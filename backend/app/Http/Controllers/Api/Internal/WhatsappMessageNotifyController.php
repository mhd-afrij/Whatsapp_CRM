<?php

namespace App\Http\Controllers\Api\Internal;

use App\Http\Controllers\Controller;
use App\Models\Conversation;
use App\Models\Notification;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Realtime hook the whatsapp-gateway calls right after persisting a live inbound
 * message (src/lib/laravel-client.ts -> notifyNewMessage). Unlike the polling
 * `conversations:notify-new-messages` command - which stays as an eventual
 * backstop for missed calls - this raises the `conversation.new_message` bell
 * notification for the conversation's assignee within ~1s of message arrival.
 *
 * The route lives outside the Sanctum `/api/v1` group (gateway has no user) and
 * is guarded by EnsureInternalSecret. The unauthenticated context is why every
 * query here constrains workspace_id explicitly - the BelongsToWorkspace global
 * scope resolves nothing without an authenticated user, so it cannot isolate for
 * us. Always answers 202 so any gateway-side failure handling can treat non-2xx
 * as an environment problem rather than a user-facing error.
 */
class WhatsappMessageNotifyController extends Controller
{
    public function notifyNewMessage(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'workspaceId' => ['required', 'integer', 'min:1'],
            'conversationId' => ['required', 'integer', 'min:1'],
            'messageId' => ['required', 'integer', 'min:1'],
            'messageType' => ['required', 'string'],
            'preview' => ['nullable', 'string'],
        ]);

        $conversation = Conversation::query()
            ->where('workspace_id', $validated['workspaceId'])
            ->where('id', $validated['conversationId'])
            ->first();

        if (! $conversation || ! $conversation->assigned_user_id || ! $conversation->assignedUser) {
            return response()->json([
                'success' => true,
                'message' => 'No assignee to notify',
                'data' => null,
            ], 202);
        }

        // Idempotent per message id - mirrors the poll command's guard so a
        // duplicate gateway call (retry/reconnect) can never double-notify.
        $alreadyNotified = Notification::query()
            ->where('user_id', $conversation->assigned_user_id)
            ->where('type', 'conversation.new_message')
            ->whereJsonContains('data->message_id', $validated['messageId'])
            ->exists();

        if ($alreadyNotified) {
            return response()->json([
                'success' => true,
                'message' => 'Already notified',
                'data' => null,
            ], 202);
        }

        NotificationService::notify($conversation->assignedUser, 'conversation.new_message', [
            'conversation_id' => $conversation->id,
            'message_id' => $validated['messageId'],
            'message_type' => $validated['messageType'],
            'preview' => $validated['preview'] ?? null,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Notified',
            'data' => null,
        ], 202);
    }
}