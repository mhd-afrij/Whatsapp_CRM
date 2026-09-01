<?php

namespace App\Console\Commands;

use App\Models\Campaign;
use App\Models\CampaignMessage;
use App\Services\CampaignService;
use Illuminate\Console\Command;

class DispatchScheduledCampaigns extends Command
{
    protected $signature = 'campaigns:dispatch-scheduled';

    protected $description = 'Start due scheduled campaigns and finalize sending campaigns whose recipients have all been dispatched.';

    public function handle(CampaignService $campaigns): int
    {
        // Due scheduled campaigns -> begin sending.
        $due = Campaign::query()
            ->where('status', Campaign::STATUS_SCHEDULED)
            ->whereNotNull('scheduled_at')
            ->where('scheduled_at', '<=', now())
            ->get();

        foreach ($due as $campaign) {
            try {
                $count = $campaigns->startSending($campaign);
                $this->info("Campaign #{$campaign->id} '{$campaign->name}' started ({$count} recipient job(s) dispatched).");
            } catch (\Throwable $e) {
                report($e);
                $this->error("Campaign #{$campaign->id} failed to start: {$e->getMessage()}");
                $campaign->forceFill(['status' => Campaign::STATUS_FAILED])->save();
            }
        }

        // Safety net for the per-job completion check: any campaign still marked
        // sending with no pending rows left gets finalized here.
        $stale = Campaign::query()
            ->where('status', Campaign::STATUS_SENDING)
            ->where('started_at', '<=', now()->subMinutes(5))
            ->whereDoesntHave('messages', fn ($q) => $q->where('status', CampaignMessage::STATUS_PENDING))
            ->get();

        foreach ($stale as $campaign) {
            $campaigns->finalizeIfComplete($campaign->refresh());
            $this->info("Campaign #{$campaign->id} '{$campaign->name}' finalized as {$campaign->refresh()->status}.");
        }

        return self::SUCCESS;
    }
}
