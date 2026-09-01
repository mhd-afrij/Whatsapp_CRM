<?php

namespace App\Jobs;

use App\Models\Campaign;
use App\Models\CampaignMessage;
use App\Services\GatewayClient;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Sends one campaign recipient through the gateway. Both the row status and
 * the campaign status are re-checked inside handle(): a cancelled or re-queued
 * campaign must not keep firing stale jobs.
 */
class SendCampaignMessageJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /**
     * Single attempt by design: the gateway already retries each send
     * internally (BullMQ backoff + dead-letter), and a campaign-level "resend"
     * re-targets only rows that never reached STATUS_SENT. Laravel-side retries
     * under QUEUE_CONNECTION=sync would also bubble exceptions mid-campaign and
     * abort every remaining recipient.
     */
    public int $tries = 1;

    public function __construct(public readonly int $campaignMessageId) {}

    public function handle(GatewayClient $gateway): void
    {
        $row = CampaignMessage::query()->find($this->campaignMessageId);
        if (! $row || $row->status !== CampaignMessage::STATUS_PENDING) {
            return;
        }

        $campaign = Campaign::query()->find($row->campaign_id);
        if (! $campaign || $campaign->status !== Campaign::STATUS_SENDING) {
            $row->forceFill([
                'status' => CampaignMessage::STATUS_SKIPPED,
                'error' => 'Campaign no longer active.',
            ])->save();

            return;
        }

        try {
            $started = $gateway->startConversation([
                'workspaceId' => $row->workspace_id,
                'phoneNumber' => $row->phone_number,
                'contactId' => $row->contact_id,
            ]);
            $conversationId = $started['data']['conversationId'] ?? null;
            if (! $conversationId) {
                throw new RuntimeException('Gateway did not return a conversation id.');
            }

            // Rendered at materialize time; fall back for rows created before
            // content was snapshotted (defensive - should not happen).
            $content = $row->rendered_content ?? (string) $campaign->message_content;

            // Deterministic per-recipient key: if this job is retried after the
            // gateway already accepted the send, the gateway's dedupe lookup
            // returns the original dispatch instead of sending twice.
            $result = $gateway->sendMessage([
                'workspaceId' => $row->workspace_id,
                'conversationId' => (int) $conversationId,
                'content' => $content,
                'requestedByUserId' => $campaign->created_by,
                'idempotencyKey' => "campaign:{$campaign->id}:{$row->id}:{$row->contact_id}",
            ]);

            $row->forceFill([
                'status' => CampaignMessage::STATUS_SENT,
                'conversation_id' => (int) $conversationId,
                'wa_message_id' => $result['data']['message']['whatsapp_message_id']
                    ?? $result['data']['messageId']
                    ?? null,
                'dispatch_id' => $result['data']['dispatchId'] ?? null,
                'sent_at' => now(),
                'error' => null,
            ])->save();
        } catch (\Throwable $e) {
            // Terminal failure for this recipient - recorded on the row and
            // surfaced via campaign analytics; the campaign keeps going.
            $row->forceFill([
                'status' => CampaignMessage::STATUS_FAILED,
                'error' => Str::limit($e->getMessage(), 990),
            ])->save();

            Log::warning('Campaign message send failed', [
                'campaign_message_id' => $row->id,
                'campaign_id' => $row->campaign_id,
                'error' => $e->getMessage(),
            ]);
        } finally {
            $campaign->refresh();
            app(\App\Services\CampaignService::class)->finalizeIfComplete($campaign);
        }
    }
}
