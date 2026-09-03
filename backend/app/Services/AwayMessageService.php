<?php

namespace App\Services;

use App\Models\Conversation;
use App\Models\Message;
use App\Models\WorkspaceSetting;
use Illuminate\Support\Facades\Log;
use RuntimeException;

class AwayMessageService
{
    public function __construct(
        private readonly BusinessHoursService $businessHoursService,
        private readonly GatewayClient $gateway,
    ) {}

    /**
     * Check if an away message should be sent for a conversation.
     */
    public function shouldSendAwayMessage(int $workspaceId, int $conversationId): bool
    {
        $settings = WorkspaceSetting::where('workspace_id', $workspaceId)->first();

        if (! $settings || ! $settings->away_message_enabled) {
            return false;
        }

        // Check if we're outside business hours
        if ($this->businessHoursService->isWithinBusinessHours($workspaceId)) {
            return false;
        }

        // Check trigger type
        $trigger = $settings->away_message_trigger ?? 'outside_hours';

        if ($trigger === 'outside_hours') {
            return true;
        }

        // For 'once_per_conversation', check if an away message was already sent
        if ($trigger === 'once_per_conversation') {
            $existingAwayMessage = Message::query()
                ->where('conversation_id', $conversationId)
                ->where('direction', 'outbound')
                ->where('message_type', 'system')
                ->where('body', 'like', '%away message%')
                ->exists();

            return ! $existingAwayMessage;
        }

        return false;
    }

    /**
     * Send an away message for a conversation.
     */
    public function sendAwayMessage(int $workspaceId, int $conversationId): bool
    {
        if (! $this->shouldSendAwayMessage($workspaceId, $conversationId)) {
            return false;
        }

        $settings = WorkspaceSetting::where('workspace_id', $workspaceId)->first();

        if (! $settings || empty($settings->away_message)) {
            return false;
        }

        $conversation = Conversation::find($conversationId);
        if (! $conversation || ! $conversation->whatsapp_contact) {
            return false;
        }

        try {
            $this->gateway->sendMessage([
                'workspaceId' => $workspaceId,
                'conversationId' => $conversationId,
                'content' => $settings->away_message,
                'idempotencyKey' => 'away_msg_'.$workspaceId.'_'.$conversationId.'_'.now()->format('Y-m-d_H'),
            ]);

            Log::info('Away message sent', [
                'workspace_id' => $workspaceId,
                'conversation_id' => $conversationId,
            ]);

            return true;
        } catch (RuntimeException $e) {
            Log::error('Failed to send away message', [
                'workspace_id' => $workspaceId,
                'conversation_id' => $conversationId,
                'error' => $e->getMessage(),
            ]);

            return false;
        }
    }
}
