<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Workspace;
use App\Services\AzureBlobService;
use App\Support\AuditLogger;
use App\Traits\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

/**
 * Workspace-level profile/branding/notification-default/security settings.
 * Gated `workspace.settings.manage` for both read and write - per
 * docs/07-permission-matrix.md this permission is Super Administrator/
 * Administrator only, there is no separate "view" permission for it (unlike
 * roles/teams which split view vs manage), so a single gate on both verbs is
 * correct here, not an oversight.
 *
 * Schema note: `workspaces` holds name/slug/whatsapp_number/timezone/logo_path
 * /is_active. `workspace_settings` (1:1) holds business_hours/
 * notification_defaults/branding as the only structured
 * columns that actually exist (docs/04-database-design.md). There are no
 * password-policy, session-timeout, or data-retention columns anywhere in the
 * schema - rather than inventing them (and a migration) outside of the
 * explicit instruction to only add columns the schema supports, "security"
 * and "data retention" are surfaced here as read-only informational sections
 * derived from real config (session lifetime from config/session.php, the
 * active storage driver) - see `securityInfo()`/`storageInfo()` below.
 */
class WorkspaceSettingController extends Controller
{
    use ApiResponse;

    public function __construct(protected AzureBlobService $azureBlob) {}

    public function show(Request $request)
    {
        $workspace = Workspace::with('settings')->findOrFail($request->user()->workspace_id);

        return $this->success($this->payload($workspace), 'OK');
    }

    public function update(Request $request)
    {
        $workspace = Workspace::findOrFail($request->user()->workspace_id);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:150'],
            'timezone' => ['sometimes', 'string', 'timezone'],
            'logo' => ['sometimes', 'nullable', 'image', 'max:2048'],
            'business_hours' => ['sometimes', 'array'],
            'notification_defaults' => ['sometimes', 'array'],
            'branding' => ['sometimes', 'array'],
            'away_message_enabled' => ['sometimes', 'boolean'],
            'away_message' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'away_message_trigger' => ['sometimes', Rule::in(['outside_hours', 'once_per_conversation'])],
        ]);

        $before = array_merge(
            $workspace->only(['name', 'timezone']),
            $workspace->settings?->only(['business_hours', 'notification_defaults', 'branding']) ?? []
        );

        $workspace->fill($request->only(['name', 'timezone']));

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
            'business_hours', 'notification_defaults', 'branding',
            'away_message_enabled', 'away_message', 'away_message_trigger',
        ]));
        $settings->save();

        $after = collect($data)->except('logo')->all();
        $before = array_intersect_key($before, $after);

        AuditLogger::log('workspace.settings.updated', $request->user(), $workspace, $after, $request, $before);

        return $this->success($this->payload($workspace->fresh(['settings'])), 'Workspace settings updated successfully.');
    }

    protected function payload(Workspace $workspace): array
    {
        $settings = $workspace->settings;

        return [
            'id' => $workspace->id,
            'name' => $workspace->name,
            'slug' => $workspace->slug,
            'whatsapp_number' => $workspace->whatsapp_number,
            'timezone' => $workspace->timezone,
            'logo_url' => $workspace->logo_path ? $this->azureBlob->getUrl($workspace->logo_path) : null,
            'is_active' => (bool) $workspace->is_active,
            'business_hours' => $settings?->business_hours,
            'notification_defaults' => $settings?->notification_defaults,
            'branding' => $settings?->branding,
            'away_message_enabled' => (bool) ($settings?->away_message_enabled ?? false),
            'away_message' => $settings?->away_message,
            'away_message_trigger' => $settings?->away_message_trigger ?? 'outside_hours',
            'storage' => $this->storageInfo(),
            'security' => $this->securityInfo(),
        ];
    }

    /**
     * Read-only: which storage driver is actually active and, for s3/minio,
     * the bucket name - never keys/secrets.
     */
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

    /**
     * Read-only: real, currently-enforced security parameters that already
     * exist in config (not schema-backed toggles, since no such columns
     * exist yet - see class docblock).
     */
    protected function securityInfo(): array
    {
        return [
            'session_lifetime_minutes' => (int) Config::get('session.lifetime'),
            'session_expire_on_close' => (bool) Config::get('session.expire_on_close'),
            'sanctum_token_expiration_minutes' => Config::get('sanctum.expiration'),
        ];
    }
}




