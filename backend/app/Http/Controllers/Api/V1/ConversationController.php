<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Contact;
use App\Models\Conversation;
use App\Models\ConversationAssignment;
use App\Models\ConversationParticipant;
use App\Models\Label;
use App\Models\Message;
use App\Models\MessageDispatchQueue;
use App\Models\User;
use App\Models\UserPresence;
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

    public function __construct(protected GatewayClient $gateway) {}

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

        if (! $request->boolean('archived')) {
            $query->whereNull('archived_at');
        }

        if ($request->filled('search')) {
            $search = $request->string('search')->toString();
            $query->where(function ($matches) use ($search) {
                $matches->whereHas('contact', fn ($contact) => $contact
                    ->where('full_name', 'like', "%{$search}%")
                    ->orWhere('phone_number', 'like', "%{$search}%"))
                    ->orWhereHas('whatsappContact', fn ($contact) => $contact
                        ->where('push_name', 'like', "%{$search}%")
                        ->orWhere('phone_number', 'like', "%{$search}%")
                        ->orWhere('wa_jid', 'like', "%{$search}%"))
                    ->orWhereHas('messages', fn ($message) => $message->where('body', 'like', "%{$search}%"))
                    ->orWhereHas('labels', fn ($label) => $label->where('name', 'like', "%{$search}%"));
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

        if ($request->boolean('starred')) {
            $query->whereNotNull('starred_at');
        }

        if ($request->boolean('pinned')) {
            $query->whereNotNull('pinned_at');
        }

        if ($request->boolean('groups')) {
            $query->whereHas('whatsappContact', fn ($q) => $q->where('wa_jid', 'like', '%@g.us'));
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
     * POST /api/v1/conversations
     * Start (find or create) a WhatsApp conversation for a contact.
     */
    public function store(Request $request)
    {
        $user = $request->user();
        $validator = Validator::make($request->all(), [
            'contact_id' => 'required|integer|exists:contacts,id',
        ]);

        if ($validator->fails()) {
            return $this->error('The given data was invalid.', $validator->errors());
        }

        $contactId = $validator->validated()['contact_id'];
        $contact = Contact::where('id', $contactId)
            ->where('workspace_id', $user->workspace_id)
            ->first();

        if (! $contact) {
            return $this->error('Contact not found', [], 404);
        }

        if (! $contact->phone_number) {
            return $this->error('Contact does not have a phone number', [], 422);
        }

        try {
            $existingConversation = Conversation::where('workspace_id', $user->workspace_id)
                ->whereHas('whatsappContact', function ($q) use ($contact) {
                    $q->where('contact_id', $contact->id);
                })
                ->first();

            if ($existingConversation) {
                $existingConversation->load(['whatsappContact', 'contact', 'assignedUser', 'assignedTeam', 'labels']);
                return $this->success($existingConversation, 'OK');
            }

            $response = $this->gateway->startConversation([
                'workspaceId' => $user->workspace_id,
                'phoneNumber' => $contact->phone_number,
                'contactId' => $contact->id,
            ]);

            $conversationId = $response['data']['conversationId'] ?? null;
            if (! $conversationId) {
                throw new RuntimeException('Gateway did not return a conversation ID');
            }

            $conversation = Conversation::with(['whatsappContact', 'contact', 'assignedUser', 'assignedTeam', 'labels'])
                ->find($conversationId);

            if (! $conversation) {
                throw new RuntimeException('Created conversation not found');
            }

            if (! $conversation->assigned_user_id) {
                $conversation->update(['assigned_user_id' => $user->id]);
            }

            AuditLogger::log('conversation.created', $user, $conversation, [], $request);

            return $this->success($conversation, 'Conversation started', [], 201);
        } catch (RuntimeException $e) {
            return $this->error('Failed to start conversation: '.$e->getMessage(), [], 500);
        }
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
            'body' => 'nullable|string|max:65535',
            'media' => 'sometimes|array',
            'media.storage_path' => 'required_with:media|string',
            'media.mime_type' => 'required_with:media|string',
            'media.file_name' => 'sometimes|nullable|string|max:255',
            'media.size_bytes' => 'sometimes|nullable|integer|min:0',
            'media.checksum_sha256' => 'sometimes|nullable|string|max:64',
            'replied_to_message_id' => 'sometimes|nullable|integer|exists:messages,id',
        ]);

        if ($validator->fails()) {
            return $this->error('The given data was invalid.', $validator->errors());
        }

        $data = $validator->validated();
        $idempotencyKey = (string) Str::uuid();

        $replyToWhatsappMessageId = null;
        if (! empty($data['replied_to_message_id'])) {
            $repliedMessage = Message::query()->find($data['replied_to_message_id']);
            $replyToWhatsappMessageId = $repliedMessage?->whatsapp_message_id;
        }

        $payload = [
            'workspaceId' => $conversation->workspace_id,
            'conversationId' => $conversation->id,
            'content' => ! empty($data['body']) ? $data['body'] : null,
            'mediaRef' => $data['media']['storage_path'] ?? null,
            'mediaMimeType' => $data['media']['mime_type'] ?? null,
            'mediaFileName' => $data['media']['file_name'] ?? null,
            'mediaSizeBytes' => $data['media']['size_bytes'] ?? null,
            'mediaChecksumSha256' => $data['media']['checksum_sha256'] ?? null,
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
            // once the BullMQ worker finishes. Poll briefly (max ~500 ms) so the user gets the
            // real persisted message when the worker is fast, but fall through to a 202 queued
            // response instead of blocking the PHP process for seconds.
            for ($attempt = 0; $attempt < 5 && ! $message; $attempt++) {
                $dispatch = MessageDispatchQueue::query()->find($dispatchId);

                if (! $dispatch) {
                    usleep(100_000);

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

                usleep(100_000);
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
     * PATCH /api/v1/conversations/{id}/archive
     */
    public function archive(Request $request, Conversation $conversation)
    {
        $this->authorize('archive', $conversation);

        if ($conversation->archived_at) {
            return $this->error('Conversation is already archived.', null, 409);
        }

        $conversation->forceFill([
            'archived_at' => now(),
            'status' => 'closed',
            'closed_at' => $conversation->closed_at ?? now(),
            'closed_by' => $conversation->closed_by ?? $request->user()->id,
        ])->save();

        AuditLogger::log('conversation.archived', $request->user(), $conversation, [], $request);
        $this->relayConversationEvent('conversation.updated', $conversation, [
            'archivedAt' => optional($conversation->archived_at)->toIso8601String(),
        ]);

        return $this->success($conversation->fresh(), 'Conversation archived');
    }

    /**
     * PATCH /api/v1/conversations/{id}/unarchive
     */
    public function unarchive(Request $request, Conversation $conversation)
    {
        $this->authorize('unarchive', $conversation);

        if (! $conversation->archived_at) {
            return $this->error('Conversation is not archived.', null, 409);
        }

        $conversation->forceFill([
            'archived_at' => null,
            'status' => 'open',
            'closed_at' => null,
            'closed_by' => null,
        ])->save();

        AuditLogger::log('conversation.unarchived', $request->user(), $conversation, [], $request);
        $this->relayConversationEvent('conversation.updated', $conversation, [
            'archivedAt' => null,
        ]);

        return $this->success($conversation->fresh(), 'Conversation unarchived');
    }

    /**
     * PATCH /api/v1/conversations/{id}/pin
     */
    public function pin(Request $request, Conversation $conversation)
    {
        $this->authorize('pin', $conversation);

        $conversation->forceFill(['pinned_at' => now()])->save();
        AuditLogger::log('conversation.pinned', $request->user(), $conversation, [], $request);
        $this->relayConversationEvent('conversation.updated', $conversation, [
            'pinnedAt' => optional($conversation->pinned_at)->toIso8601String(),
        ]);

        return $this->success($conversation->fresh(), 'Conversation pinned');
    }

    /**
     * PATCH /api/v1/conversations/{id}/unpin
     */
    public function unpin(Request $request, Conversation $conversation)
    {
        $this->authorize('pin', $conversation);

        $conversation->forceFill(['pinned_at' => null])->save();
        AuditLogger::log('conversation.unpinned', $request->user(), $conversation, [], $request);
        $this->relayConversationEvent('conversation.updated', $conversation, ['pinnedAt' => null]);

        return $this->success($conversation->fresh(), 'Conversation unpinned');
    }

    /**
     * PATCH /api/v1/conversations/{id}/mute
     */
    public function mute(Request $request, Conversation $conversation)
    {
        $this->authorize('mute', $conversation);

        $until = $request->filled('muted_until')
            ? $request->date('muted_until')
            : now()->addDay();

        $conversation->forceFill(['muted_until' => $until])->save();
        AuditLogger::log('conversation.muted', $request->user(), $conversation, [
            'muted_until' => $until?->toIso8601String(),
        ], $request);
        $this->relayConversationEvent('conversation.updated', $conversation, [
            'mutedUntil' => optional($conversation->muted_until)->toIso8601String(),
        ]);

        return $this->success($conversation->fresh(), 'Conversation muted');
    }

    /**
     * PATCH /api/v1/conversations/{id}/unmute
     */
    public function unmute(Request $request, Conversation $conversation)
    {
        $this->authorize('mute', $conversation);

        $conversation->forceFill(['muted_until' => null])->save();
        AuditLogger::log('conversation.unmuted', $request->user(), $conversation, [], $request);
        $this->relayConversationEvent('conversation.updated', $conversation, ['mutedUntil' => null]);

        return $this->success($conversation->fresh(), 'Conversation unmuted');
    }

    /**
     * PATCH /api/v1/conversations/{id}/star
     */
    public function star(Request $request, Conversation $conversation)
    {
        $this->authorize('pin', $conversation);

        $conversation->forceFill(['starred_at' => now()])->save();
        AuditLogger::log('conversation.starred', $request->user(), $conversation, [], $request);
        $this->relayConversationEvent('conversation.updated', $conversation, [
            'starredAt' => optional($conversation->starred_at)->toIso8601String(),
        ]);

        return $this->success($conversation->fresh(), 'Conversation starred');
    }

    /**
     * PATCH /api/v1/conversations/{id}/unstar
     */
    public function unstar(Request $request, Conversation $conversation)
    {
        $this->authorize('pin', $conversation);

        $conversation->forceFill(['starred_at' => null])->save();
        AuditLogger::log('conversation.unstarred', $request->user(), $conversation, [], $request);
        $this->relayConversationEvent('conversation.updated', $conversation, ['starredAt' => null]);

        return $this->success($conversation->fresh(), 'Conversation unstarred');
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
     * POST /api/v1/presence
     * Update the current user's presence status.
     * Uses Redis for ephemeral presence to avoid database writes on every heartbeat.
     */
    public function updatePresence(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'status' => 'required|in:online,away,offline,busy',
        ]);

        if ($validator->fails()) {
            return $this->error('The given data was invalid.', $validator->errors());
        }

        $user = $request->user();
        $status = $request->string('status');

        // Update in database for persistence
        UserPresence::updateOrCreate(
            ['user_id' => $user->id],
            ['status' => $status, 'last_active_at' => now()]
        );

        // Broadcast presence update via gateway
        try {
            $this->gateway->emitEvent('presence.updated', $user->workspace_id, null, [
                'userId' => $user->id,
                'status' => $status,
                'lastSeen' => now()->toIso8601String(),
                'name' => $user->name,
            ]);
        } catch (RuntimeException $e) {
            // Presence updates are best-effort
            Log::warning('Failed to broadcast presence update', [
                'user_id' => $user->id,
                'error' => $e->getMessage(),
            ]);
        }

        return $this->success(null, 'Presence updated');
    }

    /**
     * GET /api/v1/presence
     * Get presence status for all users in the workspace.
     */
    public function getPresence(Request $request)
    {
        $workspaceId = $request->user()->workspace_id;

        $presences = UserPresence::query()
            ->whereHas('user', fn ($q) => $q->where('workspace_id', $workspaceId))
            ->with('user:id,name,email')
            ->get()
            ->map(fn ($presence) => [
                'user_id' => $presence->user_id,
                'name' => $presence->user->name,
                'status' => $presence->status,
                'last_active_at' => $presence->last_active_at->toIso8601String(),
            ]);

        return $this->success($presences, 'OK');
    }

    /**
     * GET /api/v1/conversations/{id}/assignment-history
     * Get the assignment history for a conversation.
     */
    public function assignmentHistory(Request $request, Conversation $conversation)
    {
        $this->authorize('view', $conversation);

        $assignments = ConversationAssignment::query()
            ->where('conversation_id', $conversation->id)
            ->with(['assignedToUser:id,name', 'assignedToTeam:id,name', 'assignedBy:id,name'])
            ->orderByDesc('assigned_at')
            ->get()
            ->map(fn ($assignment) => [
                'id' => $assignment->id,
                'assigned_to_user_id' => $assignment->assigned_to_user_id,
                'assigned_to_team_id' => $assignment->assigned_to_team_id,
                'assigned_by' => $assignment->assignedBy?->name,
                'assigned_at' => $assignment->assigned_at->toIso8601String(),
                'unassigned_at' => $assignment->unassigned_at?->toIso8601String(),
                'assigned_to_user' => $assignment->assignedToUser?->name,
                'assigned_to_team' => $assignment->assignedToTeam?->name,
            ]);

        return $this->success($assignments, 'OK');
    }

    /**
     * DELETE /api/v1/conversations/{conversation}/messages/{message}/revoke
     * Revoke a message for everyone in the conversation.
     */
    public function revokeMessage(Request $request, Conversation $conversation, Message $message)
    {
        $this->authorize('reply', $conversation);

        $conversation->load('whatsappContact');

        if (! $conversation->whatsappContact) {
            return $this->error('No WhatsApp contact linked to this conversation.', null, 404);
        }

        // Only allow revoking outbound messages sent by the current user
        if ($message->direction !== 'outbound') {
            return $this->error('You can only revoke your own messages.', null, 403);
        }

        if ($message->sender_type !== 'user' || $message->sender_id !== $request->user()->id) {
            return $this->error('You can only revoke your own messages.', null, 403);
        }

        try {
            $this->gateway->revokeMessage(
                $conversation->workspace_id,
                $conversation->id,
                $conversation->whatsappContact->wa_jid,
                $message->whatsapp_message_id,
                $request->user()->id
            );
        } catch (RuntimeException $e) {
            return $this->failure($e->getMessage(), 'gateway_unreachable', 502);
        }

        return $this->success(null, 'Message revoked');
    }

    /**
     * POST /api/v1/conversations/{conversation}/messages/{message}/reaction
     * Add or remove a reaction to a message.
     */
    public function addReaction(Request $request, Conversation $conversation, Message $message)
    {
        $this->authorize('view', $conversation);

        $validator = Validator::make($request->all(), [
            'emoji' => 'required|string|max:8',
        ]);

        if ($validator->fails()) {
            return $this->error('The given data was invalid.', $validator->errors());
        }

        $conversation->load('whatsappContact');

        if (! $conversation->whatsappContact) {
            return $this->error('No WhatsApp contact linked to this conversation.', null, 404);
        }

        try {
            $this->gateway->sendReaction(
                $conversation->workspace_id,
                $conversation->id,
                $conversation->whatsappContact->wa_jid,
                $message->whatsapp_message_id,
                $request->string('emoji'),
                false,
                $request->user()->id,
                $request->user()->name
            );
        } catch (RuntimeException $e) {
            return $this->failure($e->getMessage(), 'gateway_unreachable', 502);
        }

        return $this->success(null, 'Reaction added');
    }

    /**
     * DELETE /api/v1/conversations/{conversation}/messages/{message}/reaction
     * Remove a reaction from a message.
     */
    public function removeReaction(Request $request, Conversation $conversation, Message $message)
    {
        $this->authorize('view', $conversation);

        $validator = Validator::make($request->all(), [
            'emoji' => 'required|string|max:8',
        ]);

        if ($validator->fails()) {
            return $this->error('The given data was invalid.', $validator->errors());
        }

        $conversation->load('whatsappContact');

        if (! $conversation->whatsappContact) {
            return $this->error('No WhatsApp contact linked to this conversation.', null, 404);
        }

        try {
            $this->gateway->sendReaction(
                $conversation->workspace_id,
                $conversation->id,
                $conversation->whatsappContact->wa_jid,
                $message->whatsapp_message_id,
                $request->string('emoji'),
                true,
                $request->user()->id,
                $request->user()->name
            );
        } catch (RuntimeException $e) {
            return $this->failure($e->getMessage(), 'gateway_unreachable', 502);
        }

        return $this->success(null, 'Reaction removed');
    }

    /**
     * POST /api/v1/conversations/{id}/typing
     * Send a typing indicator to the WhatsApp contact for this conversation.
     * The gateway will send the presence update to WhatsApp and broadcast
     * the typing event to other agents via Socket.IO.
     */
    public function typing(Request $request, Conversation $conversation)
    {
        $this->authorize('view', $conversation);

        $validator = Validator::make($request->all(), [
            'is_typing' => 'required|boolean',
        ]);

        if ($validator->fails()) {
            return $this->error('The given data was invalid.', $validator->errors());
        }

        $conversation->load('whatsappContact');

        if (! $conversation->whatsappContact) {
            return $this->error('No WhatsApp contact linked to this conversation.', null, 404);
        }

        try {
            $this->gateway->sendTypingIndicator(
                $conversation->workspace_id,
                $conversation->id,
                $conversation->whatsappContact->wa_jid,
                $request->boolean('is_typing'),
                $request->user()->id,
                $request->user()->name
            );
        } catch (RuntimeException $e) {
            // Typing indicators are best-effort; don't fail the request
            Log::warning('Failed to send typing indicator', [
                'conversation_id' => $conversation->id,
                'error' => $e->getMessage(),
            ]);
        }

        return $this->success(null, 'Typing indicator sent');
    }

    /**
     * POST /api/v1/conversations/{conversation}/labels/{label}
     * Gated on `reply` (the general "can act on this conversation" permission) rather than
     * a dedicated policy method - conversations have no generic "update".
     */
    public function attachLabel(Request $request, Conversation $conversation, Label $label)
    {
        $this->authorize('reply', $conversation);

        $conversation->labels()->syncWithoutDetaching([$label->id => ['created_at' => now()]]);

        return $this->success($conversation->fresh(['labels']), 'Label attached');
    }

    /**
     * DELETE /api/v1/conversations/{conversation}/labels/{label}
     */
    public function detachLabel(Request $request, Conversation $conversation, Label $label)
    {
        $this->authorize('reply', $conversation);

        $conversation->labels()->detach($label->id);

        return $this->success($conversation->fresh(['labels']), 'Label detached');
    }

    /**
     * GET /api/v1/conversations/{conversation}/messages/search?q={query}
     * Search for messages within a conversation by body text.
     */
    public function searchMessages(Request $request, Conversation $conversation)
    {
        $this->authorize('view', $conversation);

        $validated = Validator::make($request->all(), [
            'q' => 'required|string|min:1|max:100',
            'per_page' => 'integer|min:1|max:100',
            'page' => 'integer|min:1',
        ])->validate();

        $query = $conversation->messages()
            ->where('body', 'like', "%{$validated['q']}%")
            ->with(['media', 'reactions', 'statusEvents'])
            ->orderBy('created_at', 'desc');

        $messages = $query->paginate($request->integer('per_page', 30));

        return $this->success($messages, 'Messages found');
    }

    /**
     * GET /api/v1/conversations/{conversation}/messages/{message}/status-events
     * Get the status event history for a message (sending/sent/delivered/read/failed).
     */
    public function messageStatusEvents(Request $request, Conversation $conversation, Message $message)
    {
        $this->authorize('view', $conversation);

        if ($message->conversation_id !== $conversation->id) {
            return $this->error('Message not found in this conversation', null, 404);
        }

        $statusEvents = $message->statusEvents()
            ->orderBy('created_at', 'asc')
            ->get();

        return $this->success($statusEvents, 'Message status events retrieved');
    }

    /**
     * GET /api/v1/conversations/{conversation}/messages/{message}/reactions
     * Get all reactions on a message, including who reacted.
     */
    public function messageReactions(Request $request, Conversation $conversation, Message $message)
    {
        $this->authorize('view', $conversation);

        if ($message->conversation_id !== $conversation->id) {
            return $this->error('Message not found in this conversation', null, 404);
        }

        $reactions = $message->reactions()
            ->with(['user' => function ($q) {
                $q->select('id', 'name', 'email');
            }])
            ->get()
            ->groupBy('emoji')
            ->map(function ($group) {
                return [
                    'emoji' => $group->first()->emoji,
                    'count' => $group->count(),
                    'reactors' => $group->map(function ($reaction) {
                        return [
                            'user_id' => $reaction->user_id,
                            'user_name' => $reaction->user?->name ?? 'Unknown',
                            'reacted_at' => $reaction->reacted_at,
                        ];
                    })->values(),
                ];
            })
            ->values();

        return $this->success($reactions, 'Message reactions retrieved');
    }

    /**
     * DELETE /api/v1/conversations/{conversation}/messages
     * Clears the conversation's message history via the gateway (which owns the
     * messages table and the last-message summary columns). The conversation
     * row survives so the thread can continue.
     */
    public function clearMessages(Request $request, Conversation $conversation)
    {
        $this->authorize('close', $conversation);

        try {
            $result = $this->gateway->clearConversation($conversation->id, $conversation->workspace_id);
        } catch (RuntimeException $e) {
            return $this->failure($e->getMessage(), 'gateway_unreachable', 502);
        }

        return $this->success([
            'conversation_id' => $conversation->id,
            'messages_deleted' => $result['data']['messagesDeleted'] ?? 0,
        ], 'Conversation cleared');
    }

    /**
     * DELETE /api/v1/conversations/{conversation}
     * Permanently deletes the conversation (and every gateway-owned row it
     * cascades) via the gateway. This is a hard delete - there is no restore.
     */
    public function deleteConversation(Request $request, Conversation $conversation)
    {
        $this->authorize('close', $conversation);

        try {
            $this->gateway->deleteConversation($conversation->id, $conversation->workspace_id);
        } catch (RuntimeException $e) {
            return $this->failure($e->getMessage(), 'gateway_unreachable', 502);
        }

        return $this->success(['conversation_id' => $conversation->id], 'Conversation deleted');
    }

    /**
     * PATCH /api/v1/conversations/{conversation}/block
     * Marks the conversation's contact as blocked. Best-effort realtime relay
     * to the gateway so other agents' inboxes reflect the state immediately;
     * a gateway outage never fails the mutation (the flag is backend-owned).
     */
    public function block(Request $request, Conversation $conversation)
    {
        $this->authorize('close', $conversation);

        $conversation->forceFill(['blocked_at' => now()])->save();

        $payload = ['id' => $conversation->id, 'blocked_at' => $conversation->fresh()->blocked_at];
        $this->relayConversationEvent('conversation.updated', $conversation, $payload);

        return $this->success($conversation->fresh(['whatsappContact', 'contact', 'assignedUser', 'assignedTeam', 'labels']), 'Contact blocked');
    }

    /**
     * PATCH /api/v1/conversations/{conversation}/unblock
     */
    public function unblock(Request $request, Conversation $conversation)
    {
        $this->authorize('close', $conversation);

        $conversation->forceFill(['blocked_at' => null])->save();

        $payload = ['id' => $conversation->id, 'blocked_at' => null];
        $this->relayConversationEvent('conversation.updated', $conversation, $payload);

        return $this->success($conversation->fresh(['whatsappContact', 'contact', 'assignedUser', 'assignedTeam', 'labels']), 'Contact unblocked');
    }

    /**
     * PATCH /api/v1/conversations/{conversation}/report
     * Flags a conversation for review. `report_reason` is free text; reports
     * are backend-owned and never touch the gateway's tables.
     */
    public function report(Request $request, Conversation $conversation)
    {
        $this->authorize('close', $conversation);

        $validated = Validator::make($request->all(), [
            'reason' => 'required|string|max:500',
        ])->validate();

        $conversation->forceFill([
            'reported_at' => now(),
            'report_reason' => $validated['reason'],
        ])->save();

        $payload = ['id' => $conversation->id, 'reported_at' => $conversation->fresh()->reported_at];
        $this->relayConversationEvent('conversation.updated', $conversation, $payload);

        return $this->success($conversation->fresh(['whatsappContact', 'contact', 'assignedUser', 'assignedTeam', 'labels']), 'Conversation reported');
    }

    /**
     * POST /api/v1/conversations/{conversation}/messages/{message}/retry
     * Re-dispatches a failed outbound message to the gateway, reconstructing
     * the original send payload (body, media, reply reference) from the
     * persisted message row. Only messages sent by the current user can be
     * retried. The gateway creates a fresh outbound message (WhatsApp has no
     * true "resend"); the failed row stays as history.
     */
    public function retryMessage(Request $request, Conversation $conversation, Message $message)
    {
        $this->authorize('reply', $conversation);

        if ($message->conversation_id !== $conversation->id) {
            return $this->error('Message not found in this conversation', null, 404);
        }

        if ($message->direction !== 'outbound') {
            return $this->error('You can only retry outbound messages.', null, 403);
        }

        if ($message->sender_user_id !== $request->user()->id) {
            return $this->error('You can only retry your own messages.', null, 403);
        }

        if ($message->status !== 'failed') {
            return $this->error('Only failed messages can be retried.', null, 422);
        }

        $message->load('media');

        $replyToWhatsappMessageId = null;
        if ($message->replied_to_message_id) {
            $replyToWhatsappMessageId = Message::query()
                ->where('id', $message->replied_to_message_id)
                ->value('whatsapp_message_id');
        }

        $payload = [
            'workspaceId' => $conversation->workspace_id,
            'conversationId' => $conversation->id,
            'content' => $message->body,
            'mediaRef' => $message->media?->storage_path,
            'mediaMimeType' => $message->media?->mime_type,
            'mediaFileName' => $message->media?->file_name,
            'mediaSizeBytes' => $message->media?->file_size_bytes,
            'mediaChecksumSha256' => $message->media?->checksum_sha256,
            'replyToWhatsappMessageId' => $replyToWhatsappMessageId,
            'requestedByUserId' => $request->user()->id,
            'idempotencyKey' => (string) Str::uuid(),
        ];

        try {
            $result = $this->gateway->sendMessage($payload);
        } catch (RuntimeException $e) {
            return $this->failure($e->getMessage(), 'gateway_unreachable', 502);
        }

        $messageFromResult = $this->resolveSendResult($result);

        if (! $messageFromResult) {
            $dispatchId = $result['data']['dispatchId'] ?? $result['data']['dispatch_id'] ?? null;

            if ($dispatchId) {
                return $this->success([
                    'dispatchId' => (int) $dispatchId,
                    'status' => 'pending',
                    'bullmqJobId' => $result['data']['bullmqJobId'] ?? $result['data']['bullmq_job_id'] ?? null,
                ], 'Message requeued', null, 202);
            }

            return $this->failure(
                'The gateway accepted the retry but the message has not appeared yet. Retry shortly.',
                'message_not_yet_visible',
                502
            );
        }

        return $this->success($messageFromResult, 'Message sent', null, 201);
    }

    /**
     * Mirrors the send-result resolution in storeMessage(): a synchronous
     * message row from the gateway response, else a brief poll of the
     * dispatch queue for the persisted outbound message, else null (which the
     * caller turns into a 202 queued ack).
     */
    protected function resolveSendResult(array $result): ?Message
    {
        $messageId = $result['data']['message']['id'] ?? $result['data']['id'] ?? null;
        $dispatchId = $result['data']['dispatchId'] ?? $result['data']['dispatch_id'] ?? null;

        if ($messageId) {
            for ($attempt = 0; $attempt < 3; $attempt++) {
                $message = Message::query()->with(['media', 'sender'])->find($messageId);
                if ($message) {
                    return $message;
                }
                usleep(50_000);
            }

            return null;
        }

        if ($dispatchId) {
            for ($attempt = 0; $attempt < 5; $attempt++) {
                $dispatch = MessageDispatchQueue::query()->find($dispatchId);

                if (! $dispatch) {
                    usleep(100_000);

                    continue;
                }

                if ($dispatch->status === 'failed') {
                    return null;
                }

                if ($dispatch->message_id) {
                    $message = Message::query()->with(['media', 'sender'])->find($dispatch->message_id);
                    if ($message) {
                        return $message;
                    }
                }

                usleep(100_000);
            }
        }

        return null;
    }
}
