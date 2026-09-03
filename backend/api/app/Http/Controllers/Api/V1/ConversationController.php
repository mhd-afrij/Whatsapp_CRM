<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Conversation;
use App\Models\Message;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class ConversationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Conversation::where('workspace_id', $request->user()->workspace_id)
            ->with('assignee:id,name,email')
            ->orderByRaw('last_message_at IS NULL, last_message_at DESC');

        if ($request->filled('status')) {
            $query->where('status', $request->input('status'));
        }

        if ($request->filled('assignee_id')) {
            $assigneeId = $request->input('assignee_id');
            if ($assigneeId === 'unassigned') {
                $query->whereNull('assignee_id');
            } else {
                $query->where('assignee_id', $assigneeId);
            }
        }

        if ($request->filled('search')) {
            $search = $request->input('search');
            $query->where(function ($q) use ($search) {
                $q->where('contact_name', 'like', "%{$search}%")
                    ->orWhere('contact_phone', 'like', "%{$search}%");
            });
        }

        if ($request->filled('tag')) {
            $query->whereJsonContains('tags', $request->input('tag'));
        }

        $perPage = min((int) $request->input('per_page', 50), 100);
        $conversations = $query->paginate($perPage);

        return response()->json([
            'data' => $conversations->items(),
            'meta' => [
                'current_page' => $conversations->currentPage(),
                'last_page' => $conversations->lastPage(),
                'per_page' => $conversations->perPage(),
                'total' => $conversations->total(),
            ],
        ]);
    }

    public function messages(Request $request, Conversation $conversation): JsonResponse
    {
        abort_unless($conversation->workspace_id === $request->user()->workspace_id, 404);

        $conversation->forceFill(['unread_count' => 0])->save();

        $perPage = min((int) $request->input('per_page', 50), 100);
        $messages = $conversation->messages()
            ->orderBy('sent_at', 'desc')
            ->paginate($perPage);

        $messages->setCollection($messages->getCollection()->reverse()->values());

        return response()->json([
            'data' => $messages->items(),
            'meta' => [
                'current_page' => $messages->currentPage(),
                'last_page' => $messages->lastPage(),
                'per_page' => $messages->perPage(),
                'total' => $messages->total(),
            ],
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

        return response()->json(['data' => $conversation->fresh('assignee:id,name,email')]);
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

    public function markRead(Request $request, Conversation $conversation): JsonResponse
    {
        abort_unless($conversation->workspace_id === $request->user()->workspace_id, 404);

        $conversation->forceFill(['unread_count' => 0])->save();

        return response()->json(['data' => $conversation]);
    }

    public function updateMessageStatus(Request $request): JsonResponse
    {
        $data = $request->validate([
            'wa_message_id' => ['required', 'string'],
            'status' => ['required', 'string', 'in:sent,delivered,read'],
        ]);

        $message = Message::where('wa_message_id', $data['wa_message_id'])->first();

        if (! $message) {
            return response()->json(['message' => 'Message not found.'], 404);
        }

        $statusOrder = ['sent' => 0, 'delivered' => 1, 'read' => 2];
        if (($statusOrder[$data['status']] ?? 0) > ($statusOrder[$message->status] ?? 0)) {
            $message->forceFill(['status' => $data['status']])->save();
        }

        return response()->json(['data' => $message]);
    }

    public function getAgents(Request $request): JsonResponse
    {
        $agents = \App\Models\User::where('workspace_id', $request->user()->workspace_id)
            ->where('status', 'active')
            ->get(['id', 'name', 'email', 'avatar_path']);

        return response()->json(['data' => $agents]);
    }
}
