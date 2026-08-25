<?php

namespace App\Console\Commands;

use App\Models\Notification;
use App\Models\User;
use App\Models\WhatsappConnectionEvent;
use App\Services\NotificationService;
use Illuminate\Console\Command;

/**
 * Polls the gateway-owned, read-only `whatsapp_connection_events` table
 * (see docs/DATA_OWNERSHIP.md - the backend never writes this table, only
 * the gateway does, via WhatsApp connection-manager.ts) for events that
 * mean the connection needs human attention, and notifies every workspace
 * user who holds `whatsapp.connection.manage` (the same permission gating
 * the connection settings page itself).
 *
 * `disconnected` -> `whatsapp.connection.failed`
 * `logged_out`   -> `whatsapp.connection.reauth_required` (a fresh QR scan is required)
 *
 * Idempotency is checked against the `notifications` table (a notification
 * already carrying this connection event's id means it was already sent),
 * the same pattern used by NotifyOverdueTasks - there is no
 * "notified_at" column on the gateway-owned events table to write to, and
 * this command must never write to it.
 */
class NotifyWhatsappConnectionEvents extends Command
{
    protected $signature = 'whatsapp:notify-connection-events';

    protected $description = 'Notify workspace admins of WhatsApp disconnects/logouts that need attention.';

    private const EVENT_TYPE_MAP = [
        'disconnected' => 'whatsapp.connection.failed',
        'logged_out' => 'whatsapp.connection.reauth_required',
    ];

    public function handle(): int
    {
        $events = WhatsappConnectionEvent::query()
            ->whereIn('event_type', array_keys(self::EVENT_TYPE_MAP))
            ->where('occurred_at', '>=', now()->subDay())
            ->orderBy('occurred_at')
            ->get();

        $count = 0;

        foreach ($events as $event) {
            $notificationType = self::EVENT_TYPE_MAP[$event->event_type];

            $alreadyNotified = Notification::query()
                ->where('workspace_id', $event->workspace_id)
                ->where('type', $notificationType)
                ->whereJsonContains('data->connection_event_id', $event->id)
                ->exists();

            if ($alreadyNotified) {
                continue;
            }

            $admins = User::query()
                ->where('workspace_id', $event->workspace_id)
                ->where('is_active', true)
                ->get()
                ->filter(fn (User $user) => $user->hasPermission('whatsapp.connection.manage'));

            foreach ($admins as $admin) {
                NotificationService::notify($admin, $notificationType, [
                    'connection_event_id' => $event->id,
                    'session_id' => $event->whatsapp_session_id,
                    'occurred_at' => optional($event->occurred_at)->toIso8601String(),
                ]);
                $count++;
            }
        }

        $this->info("Sent {$count} WhatsApp connection notification(s).");

        return self::SUCCESS;
    }
}
