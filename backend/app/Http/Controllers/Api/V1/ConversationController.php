<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Conversation;
use App\Models\ConversationAssignment;
use App\Models\ConversationParticipant;
use App\Models\MessageDispatchQueue;
use App\Models\Message;
use App\Models\User;
use App\Services\GatewayClient;
use App\Services\NotificationService;
use App\Support\AuditLogger;
use App\Traits\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use RuntimeException;

class ConversationController extends Controller
{
    use ApiResponse;

    public function __construct(protected GatewayClient $gateway)
    {
    }

    /**
     * GET /api/v1/conversations
     * Filters: status (open|pending|closed), assigned_to=me|unassigned|{userId}, team_id,
     * label, unread=1.
     */
    public function index(Request $request)
    {
        $user = $request->user();

        $query = Conversation::query()
            ->visibleTo($user)
            ->with(['whatsappContact', 'contact', 'assignedUser', 'assignedTeam', 'labels']);

        if ($request->filled('search')) {
            $search = $request->string('search')->toString();
            $query->where(function ($matches) use ($search) {
                $matches->whereHas('contact', fn ($contact) => $contact
                    ->where('full_name', 'like', "%{$search}%")
                    ->orWhere('phone_number', 'like', "%{$search}%"))
                    ->orWhereHas('whatsappContact', fn ($contact) => $contact
                        ->where('push_name', 'like', "%{$search}%")
                        ->orWhere('phone_number', 'like', "%{$search}%"))
                    ->orWhereHas('messages', fn ($message) => $message->where('body', 'like', "%{$search}%"));
            });
        }

        if ($request->filled('status')) {
            $query->where('status', $request->string('status'));
        }

        if ($request->filled('priority')) {
            $query->where('priority', $request->string('priority'));
        }

        $assignedTo = $request->string('assigned_to')->toString();
        if ($assignedTo === 'me') {
            $query->where('assigned_user_id', $user->id);
        } elseif ($assignedTo === 'unassigned') {
            $query->whereNull('assigned_user_id')->whereNull('assigned_team_id');
        } elseif ($assignedTo !== '') {
            $query->where('assigned_user_id', (int) $assignedTo);
        }

        if ($request->filled('team_id')) {
            $query->where('assigned_team_id', $request->integer('team_id'));
        }

        if ($request->boolean('unread')) {
            $query->where('unread_count', '>', 0);
        }

        if ($request->filled('label')) {
            $label = $request->string('label')->toString();
            $query->whereHas('labels', fn ($q) => $q->where('name', $label));
        }

        // Multi-label filter, any-match (OR) - see ContactController::index for rationale.
        // Kept alongside the pre-existing single-name `label` filter above for compatibility.
        if ($request->filled('labels')) {
            $labelIds = array_map('intval', (array) $request->input('labels'));
            $query->whereHas('labels', fn ($q) => $q->whereIn('labels.id', $labelIds));
        }

        $perPage = min(max((int) $request->integer('per_page', 15), 1), 100);

        $paginator = $query->orderByDesc('last_message_at')->orderByDesc('id')->paginate($perPage);

        return $this->success($paginator->items(), 'OK', [
            'page' => $paginator->currentPage(),
            'per_page' => $paginator->perPage(),
            'total' => $paginator->total(),
            'last_page' => $paginator->lastPage(),
        ]);
    }

    /**
     * GET /api/v1/conversations/{id}
     */
    public function show(Request $request, Conversation $conversation)
    {
        $this->authorize('view', $conversation);
        $conversation->load(['whatsappContact', 'contact', 'assignedUser', 'assignedTeam', 'labels']);

        return $this->success($conversation, 'OK');
    }

