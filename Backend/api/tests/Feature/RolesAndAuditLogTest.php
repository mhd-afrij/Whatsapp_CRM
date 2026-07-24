<?php

use App\Models\AuditLog;
use App\Models\Permission;
use Illuminate\Support\Str;

it('allows a user with roles.manage to list roles and permissions', function () {
    [$workspace, $user] = userWithRole('administrator');

    // Grant roles.manage explicitly via a permission row + pivot, independent of RoleSeeder.
    $permission = Permission::firstOrCreate(['key' => 'roles.manage'], ['description' => 'Manage roles']);
    $user->roles()->first()->permissions()->syncWithoutDetaching([$permission->id]);

    $token = loginAs($user, $workspace);

    $this->withHeader('Authorization', 'Bearer '.$token)
        ->getJson('/api/v1/roles')
        ->assertStatus(200);

    $this->withHeader('Authorization', 'Bearer '.$token)
        ->getJson('/api/v1/permissions')
        ->assertStatus(200)
        ->assertJsonFragment(['key' => 'roles.manage']);
});

it('forbids a user without roles.manage from listing roles', function () {
    [$workspace, $user] = userWithRole('agent');
    $token = loginAs($user, $workspace);

    $this->withHeader('Authorization', 'Bearer '.$token)
        ->getJson('/api/v1/roles')
        ->assertStatus(403)
        ->assertJson(['code' => 'FORBIDDEN']);
});

it('scopes audit logs to the requesting workspace and requires audit.view', function () {
    [$workspaceA, $userA] = userWithRole('agent');
    $permission = Permission::firstOrCreate(['key' => 'audit.view'], ['description' => 'View audit log']);
    $userA->roles()->first()->permissions()->syncWithoutDetaching([$permission->id]);

    [$workspaceB, $userB] = userWithRole('agent');

    AuditLog::create([
        'workspace_id' => $workspaceA->id,
        'user_id' => $userA->id,
        'action' => 'auth.login',
        'entity_type' => 'User',
        'entity_id' => $userA->id,
        'ip_address' => '127.0.0.1',
        'correlation_id' => (string) Str::uuid(),
    ]);
    AuditLog::create([
        'workspace_id' => $workspaceB->id,
        'user_id' => $userB->id,
        'action' => 'auth.login',
        'entity_type' => 'User',
        'entity_id' => $userB->id,
        'ip_address' => '127.0.0.1',
        'correlation_id' => (string) Str::uuid(),
    ]);

    $token = loginAs($userA, $workspaceA);

    $response = $this->withHeader('Authorization', 'Bearer '.$token)->getJson('/api/v1/audit-logs');

    $response->assertStatus(200);
    expect(collect($response->json('data')))->each(
        fn ($entry) => $entry->toHaveKey('workspace_id', $workspaceA->id)
    );
});
