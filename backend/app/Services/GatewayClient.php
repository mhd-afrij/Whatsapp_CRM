<?php

namespace App\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Thin HTTP client for the whatsapp-gateway's internal control API
 * (see whatsapp-gateway/src/routes/internal-whatsapp.routes.ts). Every
 * call is authenticated with a shared secret header, never exposed to
 * end users directly - only reachable through WhatsappController, which
 * additionally gates access behind the whatsapp.connection.manage permission.
 */
class GatewayClient
{
    public function status(): array
    {
        return $this->request('get', '/internal/whatsapp/status');
    }

    public function health(): array
    {
        return $this->request('get', '/whatsapp/health');
    }

    public function connect(): array
    {
        return $this->request('post', '/internal/whatsapp/connect');
    }

    public function disconnect(): array
    {
        return $this->request('post', '/internal/whatsapp/disconnect');
    }

    public function logout(): array
    {
        return $this->request('post', '/internal/whatsapp/logout');
    }

    public function reconnect(): array
    {
        return $this->request('post', '/internal/whatsapp/reconnect');
    }

    /**
     * Destructive reset: asks the gateway to log the WhatsApp session out
     * (forcing a fresh QR re-pair) and purge every gateway-owned row for the
     * workspace - chats, whatsapp_contacts, the dispatch queue / processing
     * failures and the sync checkpoints. Backend-owned rows (leads, deals,
     * tasks, CRM contacts) are never touched by the gateway; the caller is
     * responsible for any backend-side cleanup. Returns the deleted-row
     * counts plus the post-logout session snapshot.
     */
    public function resetData(int $workspaceId): array
    {
        return $this->request('post', '/internal/whatsapp/reset-data', ['workspaceId' => $workspaceId]);
    }

    public function events(int $limit = 50): array
    {
        return $this->request('get', '/internal/whatsapp/events', ['limit' => $limit]);
    }

    /**
     * Ask the gateway to send an outbound WhatsApp message (docs/05-api-contract.md §22,
     * `/internal/gateway/send-message` — implemented gateway-side under
     * `/internal/whatsapp/messages/send`). The gateway performs the Baileys send and is the
     * only writer of the `messages` table; on success it responds synchronously with the
     * persisted message record so the backend can read it back without a network round trip
     * to the socket layer.
     */
    public function sendMessage(array $payload): array
    {
        return $this->request('post', '/internal/whatsapp/messages/send', $payload);
    }

    /**
     * Start (find or create) a WhatsApp conversation for a contact by phone number.
     * Returns the conversation ID, ready to use for sending messages.
     */
    public function startConversation(array $payload): array
    {
        return $this->request('post', '/internal/whatsapp/conversations/start', $payload);
    }

    /**
     * Ask the gateway to delete every message in a conversation and reset the
     * gateway-owned conversation summary columns (last_message_at,
     * last_message_preview, unread_count). The conversation row itself stays
     * so the chat thread can continue.
     */
    public function clearConversation(int $conversationId, int $workspaceId): array
    {
        return $this->request('delete', "/internal/whatsapp/conversations/{$conversationId}/messages", ['workspaceId' => $workspaceId]);
    }

    /**
     * Ask the gateway to delete a conversation and every gateway-owned row it
     * cascades (messages, media, reactions, status events, dispatch queue,
     * participants, assignments, label links). Backend-owned CRM rows that
     * merely reference the contact are untouched.
     */
    public function deleteConversation(int $conversationId, int $workspaceId): array
    {
        return $this->request('delete', "/internal/whatsapp/conversations/{$conversationId}", ['workspaceId' => $workspaceId]);
    }

    /**
     * Resolves a message_media row to a short-lived signed URL (or, in
     * local-disk dev mode, a server-side file path) via the gateway's
     * `/internal/whatsapp/media/:mediaId/url` endpoint. Callers MUST verify
     * the requesting user can view the owning conversation before calling
     * this - see MediaController::url().
     */
    public function mediaUrl(int $mediaId, int $workspaceId): array
    {
        return $this->request('get', "/internal/whatsapp/media/{$mediaId}/url", ['workspaceId' => $workspaceId]);
    }

