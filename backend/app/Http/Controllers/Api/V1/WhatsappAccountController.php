<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\WhatsappAccountStateException;
use App\Http\Controllers\Controller;
use App\Models\WhatsappAccount;
use App\Services\WhatsappAccountService;
use App\Support\AuditLogger;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule as ValidationRule;
use RuntimeException;

/**
 * Managed WhatsApp accounts API (backend-owned bookkeeping around the
 * gateway's single live Baileys session - see WhatsappAccountService for the
 * architecture notes).
 *
 * All routes are gated by permission:whatsapp.connection.manage (see
 * routes/api.php). Workspace isolation is enforced by the WorkspaceScope
 * global scope on the WhatsappAccount model: every query in this controller
 * is automatically constrained to the authenticated user's workspace, so a
 * tampered :account id from another workspace 404s instead of leaking.
 */
class WhatsappAccountController extends Controller
{
    use ApiResponse;

    public function __construct(protected WhatsappAccountService $accounts) {}

    public function index(Request $request): JsonResponse
    {
        return $this->success(
            $this->accounts->listForWorkspace($request->user()->workspace_id)
                ->map(fn (WhatsappAccount $account) => $this->accounts->accountData($account))
                ->values(),
            'OK',
        );
    }

    public function store(Request $request): JsonResponse
    {
        $workspaceId = $request->user()->workspace_id;
        $data = $this->validateAccount($request, $workspaceId);

        $account = $this->accounts->create($workspaceId, $data, $request->user()->id);

        AuditLogger::log('whatsapp_account.created', $request->user(), $account, [
            'name' => $account->name,
            'mobile_number' => $account->phone_number,
            'assigned_team_id' => $account->assigned_team_id,
            'auto_reply_enabled' => $account->auto_reply_enabled,
            'routing_mode' => $account->routing_mode,
        ], $request);

        return $this->success(
            $this->accounts->accountData($account),
            'WhatsApp account created successfully.',
            null,
            201,
        );
    }

    public function show(Request $request, WhatsappAccount $account): JsonResponse
    {
        // WorkspaceScope makes foreign ids 404 here (see class docblock).
        return $this->success(
            $this->accounts->accountData($this->accounts->syncFromGateway($account)),
            'OK',
        );
    }

    public function update(Request $request, WhatsappAccount $account): JsonResponse
    {
        $data = $this->validateAccount($request, $account->workspace_id, partial: true, exclude: $account);
        $before = $account->only(array_keys($data));

        $account = $this->accounts->update($account, $data);

        AuditLogger::log('whatsapp_account.updated', $request->user(), $account, $account->only(array_keys($data)), $request, $before);

        return $this->success($this->accounts->accountData($account), 'WhatsApp account updated successfully.');
    }

    public function destroy(Request $request, WhatsappAccount $account): JsonResponse
    {
        $before = $account->only(['name', 'phone_number', 'status', 'is_active']);
        $deactivateGateway = $account->is_active;

        $this->accounts->delete($account, deactivateGateway: $deactivateGateway);

        AuditLogger::log('whatsapp_account.deleted', $request->user(), null, $before, $request);

        return $this->success(null, 'WhatsApp account deleted successfully.');
    }

    public function connect(Request $request, WhatsappAccount $account): JsonResponse
    {
        try {
            $snapshot = $this->accounts->connect($account);
        } catch (WhatsappAccountStateException $e) {
            return $this->error($e->getMessage(), null, 409);
        } catch (RuntimeException $e) {
            return $this->failure($e->getMessage(), 'gateway_unreachable', 502);
        }

        AuditLogger::log('whatsapp_account.connect', $request->user(), $account, [], $request);

        return $this->success($snapshot, 'QR pairing initiated. Scan the code with your phone.');
    }

