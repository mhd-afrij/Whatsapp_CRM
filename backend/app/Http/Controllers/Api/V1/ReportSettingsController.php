<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AnalyticsSetting;
use App\Services\ReportService;
use App\Support\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

/**
 * Reports-page preferences API.
 *
 * GET  /api/v1/reports/settings        - report prefs + read-only workspace analytics
 *                                       context (timezone/currency/week start/default period)
 * PATCH /api/v1/reports/settings        - update report prefs (reports.manage_settings)
 * POST  /api/v1/reports/settings/reset  - reset to defaults (reports.manage_settings)
 *
 * Prefs are stored in the workspace's analytics_settings.report_preferences JSON
 * column (one row per workspace, unique). The analytics context (timezone, currency,
 * week start, default period) is read-only here - it is owned by the Analytics
 * Settings page (AnalyticsSettingController).
 */
class ReportSettingsController extends Controller
{
    public function __construct(protected ReportService $reportService) {}

    public function show(Request $request)
    {
        $settings = $this->reportService->settingsFor($request->user()->workspace_id);

        return $this->success([
            'preferences' => $this->reportService->preferencesFor($settings),
            'defaults' => AnalyticsSetting::reportPreferenceDefaults(),
            'analytics' => $settings->only([
                'timezone', 'currency', 'default_period', 'week_starts_on_monday', 'date_format',
            ]),
        ]);
    }

    public function update(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'include_weekends' => 'sometimes|boolean',
            'allow_custom_periods' => 'sometimes|boolean',
            'compare_previous' => 'sometimes|boolean',
        ]);

        if ($validator->fails()) {
            return $this->error('The given data was invalid.', $validator->errors());
        }

        $settings = $this->reportService->settingsFor($request->user()->workspace_id);
        $before = $settings->report_preferences ?? [];

        $preferences = array_merge(
            AnalyticsSetting::reportPreferenceDefaults(),
            $before,
            $validator->validated()
        );

        $settings->report_preferences = $preferences;
        $settings->save();

        $changed = collect($settings->getChanges())
            ->except(['updated_at', 'workspace_id'])
            ->keys()
            ->all();

        if ($changed !== []) {
            AuditLogger::log(
                'reports.settings.updated',
                $request->user(),
                $settings,
                $settings->only($changed),
                $request,
                ['report_preferences' => $before]
            );
        }

        return $this->success([
            'preferences' => $this->reportService->preferencesFor($settings->fresh()),
            'defaults' => AnalyticsSetting::reportPreferenceDefaults(),
            'analytics' => $settings->fresh()->only([
                'timezone', 'currency', 'default_period', 'week_starts_on_monday', 'date_format',
            ]),
        ], 'Report preferences updated.');
    }

    public function reset(Request $request)
    {
        $settings = $this->reportService->settingsFor($request->user()->workspace_id);
        $before = $settings->report_preferences ?? [];

        $settings->report_preferences = AnalyticsSetting::reportPreferenceDefaults();
        $settings->save();

        $changed = collect($settings->getChanges())
            ->except(['updated_at', 'workspace_id'])
            ->keys()
            ->all();

        if ($changed !== []) {
            AuditLogger::log(
                'reports.settings.reset',
                $request->user(),
                $settings,
                $settings->only($changed),
                $request,
                ['report_preferences' => $before]
            );
        }

        return $this->success([
            'preferences' => $this->reportService->preferencesFor($settings->fresh()),
            'defaults' => AnalyticsSetting::reportPreferenceDefaults(),
            'analytics' => $settings->fresh()->only([
                'timezone', 'currency', 'default_period', 'week_starts_on_monday', 'date_format',
            ]),
        ], 'Report preferences reset to defaults.');
    }
}
