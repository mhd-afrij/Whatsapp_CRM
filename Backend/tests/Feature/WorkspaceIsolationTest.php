<?php

namespace Tests\Feature;

use App\Models\Contact;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Verifies the WorkspaceScope global scope (app/Models/Scopes/WorkspaceScope.php)
 * enforced via the BelongsToWorkspace trait: workspace A must never see workspace
 * B's rows, and creating a record while authenticated auto-fills workspace_id.
 */
class WorkspaceIsolationTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_user_only_sees_contacts_belonging_to_their_own_workspace(): void
    {
        $workspaceA = Workspace::factory()->create();
        $workspaceB = Workspace::factory()->create();

        $userA = User::factory()->for($workspaceA, 'workspace')->create();

        Contact::factory()->count(3)->create(['workspace_id' => $workspaceA->id]);
        Contact::factory()->count(5)->create(['workspace_id' => $workspaceB->id]);

        $this->actingAs($userA);

        $this->assertSame(3, Contact::query()->count());
        $this->assertSame(
            3,
            Contact::query()->where('workspace_id', $workspaceA->id)->count()
        );
    }

    public function test_a_workspace_cannot_load_another_workspaces_contact_by_id(): void
    {
        $workspaceA = Workspace::factory()->create();
        $workspaceB = Workspace::factory()->create();

        $userA = User::factory()->for($workspaceA, 'workspace')->create();
        $foreignContact = Contact::factory()->create(['workspace_id' => $workspaceB->id]);

        $this->actingAs($userA);

        $this->assertNull(Contact::query()->find($foreignContact->id));
    }

    public function test_creating_a_contact_while_authenticated_auto_fills_workspace_id(): void
    {
        $workspace = Workspace::factory()->create();
        $user = User::factory()->for($workspace, 'workspace')->create();

        $this->actingAs($user);

        $contact = Contact::query()->create(['full_name' => 'Auto Workspace Contact']);

        $this->assertSame($workspace->id, $contact->workspace_id);
    }

    public function test_querying_without_an_authenticated_user_is_unscoped(): void
    {
        $workspaceA = Workspace::factory()->create();
        $workspaceB = Workspace::factory()->create();

        Contact::factory()->count(2)->create(['workspace_id' => $workspaceA->id]);
        Contact::factory()->count(3)->create(['workspace_id' => $workspaceB->id]);

        $this->assertSame(5, Contact::query()->count());
    }
}
