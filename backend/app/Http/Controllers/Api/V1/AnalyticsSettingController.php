<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AnalyticsSetting;
use App\Support\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

/**
 * Workspace-scoped Analytics Settings API.
 *
 * GET   /api/v1/settings/analytics          - current settings (+ server defaults)
 * PATCH  /api/v1/settings/analytics         - partial update (validated, audited)
 * POST   /api/v1/settings/analytics/reset   - reset to recommended defaults (audited)
 *
 * Gated on workspace.settings.manage (see routes/api.php) so only workspace
 * admins can read or change these values; every query is workspace-scoped via
 * the BelongsToWorkspace trait (WorkspaceScope), so cross-workspace access is
 * impossible regardless of client-supplied parameters.
 */
class AnalyticsSettingController extends Controller
{
    /** Retention choices: 0 = Unlimited. */
    private const RAW_RETENTIONS = [30, 90, 180, 365, 730, 0];
    private const AGGREGATE_RETENTIONS = [90, 365, 730, 1825, 0];
    private const EXPORT_RANGES = [30, 90, 180, 365, 0];

    public function show(Request $request)
    {
        $settings = $this->settingsFor($request);

        return $this->success([
            'settings' => $settings,
            'defaults' => AnalyticsSetting::recommendedDefaults(),
        ]);
    }

    public function update(Request $request)
    {
        $validator = Validator::make($request->all(), $this->rules());

        if ($validator->fails()) {
            return $this->error('The given data was invalid.', $validator->errors());
        }

        $settings = $this->settingsFor($request);
        $data = $validator->validated();

        $before = $settings->only(array_keys(AnalyticsSetting::recommendedDefaults()));
        $filtered = collect($data)
            ->only(array_keys(AnalyticsSetting::recommendedDefaults()))
            ->all();

        $settings->fill($filtered);
        $settings->save();

        // Audit only the fields that actually changed.
        $changed = collect($settings->getChanges())
            ->except(['updated_at', 'workspace_id'])
            ->keys()
            ->all();

        if ($changed !== []) {
            AuditLogger::log(
                'analytics.settings.updated',
                $request->user(),
                $settings,
                $settings->only($changed),
                $request,
                array_intersect_key($before, array_flip($changed))
            );
        }

        return $this->success([
            'settings' => $settings->fresh(),
            'defaults' => AnalyticsSetting::recommendedDefaults(),
        ], 'Analytics settings updated successfully.');
    }

    public function reset(Request $request)
    {
        $settings = $this->settingsFor($request);
        $defaults = AnalyticsSetting::recommendedDefaults();

        $before = $settings->only(array_keys($defaults));

        $settings->fill($defaults);
        $settings->save();

        $changed = collect($settings->getChanges())
            ->except(['updated_at', 'workspace_id'])
            ->keys()
            ->all();

        if ($changed !== []) {
            AuditLogger::log(
                'analytics.settings.reset',
                $request->user(),
                $settings,
                $settings->only($changed),
                $request,
                array_intersect_key($before, array_flip($changed))
            );
        }

        return $this->success([
            'settings' => $settings->fresh(),
            'defaults' => $defaults,
        ], 'Analytics settings were reset to the recommended defaults.');
    }

    private function settingsFor(Request $request): AnalyticsSetting
    {
        // firstOrCreate relies on the WorkspaceScope + creating hook, so the
        // workspace_id always comes from the authenticated user, never the client.
        // A freshly created row is seeded with the recommended defaults so the
        // model's serialized attributes match what the DB columns hold.
        return AnalyticsSetting::query()->firstOrCreate(
            ['workspace_id' => $request->user()->workspace_id],
            array_merge(
                ['workspace_id' => $request->user()->workspace_id],
                AnalyticsSetting::recommendedDefaults()
            )
        );
    }

    private function rules(): array
    {
        $booleans = collect(AnalyticsSetting::recommendedDefaults())
            ->filter(fn ($value) => is_bool($value))
            ->keys()
            ->mapWithKeys(fn (string $field) => [$field => ['sometimes', 'boolean']])
            ->all();

        return $booleans + [
            'timezone' => ['sometimes', 'string', 'timezone:all'],
            'default_period' => ['sometimes', 'string', Rule::in(['today', 'yesterday', 'last_7_days', 'last_30_days', 'last_90_days'])],
            'currency' => ['sometimes', 'string', 'size:3'],
            'date_format' => ['sometimes', 'string', Rule::in(['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'])],

            'agent_visibility' => ['sometimes', 'string', Rule::in(['super_admin', 'workspace_admins', 'managers', 'managers_plus_self', 'agent_self'])],

            'conversation_start_rule' => ['sometimes', 'string', Rule::in(['first_incoming', 'first_outgoing', 'either_direction'])],
            'conversation_resolution_rule' => ['sometimes', 'string', Rule::in(['resolved', 'closed', 'either'])],
            'deleted_messages_rule' => ['sometimes', 'string', Rule::in(['keep', 'exclude'])],

            'raw_event_retention_days' => ['sometimes', 'integer', Rule::in(self::RAW_RETENTIONS)],
            'aggregate_retention_days' => ['sometimes', 'integer', Rule::in(self::AGGREGATE_RETENTIONS)],
            'max_export_range_days' => ['sometimes', 'integer', Rule::in(self::EXPORT_RANGES)],
        ];
    }
}
