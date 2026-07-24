<?php

use App\Models\CalendarEvent;
use App\Models\Lead;
use App\Models\Permission;
use App\Models\Role;

function grantCrmPermissions(Role $role, array $keys): void
{
    $ids = collect($keys)->map(
        fn ($key) => Permission::firstOrCreate(['key' => $key], ['description' => $key])->id
    );

    $role->permissions()->syncWithoutDetaching($ids);
}

// Leads

it('creates, updates, archives, and deletes a lead', function () {
    [$workspace, $user] = userWithRole('agent');
    grantCrmPermissions($user->roles->first(), ['leads.view', 'leads.create', 'leads.update', 'leads.delete']);
    $token = loginAs($user, $workspace);
    $auth = fn () => $this->withHeader('Authorization', 'Bearer '.$token);

    $create = $auth()->postJson('/api/v1/crm/leads', [
        'title' => 'New Deal',
        'customer_name' => 'Acme Co',
        'stage' => 'new',
    ]);
    $create->assertStatus(201);
    $leadId = $create->json('data.id');

    $auth()->getJson('/api/v1/crm/leads')
        ->assertStatus(200)
        ->assertJsonCount(1, 'data');

    $auth()->patchJson("/api/v1/crm/leads/{$leadId}", ['stage' => 'won'])
        ->assertStatus(200)
        ->assertJsonPath('data.stage', 'won');

    $auth()->postJson("/api/v1/crm/leads/{$leadId}/archive")->assertStatus(200);
    $this->assertSoftDeleted('leads', ['id' => $leadId]);

    $auth()->deleteJson("/api/v1/crm/leads/{$leadId}")->assertStatus(200);
    $this->assertDatabaseMissing('leads', ['id' => $leadId]);
});

it('forbids creating a lead without leads.create', function () {
    [$workspace, $user] = userWithRole('agent');
    $token = loginAs($user, $workspace);

    $this->withHeader('Authorization', 'Bearer '.$token)->postJson('/api/v1/crm/leads', [
        'title' => 'New Deal',
        'customer_name' => 'Acme Co',
        'stage' => 'new',
    ])->assertStatus(403);
});

it('does not allow updating a lead from another workspace', function () {
    [$workspaceA, $userA] = userWithRole('agent');
    grantCrmPermissions($userA->roles->first(), ['leads.update']);
    [$workspaceB] = userWithRole('agent');
    $lead = Lead::create([
        'workspace_id' => $workspaceB->id,
        'title' => 'Other workspace lead',
        'customer_name' => 'Other Co',
        'stage' => 'new',
    ]);

    $token = loginAs($userA, $workspaceA);

    $this->withHeader('Authorization', 'Bearer '.$token)
        ->patchJson("/api/v1/crm/leads/{$lead->id}", ['stage' => 'won'])
        ->assertStatus(404);
});

// Customers

it('creates, updates, archives, and deletes a customer', function () {
    [$workspace, $user] = userWithRole('agent');
    grantCrmPermissions($user->roles->first(), ['customers.view', 'customers.create', 'customers.update', 'customers.delete']);
    $token = loginAs($user, $workspace);
    $auth = fn () => $this->withHeader('Authorization', 'Bearer '.$token);

    $create = $auth()->postJson('/api/v1/crm/customers', [
        'name' => 'Jane Doe',
        'stage' => 'active',
    ]);
    $create->assertStatus(201);
    $customerId = $create->json('data.id');

    $auth()->getJson('/api/v1/crm/customers')
        ->assertStatus(200)
        ->assertJsonCount(1, 'data');

    $auth()->patchJson("/api/v1/crm/customers/{$customerId}", ['company' => 'Acme'])
        ->assertStatus(200)
        ->assertJsonPath('data.company', 'Acme');

    $auth()->postJson("/api/v1/crm/customers/{$customerId}/archive")->assertStatus(200);
    $this->assertSoftDeleted('customers', ['id' => $customerId]);

    $auth()->deleteJson("/api/v1/crm/customers/{$customerId}")->assertStatus(200);
    $this->assertDatabaseMissing('customers', ['id' => $customerId]);
});

it('validates required fields when creating a customer', function () {
    [$workspace, $user] = userWithRole('agent');
    grantCrmPermissions($user->roles->first(), ['customers.create']);
    $token = loginAs($user, $workspace);

    $this->withHeader('Authorization', 'Bearer '.$token)
        ->postJson('/api/v1/crm/customers', ['stage' => 'active'])
        ->assertStatus(422)
        ->assertJsonValidationErrors('name');
});

