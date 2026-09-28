<?php

namespace App\Support;

/**
 * Single source of truth for the notification types this CRM can emit and
 * whose per-type preferences can be stored.
 *
 * This class previously did not exist while NotificationSettingsController
 * imported it, which made all three /api/v1/settings/notifications routes
 * fatal. It is the union of the types the backend actually emits today and
 * the types the frontend already renders labels for, so the preferences screen
 * and the notification list agree on the vocabulary.
 *
 * Kept deliberately as one flat const rather than a registry with per-type
 * metadata: the only consumers are the validation guard, the settings list,
 * and the preference seed. Labels and UI grouping live in
 * frontend/src/lib/notifications-api.ts.
 */
final class NotificationTypes
{
    // Conversations / WhatsApp inbox
    public const CONVERSATION_ASSIGNED = 'conversation.assigned';

    public const CONVERSATION_NEW_MESSAGE = 'conversation.new_message';

    public const CONVERSATION_REASSIGNED = 'conversation.reassigned';

    public const CONVERSATION_REOPENED = 'conversation.reopened';

    // Tasks, notes, calendar
    public const TASK_ASSIGNED = 'task.assigned';

    public const TASK_REMINDER = 'task.reminder';

    public const TASK_OVERDUE = 'task.overdue';

    public const TASK_COMMENT_MENTION = 'task.comment_mention';

    public const NOTE_MENTION = 'note.mention';

    public const CALENDAR_EVENT_REMINDER = 'calendar_event.reminder';

    // Leads & deals
    public const LEAD_ASSIGNED = 'lead.assigned';

    public const LEAD_STATUS_CHANGED = 'lead.status_changed';

    public const DEAL_ASSIGNED = 'deal.assigned';

    public const DEAL_STAGE_CHANGED = 'deal.stage_changed';

    public const DEAL_WON = 'deal.won';

    public const DEAL_LOST = 'deal.lost';

    // WhatsApp connection health
    public const WHATSAPP_CONNECTION_FAILED = 'whatsapp.connection.failed';

    public const WHATSAPP_REAUTH_REQUIRED = 'whatsapp.connection.reauth_required';

    public const WHATSAPP_RECONNECTED = 'whatsapp.reconnected';

    public const WHATSAPP_QR_REQUIRED = 'whatsapp.qr_required';

    // Imports, exports, reporting
    public const IMPORT_COMPLETED = 'import.completed';

    public const EXPORT_COMPLETED = 'export.completed';

    public const REPORT_EXPORT_READY = 'report.export_ready';

    // SLA
    public const SLA_WARNING = 'sla.warning';

    public const SLA_BREACHED = 'sla.breached';

    /**
     * Every storable notification type.
     *
     * @var list<string>
     */
    public const KNOWN_TYPES = [
        self::CONVERSATION_ASSIGNED,
        self::CONVERSATION_NEW_MESSAGE,
        self::CONVERSATION_REASSIGNED,
        self::CONVERSATION_REOPENED,
        self::TASK_ASSIGNED,
        self::TASK_REMINDER,
        self::TASK_OVERDUE,
        self::TASK_COMMENT_MENTION,
        self::NOTE_MENTION,
        self::CALENDAR_EVENT_REMINDER,
        self::LEAD_ASSIGNED,
        self::LEAD_STATUS_CHANGED,
        self::DEAL_ASSIGNED,
        self::DEAL_STAGE_CHANGED,
        self::DEAL_WON,
        self::DEAL_LOST,
        self::WHATSAPP_CONNECTION_FAILED,
        self::WHATSAPP_REAUTH_REQUIRED,
        self::WHATSAPP_RECONNECTED,
        self::WHATSAPP_QR_REQUIRED,
        self::IMPORT_COMPLETED,
        self::EXPORT_COMPLETED,
        self::REPORT_EXPORT_READY,
        self::SLA_WARNING,
        self::SLA_BREACHED,
    ];

    public static function isKnown(string $type): bool
    {
        return in_array($type, self::KNOWN_TYPES, true);
    }
}
