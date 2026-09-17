<?php

namespace App\Services;

use App\Exceptions\WhatsappAccountStateException;
use App\Models\WhatsappAccount;
use App\Models\WhatsappSession;
use RuntimeException;

/**
 * Business logic for managed WhatsApp connections (whatsapp_connections).
 *
 * Architecture (verified against the gateway source, whatsapp-gateway/src/
 * whatsapp/connection-manager-registry.ts): the gateway runs ONE live
 * Baileys session PER connection, keyed by workspace+accountId, each with
 * its own session directory + lock lease. Therefore a workspace can hold
 * many connections and every one of them may be connected concurrently.
 *
 * The backend never implements WhatsApp protocol logic: every action here
 * is a thin call into the gateway's internal API, scoped to the account's
 * own session via accountId. Live status is read from the gateway-owned
 * whatsapp_sessions row for that account (keyed by whatsapp_account_id,
 * see docs/DATA_OWNERSHIP.md) and mirrored onto the connection row.
 *
 * is_active is a routing preference (the default account for the inbox and
 * auto-routing), NOT a "one live session" guard - there is no single active
 * slot to switch between under concurrency.
 */
class WhatsappAccountService
{
    public function __construct(protected GatewayClient $gateway) {}

    // ------------------------------------------------------------------
    // Queries
    // ------------------------------------------------------------------

    /**
     * All managed connection slots for a workspace, active-first then oldest
     * first, with each row's own gateway session status mirrored onto it.
     * Workspace isolation comes from the WorkspaceScope global scope on the
     * model, so a caller can never observe another workspace's rows.
     *
     * @return \Illuminate\Database\Eloquent\Collection<int, WhatsappAccount>
     */
    public function listForWorkspace(int $workspaceId)
    {
        $accounts = WhatsappAccount::query()
            ->with('assignedTeam:id,name')
            ->orderByDesc('is_active')
            ->orderBy('id')
            ->get();

        foreach ($accounts as $account) {
            $this->applyLiveStatus($account);
        }

        return $accounts;
    }

    /**
     * Workspace-scoped lookup - the repository layer. Never findById blindly;
     * the model's global scope already constrains every query to the current
     * workspace, so a foreign id simply returns null (=> 404 upstream).
     */
    public function findForWorkspace(int $accountId): ?WhatsappAccount
    {
        return WhatsappAccount::query()->find($accountId);
    }

    // ------------------------------------------------------------------
    // Create / update / delete
    // ------------------------------------------------------------------

    /**
     * @param  array{name?: string|null, mobile_number?: string|null, assigned_team_id?: int|null, auto_reply_enabled?: bool, routing_mode?: string}  $data
     * @param  int|null  $createdBy
     */
    public function create(int $workspaceId, array $data, ?int $createdBy = null): WhatsappAccount
    {
        // Auto-generate a name if not provided.
        $name = $data['name'] ?? 'WhatsApp Account ' . (WhatsappAccount::where('workspace_id', $workspaceId)->count() + 1);

        $account = WhatsappAccount::create([
            'workspace_id' => $workspaceId,
            'name' => $name,
            'display_name' => $name,
            'provider' => WhatsappAccount::PROVIDER_BAILEYS,
            // A freshly created DB row is NEVER reported as connected - it is
            // a managed slot until a real gateway session confirms a connect.
            'status' => 'disconnected',
            // The number the user intends to link. The live phone_number is
            // later overwritten from the real gateway session once Baileys
            // confirms the pairing (syncFromGateway), so a typo can never
            // impersonate a connected identity.
            'phone_number' => $data['mobile_number'] ?? null,
            'is_active' => false,
            'auto_reply_enabled' => (bool) ($data['auto_reply_enabled'] ?? false),
            'assigned_team_id' => $data['assigned_team_id'] ?? null,
            'routing_mode' => $data['routing_mode'] ?? 'default',
            'created_by' => $createdBy,
        ]);

        return $account->fresh(['assignedTeam:id,name']);
    }

    /**
     * @param  array{name?: string, assigned_team_id?: int|null, auto_reply_enabled?: bool, routing_mode?: string}  $data
     */
    public function update(WhatsappAccount $account, array $data): WhatsappAccount
    {
        $account->fill(collect($data)->only([
            'name', 'assigned_team_id', 'auto_reply_enabled', 'routing_mode',
        ])->all());

        // Keep the legacy settings mirror in sync; display_name is what the
        // rest of the workspace-settings UI renders today.
        if (array_key_exists('name', $data)) {
            $account->display_name = $data['name'];
        }

        $account->save();

        return $account->fresh(['assignedTeam:id,name']);
    }

