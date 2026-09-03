<?php

use App\Models\Permission;
use App\Models\User;

it('lists team members scoped to the requesting workspace', function () {
    [$workspaceA, $userA] = userWithRole('agent');
    $permission = Permission::firstOrCreate(['key' => 'users.view'], ['description' => 'View team members']);
    $userA->roles()->first()->permissions()->syncWithoutDetaching([$permission->id]);

    User::factory()->create(['workspace_id' => $workspaceA->id]);

    [$workspaceB] = userWithRole('agent');
    User::factory()->create(['workspace_id' => $workspaceB->id]);

    $token = loginAs($userA, $workspaceA);

    $response = $this->withHeader('Authorization', 'Bearer '.$token)->getJson('/api/v1/users');

    $response->assertStatus(200);
    expect($response->json('data'))->toHaveCount(2); // userA + the factory-created teammate in workspaceA only
});

it('forbids listing users without users.view', function () {
    [$workspace, $user] = userWithRole('agent');
    $token = loginAs($user, $workspace);

    $this->withHeader('Authorization', 'Bearer '.$token)
        ->getJson('/api/v1/users')
        ->assertStatus(403);
});
