<?php

namespace Tests\Feature;

use App\Models\Pipeline;
use App\Models\Role;
use App\Models\User;
use App\Models\Workspace;
use App\Support\AuditLogger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\CreatesWorkspaceUsers;
use Tests\TestCase;

class WorkspaceSettingsAndAuditLogTest extends TestCase
{
    use RefreshDatabase, CreatesWorkspaceUsers;

    // --- Workspace settings ---

    public function test_agent_and_manager_are_forbidden_from_workspace_settings(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $manager = $this->userWithRole('Manager');

        $this->asUser($agent)->getJson('/api/v1/workspace')->assertForbidden();
        $this->asUser($manager)->getJson('/api/v1/workspace')->assertForbidden();
    }

    public function test_administrator_can_view_workspace_settings(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');

        $response = $this->asUser($admin)->getJson('/api/v1/workspace')->assertOk();

        $response->assertJsonStructure([
            'data' => ['id', 'name', 'timezone', 'logo_url', 'storage' => ['driver'], 'security' => ['session_lifetime_minutes']],
        ]);
    }

    public function test_administrator_can_update_workspace_profile_and_settings_persist(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');
        $pipeline = Pipeline::factory()->create(['workspace_id' => $admin->workspace_id]);

        $response = $this->asUser($admin)->patchJson('/api/v1/workspace', [
            'name' => 'Acme Renamed',
            'timezone' => 'Europe/London',
            'business_hours' => ['mon' => ['09:00', '17:00']],
            'default_pipeline_id' => $pipeline->id,
            'notification_defaults' => ['email' => true],
            'branding' => ['primary_color' => '#123456'],
        ])->assertOk();

        $response->assertJsonPath('data.name', 'Acme Renamed');
        $response->assertJsonPath('data.timezone', 'Europe/London');
        $response->assertJsonPath('data.default_pipeline_id', $pipeline->id);

        $this->assertDatabaseHas('workspaces', ['id' => $admin->workspace_id, 'name' => 'Acme Renamed']);
        $this->assertDatabaseHas('workspace_settings', [
            'workspace_id' => $admin->workspace_id,
            'default_pipeline_id' => $pipeline->id,
        ]);
    }

    public function test_administrator_can_upload_workspace_logo(): void
    {
        Storage::fake('public');
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');

        $file = UploadedFile::fake()->image('logo.png', 200, 200);

        $response = $this->asUser($admin)->post('/api/v1/workspace', [
            '_method' => 'PATCH',
            'logo' => $file,
        ])->assertOk();

        $this->assertNotNull($response->json('data.logo_url'));

        $workspace = Workspace::find($admin->workspace_id);
        Storage::disk('public')->assertExists($workspace->logo_path);
    }

    public function test_workspace_settings_update_writes_audit_log(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');

        $this->asUser($admin)->patchJson('/api/v1/workspace', ['name' => 'Renamed Co'])->assertOk();

        $this->assertDatabaseHas('audit_logs', [
            'workspace_id' => $admin->workspace_id,
            'action' => 'workspace.settings.updated',
            'user_id' => $admin->id,
        ]);
    }

    // --- Audit log browsing ---

    public function test_agent_and_manager_are_forbidden_from_audit_logs(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $manager = $this->userWithRole('Manager');

        $this->asUser($agent)->getJson('/api/v1/audit-logs')->assertForbidden();
        $this->asUser($manager)->getJson('/api/v1/audit-logs')->assertForbidden();
    }

    public function test_administrator_can_list_and_paginate_audit_logs(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');

        for ($i = 0; $i < 5; $i++) {
            AuditLogger::log('test.action', $admin, $admin, ['n' => $i]);
        }

        $response = $this->asUser($admin)->getJson('/api/v1/audit-logs?per_page=2')->assertOk();

        $this->assertCount(2, $response->json('data'));
        $this->assertSame(5, $response->json('meta.total'));
        $this->assertSame(3, $response->json('meta.last_page'));
    }