    public function reconnect(Request $request, WhatsappAccount $account): JsonResponse
    {
        try {
            $snapshot = $this->accounts->reconnect($account);
        } catch (WhatsappAccountStateException $e) {
            return $this->error($e->getMessage(), null, 409);
        } catch (RuntimeException $e) {
            return $this->failure($e->getMessage(), 'gateway_unreachable', 502);
        }

        AuditLogger::log('whatsapp_account.reconnect', $request->user(), $account, [], $request);

        return $this->success($snapshot, 'Reconnection initiated.');
    }

    public function disconnect(Request $request, WhatsappAccount $account): JsonResponse
    {
        try {
            $snapshot = $this->accounts->disconnect($account);
        } catch (WhatsappAccountStateException $e) {
            return $this->error($e->getMessage(), null, 409);
        } catch (RuntimeException $e) {
            return $this->failure($e->getMessage(), 'gateway_unreachable', 502);
        }

        AuditLogger::log('whatsapp_account.disconnect', $request->user(), $account, [], $request);

        return $this->success($snapshot, 'WhatsApp account disconnected.');
    }

    public function qr(Request $request, WhatsappAccount $account): JsonResponse
    {
        try {
            $qr = $this->accounts->qr($account);
        } catch (WhatsappAccountStateException $e) {
            return $this->error($e->getMessage(), null, 409);
        } catch (RuntimeException $e) {
            return $this->failure($e->getMessage(), 'gateway_unreachable', 502);
        }

        return $this->success($qr, 'OK');
    }

    /**
     * GET /whatsapp/accounts/{account}/connection-status
     * Live connection snapshot for the connect wizard: gateway status, QR,
     * pairing code + expiry and the mirrored account row.
     */
    public function connectionStatus(Request $request, WhatsappAccount $account): JsonResponse
    {
        try {
            $status = $this->accounts->connectionStatus($account);
        } catch (WhatsappAccountStateException $e) {
            return $this->error($e->getMessage(), null, 409);
        } catch (RuntimeException $e) {
            return $this->failure($e->getMessage(), 'gateway_unreachable', 502);
        }

        return $this->success($status, 'OK');
    }

    public function setActive(Request $request, WhatsappAccount $account): JsonResponse
    {
        try {
            $data = $this->accounts->setActive($account);
        } catch (WhatsappAccountStateException $e) {
            // Refuse to silently steal the live session from a connected
            // account - the UI asks for confirmation before retrying via the
            // force endpoint (see setActiveForce).
            return $this->error($e->getMessage(), null, 409);
        }

        AuditLogger::log('whatsapp_account.set_active', $request->user(), $account, [], $request);

        return $this->success($data, 'Active WhatsApp account updated.');
    }

    /**
     * Force-activation used after the user explicitly confirms the switch in
     * the UI. Under concurrency every account already runs its own session,
     * so activation is pure bookkeeping - nothing to disconnect, identical
     * to setActive. Kept as a separate route for client backwards
     * compatibility.
     */
    public function setActiveForce(Request $request, WhatsappAccount $account): JsonResponse
    {
        return $this->setActive($request, $account);
    }

    // ------------------------------------------------------------------

