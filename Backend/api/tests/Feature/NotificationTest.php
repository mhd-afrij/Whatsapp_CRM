<?php

use App\Models\Conversation;
use App\Models\Notification;

it('notifies a teammate when a conversation is assigned to them', function () {
    [$workspace, $agent] = userWithRole('agent');
    grantCrmPermissions($agent->roles->first(), ['conversations.view', 'conversations.assign']);

    [, $teammate] = userWithRole('agent');
    $teammate->update(['workspace_id' => $workspace->id]);

    $conversation = Conversation::create([
        'workspace_id' => $workspace->id,
        'contact_phone' => '+15550000000',
        'contact_name' => 'Jane Prospect',
        'status' => 'open',
    ]);

    $token = loginAs($agent, $workspace);

    $this->withHeader('Authorization', 'Bearer '.$token)
        ->patchJson("/api/v1/conversations/{$conversation->id}/assign", ['assignee_id' => $teammate->id])
        ->assertStatus(200);

    $this->assertDatabaseHas('notifications', [
        'workspace_id' => $workspace->id,
        'user_id' => $teammate->id,
        'type' => 'conversation.assigned',
    ]);
});

it('lists notifications for the current user and marks them read', function () {
    [$workspace, $user] = userWithRole('agent');

    $mine = Notification::create([
        'workspace_id' => $workspace->id,
        'user_id' => $user->id,
        'type' => 'task.assigned',
        'title' => 'Follow up with Acme',
    ]);

    [, $other] = userWithRole('agent');
    $other->update(['workspace_id' => $workspace->id]);
    Notification::create([
        'workspace_id' => $workspace->id,
        'user_id' => $other->id,
        'type' => 'task.assigned',
        'title' => 'Not for me',
    ]);

    $token = loginAs($user, $workspace);
    $auth = fn () => $this->withHeader('Authorization', 'Bearer '.$token);

    $auth()->getJson('/api/v1/notifications')
        ->assertStatus(200)
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.id', $mine->id);

    $auth()->patchJson("/api/v1/notifications/{$mine->id}/read")
        ->assertStatus(200)
        ->assertJsonPath('data.read_at', fn ($value) => $value !== null);
});

it('cannot mark another user\'s notification as read', function () {
    [$workspace, $user] = userWithRole('agent');
    [, $other] = userWithRole('agent');
    $other->update(['workspace_id' => $workspace->id]);

    $notification = Notification::create([
        'workspace_id' => $workspace->id,
        'user_id' => $other->id,
        'type' => 'task.assigned',
        'title' => 'Not for me',
    ]);

    $token = loginAs($user, $workspace);

    $this->withHeader('Authorization', 'Bearer '.$token)
        ->patchJson("/api/v1/notifications/{$notification->id}/read")
        ->assertStatus(404);
});

it('marks all notifications as read', function () {
    [$workspace, $user] = userWithRole('agent');

    Notification::create(['workspace_id' => $workspace->id, 'user_id' => $user->id, 'type' => 'task.assigned', 'title' => 'A']);
    Notification::create(['workspace_id' => $workspace->id, 'user_id' => $user->id, 'type' => 'task.assigned', 'title' => 'B']);

    $token = loginAs($user, $workspace);

    $this->withHeader('Authorization', 'Bearer '.$token)
        ->postJson('/api/v1/notifications/read-all')
        ->assertStatus(200);

    expect(Notification::where('user_id', $user->id)->whereNull('read_at')->count())->toBe(0);
});

it('notifies a teammate when a task is assigned to them', function () {
    [$workspace, $agent] = userWithRole('agent');
    grantCrmPermissions($agent->roles->first(), ['tasks.create']);

    [, $teammate] = userWithRole('agent');
    $teammate->update(['workspace_id' => $workspace->id]);

    $token = loginAs($agent, $workspace);

    $this->withHeader('Authorization', 'Bearer '.$token)->postJson('/api/v1/crm/tasks', [
        'title' => 'Call back',
        'priority' => 'normal',
        'status' => 'open',
        'assignee_id' => $teammate->id,
    ])->assertStatus(201);

    $this->assertDatabaseHas('notifications', [
        'workspace_id' => $workspace->id,
        'user_id' => $teammate->id,
        'type' => 'task.assigned',
    ]);
});
