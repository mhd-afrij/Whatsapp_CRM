<?php

namespace Tests\Feature;

use App\Models\Invitation;
use App\Models\Role;
use App\Models\Team;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\CreatesWorkspaceUsers;
use Tests\TestCase;

class AdminSuiteTest extends TestCase
{
    use CreatesWorkspaceUsers, RefreshDatabase;

    // --- Users admin ---

    public function test_agent_gets_minimal_directory_not_admin_listing_even_with_search_param(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        User::factory()->create(['workspace_id' => $agent->workspace_id, 'name' => 'Zed Zephyr']);

        // Agent lacks users.view, so the admin-listing shape (paginated, with meta) never
        // kicks in even though 'search' is present - falls back to the plain directory.
        $response = $this->asUser($agent)->getJson('/api/v1/users?search=Zed')->assertOk();
        $this->assertNull($response->json('meta'));
    }

    public function test_manager_can_list_admin_users_scoped_query(): void
    {
        $this->seedRbac();
        $manager = $this->userWithRole('Manager');
        User::factory()->create(['workspace_id' => $manager->workspace_id, 'name' => 'Zed Zephyr']);

        $response = $this->asUser($manager)->getJson('/api/v1/users?search=Zed')->assertOk();
        $this->assertSame(1, count($response->json('data')));
    }

    public function test_any_authenticated_user_still_gets_minimal_directory_without_admin_params(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');

        $this->asUser($agent)->getJson('/api/v1/users')->assertOk()->assertJsonPath('success', true);
    }

    public function test_admin_can_view_and_update_a_user(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');
        $viewerRole = Role::where('name', 'Viewer')->firstOrFail();
        $target = $this->userWithRole('Agent');

        $this->asUser($admin)->getJson("/api/v1/users/{$target->id}")
            ->assertOk()->assertJsonPath('data.id', $target->id);

        $this->asUser($admin)->patchJson("/api/v1/users/{$target->id}", [
            'name' => 'Renamed Agent',
            'role_id' => $viewerRole->id,
        ])->assertOk()->assertJsonPath('data.name', 'Renamed Agent');

        $this->assertTrue($target->fresh()->roles()->where('roles.id', $viewerRole->id)->exists());
    }

    public function test_admin_cannot_manage_super_admin_accounts_or_assign_super_admin_role(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');
        $superAdmin = $this->userWithRole('Super Administrator');
        $agent = $this->userWithRole('Agent');
        $superAdminRole = Role::where('name', 'Super Administrator')->firstOrFail();

        $this->asUser($admin)
            ->patchJson("/api/v1/users/{$superAdmin->id}", ['name' => 'Renamed Super Admin'])
            ->assertStatus(403);

        $this->asUser($admin)
            ->patchJson("/api/v1/users/{$agent->id}", ['role_id' => $superAdminRole->id])
            ->assertStatus(403);

        $this->asUser($admin)
            ->patchJson("/api/v1/users/{$superAdmin->id}/suspend")
            ->assertStatus(403);
    }

    public function test_super_admin_can_assign_the_super_admin_role_to_another_user(): void
    {
        $this->seedRbac();
        $superAdmin = $this->userWithRole('Super Administrator');
        $agent = $this->userWithRole('Agent');
        $superAdminRole = Role::where('name', 'Super Administrator')->firstOrFail();

        $this->asUser($superAdmin)
            ->patchJson("/api/v1/users/{$agent->id}", ['role_id' => $superAdminRole->id])
            ->assertOk();

        $this->assertTrue($agent->fresh()->isSuperAdmin());
    }


    public function test_agent_cannot_update_another_user(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $other = $this->userWithRole('Agent');

        $this->asUser($agent)->patchJson("/api/v1/users/{$other->id}", ['name' => 'Nope'])
            ->assertStatus(403);
    }

    public function test_admin_can_resend_a_pending_invitation(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');
        $role = Role::where('name', 'Agent')->firstOrFail();

        $invitation = Invitation::create([
            'workspace_id' => $admin->workspace_id,
            'email' => 'invitee@example.com',
            'role_id' => $role->id,
            'invited_by' => $admin->id,
            'token' => 'test-token',
            'status' => 'pending',
            'expires_at' => now()->addDay(),
        ]);

        $this->asUser($admin)->postJson("/api/v1/invitations/{$invitation->id}/resend")
            ->assertOk()->assertJsonPath('success', true);
    }

    public function test_manager_cannot_resend_invitation(): void
    {
        $this->seedRbac();
        $manager = $this->userWithRole('Manager');
        $role = Role::where('name', 'Agent')->firstOrFail();

        $invitation = Invitation::create([
            'workspace_id' => $manager->workspace_id,
            'email' => 'invitee2@example.com',
            'role_id' => $role->id,
            'invited_by' => $manager->id,
            'token' => 'test-token-2',
            'status' => 'pending',
            'expires_at' => now()->addDay(),
        ]);

        $this->asUser($manager)->postJson("/api/v1/invitations/{$invitation->id}/resend")
            ->assertStatus(403);
    }

    // --- Team admin ---

    public function test_agent_cannot_create_a_team(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');

        $this->asUser($agent)->postJson('/api/v1/teams', ['name' => 'Sales'])->assertStatus(403);
    }

