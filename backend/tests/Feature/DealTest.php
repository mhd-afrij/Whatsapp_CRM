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

class DealTest extends TestCase
{
    use CreatesWorkspaceUsers, RefreshDatabase;

    protected function makePipeline(int $workspaceId): Pipeline
    {
        $pipeline = Pipeline::factory()->create(['workspace_id' => $workspaceId]);
        PipelineStage::factory()->create(['pipeline_id' => $pipeline->id, 'position' => 1, 'name' => 'New']);
        PipelineStage::factory()->create(['pipeline_id' => $pipeline->id, 'position' => 2, 'name' => 'Won', 'is_won_stage' => true]);
        PipelineStage::factory()->create(['pipeline_id' => $pipeline->id, 'position' => 3, 'name' => 'Lost', 'is_lost_stage' => true]);

        return $pipeline->fresh('stages');
    }

    public function test_viewer_without_permission_cannot_list_deals(): void
    {
        $this->seedRbac();
        $viewer = $this->userWithRole('Viewer');

        $this->asUser($viewer)->getJson('/api/v1/deals')->assertStatus(403);
    }

    public function test_agent_can_create_a_deal(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $contact = Contact::factory()->create(['workspace_id' => $agent->workspace_id]);
        $pipeline = $this->makePipeline($agent->workspace_id);
        $stage = $pipeline->stages->firstWhere('name', 'New');

        $response = $this->asUser($agent)->postJson('/api/v1/deals', [
            'contact_id' => $contact->id,
            'pipeline_id' => $pipeline->id,
            'pipeline_stage_id' => $stage->id,
            'title' => 'Big Deal',
            'value_amount' => 5000,
        ])->assertStatus(201);

        $this->assertDatabaseHas('deals', ['id' => $response->json('data.id'), 'title' => 'Big Deal', 'status' => 'open']);
        $this->assertDatabaseHas('deal_stage_history', ['deal_id' => $response->json('data.id'), 'to_stage_id' => $stage->id, 'from_stage_id' => null]);
    }

    public function test_moving_deal_stage_writes_history_and_updates_current_stage(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $pipeline = $this->makePipeline($agent->workspace_id);
        $newStage = $pipeline->stages->firstWhere('name', 'New');
        $wonStage = $pipeline->stages->firstWhere('name', 'Won');

        $deal = Deal::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'pipeline_id' => $pipeline->id,
            'pipeline_stage_id' => $newStage->id,
            'owner_user_id' => $agent->id,
        ]);

        $this->asUser($agent)->patchJson("/api/v1/deals/{$deal->id}/stage", [
            'pipeline_stage_id' => $wonStage->id,
        ])->assertOk();

        $this->assertDatabaseHas('deals', ['id' => $deal->id, 'pipeline_stage_id' => $wonStage->id]);
        $this->assertDatabaseHas('deal_stage_history', [
            'deal_id' => $deal->id,
            'from_stage_id' => $newStage->id,
            'to_stage_id' => $wonStage->id,
        ]);
    }

    public function test_marking_deal_won_sets_probability_and_closes(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $pipeline = $this->makePipeline($agent->workspace_id);
        $deal = Deal::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'pipeline_id' => $pipeline->id,
            'pipeline_stage_id' => $pipeline->stages->first()->id,
            'owner_user_id' => $agent->id,
        ]);

        $this->asUser($agent)->postJson("/api/v1/deals/{$deal->id}/won")->assertOk();

        $this->assertDatabaseHas('deals', ['id' => $deal->id, 'status' => 'won', 'probability_percent' => 100]);
        $this->assertNotNull($deal->fresh()->closed_at);
    }

    public function test_marking_deal_lost_requires_lost_reason(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $pipeline = $this->makePipeline($agent->workspace_id);
        $deal = Deal::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'pipeline_id' => $pipeline->id,
            'pipeline_stage_id' => $pipeline->stages->first()->id,
            'owner_user_id' => $agent->id,
        ]);

        $this->asUser($agent)->postJson("/api/v1/deals/{$deal->id}/lost")
            ->assertStatus(422);

        $this->asUser($agent)->postJson("/api/v1/deals/{$deal->id}/lost", ['lost_reason' => 'Budget cut'])
            ->assertOk();

        $this->assertDatabaseHas('deals', ['id' => $deal->id, 'status' => 'lost', 'lost_reason' => 'Budget cut']);
    }

    public function test_cannot_move_stage_of_a_closed_deal(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $pipeline = $this->makePipeline($agent->workspace_id);
        $newStage = $pipeline->stages->firstWhere('name', 'New');
        $wonStage = $pipeline->stages->firstWhere('name', 'Won');

        $deal = Deal::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'pipeline_id' => $pipeline->id,
            'pipeline_stage_id' => $newStage->id,
            'owner_user_id' => $agent->id,
            'status' => 'won',
        ]);

        $this->asUser($agent)->patchJson("/api/v1/deals/{$deal->id}/stage", [
            'pipeline_stage_id' => $wonStage->id,
        ])->assertStatus(422);
    }

    public function test_cannot_view_a_deal_belonging_to_another_workspace(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $other = Workspace::factory()->create();
        $foreign = Deal::factory()->create(['workspace_id' => $other->id]);

        $this->asUser($agent)->getJson("/api/v1/deals/{$foreign->id}")->assertStatus(404);
    }
}
