<?php

use App\Models\Customer;
use App\Models\Lead;
use App\Models\Permission;

it('searches customers and leads scoped to the workspace and permissions', function () {
    [$workspace, $user] = userWithRole('agent');
    $permission = Permission::firstOrCreate(['key' => 'customers.view'], ['description' => 'View customers']);
    $user->roles->first()->permissions()->syncWithoutDetaching([$permission->id]);

    Customer::create(['workspace_id' => $workspace->id, 'name' => 'Acme Corp', 'stage' => 'active']);
    Customer::create(['workspace_id' => $workspace->id, 'name' => 'Unrelated Inc', 'stage' => 'active']);

    [$otherWorkspace] = userWithRole('agent');
    Customer::create(['workspace_id' => $otherWorkspace->id, 'name' => 'Acme Corp Other', 'stage' => 'active']);

    // leads.view not granted, so leads should be empty even though a match exists.
    Lead::create(['workspace_id' => $workspace->id, 'title' => 'Acme deal', 'customer_name' => 'Acme Corp', 'stage' => 'new']);

    $token = loginAs($user, $workspace);

    $response = $this->withHeader('Authorization', 'Bearer '.$token)->getJson('/api/v1/search?q=Acme');

    $response->assertStatus(200);
    expect($response->json('data.customers'))->toHaveCount(1);
    expect($response->json('data.customers.0.name'))->toBe('Acme Corp');
    expect($response->json('data.leads'))->toHaveCount(0);
});

it('requires at least 2 characters', function () {
    [$workspace, $user] = userWithRole('agent');
    $token = loginAs($user, $workspace);

    $this->withHeader('Authorization', 'Bearer '.$token)
        ->getJson('/api/v1/search?q=a')
        ->assertStatus(422);
});