    public function test_manager_can_view_but_not_manage_teams(): void
    {
        $this->seedRbac();
        $manager = $this->userWithRole('Manager');

        $this->asUser($manager)->getJson('/api/v1/teams')->assertOk();
        $this->asUser($manager)->postJson('/api/v1/teams', ['name' => 'Sales'])->assertStatus(403);
    }

    public function test_admin_can_crud_a_team_and_manage_members(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');
        $memberA = $this->userWithRole('Agent');
        $memberB = $this->userWithRole('Agent');

        $create = $this->asUser($admin)->postJson('/api/v1/teams', [
            'name' => 'Support Team',
            'description' => 'Handles support',
        ])->assertStatus(201);

        $teamId = $create->json('data.id');

        $this->asUser($admin)->patchJson("/api/v1/teams/{$teamId}", ['name' => 'Support Team Renamed'])
            ->assertOk()->assertJsonPath('data.name', 'Support Team Renamed');

        $this->asUser($admin)->postJson("/api/v1/teams/{$teamId}/members", [
            'user_id' => $memberA->id,
            'is_lead' => true,
        ])->assertOk();

        $this->asUser($admin)->postJson("/api/v1/teams/{$teamId}/members", [
            'user_id' => $memberB->id,
        ])->assertOk()->assertJsonCount(2, 'data.members');

        $this->asUser($admin)->deleteJson("/api/v1/teams/{$teamId}/members/{$memberB->id}")
            ->assertOk()->assertJsonCount(1, 'data.members');

        $this->asUser($admin)->deleteJson("/api/v1/teams/{$teamId}")->assertOk();
        $this->assertDatabaseMissing('teams', ['id' => $teamId]);
    }

    // --- Role admin ---

    public function test_only_super_admin_can_manage_roles(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');

        $this->asUser($admin)->getJson('/api/v1/roles')->assertOk();
        $this->asUser($admin)->postJson('/api/v1/roles', ['name' => 'Custom Role'])->assertStatus(403);
    }

    public function test_super_admin_can_create_update_and_delete_a_custom_role(): void
    {
        $this->seedRbac();
        $superAdmin = $this->userWithRole('Super Administrator');

        $create = $this->asUser($superAdmin)->postJson('/api/v1/roles', [
            'name' => 'Custom Auditor',
            'description' => 'Read-only auditor',
            'permissions' => ['contacts.view', 'reports.view'],
        ])->assertStatus(201);

        $roleId = $create->json('data.id');
        $this->assertFalse($create->json('data.is_system'));
        $this->assertEqualsCanonicalizing(['contacts.view', 'reports.view'], $create->json('data.permissions'));

        $this->asUser($superAdmin)->patchJson("/api/v1/roles/{$roleId}", [
            'permissions' => ['contacts.view'],
        ])->assertOk()->assertJsonCount(1, 'data.permissions');

        $this->asUser($superAdmin)->deleteJson("/api/v1/roles/{$roleId}")->assertOk();
        $this->assertDatabaseMissing('roles', ['id' => $roleId]);
    }

    public function test_system_roles_cannot_be_deleted_or_edited(): void
    {
        $this->seedRbac();
        $superAdmin = $this->userWithRole('Super Administrator');
        $agentRole = Role::where('name', 'Agent')->firstOrFail();

        $this->asUser($superAdmin)->deleteJson("/api/v1/roles/{$agentRole->id}")
            ->assertStatus(422);

        $this->asUser($superAdmin)->patchJson("/api/v1/roles/{$agentRole->id}", [
            'permissions' => ['contacts.view'],
        ])->assertStatus(422);

        $this->assertDatabaseHas('roles', ['id' => $agentRole->id, 'is_system' => true]);
    }

    public function test_role_with_assigned_users_cannot_be_deleted(): void
    {
        $this->seedRbac();
        $superAdmin = $this->userWithRole('Super Administrator');

        $create = $this->asUser($superAdmin)->postJson('/api/v1/roles', [
            'name' => 'In Use Role',
        ])->assertStatus(201);
        $roleId = $create->json('data.id');

        $user = $this->userWithRole('Agent');
        $user->roles()->attach($roleId);

        $this->asUser($superAdmin)->deleteJson("/api/v1/roles/{$roleId}")->assertStatus(422);
    }

    // --- Permission catalog ---

    public function test_permission_catalog_is_gated_and_complete(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $admin = $this->userWithRole('Administrator');

        $this->asUser($agent)->getJson('/api/v1/permissions')->assertStatus(403);

        $response = $this->asUser($admin)->getJson('/api/v1/permissions')->assertOk();

        $allPermissions = collect($response->json('data'))->flatten(1)->pluck('name');
        $this->assertTrue($allPermissions->contains('roles.manage'));
        $this->assertTrue($allPermissions->contains('teams.manage'));
        $this->assertTrue($allPermissions->contains('users.manage'));
        $this->assertGreaterThanOrEqual(35, $allPermissions->count());
    }

    // --- Workspace isolation ---

    public function test_teams_and_roles_are_workspace_isolated(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');

        $otherWorkspace = Workspace::factory()->create();
        $otherTeam = Team::create(['workspace_id' => $otherWorkspace->id, 'name' => 'Other Workspace Team']);

        $this->asUser($admin)->getJson('/api/v1/teams')->assertOk()
            ->assertJsonMissing(['name' => 'Other Workspace Team']);

        $this->asUser($admin)->getJson("/api/v1/teams/{$otherTeam->id}")->assertStatus(404);
    }
}
