<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Role;
use App\Models\User;
use App\Models\WhatsappAccountSetting;
use App\Models\WhatsappConnectionEvent;
use App\Models\WhatsappSession;
use App\Models\Workspace;
use App\Services\AzureBlobService;
use App\Support\AuditLogger;
use App\Traits\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class WorkspaceSettingController extends Controller
{
    use ApiResponse;

    public function __construct(protected AzureBlobService $azureBlob) {}

    public function show(Request $request)
    {
        $workspace = Workspace::with(['settings', 'whatsappSessions', 'whatsappAccountSettings.assignedTeam'])
            ->findOrFail($request->user()->workspace_id);

        return $this->success($this->payload($workspace), 'OK');
    }

    public function update(Request $request)
    {
        $workspace = Workspace::findOrFail($request->user()->workspace_id);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:150'],
            'slug' => ['sometimes', 'string', 'alpha_dash', 'max:150', Rule::unique('workspaces', 'slug')->ignore($workspace->id)],
            'business_category' => ['sometimes', 'nullable', 'string', 'max:120'],
            'country' => ['sometimes', 'nullable', 'string', 'max:100'],
            'timezone' => ['sometimes', 'string', 'timezone'],
            'language' => ['sometimes', 'string', 'max:20'],
            'logo' => ['sometimes', 'nullable', 'image', 'max:2048'],
            'default_pipeline_id' => ['sometimes', 'nullable', 'integer', Rule::exists('pipelines', 'id')->where('workspace_id', $workspace->id)],
            'business_hours' => ['sometimes', 'array'],
            'notification_defaults' => ['sometimes', 'array'],
            'branding' => ['sometimes', 'array'],
            'inbox_settings' => ['sometimes', 'array'],
            'contact_settings' => ['sometimes', 'array'],
            'lead_sales_settings' => ['sometimes', 'array'],
            'integration_settings' => ['sometimes', 'array'],
            'away_message_enabled' => ['sometimes', 'boolean'],
            'away_message' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'away_message_trigger' => ['sometimes', Rule::in(['outside_hours', 'once_per_conversation'])],
        ]);

        $before = array_merge(
            $workspace->only(['name', 'slug', 'business_category', 'country', 'timezone', 'language']),
            $workspace->settings?->only([
                'business_hours', 'notification_defaults', 'branding', 'default_pipeline_id',
                'inbox_settings', 'contact_settings', 'lead_sales_settings', 'integration_settings',
                'away_message_enabled', 'away_message', 'away_message_trigger',
            ]) ?? []
        );

        $workspace->fill($request->only(['name', 'slug', 'business_category', 'country', 'timezone', 'language']));

        if ($request->hasFile('logo')) {
            if ($workspace->logo_path) {
                $this->azureBlob->delete($workspace->logo_path);
            }
            $upload = $this->azureBlob->upload($request->file('logo'), 'workspace-logos/'.$workspace->id);
            $workspace->logo_path = $upload['file_path'];
        }

        $workspace->save();

        $settings = $workspace->settings ?? $workspace->settings()->create(['workspace_id' => $workspace->id]);
        $settings->fill($request->only([
            'default_pipeline_id', 'business_hours', 'notification_defaults', 'branding',
            'inbox_settings', 'contact_settings', 'lead_sales_settings', 'integration_settings',
            'away_message_enabled', 'away_message', 'away_message_trigger',
        ]));
        $settings->save();

        $after = collect($data)->except('logo')->all();
        $before = array_intersect_key($before, $after);

        AuditLogger::log('workspace.settings.updated', $request->user(), $workspace, $after, $request, $before);

        return $this->success($this->payload($workspace->fresh(['settings', 'whatsappSessions', 'whatsappAccountSettings.assignedTeam'])), 'Workspace settings updated successfully.');
    }

    public function storeWhatsappAccount(Request $request)
    {
        $workspaceId = $request->user()->workspace_id;
        $data = $this->validateWhatsappAccount($request, $workspaceId);

        $account = DB::transaction(function () use ($workspaceId, $data) {
            if (($data['is_default'] ?? false) === true) {
                WhatsappAccountSetting::query()->where('workspace_id', $workspaceId)->update(['is_default' => false]);
            }

            return WhatsappAccountSetting::create([
                ...$data,
                'workspace_id' => $workspaceId,
                'auto_reply_settings' => $data['auto_reply_settings'] ?? ['enabled' => false, 'message' => null],
            ]);
        });

        AuditLogger::log('whatsapp_account.created', $request->user(), $account, $data, $request);

        return $this->success($this->whatsappAccountPayload($account->fresh(['session', 'assignedTeam'])), 'WhatsApp account setting created.', null, 201);
    }

    public function updateWhatsappAccount(Request $request, WhatsappAccountSetting $account)
    {
        $workspaceId = $request->user()->workspace_id;
        abort_unless($account->workspace_id === $workspaceId, 404);

        $data = $this->validateWhatsappAccount($request, $workspaceId, true);
        $before = $account->only(array_keys($data));

        DB::transaction(function () use ($account, $workspaceId, $data) {
            if (($data['is_default'] ?? false) === true) {
                WhatsappAccountSetting::query()
                    ->where('workspace_id', $workspaceId)
                    ->whereKeyNot($account->id)
                    ->update(['is_default' => false]);
            }
            $account->update($data);
        });

        AuditLogger::log('whatsapp_account.updated', $request->user(), $account, $data, $request, $before);

        return $this->success($this->whatsappAccountPayload($account->fresh(['session', 'assignedTeam'])), 'WhatsApp account setting updated.');
    }

    public function destroyWhatsappAccount(Request $request, WhatsappAccountSetting $account)
    {
        abort_unless($account->workspace_id === $request->user()->workspace_id, 404);
        $before = $account->toArray();
        $account->delete();
        AuditLogger::log('whatsapp_account.deleted', $request->user(), null, $before, $request);

        return $this->success(null, 'WhatsApp account setting deleted.');
    }

    public function transferOwnership(Request $request)
    {
        $workspaceId = $request->user()->workspace_id;
        $data = $request->validate([
            'user_id' => ['required', 'integer', Rule::exists('users', 'id')->where('workspace_id', $workspaceId)],
        ]);

        $role = Role::query()
            ->where('workspace_id', $workspaceId)
            ->where('slug', 'super-administrator')
            ->firstOrFail();

        $target = User::query()->where('workspace_id', $workspaceId)->findOrFail($data['user_id']);
        $target->roles()->syncWithoutDetaching([$role->id]);

        AuditLogger::log('workspace.ownership_transferred', $request->user(), $target, ['role_id' => $role->id], $request);

        return $this->success(['user_id' => $target->id], 'Workspace ownership transferred.');
    }

    public function disable(Request $request)
    {
        $workspace = Workspace::findOrFail($request->user()->workspace_id);
        $data = $request->validate([
            'confirmation' => ['required', 'string', Rule::in([$workspace->slug])],
        ]);

        $workspace->forceFill(['is_active' => false])->save();
        AuditLogger::log('workspace.disabled', $request->user(), $workspace, $data, $request, ['is_active' => true]);

        return $this->success(['id' => $workspace->id, 'is_active' => false], 'Workspace disabled.');
    }

    public function destroy(Request $request)
    {
        $workspace = Workspace::findOrFail($request->user()->workspace_id);
        $data = $request->validate([
            'confirmation' => ['required', 'string', Rule::in([$workspace->slug])],
        ]);

        if (! $workspace->is_active) {
            return $this->error('This workspace is already disabled.', null, 409);
        }

        $workspace->delete();

        AuditLogger::log('workspace.deleted', $request->user(), $workspace, $data, $request, ['is_active' => true]);

        return $this->success(['id' => $workspace->id], 'Workspace deleted.');
    }

    protected function validateWhatsappAccount(Request $request, int $workspaceId, bool $partial = false): array
    {
        $required = $partial ? 'sometimes' : 'required';

        return $request->validate([
            'display_name' => [$required, 'nullable', 'string', 'max:120'],
            'whatsapp_session_id' => ['sometimes', 'nullable', 'integer', Rule::exists('whatsapp_sessions', 'id')->where('workspace_id', $workspaceId)],
            'assigned_team_id' => ['sometimes', 'nullable', 'integer', Rule::exists('teams', 'id')->where('workspace_id', $workspaceId)],
            'is_default' => ['sometimes', 'boolean'],
            'auto_reply_settings' => ['sometimes', 'array'],
            'auto_reply_settings.enabled' => ['sometimes', 'boolean'],
            'auto_reply_settings.message' => ['sometimes', 'nullable', 'string', 'max:2000'],
        ]);
    }

    protected function payload(Workspace $workspace): array
    {
        $settings = $workspace->settings;
        $accountSettings = $workspace->whatsappAccountSettings->keyBy('whatsapp_session_id');

        return [
            'id' => $workspace->id,
            'name' => $workspace->name,
            'slug' => $workspace->slug,
            'business_category' => $workspace->business_category,
            'country' => $workspace->country,
            'whatsapp_number' => $workspace->whatsapp_number,
            'timezone' => $workspace->timezone,
            'language' => $workspace->language ?? 'en',
            'logo_url' => $workspace->logo_path ? $this->azureBlob->getUrl($workspace->logo_path) : null,
            'is_active' => (bool) $workspace->is_active,
            'default_pipeline_id' => $settings?->default_pipeline_id ? (int) $settings->default_pipeline_id : null,
            'business_hours' => $settings?->business_hours,
            'notification_defaults' => $settings?->notification_defaults,
            'branding' => $settings?->branding,
            'inbox_settings' => $settings?->inbox_settings ?? [],
            'contact_settings' => $settings?->contact_settings ?? [],
            'lead_sales_settings' => $settings?->lead_sales_settings ?? [],
            'integration_settings' => $settings?->integration_settings ?? [],
            'away_message_enabled' => (bool) ($settings?->away_message_enabled ?? false),
            'away_message' => $settings?->away_message,
            'away_message_trigger' => $settings?->away_message_trigger ?? 'outside_hours',
            'whatsapp_accounts' => $workspace->whatsappSessions->map(function (WhatsappSession $session) use ($accountSettings) {
                $account = $accountSettings->get($session->id);
                return $this->whatsappAccountPayload($account, $session);
            })->values(),
            'detached_whatsapp_accounts' => $workspace->whatsappAccountSettings
                ->whereNull('whatsapp_session_id')
                ->values()
                ->map(fn (WhatsappAccountSetting $account) => $this->whatsappAccountPayload($account))
                ->values(),
            'storage' => $this->storageInfo(),
            'security' => $this->securityInfo(),
            'billing' => ['configured' => false, 'message' => 'Billing is not implemented in this workspace.'],
        ];
    }

    protected function whatsappAccountPayload(?WhatsappAccountSetting $account, ?WhatsappSession $session = null): array
    {
        $session ??= $account?->session;

        return [
            'id' => $account?->id,
            'whatsapp_session_id' => $session?->id ?? $account?->whatsapp_session_id,
            'display_name' => $account?->display_name ?? ($session?->phone_number ? 'WhatsApp '.$session->phone_number : 'WhatsApp account'),
            'assigned_team_id' => $account?->assigned_team_id,
            'assigned_team' => $account?->assignedTeam ? ['id' => $account->assignedTeam->id, 'name' => $account->assignedTeam->name] : null,
            'is_default' => (bool) ($account?->is_default ?? false),
            'auto_reply_settings' => $account?->auto_reply_settings ?? ['enabled' => false, 'message' => null],
            'status' => $session?->status,
            'phone_number' => $session?->phone_number,
            'device_id' => $session?->device_id,
            'last_connected_at' => $session?->last_connected_at?->toIso8601String(),
            'last_disconnected_at' => $session?->last_disconnected_at?->toIso8601String(),
        ];
    }

    protected function storageInfo(): array
    {
        $disk = Config::get('filesystems.default');
        $diskConfig = Config::get("filesystems.disks.{$disk}", []);

        return [
            'driver' => $diskConfig['driver'] ?? $disk,
            'bucket' => $diskConfig['bucket'] ?? null,
            'endpoint' => $diskConfig['endpoint'] ?? null,
        ];
    }

    protected function securityInfo(): array
    {
        return [
            'session_lifetime_minutes' => (int) Config::get('session.lifetime'),
            'session_expire_on_close' => (bool) Config::get('session.expire_on_close'),
            'sanctum_token_expiration_minutes' => Config::get('sanctum.expiration'),
        ];
    }
}
