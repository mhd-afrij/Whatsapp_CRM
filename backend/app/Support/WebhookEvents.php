<?php

namespace App\Support;

/**
 * Catalog of webhook events the backend can actually emit. Every event here has
 * a real emission point in the backend (accounts connection actions/state
 * sync, message send/fail, conversation lifecycle, contact/lead mutations) -
 * no synthetic or unobservable events. Events the backend genuinely cannot
 * observe (e.g. inbound message.received, which lives entirely in the gateway
 * process) are intentionally NOT listed instead of firing nothing.
 */
class WebhookEvents
{
    public const ACCOUNT_CONNECTED = 'whatsapp.account.connected';
    public const ACCOUNT_DISCONNECTED = 'whatsapp.account.disconnected';
    public const ACCOUNT_QR_REQUIRED = 'whatsapp.account.qr_required';
    public const ACCOUNT_RECONNECTING = 'whatsapp.account.reconnecting';
    public const ACCOUNT_LOGGED_OUT = 'whatsapp.account.logged_out';
    public const ACCOUNT_ERROR = 'whatsapp.account.error';

    public const MESSAGE_SENT = 'whatsapp.message.sent';
    public const MESSAGE_FAILED = 'whatsapp.message.failed';

    public const CONVERSATION_CREATED = 'conversation.created';
    public const CONVERSATION_ASSIGNED = 'conversation.assigned';
    public const CONVERSATION_CLOSED = 'conversation.closed';

    public const CONTACT_CREATED = 'contact.created';

    public const LEAD_CREATED = 'lead.created';
    public const LEAD_UPDATED = 'lead.updated';
    public const LEAD_CONVERTED = 'lead.converted';

    /**
     * @return array<int, array{event: string, group: string, label: string}>
     */
    public static function catalog(): array
    {
        $items = [
            [self::ACCOUNT_CONNECTED, 'WhatsApp', 'Account connected'],
            [self::ACCOUNT_DISCONNECTED, 'WhatsApp', 'Account disconnected'],
            [self::ACCOUNT_QR_REQUIRED, 'WhatsApp', 'QR code required'],
            [self::ACCOUNT_RECONNECTING, 'WhatsApp', 'Account reconnecting'],
            [self::ACCOUNT_LOGGED_OUT, 'WhatsApp', 'Account logged out'],
            [self::ACCOUNT_ERROR, 'WhatsApp', 'Account connection error'],
            [self::MESSAGE_SENT, 'Messages', 'Message sent'],
            [self::MESSAGE_FAILED, 'Messages', 'Message send failed'],
            [self::CONVERSATION_CREATED, 'Conversations', 'Conversation created'],
            [self::CONVERSATION_ASSIGNED, 'Conversations', 'Conversation assigned'],
            [self::CONVERSATION_CLOSED, 'Conversations', 'Conversation closed'],
            [self::CONTACT_CREATED, 'Contacts', 'Contact created'],
            [self::LEAD_CREATED, 'Leads', 'Lead created'],
            [self::LEAD_UPDATED, 'Leads', 'Lead updated'],
            [self::LEAD_CONVERTED, 'Leads', 'Lead converted'],
        ];

        return array_map(
            fn (array $item) => ['event' => $item[0], 'group' => $item[1], 'label' => $item[2]],
            $items
        );
    }

    /**
     * @return array<int, string> the event names themselves, for validation.
     */
    public static function names(): array
    {
        return array_column(static::catalog(), 'event');
    }
}