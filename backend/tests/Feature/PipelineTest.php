<?php

namespace Tests\Feature;

use App\Models\Contact;
use App\Models\Deal;
use App\Models\Pipeline;
use App\Models\PipelineStage;
use App\Models\Workspace;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\CreatesWorkspaceUsers;
use Tests\TestCase;

class PipelineTest extends TestCase
{
    use CreatesWorkspaceUsers, RefreshDatabase;

    public function test_agent_cannot_manage_pipelines(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');

        $this->asUser($agent)->postJson('/api/v1/pipelines', ['name' => 'New Pipeline'])
            ->assertStatus(403);
    }

    public function test_agent_can_still_view_the_board(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $pipeline = Pipeline::factory()->create(['workspace_id' => $agent->workspace_id]);
        PipelineStage::factory()->create(['pipeline_id' => $pipeline->id, 'position' => 1]);

        $this->asUser($agent)->getJson("/api/v1/pipelines/{$pipeline->id}/board")->assertOk();
    }

    public function test_administrator_can_create_a_pipeline_with_default_stages(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');

        $response = $this->asUser($admin)->postJson('/api/v1/pipelines', ['name' => 'Enterprise Pipeline'])
            ->assertStatus(201);

        $this->assertDatabaseHas('pipelines', ['id' => $response->json('data.id'), 'name' => 'Enterprise Pipeline']);
        $this->assertCount(7, $response->json('data.stages'));
    }

    public function test_board_returns_stage_and_overall_totals(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');
        $pipeline = Pipeline::factory()->create(['workspace_id' => $admin->workspace_id]);
        $stage1 = PipelineStage::factory()->create(['pipeline_id' => $pipeline->id, 'position' => 1]);
        $stage2 = PipelineStage::factory()->create(['pipeline_id' => $pipeline->id, 'position' => 2]);

        $contact = Contact::factory()->create(['workspace_id' => $admin->workspace_id]);

        Deal::factory()->create([
            'workspace_id' => $admin->workspace_id, 'contact_id' => $contact->id,
            'pipeline_id' => $pipeline->id, 'pipeline_stage_id' => $stage1->id, 'value_amount' => 100,
        ]);
        Deal::factory()->create([
            'workspace_id' => $admin->workspace_id, 'contact_id' => $contact->id,
            'pipeline_id' => $pipeline->id, 'pipeline_stage_id' => $stage1->id, 'value_amount' => 200,
        ]);
        Deal::factory()->create([
            'workspace_id' => $admin->workspace_id, 'contact_id' => $contact->id,
            'pipeline_id' => $pipeline->id, 'pipeline_stage_id' => $stage2->id, 'value_amount' => 50,
        ]);

        $response = $this->asUser($admin)->getJson("/api/v1/pipelines/{$pipeline->id}/board")->assertOk();

        $stages = collect($response->json('data.stages'));
        $this->assertEquals(300.0, $stages->firstWhere('id', $stage1->id)['total_value']);
        $this->assertEquals(50.0, $stages->firstWhere('id', $stage2->id)['total_value']);
        $this->assertEquals(350.0, $response->json('data.overall_total'));
    }

    public function test_pipeline_belonging_to_another_workspace_is_not_visible(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');
        $other = Workspace::factory()->create();
        $foreign = Pipeline::factory()->create(['workspace_id' => $other->id]);

        $this->asUser($admin)->getJson("/api/v1/pipelines/{$foreign->id}")->assertStatus(404);
    }

    public function test_cannot_delete_pipeline_with_deals(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');
        $pipeline = Pipeline::factory()->create(['workspace_id' => $admin->workspace_id]);
        $stage = PipelineStage::factory()->create(['pipeline_id' => $pipeline->id, 'position' => 1]);
        $contact = Contact::factory()->create(['workspace_id' => $admin->workspace_id]);
        Deal::factory()->create([
            'workspace_id' => $admin->workspace_id, 'contact_id' => $contact->id,
            'pipeline_id' => $pipeline->id, 'pipeline_stage_id' => $stage->id,
        ]);

        $this->asUser($admin)->deleteJson("/api/v1/pipelines/{$pipeline->id}")->assertStatus(422);
    }
}
