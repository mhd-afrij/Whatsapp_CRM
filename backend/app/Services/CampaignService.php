<?php

namespace App\Services;

use App\Jobs\SendCampaignMessageJob;
use App\Models\Campaign;
use App\Models\CampaignMessage;
use App\Models\Contact;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Campaign lifecycle logic shared by the controller (send/cancel actions) and
 * the scheduler command (due scheduled campaigns): resolves the audience from
 * audience_filter, materializes per-recipient campaign_messages rows (skipping
 * recipients already successfully sent to, which is what makes re-sending a
 * completed/failed campaign safe), fans out queue jobs, and finalizes counters.
 */
class CampaignService
{
    /**
     * Contacts matching the campaign's audience_filter. Only contacts with a
     * phone number are addressable over WhatsApp; everything else would fail
     * downstream anyway, so they are excluded at the source.
     */
    public function audienceQuery(Campaign $campaign): Builder
    {
        $filter = $campaign->audience_filter ?? [];

        $query = Contact::query()
            ->where('contacts.workspace_id', $campaign->workspace_id)
            ->whereNotNull('phone_number')
            ->when(! empty($filter['statuses']), fn (Builder $q) => $q->whereIn('status', $filter['statuses']))
            ->when(! empty($filter['search']), function (Builder $q) use ($filter) {
                $term = str_replace(['%', '_'], ['\%', '\_'], trim((string) $filter['search']));
                $q->where(function (Builder $inner) use ($term) {
                    $inner->where('full_name', 'like', "%{$term}%")
                        ->orWhere('phone_number', 'like', "%{$term}%");
                });
            })
            ->when(! empty($filter['labels']), fn (Builder $q) => $q->whereHas(
                'labels',
                fn (Builder $lq) => $lq->whereIn('labels.id', $filter['labels'])
            ));

        // Every label in the filter must belong to the campaign's workspace -
        // ids are user input, never trusted blindly.
        if (! empty($filter['labels'])) {
            $validLabelIds = DB::table('labels')
                ->where('workspace_id', $campaign->workspace_id)
                ->whereIn('id', $filter['labels'])
                ->pluck('id');
            if ($validLabelIds->isEmpty()) {
                return $query->whereRaw('1 = 0');
            }

            $query->whereHas('labels', fn (Builder $lq) => $lq->whereIn('labels.id', $validLabelIds));
        }

        return $query;
    }

    public function audienceCount(Campaign $campaign): int
    {
        return $this->audienceQuery($campaign)->count();
    }

    /**
     * Move a campaign into sending state, create pending rows for every
     * audience member not already sent to, and enqueue one job per pending
     * row. Safe to call repeatedly - existing sent rows are left untouched.
     *
     * @return int number of recipient jobs dispatched
     */
    public function startSending(Campaign $campaign): int
    {
        if (! in_array($campaign->status, Campaign::SENDABLE_STATUSES, true)) {
            throw new RuntimeException("Campaign cannot be sent while status is '{$campaign->status}'.");
        }

        $campaign->forceFill([
            'status' => Campaign::STATUS_SENDING,
            'started_at' => $campaign->started_at ?? now(),
            'completed_at' => null,
            'scheduled_at' => null,
        ])->save();

        $this->materializeRows($campaign);

        return $this->dispatchPending($campaign);
    }