    /**
     * GET /api/v1/conversations/{id}/messages
     * Cursor-paginated (newest first) for infinite-scroll-on-load-older chat history.
     */
    public function messages(Request $request, Conversation $conversation)
    {
        $this->authorize('view', $conversation);
        $perPage = min(max((int) $request->integer('per_page', 30), 1), 100);

        $paginator = Message::query()
            ->where('conversation_id', $conversation->id)
            ->with(['media', 'reactions', 'sender'])
            ->orderByDesc('id')
            ->cursorPaginate($perPage);

        return $this->success($paginator->items(), 'OK', [
            'per_page' => $paginator->perPage(),
            'next_cursor' => $paginator->nextCursor()?->encode(),
            'prev_cursor' => $paginator->previousCursor()?->encode(),
            'has_more' => $paginator->hasMorePages(),
        ]);
    }

    /**
     * POST /api/v1/conversations/{id}/messages
     * Laravel never writes to `messages` directly (gateway-owned table, see
     * docs/DATA_OWNERSHIP.md); this dispatches the send to the gateway's internal API and
     * reads back the row the gateway persisted synchronously.
     */
    public function storeMessage(Request $request, Conversation $conversation)
    {
        $this->authorize('reply', $conversation);
        $validator = Validator::make($request->all(), [
            'message_type' => 'sometimes|string|in:text,image,video,audio,document,sticker,location,contact_card,template',
            'body' => 'required_if:message_type,text,null|nullable|string|max:65535',
            'media' => 'sometimes|array',
            'media.storage_path' => 'required_with:media|string',
            'media.mime_type' => 'required_with:media|string',
            'replied_to_message_id' => 'sometimes|nullable|integer|exists:messages,id',
        ]);

        if ($validator->fails()) {
            return $this->error('The given data was invalid.', $validator->errors());
        }

        $data = $validator->validated();
        $idempotencyKey = (string) Str::uuid();

        $payload = [
            'workspaceId' => $conversation->workspace_id,
            'conversationId' => $conversation->id,
            'content' => $data['body'] ?? '',
            'mediaRef' => $data['media']['storage_path'] ?? null,
            'replyToWhatsappMessageId' => $data['replied_to_message_id'] ?? null,
            'requestedByUserId' => $request->user()->id,
            'idempotencyKey' => $idempotencyKey,
        ];

        try {
            $result = $this->gateway->sendMessage($payload);
        } catch (RuntimeException $e) {
            return $this->failure($e->getMessage(), 'gateway_unreachable', 502);
        }

        $messageId = $result['data']['message']['id'] ?? $result['data']['id'] ?? null;
        $dispatchId = $result['data']['dispatchId'] ?? $result['data']['dispatch_id'] ?? null;
        $bullmqJobId = $result['data']['bullmqJobId'] ?? $result['data']['bullmq_job_id'] ?? null;

        $message = null;

        if ($messageId) {
            // Backwards compatibility for older gateway responses that returned the message row
            // immediately.
            for ($attempt = 0; $attempt < 3; $attempt++) {
                $message = Message::query()->with(['media', 'sender'])->find($messageId);
                if ($message) {
                    break;
                }
                usleep(50_000);
            }
        } elseif ($dispatchId) {
            // The gateway now enqueues sends asynchronously and persists the outbound message
            // once the BullMQ worker finishes. Poll the shared dispatch table briefly so the
            // user gets the real persisted message instead of a false "failed to send" error.
            for ($attempt = 0; $attempt < 20 && ! $message; $attempt++) {
                $dispatch = MessageDispatchQueue::query()->find($dispatchId);

                if (! $dispatch) {
                    usleep(250_000);
                    continue;
                }

                if ($dispatch->status === 'failed') {
                    return $this->failure(
                        'The gateway reported that the message failed to send.',
                        'message_failed',
                        502
                    );
                }

                if ($dispatch->message_id) {
                    $message = Message::query()->with(['media', 'sender'])->find($dispatch->message_id);
                    if ($message) {
                        break;
                    }
                }

                usleep(250_000);
            }
        }

        if (! $message) {
            if ($dispatchId) {
                return $this->success([
                    'dispatchId' => (int) $dispatchId,
                    'status' => 'pending',
                    'bullmqJobId' => $bullmqJobId,
                ], 'Message queued', null, 202);
            }

            return $this->failure(
                'The gateway accepted the message but it has not appeared yet. Retry shortly.',
                'message_not_yet_visible',
                502
            );
        }

        return $this->success($message->load(['media', 'sender']), 'Message sent', null, 201);
    }

