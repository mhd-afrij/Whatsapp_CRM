<?php

namespace App\Console\Commands;

use App\Models\Conversation;
use App\Models\Message;
use App\Models\SlaConfig;
use App\Services\SlaService;
use Illuminate\Console\Command;

/**
 * Backend-side SLA engine (the backend has no webhook into \"a message just
 * arrived\" — `messages` is gateway-owned, docs/DATA_OWNERSHIP.md — so, like
 * SendTaskReminders/NotifyOverdueTasks, this is a polling command rather than
 * an inline controller hook).
 *
 * For every workspace with an active SLA config it:
 *   1. Starts a `first_response` timer on conversations whose most recent
 *      message is inbound and unanswered (no outbound after it), anchoring the
 *      timer to the inbound message's created_at; and
 *   2. Flips pending timers whose deadline has passed to `breached` (and the
 *      next-5-minutes ones to `at_risk`) via SlaService::checkBreaches.
 *
 * Both steps are idempotent: startSla skips conversations that already have an
 * active timer of that type, and checkBreaches only touches pending rows.
 */
class CheckSlaBreaches extends Command
{
    protected $signature = 'sla:check-breaches';

    protected $description = 'Start SLA timers for unanswered inbound messages and flip pending timers to at-risk/breached.';

    public function handle(SlaService $sla): int
    {
        $configs = SlaConfig::query()
            ->where('is_active', true)
            ->with('slaEvents')
            ->get();

        $started = 0;

        foreach ($configs as $config) {
            $conversations = Conversation::query()
                ->where('workspace_id', $config->workspace_id)
                ->get();

            foreach ($conversations as $conversation) {
                $latestInbound = Message::query()
                    ->where('conversation_id', $conversation->id)
                    ->where('direction', 'inbound')
                    ->orderByDesc('created_at')
                    ->first();

                if (! $latestInbound) {
                    continue;
                }

                // Answered: an outbound message exists after the latest inbound one.
                $answeredAfter = Message::query()
                    ->where('conversation_id', $conversation->id)
                    ->where('direction', 'outbound')
                    ->where('created_at', '>', $latestInbound->created_at)
                    ->exists();

                if ($answeredAfter) {
                    continue;
                }

                if ($sla->startSla(
                    $config->workspace_id,
                    $conversation->id,
                    'first_response',
                    $latestInbound->created_at
                )) {
                    $started++;
                }
            }

            $result = $sla->checkBreaches($config->workspace_id);
            $this->info(
                "Workspace {$config->workspace_id}: {$result['breached']} breached, {$result['at_risk']} at risk."
            );
        }

        $this->info("Started {$started} SLA timer(s).");

        return self::SUCCESS;
    }
}
