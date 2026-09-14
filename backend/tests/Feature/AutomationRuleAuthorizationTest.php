<?php

namespace Tests\Feature;

use App\Models\AutomationRule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\CreatesWorkspaceUsers;
use Tests\TestCase;

class AutomationRuleAuthorizationTest extends TestCase
{
    use CreatesWorkspaceUsers, RefreshDatabase;

    private function rulePayload(array $overrides = []): array
    {
        return array_merge([
            'name' => 'VIP keyword',
            'trigger_type' => 'keyword',
            'trigger_value' => 'vip',
            'actions' => [['type' => 'add_label', 'value' => 'VIP']],
            'is_active' => true,
        ], $overrides);
    }

    public function test_agent_cannot_read_or_manage_automation_rules(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');

        $this->asUser($agent)->getJson('/api/v1/automation-rules')
            ->assertStatus(403)->assertJsonPath('success', false);

        $this->asUser($agent)->postJson('/api/v1/automation-rules', $this->rulePayload())
            ->assertStatus(403)->assertJsonPath('success', false);
    }

    public function test_viewer_cannot_manage_automation_rules(): void
    {
        $this->seedRbac();
        $viewer = $this->userWithRole('Viewer');

        $create = $this->asUser($viewer)->postJson('/api/v1/automation-rules', $this->rulePayload())
            ->assertStatus(403)->assertJsonPath('success', false);
        $this->assertSame(403, $create->getStatusCode());
        $this->assertDatabaseCount('automation_rules', 0);
    }

    public function test_administrator_can_create_update_and_delete_automation_rules(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');

        $create = $this->asUser($admin)->postJson('/api/v1/automation-rules', $this->rulePayload())
            ->assertStatus(201)->assertJsonPath('success', true);

        $ruleId = $create->json('data.id');

        $this->asUser($admin)->getJson('/api/v1/automation-rules')
            ->assertOk()->assertJsonCount(1, 'data');

        $this->asUser($admin)->patchJson("/api/v1/automation-rules/{$ruleId}", [
            'name' => 'VIP keyword (updated)',
        ])->assertOk()->assertJsonPath('data.name', 'VIP keyword (updated)');

        $this->asUser($admin)->deleteJson("/api/v1/automation-rules/{$ruleId}")
            ->assertOk()->assertJsonPath('success', true);

        $this->assertDatabaseMissing('automation_rules', ['id' => $ruleId]);
    }

    public function test_super_admin_can_manage_automation_rules(): void
    {
        $this->seedRbac();
        $superAdmin = $this->userWithRole('Super Administrator');

        $this->asUser($superAdmin)->postJson('/api/v1/automation-rules', $this->rulePayload())
            ->assertStatus(201)->assertJsonPath('success', true);
    }

    public function test_cannot_target_another_workspaces_rule(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');

        $otherWorkspace = \App\Models\Workspace::factory()->create();
        $foreign = AutomationRule::create([
            'workspace_id' => $otherWorkspace->id,
            'name' => 'Foreign rule',
            'trigger_type' => 'keyword',
            'actions' => [],
        ]);

        $this->asUser($admin)->patchJson("/api/v1/automation-rules/{$foreign->id}", [
            'name' => 'Hijacked',
        ])->assertStatus(404);

        $this->asUser($admin)->deleteJson("/api/v1/automation-rules/{$foreign->id}")
            ->assertStatus(404);

        $this->assertDatabaseHas('automation_rules', ['id' => $foreign->id, 'name' => 'Foreign rule']);
    }
}