    /**
     * PATCH /api/v1/conversations/{id}/assign
     */
    public function assign(Request $request, Conversation $conversation)
    {
        $this->authorize('assign', $conversation);
        $validator = Validator::make($request->all(), [
            'assigned_user_id' => 'nullable|integer|exists:users,id',
            'assigned_team_id' => 'nullable|integer|exists:teams,id',
        ]);

        if ($validator->fails()) {
            return $this->error('The given data was invalid.', $validator->errors());
        }

        if (! $request->has('assigned_user_id') && ! $request->has('assigned_team_id')) {
            return $this->error('The given data was invalid.', [
                'assigned_user_id' => ['Either assigned_user_id or assigned_team_id is required.'],
            ]);
        }

        $data = $validator->validated();

        $before = [
            'assigned_user_id' => $conversation->assigned_user_id,
            'assigned_team_id' => $conversation->assigned_team_id,
        ];

        ConversationAssignment::query()
            ->where('conversation_id', $conversation->id)
            ->whereNull('unassigned_at')
            ->update(['unassigned_at' => now()]);

        $conversation->forceFill([
            'assigned_user_id' => $data['assigned_user_id'] ?? null,
            'assigned_team_id' => $data['assigned_team_id'] ?? null,
        ])->save();

        ConversationAssignment::query()->create([
            'conversation_id' => $conversation->id,
            'assigned_to_user_id' => $data['assigned_user_id'] ?? null,
            'assigned_to_team_id' => $data['assigned_team_id'] ?? null,
            'assigned_by' => $request->user()->id,
            'assigned_at' => now(),
        ]);

        AuditLogger::log('conversation.assigned', $request->user(), $conversation, [
            'assigned_user_id' => $data['assigned_user_id'] ?? null,
            'assigned_team_id' => $data['assigned_team_id'] ?? null,
        ], $request, $before);

        $fresh = $conversation->fresh(['assignedUser', 'assignedTeam']);
        $this->relayConversationEvent('conversation.assigned', $conversation, [
            'assignedUserId' => $data['assigned_user_id'] ?? null,
            'assignedTeamId' => $data['assigned_team_id'] ?? null,
        ]);

        if (! empty($data['assigned_user_id']) && $data['assigned_user_id'] !== $request->user()->id) {
            $assignee = User::find($data['assigned_user_id']);
            if ($assignee) {
                NotificationService::notify($assignee, 'conversation.assigned', [
                    'conversation_id' => $conversation->id,
                ]);
            }
        }

        return $this->success($fresh, 'Conversation assigned');
    }

    /**
     * PATCH /api/v1/conversations/{id}/close
     */
    public function close(Request $request, Conversation $conversation)
    {
        $this->authorize('close', $conversation);
        if ($conversation->status === 'closed') {
            return $this->error('Conversation is already closed.', null, 409);
        }

        $conversation->forceFill([
            'status' => 'closed',
            'closed_at' => now(),
            'closed_by' => $request->user()->id,
        ])->save();

        AuditLogger::log('conversation.closed', $request->user(), $conversation, [], $request);
        $this->relayConversationEvent('conversation.closed', $conversation, []);

        return $this->success($conversation->fresh(), 'Conversation closed');
    }

    /**
     * PATCH /api/v1/conversations/{id}/reopen
     */
    public function reopen(Request $request, Conversation $conversation)
    {
        $this->authorize('reopen', $conversation);
        if ($conversation->status !== 'closed') {
            return $this->error('Conversation is not closed.', null, 409);
        }

        $conversation->forceFill([
            'status' => 'open',
            'closed_at' => null,
            'closed_by' => null,
        ])->save();

        AuditLogger::log('conversation.reopened', $request->user(), $conversation, [], $request);
        $this->relayConversationEvent('conversation.reopened', $conversation, []);

        return $this->success($conversation->fresh(), 'Conversation reopened');
    }

