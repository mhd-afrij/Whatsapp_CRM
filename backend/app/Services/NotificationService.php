<?php

namespace App\Services;

use App\Models\Notification;
use App\Models\NotificationPreference;
use App\Models\User;
use App\Notifications\AppNotificationMail;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Central in-app notification writer (extended in Phase 12 from the Phase 10 minimal
 * version). Every trigger point in the app (task assignment/reminder/overdue, note/task
 * mentions, conversation assignment, WhatsApp connection failures, etc.) should call
 * `notify()` rather than writing to the `notifications` table directly, so that:
 *
 *  - `notification_preferences` (per-user, per-type in_app/email toggles) is honored
 *    uniformly - a row is written only if in-app is enabled for that (user, type),
 *    defaulting to enabled when the user has never set a preference (matches the
 *    migration's `in_app_enabled` default(true)/`email_enabled` default(false)).
 *  - realtime delivery (`notification.created`, relayed to the gateway's Socket.IO
 *    layer, `workspace:{id}:user:{id}` room) happens exactly once, from one place.
 *  - queued email delivery happens exactly once, from one place, gated on the same
 *    per-type preference plus whether SMTP is actually configured in this environment.
 */
class NotificationService
{
    public static function notify(User $user, string $type, array $data = []): ?Notification
    {
        $preference = NotificationPreference::query()
            ->where('user_id', $user->id)
            ->where('notification_type', $type)
            ->first();

        $inAppEnabled = $preference ? $preference->in_app_enabled : true;
        $emailEnabled = $preference ? $preference->email_enabled : false;

        $notification = null;

        if ($inAppEnabled) {
            $notification = Notification::create([
                'workspace_id' => $user->workspace_id,
                'user_id' => $user->id,
                'type' => $type,
                'data' => $data,
            ]);

            self::relayRealtime($notification);
        }

        if ($emailEnabled) {
            self::queueEmail($user, $type, $data);
        }

        return $notification;
    }

    /**
     * Best-effort relay to the gateway's Socket.IO layer (see GatewayClient::emitEvent
     * and whatsapp-gateway's `/internal/whatsapp/events/emit` -> `emitNotificationCreated`,
     * added in Phase 12). A gateway outage must never fail notification creation, which is
     * already committed by the time this runs - failures are logged, not thrown. The
     * frontend's poll-fallback (useNotifications) covers the case where this event is
     * missed entirely.
     */
    private static function relayRealtime(Notification $notification): void
    {
        try {
            app(GatewayClient::class)->notifyUser($notification->workspace_id, $notification->user_id, [
                'notification' => [
                    'id' => $notification->id,
                    'type' => $notification->type,
                    'data' => $notification->data,
                    'createdAt' => $notification->created_at?->toIso8601String(),
                ],
            ]);
        } catch (RuntimeException $e) {
            Log::warning('Failed to relay notification.created to gateway', [
                'notification_id' => $notification->id,
                'error' => $e->getMessage(),
            ]);
        }
    }

    /**
     * Queues (never sends synchronously) a Mailable-style Notification. Gated on whether
     * SMTP looks configured in this environment (`MAIL_MAILER` not `log`/`array` and a mail
     * host present) - in the absence of real SMTP credentials, this correctly no-ops rather
     * than silently swallowing mail through the log driver and calling that "sent".
     */
    private static function queueEmail(User $user, string $type, array $data): void
    {
        if (! self::mailConfigured()) {
            return;
        }

        $user->notify(new AppNotificationMail($type, $data));
    }

    public static function mailConfigured(): bool
    {
        $mailer = config('mail.default');

        if (in_array($mailer, ['log', 'array', null], true)) {
            return false;
        }

        return filled(config("mail.mailers.{$mailer}.host")) || $mailer === 'ses' || $mailer === 'ses-v2';
    }
}
