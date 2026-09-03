<?php

namespace Tests\Feature;

use App\Models\Contact;
use App\Models\Lead;
use App\Models\Pipeline;
use App\Models\PipelineStage;
use App\Models\Workspace;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\CreatesWorkspaceUsers;
use Tests\TestCase;

class LeadTest extends TestCase
{
    use CreatesWorkspaceUsers, RefreshDatabase;

    public function test_agent_can_create_and_filter_a_lead(): void
    {
        $this->seedRbac(); $agent = $this->userWithRole('Agent');
        $contact = Contact::factory()->create(['workspace_id' => $agent->workspace_id]);
        $this->asUser($agent)->postJson('/api/v1/leads', ['contact_id' => $contact->id, 'source' => 'whatsapp', 'stage' => 'new'])->assertCreated();
        $this->asUser($agent)->getJson('/api/v1/leads?stage=new')->assertOk()->assertJsonPath('meta.total', 1);
    }

    public function test_viewer_without_lead_permission_is_rejected(): void
    {
        $this->seedRbac(); $viewer = $this->userWithRole('Viewer');
        $this->asUser($viewer)->getJson('/api/v1/leads')->assertForbidden();
    }

    public function test_lead_conversion_creates_deal_and_marks_lead_converted(): void
    {
        $this->seedRbac(); $agent = $this->userWithRole('Agent');
        $contact = Contact::factory()->create(['workspace_id' => $agent->workspace_id]);
        $lead = Lead::factory()->create(['workspace_id' => $agent->workspace_id, 'contact_id' => $contact->id, 'owner_user_id' => $agent->id]);
        $pipeline = Pipeline::factory()->create(['workspace_id' => $agent->workspace_id]);
        $stage = PipelineStage::factory()->create(['pipeline_id' => $pipeline->id]);

        $response = $this->asUser($agent)->postJson('/api/v1/leads/'.$lead->id.'/convert', ['pipeline_id' => $pipeline->id, 'pipeline_stage_id' => $stage->id, 'title' => 'Converted opportunity'])->assertCreated();

        $this->assertDatabaseHas('leads', ['id' => $lead->id, 'stage' => 'converted']);
        $this->assertDatabaseHas('deals', ['id' => $response->json('data.deal.id'), 'lead_id' => $lead->id, 'contact_id' => $contact->id]);
    }

    public function test_lead_cannot_be_viewed_across_workspaces(): void
    {
        $this->seedRbac(); $agent = $this->userWithRole('Agent'); $other = Workspace::factory()->create();
        $lead = Lead::factory()->create(['workspace_id' => $other->id]);
        $this->asUser($agent)->getJson('/api/v1/leads/'.$lead->id)->assertNotFound();
    }
}