    /**
     * Delete a managed slot. The live gateway session is never touched by a
     * slot delete: whatsapp_connections is backend-owned bookkeeping, the
     * Baileys session belongs to the gateway (whatsapp_sessions +
     * credentials). If the deleted row happens to be the active one, the
     * session keeps running unharmed - the caller may pass
     * $deactivateGateway to also log the live session out first (used by the
     * controller when the user explicitly confirms it).
     */
    public function delete(WhatsappAccount $account, bool $deactivateGateway = false): void
    {
        if ($deactivateGateway && $account->is_active) {
            $this->gateway->logout($account->id);
        }

        $account->delete();
    }

    // ------------------------------------------------------------------
    // Gateway actions - each connection has its own Baileys session
    // ------------------------------------------------------------------

    /**
     * Start a fresh QR pairing on THIS account's gateway session and return
     * the gateway snapshot so the controller can surface the QR immediately.
     * Every account runs independently, so this never touches other slots.
     *
     * @return array{status: ?string, qrCode: ?string, qrExpiresAt: ?string, phoneNumber: ?string}
     */
    public function connect(WhatsappAccount $account): array
    {
        $snapshot = $this->gateway->connect($account->id);
        $this->syncFromGateway($account);

        return $this->snapshotData($snapshot);
    }

    /**
     * Ask the gateway to reconnect THIS account's live session.
     */
    public function reconnect(WhatsappAccount $account): array
    {
        $snapshot = $this->gateway->reconnect($account->id);

        return $this->snapshotData($snapshot);
    }

    /**
     * Manually disconnect THIS account's gateway session. The row stays
     * mapped to its session (now offline) and honestly reports 'disconnected'.
     */
    public function disconnect(WhatsappAccount $account): array
    {
        $snapshot = $this->gateway->disconnect($account->id);

        // The session is now offline: reflect it immediately so the account
        // list sees the real state instead of a stale 'connected' that only
        // the next session-sync would clear.
        $account->forceFill([
            'status' => 'disconnected',
            'last_disconnected_at' => now(),
            'disconnected_at' => now(),
        ])->save();

        return $this->snapshotData($snapshot);
    }

    /**
     * Current gateway QR for THIS account's session, as a data-URI QR image +
     * expiry.
     */
    public function qr(WhatsappAccount $account): array
    {
        return $this->qrData($this->gateway->status($account->id));
    }

    /**
     * Live connection status for THIS account's gateway session: the gateway
     * snapshot plus the mirrored DB row. Powers the connect wizard's polling
     * endpoint.
     *
     * @return array{status: ?string, qrCode: ?string, qrExpiresAt: ?string, phoneNumber: ?string, pairingCode: ?string, pairingCodeExpiresAt: ?string}
     */
    public function connectionStatus(WhatsappAccount $account): array
    {
        $this->syncFromGateway($account);

        $snapshot = $this->gateway->status($account->id);
        $data = $snapshot['data'] ?? [];

        return [
            'status' => $data['status'] ?? null,
            'qrCode' => $data['qrCode'] ?? null,
            'qrExpiresAt' => $data['qrExpiresAt'] ?? null,
            'phoneNumber' => $data['phoneNumber'] ?? null,
            'pairingCode' => $data['pairingCode'] ?? null,
            'pairingCodeExpiresAt' => $data['pairingCodeExpiresAt'] ?? null,
            'account' => $this->accountData($account->fresh(['assignedTeam:id,name'])),
            'connected' => ($data['status'] ?? null) === 'connected',
        ];
    }

    /**
     * Mark this connection as the workspace's routing/preference target
     * (used by the inbox default filter and auto-routing). Pure bookkeeping -
     * under concurrency there is no session to switch, so this never touches
     * the gateway or any other slot.
     */
    public function setActive(WhatsappAccount $account): array
    {
        WhatsappAccount::query()
            ->whereKeyNot($account->getKey())
            ->update(['is_active' => false]);

        $account->forceFill(['is_active' => true])->save();

        return $this->accountData($account->fresh(['assignedTeam:id,name']));
    }

    // ------------------------------------------------------------------
    // Sync helpers
    // ------------------------------------------------------------------

