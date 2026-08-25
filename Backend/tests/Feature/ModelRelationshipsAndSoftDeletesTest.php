<?php

namespace Tests\Feature;

use App\Models\Contact;
use App\Models\Deal;
use App\Models\Lead;
use App\Models\Pipeline;
use App\Models\PipelineStage;
use App\Models\Role;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ModelRelationshipsAndSoftDeletesTest extends TestCase
{
    use RefreshDatabase;

    public function test_contact_belongs_to_workspace_and_workspace_has_many_contacts(): void
    {
        $workspace = Workspace::factory()->create();
        $contact = Contact::factory()->create(['workspace_id' => $workspace->id]);

        $this->assertTrue($contact->workspace->is($workspace));
        $this->assertTrue($workspace->contacts()->whereKey($contact->id)->exists());
    }

    public function test_lead_and_deal_relationships_resolve_through_the_pipeline(): void
    {
        $workspace = Workspace::factory()->create();
        $contact = Contact::factory()->create(['workspace_id' => $workspace->id]);

        $pipeline = Pipeline::query()->create([
            'workspace_id' => $workspace->id,
            'name' => 'Sales',
            'is_default' => true,
        ]);

        $stage = PipelineStage::query()->create([
            'pipeline_id' => $pipeline->id,
            'name' => 'New',
            'position' => 1,
        ]);

        $lead = Lead::query()->create([
            'workspace_id' => $workspace->id,
            'contact_id' => $contact->id,
            'status' => 'new',
        ]);

        $deal = Deal::query()->create([
            'workspace_id' => $workspace->id,
            'lead_id' => $lead->id,
            'contact_id' => $contact->id,
            'pipeline_id' => $pipeline->id,
            'pipeline_stage_id' => $stage->id,
            'title' => 'Big Deal',
            'value_amount' => 1234.56,
        ]);

        $this->assertTrue($deal->lead->is($lead));
        $this->assertTrue($deal->pipeline->is($pipeline));
        $this->assertTrue($deal->stage->is($stage));
        $this->assertTrue($lead->deals->contains($deal));
        $this->assertEquals('1234.56', (string) $deal->value_amount);
    }

    public function test_role_belongs_to_many_users_and_permissions_via_pivots(): void
    {
        $workspace = Workspace::factory()->create();
        $user = User::factory()->for($workspace, 'workspace')->create();

        $role = Role::query()->create([
            'workspace_id' => $workspace->id,
            'name' => 'Custom Role',
            'slug' => 'custom-role',
            'is_system' => false,
        ]);

        $user->roles()->attach($role);

        $this->assertTrue($user->roles->contains($role));
        $this->assertTrue($role->users->contains($user));
    }

    public function test_soft_deleting_a_contact_hides_it_from_default_queries_but_keeps_the_row(): void
    {
        $workspace = Workspace::factory()->create();
        $contact = Contact::factory()->create(['workspace_id' => $workspace->id]);

        $contact->delete();

        $this->assertNull(Contact::query()->find($contact->id));
        $this->assertNotNull(Contact::withTrashed()->find($contact->id));
        $this->assertNotNull($contact->fresh()?->deleted_at ?? Contact::withTrashed()->find($contact->id)->deleted_at);
    }

    public function test_soft_deleting_a_user_hides_it_from_default_queries_but_keeps_the_row(): void
    {
        $workspace = Workspace::factory()->create();
        $user = User::factory()->for($workspace, 'workspace')->create();

        $user->delete();

        $this->assertNull(User::query()->find($user->id));
        $this->assertNotNull(User::withTrashed()->find($user->id));
    }
}
