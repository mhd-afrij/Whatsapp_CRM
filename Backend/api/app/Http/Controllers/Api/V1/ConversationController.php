<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Conversation;
use App\Models\Message;
use App\Models\Notification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class ConversationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return response()->json([
            'data' => Conversation::where('workspace_id', $request->user()->workspace_id)
                ->with('assignee:id,name,email')
                ->orderByRaw('last_message_at IS NULL, last_message_at DESC')
                ->get(),
        ]);
    }

    public function messages(Request $request, Conversation $conversation): JsonResponse
    {
        abort_unless($conversation->workspace_id === $request->user()->workspace_id, 404);

        $conversation->forceFill(['unread_count' => 0])->save();

        return response()->json([
            'data' => $conversation->messages()->orderBy('sent_at')->get(),
        ]);
    }

    public function sendMessage(Request $request, Conversation $conversation): JsonResponse
    {
        abort_unless($conversation->workspace_id === $request->user()->workspace_id, 404);

        $data = $request->validate([
            'body' => ['required', 'string', 'max:4096'],
        ]);

        $response = Http::withHeaders([
            'x-internal-secret' => config('services.whatsapp_sync.secret'),
        ])->post(rtrim(config('services.whatsapp_sync.base_url'), '/').'/internal/v1/messages/send', [
            'to' => $conversation->contact_phone,
            'text' => $data['body'],
        ]);

        if (! $response->successful()) {
            Log::warning('whatsapp-sync message send failed', [
                'conversation_id' => $conversation->id,
                'status' => $response->status(),
                'body' => $response->json(),
            ]);

            return response()->json([
                'message' => $response->json('message') ?? 'Failed to send message.',
            ], 409);
        }

        $now = now();
        $message = Message::create([
            'workspace_id' => $conversation->workspace_id,
            'conversation_id' => $conversation->id,
            'direction' => 'out',
            'body' => $data['body'],
            'wa_message_id' => $response->json('data.id'),
            'status' => 'sent',
            'sent_at' => $now,
        ]);

        $conversation->forceFill(['last_message_at' => $now])->save();

        return response()->json(['data' => $message], 201);
    }

    public function assign(Request $request, Conversation $conversation): JsonResponse
    {
        abort_unless($conversation->workspace_id === $request->user()->workspace_id, 404);

        $data = $request->validate([
            'assignee_id' => ['nullable', 'integer', 'exists:users,id'],
        ]);

        $conversation->fill($data)->save();

        if (! empty($data['assignee_id']) && $data['assignee_id'] !== $request->user()->id) {
            Notification::create([
                'workspace_id' => $conversation->workspace_id,
                'user_id' => $data['assignee_id'],
                'type' => 'conversation.assigned',
                'title' => 'A conversation with '.($conversation->contact_name ?? $conversation->contact_phone).' was assigned to you.',
                'entity_type' => 'conversation',
                'entity_id' => $conversation->id,
            ]);
        }

        return response()->json(['data' => $conversation]);
    }

    public function close(Request $request, Conversation $conversation): JsonResponse
    {
        abort_unless($conversation->workspace_id === $request->user()->workspace_id, 404);

        $conversation->forceFill([
            'status' => $conversation->status === 'closed' ? 'open' : 'closed',
        ])->save();

        return response()->json(['data' => $conversation]);
    }

    public function updateTags(Request $request, Conversation $conversation): JsonResponse
    {
        abort_unless($conversation->workspace_id === $request->user()->workspace_id, 404);

        $data = $request->validate([
            'tags' => ['required', 'array'],
            'tags.*' => ['string', 'max:64'],
        ]);

        $conversation->forceFill(['tags' => array_values(array_unique($data['tags']))])->save();

        return response()->json(['data' => $conversation]);
    }
}