    /**
     * Proxies the raw bytes of a message_media row from the gateway's
     * `/internal/whatsapp/media/:mediaId/content` endpoint (local-disk dev
     * mode, where there is no public signed URL). Returns a full response
     * with the gateway's bytes + content type; the caller MUST verify the
     * requesting user can view the owning conversation first - see
     * MediaController::content().
     */
    public function mediaContent(int $mediaId, int $workspaceId): \Symfony\Component\HttpFoundation\Response
    {
        $baseUrl = rtrim((string) config('services.whatsapp_gateway.base_url'), '/');
        $token = (string) config('services.whatsapp_gateway.token');
        $timeout = (int) config('services.whatsapp_gateway.timeout', 10);

        try {
            $response = Http::withHeaders(['X-Internal-Gateway-Token' => $token])
                ->timeout($timeout)
                ->get($baseUrl."/internal/whatsapp/media/{$mediaId}/content", ['workspaceId' => $workspaceId]);
        } catch (ConnectionException $e) {
            throw new RuntimeException('Unable to reach the WhatsApp gateway service.', previous: $e);
        }

        try {
            $response->throw();
        } catch (RequestException $e) {
            throw new RuntimeException(
                'WhatsApp gateway returned an error: '.($response->json('message') ?? $response->status()),
                previous: $e,
            );
        }

        return response($response->body(), 200, [
            'Content-Type' => $response->header('Content-Type') ?: 'application/octet-stream',
        ]);
    }

    /**
     * Uploads an agent-attached file to the gateway, which stores it via its
     * own object-storage client and returns only a storage key + metadata.
     * The caller then passes `storagePath` back as `mediaRef` when dispatching
     * the outbound message (ConversationController::storeMessage), so the
     * gateway never needs a second round trip to fetch the file.
     *
     * @return array{storagePath: string, mimeType: string, fileName: ?string, sizeBytes: int, checksumSha256: string}
     */
    public function uploadMedia(int $workspaceId, string $filePath, string $originalName, string $mimeType): array
    {
        $baseUrl = rtrim((string) config('services.whatsapp_gateway.base_url'), '/');
        $token = (string) config('services.whatsapp_gateway.token');
        $timeout = (int) config('services.whatsapp_gateway.timeout', 10);

        try {
            $response = Http::withHeaders(['X-Internal-Gateway-Token' => $token])
                ->timeout($timeout)
                ->attach('file', file_get_contents($filePath), $originalName, ['Content-Type' => $mimeType])
                ->post($baseUrl.'/internal/whatsapp/media/upload', ['workspaceId' => $workspaceId]);
        } catch (ConnectionException $e) {
            throw new RuntimeException('Unable to reach the WhatsApp gateway service.', previous: $e);
        }

        try {
            $response->throw();
        } catch (RequestException $e) {
            throw new RuntimeException(
                'WhatsApp gateway rejected the media upload: '.($response->json('message') ?? $response->status()),
                previous: $e,
            );
        }

        return $response->json('data') ?? [];
    }

    /**
     * Relays a conversation-lifecycle event (decided here, on the backend)
     * to the gateway's Socket.IO layer so the inbox UI's realtime
     * subscriptions (docs/EVENT_CATALOG.md) see assign/close/reopen the same
     * way they see gateway-originated message events. Best-effort: a
     * gateway outage must never block the underlying mutation, so callers
     * should wrap this in a try/catch and log-and-continue on failure.
     */
    public function emitEvent(string $event, int $workspaceId, ?int $conversationId, array $payload): void
    {
        $this->request('post', '/internal/whatsapp/events/emit', [
            'event' => $event,
            'workspaceId' => $workspaceId,
            'conversationId' => $conversationId,
            'payload' => $payload,
        ]);
    }

    /**
     * Revoke a message for everyone in a WhatsApp conversation.
     * The gateway will send the revoke to WhatsApp and mark the message as deleted.
     */
    public function revokeMessage(int $workspaceId, int $conversationId, string $waJid, string $whatsappMessageId, ?int $userId = null): void
    {
        $this->request('post', '/internal/whatsapp/messages/revoke', [
            'workspaceId' => $workspaceId,
            'conversationId' => $conversationId,
            'waJid' => $waJid,
            'whatsappMessageId' => $whatsappMessageId,
            'userId' => $userId,
        ]);
    }

    /**
     * Send a reaction to a WhatsApp message via the gateway.
     * The gateway will send the reaction to WhatsApp and persist it in the database.
     */
    public function sendReaction(int $workspaceId, int $conversationId, string $waJid, string $whatsappMessageId, string $emoji, bool $remove = false, ?int $userId = null, ?string $name = null): void
    {
        $this->request('post', '/internal/whatsapp/messages/reaction', [
            'workspaceId' => $workspaceId,
            'conversationId' => $conversationId,
            'waJid' => $waJid,
            'whatsappMessageId' => $whatsappMessageId,
            'emoji' => $emoji,
            'remove' => $remove,
            'userId' => $userId,
            'name' => $name,
        ]);
    }

    /**
     * Send a typing indicator to a WhatsApp contact via the gateway.
     * The gateway will send the presence update to WhatsApp and broadcast
     * the typing event to the frontend via Socket.IO.
     */
    public function sendTypingIndicator(int $workspaceId, int $conversationId, string $waJid, bool $isTyping, ?int $userId = null, ?string $name = null): void
    {
        $this->request('post', '/internal/whatsapp/typing', [
            'workspaceId' => $workspaceId,
            'conversationId' => $conversationId,
            'waJid' => $waJid,
            'isTyping' => $isTyping,
            'userId' => $userId,
            'name' => $name,
        ]);
    }

