<?php

use App\Models\Permission;

it('updates workspace name and timezone', function () {
    [$workspace, $admin] = userWithRole('administrator');
    $permission = Permission::firstOrCreate(
        ['key' => 'settings.general.manage'],
        ['description' => 'Manage general workspace settings']
    );
    $admin->roles->first()->permissions()->syncWithoutDetaching([$permission->id]);

    $token = loginAs($admin, $workspace);

    $response = $this->withHeader('Authorization', 'Bearer '.$token)->patchJson('/api/v1/workspace', [
        'name' => 'Renamed Workspace',
        'timezone' => 'America/New_York',
    ]);

    $response->assertStatus(200)
        ->assertJsonPath('data.name', 'Renamed Workspace')
        ->assertJsonPath('data.timezone', 'America/New_York');

    $this->assertDatabaseHas('workspaces', [
        'id' => $workspace->id,
        'name' => 'Renamed Workspace',
        'timezone' => 'America/New_York',
    ]);

    $this->assertDatabaseHas('audit_logs', [
        'workspace_id' => $workspace->id,
        'action' => 'workspace.updated',
    ]);
});

it('forbids updating workspace settings without permission', function () {
    [$workspace, $user] = userWithRole('agent');
    $token = loginAs($user, $workspace);

    $this->withHeader('Authorization', 'Bearer '.$token)
        ->patchJson('/api/v1/workspace', ['name' => 'Nope'])
        ->assertStatus(403);
});

it('rejects an invalid timezone', function () {
    [$workspace, $admin] = userWithRole('administrator');
    $permission = Permission::firstOrCreate(
        ['key' => 'settings.general.manage'],
        ['description' => 'Manage general workspace settings']
    );
    $admin->roles->first()->permissions()->syncWithoutDetaching([$permission->id]);

    $token = loginAs($admin, $workspace);

    $this->withHeader('Authorization', 'Bearer '.$token)
        ->patchJson('/api/v1/workspace', ['timezone' => 'Not/AZone'])
        ->assertStatus(422);
});
