<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Contact;
use App\Models\WhatsappConnectionEvent;
use App\Services\GatewayClient;
use App\Support\AuditLogger;
use App\Traits\ApiResponse;
use Illuminate\Http\Request;
use RuntimeException;

class WhatsappController extends Controller
{
    use ApiResponse;

    public function __construct(protected GatewayClient $gateway) {}

    public function status(Request $request)
    {
        try {
            $result = $this->gateway->status();
        } catch (RuntimeException $e) {
            return $this->failure($e->getMessage(), 'gateway_unreachable', 502);
        }

        return $this->success($result['data'] ?? null, $result['message'] ?? 'OK');
    }

    public function health(Request $request)
    {
        try {
            $result = $this->gateway->health();
        } catch (RuntimeException $e) {
            return $this->failure($e->getMessage(), 'gateway_unreachable', 502);
        }

        return $this->success($result['data'] ?? $result, 'OK');
    }

    public function qr(Request $request)
    {
        try {
            $result = $this->gateway->status();
        } catch (RuntimeException $e) {
            return $this->failure($e->getMessage(), 'gateway_unreachable', 502);
        }

        $data = $result['data'] ?? [];

        return $this->success([
            'status' => $data['status'] ?? null,
            'qrCode' => $data['qrCode'] ?? null,
            'qrExpiresAt' => $data['qrExpiresAt'] ?? null,
        ], 'OK');
    }

    public function connect(Request $request)
    {
        try {
            $result = $this->gateway->connect();
        } catch (RuntimeException $e) {
            return $this->failure($e->getMessage(), 'gateway_unreachable', 502);
        }

        AuditLogger::log('whatsapp.connect', $request->user(), null, [], $request);

        return $this->success($result['data'] ?? null, $result['message'] ?? 'Connection initiated');
    }

    public function disconnect(Request $request)
    {
        try {
            $result = $this->gateway->disconnect();
        } catch (RuntimeException $e) {
            return $this->failure($e->getMessage(), 'gateway_unreachable', 502);
        }

        AuditLogger::log('whatsapp.disconnect', $request->user(), null, [], $request);

        return $this->success($result['data'] ?? null, $result['message'] ?? 'Disconnected');
    }

    public function logout(Request $request)
    {
        try {
            $result = $this->gateway->logout();
        } catch (RuntimeException $e) {
            return $this->failure($e->getMessage(), 'gateway_unreachable', 502);
        }

        AuditLogger::log('whatsapp.logout', $request->user(), null, [], $request);

        return $this->success($result['data'] ?? null, $result['message'] ?? 'Logged out; re-authentication required');
    }

    public function reconnect(Request $request)
    {
        try {
            $result = $this->gateway->reconnect();
        } catch (RuntimeException $e) {
            return $this->failure($e->getMessage(), 'gateway_unreachable', 502);
        }

        AuditLogger::log('whatsapp.reconnect', $request->user(), null, [], $request);

        return $this->success($result['data'] ?? null, $result['message'] ?? 'Reconnection initiated');
    }

    /**
     * POST /api/v1/whatsapp/reset-data
     * Destructive, audit-logged action: logs the WhatsApp session out (a fresh
     * QR is required to reconnect) and clears the previous session's chat data.
     * The gateway owns and purges the chats + whatsapp_contacts (see
     * docs/DATA_OWNERSHIP.md), while the backend archives the CRM contacts that
     * were linked to those whatsapp_contacts. Leads/deals/tasks that reference
     * those contacts are preserved (soft delete only).
     */
    public function resetData(Request $request)
    {
        $workspaceId = $request->user()->workspace_id;

        // Capture the linked CRM contact ids BEFORE the gateway purge - the
        // gateway's whatsapp_contacts delete nulls the FK (ON DELETE SET NULL).
        $linkedContactIds = Contact::query()
            ->where('workspace_id', $workspaceId)
            ->whereNotNull('whatsapp_contact_id')
            ->pluck('id');

        try {
            $result = $this->gateway->resetData($workspaceId);
        } catch (RuntimeException $e) {
            return $this->failure($e->getMessage(), 'gateway_unreachable', 502);
        }

        $archivedContacts = 0;
        if ($linkedContactIds->isNotEmpty()) {
            $archivedContacts = Contact::query()
                ->whereIn('id', $linkedContactIds)
                ->get()
                ->each(fn (Contact $contact) => $contact->delete())
                ->count();
        }

        AuditLogger::log('whatsapp.data_cleared', $request->user(), null, [
            'conversations' => $result['data']['conversations'] ?? null,
            'messages' => $result['data']['messages'] ?? null,
            'whatsapp_contacts' => $result['data']['whatsappContacts'] ?? null,
            'archived_contacts' => $archivedContacts,
        ], $request);

        return $this->success([
            'conversations' => $result['data']['conversations'] ?? null,
            'messages' => $result['data']['messages'] ?? null,
            'whatsappContacts' => $result['data']['whatsappContacts'] ?? null,
            'archivedContacts' => $archivedContacts,
            'session' => $result['data']['session'] ?? null,
        ], 'WhatsApp chat history and linked contacts cleared. Reconnect with a fresh QR.');
    }

    /**
     * Connection-event history is a gateway-owned, read-only table
     * (whatsapp_connection_events - see docs/DATA_OWNERSHIP.md), so this
     * reads straight from the database rather than proxying to the gateway.
     */
    public function connectionHistory(Request $request)
    {
        $limit = (int) $request->integer('limit', 50);
        $limit = max(1, min($limit, 200));

        $events = WhatsappConnectionEvent::query()
            ->where('workspace_id', $request->user()->workspace_id)
            ->orderByDesc('occurred_at')
            ->limit($limit)
            ->get(['id', 'event_type', 'metadata', 'occurred_at']);

        return $this->success($events, 'OK');
    }
}
