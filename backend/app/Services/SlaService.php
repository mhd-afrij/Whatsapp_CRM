<?php

namespace App\Services;

use App\Models\Conversation;
use App\Models\SlaConfig;
use App\Models\SlaEvent;

class SlaService
{
    /**
     * Start an SLA timer for a conversation when a new inbound message is received.
     */
    public function startSla(int $workspaceId, int $conversationId, string $type = 'first_response'): ?SlaEvent
    {
        $config = SlaConfig::query()
            ->where('workspace_id', $workspaceId)
            ->where('is_active', true)
            ->first();

        if (! $config) {
            return null;
        }

        // Check if there's already an active SLA of this type
        $existing = SlaEvent::query()
            ->where('conversation_id', $conversationId)
            ->where('type', $type)
            ->where('status', '!=', 'resolved')
            ->first();

        if ($existing) {
            return null;
        }

        $minutes = $type === 'first_response'
            ? $config->first_response_minutes
            : $config->followup_response_minutes;

        $startedAt = now();
        $deadlineAt = $startedAt->copy()->addMinutes($minutes);

        // Check if we're within business hours
        // For now, use simple calculation; can be enhanced with BusinessHoursService later

        return SlaEvent::create([
            'workspace_id' => $workspaceId,
            'conversation_id' => $conversationId,
            'sla_config_id' => $config->id,
            'type' => $type,
            'status' => 'pending',
            'started_at' => $startedAt,
            'deadline_at' => $deadlineAt,
        ]);
    }

    /**
     * Resolve an SLA event when an agent responds.
     */
    public function resolveSla(int $conversationId, string $type = 'first_response'): ?SlaEvent
    {
        $event = SlaEvent::query()
            ->where('conversation_id', $conversationId)
            ->where('type', $type)
            ->where('status', '!=', 'resolved')
            ->first();

        if (! $event) {
            return null;
        }

        $now = now();
        $status = $now->lte($event->deadline_at) ? 'within_sla' : 'breached';

        $event->update([
            'status' => $status,
            'resolved_at' => $now,
        ]);

        return $event->fresh();
    }

    /**
     * Check for SLA breaches and update status.
     */
    public function checkBreaches(int $workspaceId): array
    {
        $breached = SlaEvent::query()
            ->where('workspace_id', $workspaceId)
            ->where('status', 'pending')
            ->where('deadline_at', '<', now())
            ->get();

        $atRisk = SlaEvent::query()
            ->where('workspace_id', $workspaceId)
            ->where('status', 'pending')
            ->where('deadline_at', '<', now()->addMinutes(5))
            ->where('deadline_at', '>', now())
            ->get();

        foreach ($breached as $event) {
            $event->update(['status' => 'breached']);
        }

        foreach ($atRisk as $event) {
            $event->update(['status' => 'at_risk']);
        }

        return [
            'breached' => $breached->count(),
            'at_risk' => $atRisk->count(),
        ];
    }

    /**
     * Get SLA status for a conversation.
     */
    public function getSlaStatus(int $conversationId): array
    {
        $activeSla = SlaEvent::query()
            ->where('conversation_id', $conversationId)
            ->whereIn('status', ['pending', 'at_risk'])
            ->orderBy('deadline_at')
            ->first();

        if (! $activeSla) {
            return ['has_active_sla' => false];
        }

        $now = now();
        $remaining = $now->diffInSeconds($activeSla->deadline_at, false);
        $total = $activeSla->started_at->diffInSeconds($activeSla->deadline_at);
        $percentUsed = max(0, min(100, (1 - ($remaining / $total)) * 100));

        return [
            'has_active_sla' => true,
            'type' => $activeSla->type,
            'status' => $activeSla->status,
            'deadline_at' => $activeSla->deadline_at->toIso8601String(),
            'remaining_seconds' => max(0, $remaining),
            'percent_used' => $percentUsed,
        ];
    }
}