// Tasks

it('creates, updates, archives, and deletes a task', function () {
    [$workspace, $user] = userWithRole('agent');
    grantCrmPermissions($user->roles->first(), ['tasks.view', 'tasks.create', 'tasks.assign', 'tasks.complete']);
    $token = loginAs($user, $workspace);
    $auth = fn () => $this->withHeader('Authorization', 'Bearer '.$token);

    $create = $auth()->postJson('/api/v1/crm/tasks', [
        'title' => 'Follow up call',
        'priority' => 'high',
        'status' => 'open',
        'assignee_id' => $user->id,
    ]);
    $create->assertStatus(201);
    $taskId = $create->json('data.id');

    $auth()->getJson('/api/v1/crm/tasks')
        ->assertStatus(200)
        ->assertJsonCount(1, 'data');

    $auth()->patchJson("/api/v1/crm/tasks/{$taskId}", ['status' => 'completed'])
        ->assertStatus(200)
        ->assertJsonPath('data.status', 'completed');

    $auth()->postJson("/api/v1/crm/tasks/{$taskId}/archive")->assertStatus(200);
    $this->assertSoftDeleted('tasks', ['id' => $taskId]);

    $auth()->deleteJson("/api/v1/crm/tasks/{$taskId}")->assertStatus(200);
    $this->assertDatabaseMissing('tasks', ['id' => $taskId]);
});

it('rejects an invalid task priority', function () {
    [$workspace, $user] = userWithRole('agent');
    grantCrmPermissions($user->roles->first(), ['tasks.create']);
    $token = loginAs($user, $workspace);

    $this->withHeader('Authorization', 'Bearer '.$token)
        ->postJson('/api/v1/crm/tasks', [
            'title' => 'Bad task',
            'priority' => 'extreme',
            'status' => 'open',
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors('priority');
});

// Calendar events

it('creates, updates, archives, and deletes a calendar event', function () {
    [$workspace, $user] = userWithRole('agent');
    grantCrmPermissions($user->roles->first(), ['tasks.view', 'tasks.create', 'tasks.assign', 'tasks.complete']);
    $token = loginAs($user, $workspace);
    $auth = fn () => $this->withHeader('Authorization', 'Bearer '.$token);

    $create = $auth()->postJson('/api/v1/crm/calendar', [
        'title' => 'Demo call',
        'starts_at' => now()->addDay()->toIso8601String(),
        'kind' => 'follow_up',
    ]);
    $create->assertStatus(201);
    $eventId = $create->json('data.id');

    $auth()->getJson('/api/v1/crm/calendar')
        ->assertStatus(200)
        ->assertJsonCount(1, 'data');

    $auth()->patchJson("/api/v1/crm/calendar/{$eventId}", ['location' => 'Zoom'])
        ->assertStatus(200)
        ->assertJsonPath('data.location', 'Zoom');

    $auth()->postJson("/api/v1/crm/calendar/{$eventId}/archive")->assertStatus(200);
    $this->assertSoftDeleted('calendar_events', ['id' => $eventId]);

    $auth()->deleteJson("/api/v1/crm/calendar/{$eventId}")->assertStatus(200);
    $this->assertDatabaseMissing('calendar_events', ['id' => $eventId]);
});

it('scopes calendar events to the requesting workspace', function () {
    [$workspaceA, $userA] = userWithRole('agent');
    grantCrmPermissions($userA->roles->first(), ['tasks.view']);
    [$workspaceB] = userWithRole('agent');

    CalendarEvent::create([
        'workspace_id' => $workspaceA->id,
        'title' => 'Mine',
        'starts_at' => now()->addDay(),
        'kind' => 'follow_up',
    ]);
    CalendarEvent::create([
        'workspace_id' => $workspaceB->id,
        'title' => 'Not mine',
        'starts_at' => now()->addDay(),
        'kind' => 'follow_up',
    ]);

    $token = loginAs($userA, $workspaceA);

    $response = $this->withHeader('Authorization', 'Bearer '.$token)->getJson('/api/v1/crm/calendar');

    $response->assertStatus(200)->assertJsonCount(1, 'data');
    expect($response->json('data.0.title'))->toBe('Mine');
});