    /**
     * Shared validation. camelCase aliases are accepted for the create
     * payload documented in the frontend spec (assignedTeamId,
     * autoReplyEnabled, routingMode) alongside the app's snake_case
     * convention. workspace_id is deliberately NOT accepted from the client:
     * the workspace is always resolved from the authenticated user.
     */
    private function validateAccount(Request $request, int $workspaceId, bool $partial = false, ?WhatsappAccount $exclude = null): array
    {
        $required = $partial ? 'sometimes' : 'required';

        // Accept the camelCase alias used by the connect wizard; the
        // snake_case field is the one actually validated below. Spaces and
        // dashes are allowed here and stripped during normalization.
        if ($request->filled('mobileNumber') && ! $request->filled('mobile_number')) {
            $request->merge(['mobile_number' => $request->input('mobileNumber')]);
        }

        $rules = [
            'name' => ['sometimes', 'nullable', 'string', 'min:2', 'max:60'],
            // The number the user intends to link. Never treated as
            // authoritative: it is overwritten by the live value from the
            // real gateway session once a pairing actually confirms.
            'mobile_number' => ['sometimes', 'nullable', 'string', 'max:24', 'regex:/^\+?[0-9][0-9 \\-]{5,20}$/'],
            'assigned_team_id' => ['sometimes', 'nullable', 'integer', ValidationRule::exists('teams', 'id')->where('workspace_id', $workspaceId)],
            'assignedTeamId' => ['sometimes', 'nullable', 'integer', ValidationRule::exists('teams', 'id')->where('workspace_id', $workspaceId)],
            'auto_reply_enabled' => ['sometimes', 'boolean'],
            'autoReplyEnabled' => ['sometimes', 'boolean'],
            'routing_mode' => ['sometimes', 'string', ValidationRule::in(WhatsappAccount::ROUTING_MODES)],
            'routingMode' => ['sometimes', 'string', ValidationRule::in(WhatsappAccount::ROUTING_MODES)],
        ];

        $validator = validator($request->all(), $rules, [
            'name.required' => 'Account display name is required.',
            'name.min' => 'Account display name must be at least 2 characters.',
            'name.max' => 'Account display name may not be greater than 60 characters.',
            'assigned_team_id.exists' => 'The selected team does not exist in this workspace.',
            'assignedTeamId.exists' => 'The selected team does not exist in this workspace.',
            'routing_mode.in' => 'The selected routing mode is not supported.',
            'routingMode.in' => 'The selected routing mode is not supported.',
        ]);

        $validated = $validator->validate();

        // Trim here so the duplicate check below and the stored value agree.
        $name = isset($validated['name']) ? trim($validated['name']) : null;

        if ($name !== null) {
            $duplicate = WhatsappAccount::query()
                ->where('workspace_id', $workspaceId)
                ->whereRaw('LOWER(name) = ?', [mb_strtolower($name)])
                ->when($exclude !== null, fn ($q) => $q->whereKeyNot($exclude->getKey()))
                ->exists();

            if ($duplicate) {
                abort(response()->json([
                    'success' => false,
                    'message' => 'An account with this name already exists in this workspace.',
                ], 409));
            }
        }

        $data = [];
        if ($name !== null) {
            if (mb_strlen($name) < 2) {
                abort(response()->json([
                    'success' => false,
                    'message' => 'Account display name must be at least 2 characters.',
                ], 422));
            }
            $data['name'] = $name;
        }
        if (array_key_exists('mobile_number', $validated)) {
            $raw = $validated['mobile_number'];
            if ($raw !== null && $raw !== '') {
                // Normalize to bare E.164 digits: strip everything but digits,
                // drop a leading trunk zero when the country code follows.
                $digits = preg_replace('/[^0-9]/', '', $raw);
                $cc = (string) config('services.whatsapp_gateway.country_code', '94');
                if ($digits !== null && $digits !== '') {
                    if (str_starts_with($digits, '0')) {
                        $digits = $cc.substr($digits, 1);
                    } elseif (! str_starts_with($digits, $cc) && strlen($digits) < 11) {
                        $digits = $cc.$digits;
                    }
                }
                $data['mobile_number'] = $digits;
            } else {
                $data['mobile_number'] = null;
            }
        }
        if (array_key_exists('assigned_team_id', $validated) || array_key_exists('assignedTeamId', $validated)) {
            $data['assigned_team_id'] = $validated['assigned_team_id'] ?? $validated['assignedTeamId'] ?? null;
        }
        if (array_key_exists('auto_reply_enabled', $validated) || array_key_exists('autoReplyEnabled', $validated)) {
            $data['auto_reply_enabled'] = (bool) ($validated['auto_reply_enabled'] ?? $validated['autoReplyEnabled'] ?? false);
        }
        if (array_key_exists('routing_mode', $validated)) {
            $data['routing_mode'] = $validated['routing_mode'];
        }
        if (array_key_exists('routingMode', $validated)) {
            $data['routing_mode'] = $validated['routingMode'];
        }

        return $data;
    }
}
