<?php

namespace Tests\Feature;

use App\Models\AnalyticsSetting;
use App\Models\AuditLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\CreatesWorkspaceUsers;
use Tests\TestCase;

class AnalyticsSettingsTest extends TestCase
{
    use CreatesWorkspaceUsers, RefreshDatabase;

    // ---- Authorization ----

    public function test_settings_endpoints_require_workspace_settings_manage_permission(): void
    {
        $this->seedRbac();
        $manager = $this->userWithRole('Manager'); // no workspace.settings.manage
        $admin = $this->userWithRole('Administrator');

        $this->asUser($manager)->getJson('/api/v1/settings/analytics')->assertForbidden();
        $this->asUser($manager)->patchJson('/api/v1/settings/analytics', ['analytics_enabled' => false])->assertForbidden();
        $this->asUser($manager)->postJson('/api/v1/settings/analytics/reset')->assertForbidden();

        $this->asUser($admin)->getJson('/api/v1/settings/analytics')->assertOk();
    }

    // ---- Show / defaults ----

    public function test_show_returns_recommended_defaults_when_no_row_exists(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');

        $response = $this->asUser($admin)->getJson('/api/v1/settings/analytics');

        $response->assertOk()
            ->assertJsonPath('data.settings.analytics_enabled', true)
            ->assertJsonPath('data.settings.default_period', 'last_30_days')
            ->assertJsonPath('data.settings.raw_event_retention_days', 90)
            ->assertJsonPath('data.settings.allow_personal_data_export', false)
            ->assertJsonPath('data.defaults.default_period', 'last_30_days');

        $this->assertDatabaseCount('analytics_settings', 1);
    }

    // ---- Update + validation ----

    public function test_update_persists_valid_values(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');

        $this->asUser($admin)->patchJson('/api/v1/settings/analytics', [
            'analytics_enabled' => false,
            'default_period' => 'last_7_days',
            'track_read_messages' => false,
            'agent_visibility' => 'managers',
            'raw_event_retention_days' => 180,
            'max_export_range_days' => 0,
        ])->assertOk()
            ->assertJsonPath('data.settings.analytics_enabled', false)
            ->assertJsonPath('data.settings.default_period', 'last_7_days')
            ->assertJsonPath('data.settings.track_read_messages', false)
            ->assertJsonPath('data.settings.agent_visibility', 'managers')
            ->assertJsonPath('data.settings.raw_event_retention_days', 180)
            ->assertJsonPath('data.settings.max_export_range_days', 0);

        $this->assertDatabaseHas('analytics_settings', [
            'analytics_enabled' => false,
            'default_period' => 'last_7_days',
            'raw_event_retention_days' => 180,
        ]);
    }

    public function test_update_rejects_invalid_enum_and_retention_values(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');

        $this->asUser($admin)->patchJson('/api/v1/settings/analytics', [
            'default_period' => 'last_century',
        ])->assertStatus(422);

        $this->asUser($admin)->patchJson('/api/v1/settings/analytics', [
            'raw_event_retention_days' => 45,
        ])->assertStatus(422);

        $this->asUser($admin)->patchJson('/api/v1/settings/analytics', [
            'agent_visibility' => 'everyone',
        ])->assertStatus(422);
    }

    // ---- Reset ----

    public function test_reset_restores_recommended_defaults_and_audits(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');

        $this->asUser($admin)->patchJson('/api/v1/settings/analytics', [
            'default_period' => 'today',
            'track_leads' => false,
        ])->assertOk();

        $this->asUser($admin)->postJson('/api/v1/settings/analytics/reset')->assertOk()
            ->assertJsonPath('data.settings.default_period', 'last_30_days')
            ->assertJsonPath('data.settings.track_leads', true);

        $this->assertDatabaseHas('audit_logs', ['action' => 'analytics.settings.reset']);
    }

    // ---- Audit logging ----

    public function test_update_creates_audit_log_with_changed_fields(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');

        $this->asUser($admin)->patchJson('/api/v1/settings/analytics', [
            'analytics_enabled' => false,
            'currency' => 'USD',
        ])->assertOk();

        $this->assertDatabaseHas('audit_logs', ['action' => 'analytics.settings.updated']);

        $log = AuditLog::query()->where('action', 'analytics.settings.updated')->latest('id')->first();
        $this->assertNotNull($log);
        $this->assertEquals(['analytics_enabled', 'currency'], array_values($log->changes['after'] ? array_keys($log->changes['after']) : []));
    }

    // ---- Workspace scoping ----

    public function test_settings_are_workspace_scoped(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');

        $this->asUser($admin)->patchJson('/api/v1/settings/analytics', ['currency' => 'EUR'])->assertOk();

        $settings = AnalyticsSetting::query()->first();
        $this->assertSame($admin->workspace_id, $settings->workspace_id);
        $this->assertSame(1, AnalyticsSetting::query()->count());
    }

    // ---- Dashboard integration (honest not-tracked states) ----

    public function test_analytics_endpoints_report_not_tracked_when_analytics_disabled(): void
    {
        $this->seedRbac();
        $viewer = $this->userWithRole('Viewer');
        $admin = $this->userWithRole('Administrator');

        $this->asUser($admin)->patchJson('/api/v1/settings/analytics', ['analytics_enabled' => false])->assertOk();

        $this->asUser($viewer)->getJson('/api/v1/analytics/conversation-volume')
            ->assertOk()
            ->assertJsonPath('data.tracked', false)
            ->assertJsonPath('data.unavailable_reason', 'analytics_disabled');

        $this->asUser($viewer)->getJson('/api/v1/analytics/agent-performance')
            ->assertOk()
            ->assertJsonPath('data.tracked', false);

        $this->asUser($viewer)->getJson('/api/v1/analytics/response-time-trend')
            ->assertOk()
            ->assertJsonPath('data.tracked', false);
    }

    public function test_analytics_endpoints_report_not_tracked_when_metric_disabled(): void
    {
        $this->seedRbac();
        $viewer = $this->userWithRole('Viewer');
        $admin = $this->userWithRole('Administrator');

        $this->asUser($admin)->patchJson('/api/v1/settings/analytics', ['track_conversations' => false])->assertOk();

        $this->asUser($viewer)->getJson('/api/v1/analytics/conversation-volume')
            ->assertOk()
            ->assertJsonPath('data.tracked', false)
            ->assertJsonPath('data.unavailable_reason', 'metric_not_tracked');

        // Other endpoints are unaffected by the conversation toggle.
        $this->asUser($viewer)->getJson('/api/v1/analytics/response-time-trend')
            ->assertOk()
            ->assertJsonMissing(['tracked' => false]);
    }

    public function test_analytics_endpoints_still_return_real_data_when_tracked(): void
    {
        $this->seedRbac();
        $viewer = $this->userWithRole('Viewer');

        // When tracking is on, the endpoints keep their historical bare-series
        // shape (no tracked:false marker) so existing chart consumers are
        // unaffected. An empty workspace returns real empty arrays, not nulls.
        $this->asUser($viewer)->getJson('/api/v1/analytics/conversation-volume')
            ->assertOk()
            ->assertJsonMissing(['tracked' => false])
            ->assertJsonPath('data.0.count', 0);
    }
}