    /**
     * Create pending campaign_messages rows for every audience contact that
     * does not already have a successful row. Refreshes total_targets.
     */
    public function materializeRows(Campaign $campaign): void
    {
        $sender = $campaign->senderContext();

        $this->audienceQuery($campaign)
            ->select(['id', 'full_name', 'company', 'email', 'phone_number', 'workspace_id'])
            ->chunkById(500, function ($contacts) use ($campaign, $sender) {
                foreach ($contacts as $contact) {
                    $alreadySent = CampaignMessage::query()
                        ->where('campaign_id', $campaign->id)
                        ->where('contact_id', $contact->id)
                        ->where('status', CampaignMessage::STATUS_SENT)
                        ->exists();
                    if ($alreadySent) {
                        continue;
                    }

                    $rendered = app(MessageTemplateService::class)->resolve(
                        (string) $campaign->message_content,
                        $sender,
                        ['contact_id' => $contact->id],
                    );

                    CampaignMessage::query()->updateOrCreate(
                        ['campaign_id' => $campaign->id, 'contact_id' => $contact->id],
                        [
                            'workspace_id' => $campaign->workspace_id,
                            'phone_number' => (string) $contact->phone_number,
                            'rendered_content' => $rendered,
                            'status' => CampaignMessage::STATUS_PENDING,
                            'error' => null,
                        ],
                    );
                }
            });

        $campaign->forceFill([
            'total_targets' => CampaignMessage::query()->where('campaign_id', $campaign->id)->count(),
        ])->save();
    }

    /**
     * Enqueue a SendCampaignMessageJob for every still-pending row.
     *
     * @return int jobs dispatched
     */
    public function dispatchPending(Campaign $campaign): int
    {
        $dispatched = 0;

        CampaignMessage::query()
            ->where('campaign_id', $campaign->id)
            ->where('status', CampaignMessage::STATUS_PENDING)
            ->select(['id'])
            ->chunkById(500, function ($rows) use (&$dispatched) {
                foreach ($rows as $row) {
                    SendCampaignMessageJob::dispatch($row->id);
                    $dispatched++;
                }
            });

        return $dispatched;
    }

    /**
     * Cancel a campaign: any not-yet-dispatched recipients are marked skipped
     * so in-flight/queued jobs become no-ops (they re-check row + campaign
     * status before sending).
     */
    public function cancel(Campaign $campaign): void
    {
        if (! in_array($campaign->status, [Campaign::STATUS_DRAFT, Campaign::STATUS_SCHEDULED, Campaign::STATUS_SENDING], true)) {
            throw new RuntimeException("Campaign cannot be cancelled while status is '{$campaign->status}'.");
        }

        CampaignMessage::query()
            ->where('campaign_id', $campaign->id)
            ->where('status', CampaignMessage::STATUS_PENDING)
            ->update([
                'status' => CampaignMessage::STATUS_SKIPPED,
                'error' => 'Campaign cancelled before sending.',
            ]);

        $wasInProgress = $campaign->status === Campaign::STATUS_SENDING;

        $campaign->forceFill([
            'status' => Campaign::STATUS_CANCELLED,
            'completed_at' => $wasInProgress ? now() : null,
            'scheduled_at' => null,
        ])->save();
        $this->refreshCounters($campaign);
    }

    /** Recompute sent/failed counters from the per-recipient rows. */
    public function refreshCounters(Campaign $campaign): void
    {
        $counts = CampaignMessage::query()
            ->where('campaign_id', $campaign->id)
            ->selectRaw("SUM(status = ?) as sent, SUM(status = ?) as failed", [
                CampaignMessage::STATUS_SENT,
                CampaignMessage::STATUS_FAILED,
            ])
            ->first();

        $campaign->forceFill([
            'sent_count' => (int) ($counts?->sent ?? 0),
            'failed_count' => (int) ($counts?->failed ?? 0),
        ])->save();
    }

    /**
     * Mark a sending campaign complete once no pending rows remain. Called
     * after each terminal recipient update (cheap guard against races: the
     * update is idempotent).
     */
    public function finalizeIfComplete(Campaign $campaign): void
    {
        if ($campaign->status !== Campaign::STATUS_SENDING) {
            return;
        }

        $pending = CampaignMessage::query()
            ->where('campaign_id', $campaign->id)
            ->where('status', CampaignMessage::STATUS_PENDING)
            ->exists();
        if ($pending) {
            return;
        }

        $this->refreshCounters($campaign);
        $campaign->forceFill([
            'status' => Campaign::STATUS_COMPLETED,
            'completed_at' => now(),
        ])->save();
    }
}
