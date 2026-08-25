<?php

namespace Tests\Feature;

use App\Models\DealStageHistory;
use App\Models\Pipeline;
use App\Models\PipelineStage;
use App\Models\Role;
use App\Models\User;
use App\Models\Workspace;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Tests\CreatesWorkspaceUsers;
use Tests\TestCase;

/**
 * Phase 18: a true end-to-end flow exercising several modules in sequence in one test,
 * per the roadmap's call for integration-style tests that catch cross-module regressions
 * that single-endpoint tests miss. Mirrors a realistic agent session: log in, create a
 * contact, convert it to a lead, create a deal against it, move the deal through pipeline
 * stages, mark it won, then confirm the dashboard summary (a completely separate module/
 * controller) reflects every step above.
 */
class CrossModuleIntegrationFlowTest extends TestCase
{
    use CreatesWorkspaceUsers, RefreshDatabase;

    public function test_full_contact_to_won_deal_flow_reflects_in_dashboard_summary(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $manager = $this->userWithRole('Manager');
        $workspaceId = $agent->workspace_id;

        // 1. Login.
        $loginResponse = $this->postJson('/api/v1/auth/login', [
            'email' => $agent->email,
            'password' => 'Password123!',
        ])->assertOk();
        $token = $loginResponse->json('data.token');
        $this->assertNotEmpty($token);

        // 2. Create a contact (using the fresh login token directly, not asUser(), to prove
        // the token from step 1 actually authenticates subsequent requests).
        $contactResponse = $this->withHeader('Authorization', "Bearer {$token}")
            ->postJson('/api/v1/contacts', [
                'full_name' => 'Flow Test Contact',
                'phone_number' => '15559998888',
            ])->assertStatus(201);
        $contactId = $contactResponse->json('data.contact.id');

        // 3. Convert the contact to a lead.
        $leadResponse = $this->asUser($agent)
            ->postJson("/api/v1/contacts/{$contactId}/convert-to-lead")
            ->assertStatus(201);
        $leadId = $leadResponse->json('data.id');
        $this->assertDatabaseHas('leads', ['id' => $leadId, 'contact_id' => $contactId, 'status' => 'new']);

        // 4. Create a pipeline + stages, then a deal linked to the contact.
        $pipeline = Pipeline::factory()->create(['workspace_id' => $workspaceId]);
        $newStage = PipelineStage::factory()->create(['pipeline_id' => $pipeline->id, 'position' => 1, 'name' => 'New']);
        $negotiationStage = PipelineStage::factory()->create(['pipeline_id' => $pipeline->id, 'position' => 2, 'name' => 'Negotiation']);
        $wonStage = PipelineStage::factory()->create(['pipeline_id' => $pipeline->id, 'position' => 3, 'name' => 'Won', 'is_won_stage' => true]);

        $dealResponse = $this->asUser($agent)->postJson('/api/v1/deals', [
            'contact_id' => $contactId,
            'pipeline_id' => $pipeline->id,
            'pipeline_stage_id' => $newStage->id,
            'title' => 'Flow Test Deal',
            'value_amount' => 2500,
        ])->assertStatus(201);
        $dealId = $dealResponse->json('data.id');

        // 5. Move the deal through a pipeline stage.
        $this->asUser($agent)->patchJson("/api/v1/deals/{$dealId}/stage", [
            'pipeline_stage_id' => $negotiationStage->id,
        ])->assertOk();
        $this->assertDatabaseHas('deals', ['id' => $dealId, 'pipeline_stage_id' => $negotiationStage->id]);

        // 6. Move to the won stage, then mark won.
        $this->asUser($agent)->patchJson("/api/v1/deals/{$dealId}/stage", [
            'pipeline_stage_id' => $wonStage->id,
        ])->assertOk();
        $this->asUser($agent)->postJson("/api/v1/deals/{$dealId}/won")->assertOk();

        $this->assertDatabaseHas('deals', ['id' => $dealId, 'status' => 'won', 'probability_percent' => 100]);

        // Full stage history recorded across every transition (null -> New -> Negotiation -> Won).
        $this->assertSame(3, DealStageHistory::query()->where('deal_id', $dealId)->count());

        // 7. Dashboard summary (a different controller/module entirely) reflects the won deal.
        $summary = $this->asUser($manager)->getJson('/api/v1/dashboard/summary')->assertOk();
        $data = $summary->json('data');

        $this->assertEqualsWithDelta(2500.0, $data['deals']['won_value'], 0.01);
        $this->assertGreaterThanOrEqual(1, $data['leads']['new']);
    }

    public function test_flow_is_workspace_isolated_a_second_workspaces_agent_sees_none_of_it(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');

        $contactResponse = $this->asUser($agent)->postJson('/api/v1/contacts', [
            'full_name' => 'Isolated Contact',
            'phone_number' => '15551234567',
        ])->assertStatus(201);
        $contactId = $contactResponse->json('data.contact.id');

        // A second, independently-seeded workspace with its own roles/permissions - not the
        // same user forced into another workspace_id, since roles/permissions are seeded
        // per-workspace (RolePermissionSeeder iterates Workspace::all()) and a real
        // cross-workspace user would have their own role rows too.
        // BelongsToWorkspace auto-scopes/auto-fills workspace_id from the currently
        // authenticated user, so the seeder below must run with no authenticated user in
        // scope - otherwise it would silently (re)write these new roles onto $agent's
        // workspace instead of $otherWorkspace's.
        Auth::forgetGuards();
        $otherWorkspace = Workspace::factory()->create();
        $this->seed(RolePermissionSeeder::class);
        $otherRole = Role::withoutGlobalScopes()
            ->where('workspace_id', $otherWorkspace->id)->where('name', 'Agent')->firstOrFail();
        $otherAgent = User::factory()->create([
            'workspace_id' => $otherWorkspace->id,
            'password' => Hash::make('Password123!'),
            'is_active' => true,
        ]);
        $otherAgent->roles()->attach($otherRole->id);

        $this->asUser($otherAgent)
            ->getJson("/api/v1/contacts/{$contactId}")
            ->assertNotFound();
    }
}
