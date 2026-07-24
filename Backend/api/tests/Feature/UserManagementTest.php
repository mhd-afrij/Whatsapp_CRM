<?php

use App\Models\Permission;
use App\Models\Role;

function grantPermissions(Role $role, array $keys): void
{
    $ids = collect($keys)->map(
        fn ($key) => Permission::firstOrCreate(['key' => $key], ['description' => $key])->id
    );

    $role->permissions()->syncWithoutDetaching($ids);
}

it('invites a new team member with a role', function () {
    [$workspace, $admin] = userWithRole('administrator');
    grantPermissions($admin->roles->first(), ['users.view', 'users.invite']);

    Role::firstOrCreate(['workspace_id' => null, 'slug' => 'agent'], ['name' => 'Agent', 'is_system_role' => true]);

    $token = loginAs($admin, $workspace);

    $response = $this->withHeader('Authorization', 'Bearer '.$token)->postJson('/api/v1/users', [
        'name' => 'New Agent',
        'email' => 'new.agent@demo.test',
        'role' => 'agent',
    ]);

    $response->assertStatus(201);
    expect($response->json('data.email'))->toBe('new.agent@demo.test');
    expect($response->json('data.roles'))->toContain('agent');
    expect($response->json('temporary_password'))->not->toBeEmpty();

    $this->assertDatabaseHas('users', [
        'workspace_id' => $workspace->id,
        'email' => 'new.agent@demo.test',
    ]);

    $this->assertDatabaseHas('audit_logs', [
        'workspace_id' => $workspace->id,
        'action' => 'user.invited',
    ]);
});

it('forbids inviting a team member without users.invite', function () {
    [$workspace, $agent] = userWithRole('agent');
    $token = loginAs($agent, $workspace);

    $this->withHeader('Authorization', 'Bearer '.$token)->postJson('/api/v1/users', [
        'name' => 'New Agent',
        'email' => 'blocked@demo.test',
        'role' => 'agent',
    ])->assertStatus(403);
});

it('updates a team member name, email, and role', function () {
    [$workspace, $admin] = userWithRole('administrator');
    grantPermissions($admin->roles->first(), ['users.invite']);
    Role::firstOrCreate(['workspace_id' => null, 'slug' => 'team_lead'], ['name' => 'Team Lead', 'is_system_role' => true]);

    [, $teammate] = userWithRole('agent', ['workspace_id' => $workspace->id]);
    $teammate->update(['workspace_id' => $workspace->id]);

    $token = loginAs($admin, $workspace);

    $response = $this->withHeader('Authorization', 'Bearer '.$token)
        ->patchJson("/api/v1/users/{$teammate->id}", [
            'name' => 'Updated Name',
            'role' => 'team_lead',
        ]);

    $response->assertStatus(200);
    expect($response->json('data.name'))->toBe('Updated Name');
    expect($response->json('data.roles'))->toContain('team_lead');
});

it('suspends and restores a team member', function () {
    [$workspace, $admin] = userWithRole('administrator');
    grantPermissions($admin->roles->first(), ['users.suspend']);

    [, $teammate] = userWithRole('agent', ['workspace_id' => $workspace->id]);
    $teammate->update(['workspace_id' => $workspace->id]);

    $token = loginAs($admin, $workspace);

    $this->withHeader('Authorization', 'Bearer '.$token)
        ->patchJson("/api/v1/users/{$teammate->id}/status", ['status' => 'suspended'])
        ->assertStatus(200)
        ->assertJsonPath('data.status', 'suspended');

    $this->assertDatabaseHas('audit_logs', ['action' => 'user.suspended']);

    $this->withHeader('Authorization', 'Bearer '.$token)
        ->patchJson("/api/v1/users/{$teammate->id}/status", ['status' => 'active'])
        ->assertStatus(200)
        ->assertJsonPath('data.status', 'active');
});

it('prevents suspending your own account', function () {
    [$workspace, $admin] = userWithRole('administrator');
    grantPermissions($admin->roles->first(), ['users.suspend']);

    $token = loginAs($admin, $workspace);

    $this->withHeader('Authorization', 'Bearer '.$token)
        ->patchJson("/api/v1/users/{$admin->id}/status", ['status' => 'suspended'])
        ->assertStatus(422);
});

it('cannot manage a user from another workspace', function () {
    [$workspaceA, $admin] = userWithRole('administrator');
    grantPermissions($admin->roles->first(), ['users.suspend']);

    [, $otherUser] = userWithRole('agent');

    $token = loginAs($admin, $workspaceA);

    $this->withHeader('Authorization', 'Bearer '.$token)
        ->patchJson("/api/v1/users/{$otherUser->id}/status", ['status' => 'suspended'])
        ->assertStatus(404);
});
