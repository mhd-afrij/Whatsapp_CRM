<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Contact;
use App\Models\WhatsappConnectionEvent;
use App\Models\WhatsappContact;
use App\Services\ContactAutoLinker;
use App\Services\GatewayClient;
use App\Support\AuditLogger;
use App\Traits\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
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

    /**
     * GET /api/v1/whatsapp/health
     * Proxies the gateway's public /whatsapp/health endpoint (socket status +
     * infrastructure checks), used by the WhatsApp health settings page.
     */
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

    /**
     * PUT /api/v1/whatsapp/contacts/{whatsappContact}
     * Saves agent-edited customer details (display name / phone number) for a
     * WhatsApp conversation. The gateway owns whatsapp_contacts, so the write
     * is proxied through its internal API; this endpoint then provisions or
     * links the CRM Contact (ContactAutoLinker) and syncs conversation links so
     * the inbox immediately renders the saved name instead of the push name.
     */
    public function updateContact(Request $request, WhatsappContact $whatsappContact, ContactAutoLinker $autoLinker)
    {
        $validator = Validator::make($request->all(), [
            'name' => ['nullable', 'string', 'max:191'],
            'phone' => ['nullable', 'string', 'max:32'],
        ]);

        if ($validator->fails()) {
            return $this->error('The given data was invalid.', $validator->errors());
        }

        $data = $validator->validated();

        try {
            $this->gateway->updateContact(
                $request->user()->workspace_id,
                $whatsappContact->id,
                $data['name'] ?? null,
                $data['phone'] ?? null,
            );
        } catch (RuntimeException $e) {
            return $this->failure($e->getMessage(), 'gateway_unreachable', 502);
        }

        $whatsappContact->refresh();

        // Provision/link a CRM contact. Number-hidden @lid rows are skipped by
        // the linker until they carry a phone - which saving a number unlocks.
        $autoLinker->ensureForWhatsappContact($whatsappContact);
        $whatsappContact->refresh();

        $linked = $whatsappContact->contact_id ? $whatsappContact->contact : null;

        if ($linked) {
            $update = [];
            if (array_key_exists('name', $data)) {
                $update['full_name'] = $data['name'];
            }
            if (($data['phone'] ?? null) !== null) {
                $update['phone_number'] = $data['phone'];
            }
            if ($update) {
                $linked->update($update);
            }

            // The inbox/conversation list renders the CRM contact's name first;
            // point every conversation at it so the saved details show up now.
            foreach ($whatsappContact->conversations as $conversation) {
                if ($conversation->contact_id === null) {
                    $conversation->update(['contact_id' => $linked->id]);
                }
            }
        }

        return $this->success([
            'whatsapp_contact_id' => $whatsappContact->id,
            'wa_jid' => $whatsappContact->wa_jid,
            'contact_name' => $whatsappContact->contact_name,
            'phone_number' => $whatsappContact->phone_number,
            'contact' => $linked ? $linked->only(['id', 'full_name', 'phone_number']) : null,
        ], 'Contact details saved');
    }
}