    /**
     * PATCH /api/v1/conversations/{id}/priority
     */
    public function changePriority(Request $request, Conversation $conversation)
    {
        $this->authorize('changePriority', $conversation);
        $validator = Validator::make($request->all(), [
            'priority' => ['required', Rule::in(['low', 'normal', 'high', 'urgent'])],
        ]);

        if ($validator->fails()) {
            return $this->error('The given data was invalid.', $validator->errors());
        }

        $data = $validator->validated();
        $before = ['priority' => $conversation->priority];

        $conversation->forceFill(['priority' => $data['priority']])->save();

        AuditLogger::log('conversation.priority_changed', $request->user(), $conversation, [
            'priority' => $data['priority'],
        ], $request, $before);
        $this->relayConversationEvent('conversation.priority_changed', $conversation, [
            'priority' => $data['priority'],
        ]);

        return $this->success($conversation->fresh(), 'Conversation priority updated');
    }

    /**
     * PATCH /api/v1/conversations/{id}/read
     * Marks the conversation read for the current user (backend-owned
     * conversation_participants row). `unread_count` itself is gateway-owned
     * (see docs/04-database-design.md); resetting it is out of scope here since no
     * internal gateway endpoint for that is documented in 05-api-contract.md §22 —
     * only the per-user read-state is recorded on the backend side.
     */
    public function markRead(Request $request, Conversation $conversation)
    {
        $this->authorize('view', $conversation);
        $lastMessageId = Message::query()
            ->where('conversation_id', $conversation->id)
            ->orderByDesc('id')
            ->value('id');

        ConversationParticipant::query()->updateOrCreate(
            ['conversation_id' => $conversation->id, 'user_id' => $request->user()->id],
            ['last_read_message_id' => $lastMessageId, 'last_read_at' => now()]
        );

        return $this->success([
            'conversation_id' => $conversation->id,
            'last_read_message_id' => $lastMessageId,
            'last_read_at' => now()->toIso8601String(),
        ], 'Conversation marked as read');
    }

    /**
     * Best-effort relay of a conversation-lifecycle event to the gateway's
     * Socket.IO layer (see GatewayClient::emitEvent) so the inbox UI's
     * realtime subscriptions pick up assign/close/reopen. A gateway outage
     * must never fail the underlying HTTP mutation - it is already
     * committed by the time this runs - so failures are logged, not thrown.
     */
    protected function relayConversationEvent(string $event, Conversation $conversation, array $payload): void
    {
        try {
            $this->gateway->emitEvent($event, $conversation->workspace_id, $conversation->id, $payload);
        } catch (RuntimeException $e) {
            Log::warning('Failed to relay conversation event to gateway', [
                'event' => $event,
                'conversation_id' => $conversation->id,
                'error' => $e->getMessage(),
            ]);
        }
    }

    /**
     * POST /api/v1/conversations/{conversation}/labels/{label}
     * Gated on `reply` (the general "can act on this conversation" permission) rather than
     * a dedicated policy method - conversations have no generic "update".
     */
    public function attachLabel(Request $request, Conversation $conversation, \App\Models\Label $label)
    {
        $this->authorize('reply', $conversation);

        $conversation->labels()->syncWithoutDetaching([$label->id => ['created_at' => now()]]);

        return $this->success($conversation->fresh(['labels']), 'Label attached');
    }

    /**
     * DELETE /api/v1/conversations/{conversation}/labels/{label}
     */
    public function detachLabel(Request $request, Conversation $conversation, \App\Models\Label $label)
    {
        $this->authorize('reply', $conversation);

        $conversation->labels()->detach($label->id);

        return $this->success($conversation->fresh(['labels']), 'Label detached');
    }
}