    /**
     * "Mark as unread" (mirrors WhatsApp Web): asks the gateway to bump the
     * conversation's unread_count to at least 1 and emit a conversation.updated
     * so the inbox shows the unread dot again.
     */
    public function markConversationUnread(int $conversationId, int $workspaceId): array
    {
        return $this->request('post', "/internal/whatsapp/conversations/{$conversationId}/mark-unread", [
            'workspaceId' => $workspaceId,
        ]);
    }

    /**
     * Resets the gateway-owned unread_count to 0 when an agent reads the
     * conversation. Called by ConversationController::markRead alongside the
     * per-user last_read_message_id write.
     */
    public function markConversationRead(int $conversationId, int $workspaceId): array
    {
        return $this->request('post', "/internal/whatsapp/conversations/{$conversationId}/read", [
            'workspaceId' => $workspaceId,
        ]);
    }

    /**
     * Stars/unstars a message via the gateway (the messages table is
     * gateway-owned). Returns { messageId, starredAt }.
     */
    public function setMessageStarred(int $workspaceId, int $conversationId, int $messageId, bool $starred): array
    {
        return $this->request('patch', "/internal/whatsapp/conversations/{$conversationId}/messages/{$messageId}/star", [
            'workspaceId' => $workspaceId,
            'starred' => $starred,
        ]);
    }

    /**
     * WhatsApp-style "Delete for me" via the gateway (the messages table is
     * gateway-owned): stamps the message's `deleted_for_me_at` so it is hidden
     * from the workspace's inbox. Nothing is sent to WhatsApp (the contact
     * keeps their copy). Returns { messageId, deletedForMeAt }.
     */
    public function deleteMessageForMe(int $workspaceId, int $conversationId, int $messageId, ?int $userId = null): array
    {
        return $this->request('delete', "/internal/whatsapp/conversations/{$conversationId}/messages/{$messageId}/delete-for-me", [
            'workspaceId' => $workspaceId,
            'userId' => $userId,
        ]);
    }

    /**
     * Forwards a message into a conversation via the gateway, which
     * reconstructs the source content (text or stored media) and sends it with
     * WhatsApp's isForwarded marker. Returns { messageId, whatsappMessageId }.
     */
    public function forwardMessage(int $workspaceId, int $conversationId, int $sourceMessageId, int $requestedByUserId): array
    {
        return $this->request('post', "/internal/whatsapp/conversations/{$conversationId}/messages/forward", [
            'workspaceId' => $workspaceId,
            'sourceMessageId' => $sourceMessageId,
            'requestedByUserId' => $requestedByUserId,
        ]);
    }

    /**
     * Relays a `notification.created` event (Phase 12) to a single user's room
     * (`workspace:{workspaceId}:user:{userId}` in the gateway's `/gateway` Socket.IO
     * namespace - see whatsapp-gateway's emitNotificationCreated). Distinct from
     * emitEvent() because this always targets a userId, never a conversationId/broadcast.
     */
    public function notifyUser(int $workspaceId, int $userId, array $payload): void
    {
        $this->request('post', '/internal/whatsapp/events/emit', [
            'event' => 'notification.created',
            'workspaceId' => $workspaceId,
            'userId' => $userId,
            'payload' => $payload,
        ]);
    }

    protected function request(string $method, string $path, array $query = []): array
    {
        $baseUrl = rtrim((string) config('services.whatsapp_gateway.base_url'), '/');
        $token = (string) config('services.whatsapp_gateway.token');
        $timeout = (int) config('services.whatsapp_gateway.timeout', 10);

        try {
            $request = Http::withHeaders(['X-Internal-Gateway-Token' => $token])
                ->timeout($timeout);

            // Laravel's HTTP client sends the second argument as the request
            // body for every verb except GET/HEAD. The gateway's internal API
            // reads workspaceId etc. from query params on DELETE, so build the
            // query explicitly instead of relying on the body (which the
            // gateway would ignore).
            $response = $method === 'delete'
                ? $request->withQueryParameters($query)->delete($baseUrl.$path)
                : $request->{$method}($baseUrl.$path, $query);
        } catch (ConnectionException $e) {
            throw new RuntimeException('Unable to reach the WhatsApp gateway service.', previous: $e);
        }

        try {
            $response->throw();
        } catch (RequestException $e) {
            throw new RuntimeException(
                'WhatsApp gateway returned an error: '.($response->json('message') ?? $response->status()),
                previous: $e,
            );
        }

        return $response->json() ?? [];
    }
}