    public function test_audit_log_filters_by_action_and_user(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');
        $other = $this->userWithRole('Agent');

        AuditLogger::log('role.created', $admin, $admin, []);
        AuditLogger::log('role.deleted', $other, $other, []);

        $response = $this->asUser($admin)->getJson('/api/v1/audit-logs?action=role.created')->assertOk();
        $this->assertCount(1, $response->json('data'));
        $this->assertSame('role.created', $response->json('data.0.action'));

        $response = $this->asUser($admin)->getJson('/api/v1/audit-logs?user_id='.$other->id)->assertOk();
        $this->assertCount(1, $response->json('data'));
        $this->assertSame($other->id, $response->json('data.0.actor.id'));
    }

    public function test_audit_log_detail_returns_changes_and_metadata(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');

        $log = AuditLogger::log('role.updated', $admin, $admin, ['name' => 'New Name'], null);

        $response = $this->asUser($admin)->getJson("/api/v1/audit-logs/{$log->id}")->assertOk();

        $response->assertJsonPath('data.after.name', 'New Name');
        $response->assertJsonPath('data.changes.after.name', 'New Name');
        $this->assertNull($response->json('data.before'));
    }

    public function test_audit_log_detail_captures_real_before_and_after_on_update(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');

        $log = AuditLogger::log(
            'role.updated',
            $admin,
            $admin,
            ['name' => 'New Name'],
            null,
            ['name' => 'Old Name']
        );

        $response = $this->asUser($admin)->getJson("/api/v1/audit-logs/{$log->id}")->assertOk();

        $response->assertJsonPath('data.before.name', 'Old Name');
        $response->assertJsonPath('data.after.name', 'New Name');
        $response->assertJsonPath('data.changes.before.name', 'Old Name');
        $response->assertJsonPath('data.changes.after.name', 'New Name');
    }

    public function test_workspace_settings_update_audit_log_records_prior_values(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');

        $this->asUser($admin)->patchJson('/api/v1/workspace', ['name' => 'Renamed Co'])->assertOk();

        $log = \App\Models\AuditLog::query()
            ->where('workspace_id', $admin->workspace_id)
            ->where('action', 'workspace.settings.updated')
            ->latest('id')
            ->first();

        $this->assertNotNull($log);
        $this->assertSame('Renamed Co', $log->changes['after']['name'] ?? null);
        $this->assertNotSame('Renamed Co', $log->changes['before']['name'] ?? null);
    }

    public function test_role_update_audit_log_captures_before_and_after(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Super Administrator');

        $create = $this->asUser($admin)->postJson('/api/v1/roles', [
            'name' => 'Custom Role',
        ])->assertStatus(201);
        $roleId = $create->json('data.id');

        $this->asUser($admin)->patchJson("/api/v1/roles/{$roleId}", ['name' => 'Renamed Role'])->assertOk();

        $log = \App\Models\AuditLog::query()
            ->where('workspace_id', $admin->workspace_id)
            ->where('action', 'role.updated')
            ->where('subject_id', $roleId)
            ->latest('id')
            ->first();

        $this->assertNotNull($log);
        $this->assertSame('Renamed Role', $log->changes['after']['name'] ?? null);
        $this->assertSame('Custom Role', $log->changes['before']['name'] ?? null);
    }

    public function test_audit_log_isolated_by_workspace(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');

        $otherWorkspace = Workspace::factory()->create();
        $otherAdmin = User::factory()->create(['workspace_id' => $otherWorkspace->id]);

        $foreignLog = AuditLogger::log('foreign.action', $otherAdmin, $otherAdmin, []);

        $this->asUser($admin)->getJson("/api/v1/audit-logs/{$foreignLog->id}")->assertNotFound();

        $listResponse = $this->asUser($admin)->getJson('/api/v1/audit-logs')->assertOk();
        $actions = collect($listResponse->json('data'))->pluck('action');
        $this->assertFalse($actions->contains('foreign.action'));
    }
}
