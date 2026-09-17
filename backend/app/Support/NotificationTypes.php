<?php

namespace App\Support;

class NotificationTypes
{
    /**
     * Every notification trigger type the CRM can raise. These drive the
     * per-user preference toggles exposed by both the legacy
     * /notification-preferences endpoint and the /settings/notifications API.
     */
    public const KNOWN_TYPES = [
        'conversation.assigned',
        'conversation.new_message',
        'conversation.reassigned',
        'conversation.reopened',
        'task.assigned',
        'task.reminder',
        'task.overdue',
        'task.comment_mention',
        'note.mention',
        'lead.assigned',
        'lead.status_changed',
        'deal.assigned',
        'deal.stage_changed',
        'deal.won',
        'deal.lost',
        'whatsapp.connection.failed',
        'whatsapp.connection.reauth_required',
        'whatsapp.reconnected',
        'whatsapp.qr_required',
        'import.completed',
        'export.completed',
        'sla.warning',
        'sla.breached',
    ];
}