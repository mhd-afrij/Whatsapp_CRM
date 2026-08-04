<?php

namespace App\Console\Commands;

use App\Models\Conversation;
use App\Models\Message;
use App\Models\Notification;
use App\Services\NotificationService;
use Illuminate\Console\Command;

/**
 * Polls for inbound WhatsApp messages that arrived on a conversation with an
 * assignee, and notifies that assignee (type `conversation.new_message`).
 *
 * `messages` is a gateway-owned table (docs/DATA_OWNERSHIP.md) written only by the
 * gateway's Baileys ingestion path - the backend has no webhook/event hook into "a
 * message just arrived", so (like SendTaskReminders/NotifyOverdueTasks) this is a
 * polling command rather than an inline controller hook. Only the most recent inbound
 * message per conversation is considered per run (matching how the inbox badge itself
 * only cares about "is there something new"), and idempotency is checked against the
 * `notifications` table by message id so re-running the command never double-notifies.
 */
class NotifyNewMessagesOnAssignedConversations extends Command
{
    protected $signature = 'conversations:notify-new-messages';

    protected $description = 'Notify assignees of new inbound messages on their assigned conversations.';

    public function handle(): int
    {
        $conversations = Conversation::query()
            ->whereNotNull('assigned_user_id')
            ->with('assignedUser')
            ->get();

        $count = 0;

        foreach ($conversations as $conversation) {
            if (! $conversation->assignedUser) {
                continue;
            }

            $latestInbound = Message::query()
                ->where('conversation_id', $conversation->id)
                ->where('direction', 'inbound')
                ->orderByDesc('id')
                ->first();

            if (! $latestInbound) {
                continue;
            }

            $alreadyNotified = Notification::query()
                ->where('user_id', $conversation->assigned_user_id)
                ->where('type', 'conversation.new_message')
                ->whereJsonContains('data->message_id', $latestInbound->id)
                ->exists();

            if ($alreadyNotified) {
                continue;
            }

            NotificationService::notify($conversation->assignedUser, 'conversation.new_message', [
                'conversation_id' => $conversation->id,
                'message_id' => $latestInbound->id,
            ]);

            $count++;
        }

        $this->info("Sent {$count} new-message notification(s).");

        return self::SUCCESS;
    }
}
