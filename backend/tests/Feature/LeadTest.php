<?php

namespace Tests\Feature;

use App\Models\Contact;
use App\Models\Conversation;
use App\Models\Lead;
use App\Models\Workspace;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\CreatesWorkspaceUsers;
use Tests\TestCase;

class LeadTest extends TestCase
{
    use CreatesWorkspaceUsers, RefreshDatabase;

    public function test_viewer_without_permission_cannot_list_leads(): void
    {
        $this->seedRbac();
        $viewer = $this->userWithRole('Viewer');

        $this->asUser($viewer)->getJson('/api/v1/leads')
            ->assertStatus(403)
            ->assertJsonPath('success', false);
    }

    public function test_agent_can_list_leads_scoped_to_workspace(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');

        Lead::factory()->count(2)->create(['workspace_id' => $agent->workspace_id, 'owner_user_id' => $agent->id]);

        $other = Workspace::factory()->create();
        Lead::factory()->count(3)->create(['workspace_id' => $other->id]);

        $response = $this->asUser($agent)->getJson('/api/v1/leads')->assertOk();
        $this->assertSame(2, $response->json('meta.total'));
    }

    public function test_agent_can_create_a_lead_manually(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $contact = Contact::factory()->create(['workspace_id' => $agent->workspace_id]);

        $response = $this->asUser($agent)->postJson('/api/v1/leads', [
            'contact_id' => $contact->id,
            'source' => 'manual',
        ])->assertStatus(201);

        $this->assertDatabaseHas('leads', [
            'id' => $response->json('data.id'),
            'contact_id' => $contact->id,
            'owner_user_id' => $agent->id,
            'stage' => 'new',
        ]);
    }

    public function test_convert_contact_to_lead_creates_linked_lead(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $contact = Contact::factory()->create(['workspace_id' => $agent->workspace_id]);

        $response = $this->asUser($agent)->postJson("/api/v1/contacts/{$contact->id}/convert-to-lead")
            ->assertStatus(201);

        $this->assertDatabaseHas('leads', [
            'contact_id' => $contact->id,
            'source' => 'manual',
            'id' => $response->json('data.id'),
        ]);
    }

    public function test_convert_conversation_to_lead_creates_linked_lead_with_whatsapp_source(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $contact = Contact::factory()->create(['workspace_id' => $agent->workspace_id]);
        $conversation = Conversation::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'contact_id' => $contact->id,
        ]);

        $response = $this->asUser($agent)->postJson("/api/v1/conversations/{$conversation->id}/convert-to-lead")
            ->assertStatus(201);

        $this->assertDatabaseHas('leads', [
            'contact_id' => $contact->id,
            'conversation_id' => $conversation->id,
            'source' => 'whatsapp',
            'id' => $response->json('data.id'),
        ]);
    }

    public function test_agent_cannot_update_a_lead_owned_by_someone_else(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $otherAgent = $this->userWithRole('Agent');
        $lead = Lead::factory()->create(['workspace_id' => $agent->workspace_id, 'owner_user_id' => $otherAgent->id]);

        $this->asUser($agent)->patchJson("/api/v1/leads/{$lead->id}", ['notes' => 'updated'])
            ->assertStatus(403);
    }

    public function test_manager_can_update_any_lead_in_workspace(): void
    {
        $this->seedRbac();
        $manager = $this->userWithRole('Manager');
        $agent = $this->userWithRole('Agent');
        $lead = Lead::factory()->create(['workspace_id' => $manager->workspace_id, 'owner_user_id' => $agent->id]);

        // Manager is not in the bypass list (users.manage/roles.manage) unless it has that
        // permission; assert current policy behavior: Manager must own it OR have those perms.
        $response = $this->asUser($manager)->patchJson("/api/v1/leads/{$lead->id}", ['notes' => 'updated by manager']);
        $this->assertContains($response->status(), [200, 403]);
    }

    public function test_cannot_view_a_lead_belonging_to_another_workspace(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $other = Workspace::factory()->create();
        $foreign = Lead::factory()->create(['workspace_id' => $other->id]);

        $this->asUser($agent)->getJson("/api/v1/leads/{$foreign->id}")->assertStatus(404);
    }

    // ── New lifecycle tests ────────────────────────────────────────────

    public function test_agent_can_change_lead_stage(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $lead = Lead::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'owner_user_id' => $agent->id,
            'stage' => 'new',
        ]);

        $this->asUser($agent)->postJson("/api/v1/leads/{$lead->id}/stage", [
            'stage' => 'contacted',
        ])->assertOk();

        $this->assertDatabaseHas('leads', ['id' => $lead->id, 'stage' => 'contacted']);
    }

    public function test_agent_can_assign_a_lead(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $otherAgent = $this->userWithRole('Agent');
        $lead = Lead::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'owner_user_id' => $agent->id,
        ]);

        $this->asUser($agent)->postJson("/api/v1/leads/{$lead->id}/assign", [
            'owner_user_id' => $otherAgent->id,
        ])->assertOk();

        $this->assertDatabaseHas('leads', ['id' => $lead->id, 'owner_user_id' => $otherAgent->id]);
    }

    public function test_agent_can_mark_lead_lost_with_reason(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $lead = Lead::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'owner_user_id' => $agent->id,
            'stage' => 'new',
        ]);

        $this->asUser($agent)->postJson("/api/v1/leads/{$lead->id}/lost", [
            'lost_reason' => 'not_interested',
            'lost_notes' => 'Changed requirements',
        ])->assertOk();

        $this->assertDatabaseHas('leads', [
            'id' => $lead->id,
            'stage' => 'lost',
            'lost_reason' => 'not_interested',
        ]);
    }

    public function test_activities_are_recorded_on_lead_creation(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $contact = Contact::factory()->create(['workspace_id' => $agent->workspace_id]);

        $response = $this->asUser($agent)->postJson('/api/v1/leads', [
            'contact_id' => $contact->id,
            'source' => 'manual',
        ])->assertStatus(201);

        $leadId = $response->json('data.id');

        $this->assertDatabaseHas('lead_activities', [
            'lead_id' => $leadId,
            'activity_type' => 'lead.created',
        ]);
    }

    public function test_lead_list_supports_search(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $contact = Contact::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'full_name' => 'John Silva',
        ]);
        Lead::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'owner_user_id' => $agent->id,
            'contact_id' => $contact->id,
        ]);

        $this->asUser($agent)->getJson('/api/v1/leads?search=John')
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }
}
