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

    public function connect(): array
    {
        return $this->request('post', '/internal/whatsapp/connect');
    }

    public function disconnect(): array
    {
        return $this->request('post', '/internal/whatsapp/disconnect');
    }

    public function reconnect(): array
    {
        return $this->request('post', '/internal/whatsapp/reconnect');
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
            $response = Http::withHeaders(['X-Internal-Gateway-Token' => $token])
                ->timeout($timeout)
                ->{$method}($baseUrl.$path, $query);
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