    /**
     * Mirror THIS account's gateway-owned session state onto its connection
     * row so the CRM's own table answers "what is connected right now"
     * without a gateway round trip. Never overwrites user-configured metadata.
     */
    public function syncFromGateway(WhatsappAccount $account): WhatsappAccount
    {
        try {
            $snapshot = $this->gateway->status($account->id);
        } catch (RuntimeException) {
            // Gateway unreachable: keep the last known DB state rather than
            // inventing a status. next sync retries.
            return $account;
        }

        $session = WhatsappSession::query()
            ->where('workspace_id', $account->workspace_id)
            ->where('whatsapp_account_id', $account->id)
            ->first();

        $status = $session?->status ?? ($snapshot['data']['status'] ?? null);

        $account->forceFill([
            'status'          => $this->normalizeStatus($status),
            'phone_number'    => $session?->phone_number ?? ($snapshot['data']['phoneNumber'] ?? null),
            'device_name'     => $session?->device_id ?? $account->device_name,
            'session_id'      => $session?->id ?? $account->session_id,
            'last_connected_at' => $session?->last_connected_at ?? $account->last_connected_at,
            'last_disconnected_at' => $session?->last_disconnected_at ?? $account->last_disconnected_at,
            'qr_expires_at'   => $session?->qr_expires_at ?? $account->qr_expires_at,
            'last_heartbeat_at' => now(),
        ])->save();

        return $account;
    }

    /**
     * Sync every workspace's connections from their own gateway sessions.
     * Called on list reads (cheap: one indexed query) so status never goes
     * stale even if a socket event was missed.
     */
    public function syncAllWorkspaces(): void
    {
        WhatsappAccount::query()->withoutGlobalScopes()->get()
            ->each(function (WhatsappAccount $account) {
                $this->syncFromGateway($account);
            });
    }

    // ------------------------------------------------------------------
    // Payload shaping
    // ------------------------------------------------------------------

    public function accountData(WhatsappAccount $account): array
    {
        return [
            'id' => $account->id,
            'workspace_id' => $account->workspace_id,
            'name' => $account->name,
            'phone_number' => $account->phone_number,
            'status' => $account->status ?? 'disconnected',
            'is_active' => (bool) $account->is_active,
            'auto_reply_enabled' => (bool) $account->auto_reply_enabled,
            'assigned_team_id' => $account->assigned_team_id,
            'assigned_team' => $account->assignedTeam ? [
                'id' => $account->assignedTeam->id,
                'name' => $account->assignedTeam->name,
            ] : null,
            'routing_mode' => $account->routing_mode ?? 'default',
            'session_status' => $account->status,
            'device_name' => $account->device_name ?? null,
            'session_id' => $account->session_id,
            'whatsapp_session_id' => $account->session_id,
            'sync_state' => $account->sync_state ?? 'idle',
            'failure_reason' => $account->failure_reason,
            'connected_at' => $account->connected_at?->toIso8601String(),
            'last_seen_at' => $account->last_seen_at?->toIso8601String(),
            'disconnected_at' => $account->disconnected_at?->toIso8601String(),
            'qr_expires_at' => $account->qr_expires_at?->toIso8601String(),
            'last_connected_at' => $account->last_connected_at?->toIso8601String(),
            'last_activity_at' => $account->updated_at?->toIso8601String(),
            'created_by' => $account->created_by,
            'created_at' => $account->created_at?->toIso8601String(),
        ];
    }

    // ------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------

    private function applyLiveStatus(WhatsappAccount $account): void
    {
        $session = WhatsappSession::query()
            ->where('workspace_id', $account->workspace_id)
            ->where('whatsapp_account_id', $account->id)
            ->first();

        $status = $session?->status;

        if ($status !== null && $this->normalizeStatus($status) !== $account->status) {
            $account->forceFill(['status' => $this->normalizeStatus($status)])->saveQuietly();
        }
    }

    private function normalizeStatus(?string $raw): string
    {
        // Gateway session statuses -> the account's coarse status vocabulary.
        return match ($raw) {
            'connected' => 'connected',
            'qr_pending', 'initializing' => 'connecting',
            'logged_out' => 'disconnected',
            null => 'disconnected',
            default => 'disconnected',
        };
    }

    /**
     * @return array{status: ?string, qrCode: ?string, qrExpiresAt: ?string, phoneNumber: ?string}
     */
    private function snapshotData(array $snapshot): array
    {
        $data = $snapshot['data'] ?? [];

        return [
            'status' => $data['status'] ?? null,
            'qrCode' => $data['qrCode'] ?? null,
            'qrExpiresAt' => $data['qrExpiresAt'] ?? null,
            'phoneNumber' => $data['phoneNumber'] ?? null,
        ];
    }

    private function qrData(array $snapshot): array
    {
        $data = $snapshot['data'] ?? [];

        return [
            'status' => $data['status'] ?? null,
            'qrCode' => $data['qrCode'] ?? null,
            'qrExpiresAt' => $data['qrExpiresAt'] ?? null,
        ];
    }
}