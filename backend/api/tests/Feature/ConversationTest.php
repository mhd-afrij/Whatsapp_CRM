<?php

use App\Models\Conversation;
use App\Models\Message;
use App\Models\Permission;

it('lists conversations scoped to the requesting workspace', function () {
    [$workspaceA, $userA] = userWithRole('agent');
    $permission = Permission::firstOrCreate(['key' => 'conversations.view'], ['description' => 'View conversations']);
    $userA->roles()->first()->permissions()->syncWithoutDetaching([$permission->id]);

    Conversation::create(['workspace_id' => $workspaceA->id, 'contact_phone' => '15550001111']);

    [$workspaceB] = userWithRole('agent');
    Conversation::create(['workspace_id' => $workspaceB->id, 'contact_phone' => '15550002222']);

    $token = loginAs($userA, $workspaceA);

    $response = $this->withHeader('Authorization', 'Bearer '.$token)->getJson('/api/v1/conversations');

    $response->assertStatus(200);
    expect($response->json('data'))->toHaveCount(1);
    expect($response->json('data.0.contact_phone'))->toBe('15550001111');
});

it('forbids listing conversations without conversations.view', function () {
    [$workspace, $user] = userWithRole('agent');
    $token = loginAs($user, $workspace);

    $this->withHeader('Authorization', 'Bearer '.$token)
        ->getJson('/api/v1/conversations')
        ->assertStatus(403);
});

it('lists messages for a conversation and resets its unread count', function () {
    [$workspace, $user] = userWithRole('agent');
    $permission = Permission::firstOrCreate(['key' => 'conversations.view'], ['description' => 'View conversations']);
    $user->roles()->first()->permissions()->syncWithoutDetaching([$permission->id]);

    $conversation = Conversation::create([
        'workspace_id' => $workspace->id,
        'contact_phone' => '15550001111',
        'unread_count' => 3,
    ]);
    Message::create([
        'workspace_id' => $workspace->id,
        'conversation_id' => $conversation->id,
        'direction' => 'in',
        'body' => 'Hello there',
        'status' => 'delivered',
        'sent_at' => now(),
    ]);

    $token = loginAs($user, $workspace);

    $response = $this->withHeader('Authorization', 'Bearer '.$token)
        ->getJson("/api/v1/conversations/{$conversation->id}/messages");

    $response->assertStatus(200);
    expect($response->json('data'))->toHaveCount(1);
    expect($conversation->fresh()->unread_count)->toBe(0);
});

it('rejects internal webhook calls without the shared secret', function () {
    config(['services.whatsapp_sync.webhook_secret' => 'expected-secret']);

    $this->postJson('/api/v1/internal/whatsapp/session', ['session' => 'linked'])
        ->assertStatus(401);
});

it('persists an incoming message via the internal webhook and creates a conversation', function () {
    config(['services.whatsapp_sync.webhook_secret' => 'expected-secret']);
    config(['services.whatsapp_sync.default_workspace_slug' => 'webhook-test']);
    [$workspace] = userWithRole('agent');
    $workspace->forceFill(['slug' => 'webhook-test'])->save();

    $response = $this->withHeader('x-internal-secret', 'expected-secret')
        ->postJson('/api/v1/internal/whatsapp/messages', [
            'from' => '15550003333@s.whatsapp.net',
            'body' => 'Hi from WhatsApp',
            'timestamp' => now()->toIso8601String(),
        ]);

    $response->assertStatus(201);
    expect(Conversation::where('workspace_id', $workspace->id)->where('contact_phone', '15550003333')->exists())->toBeTrue();
});

it('assigns a conversation to a teammate', function () {
    [$workspace, $user] = userWithRole('agent');
    $permission = Permission::firstOrCreate(['key' => 'conversations.assign'], ['description' => 'Assign conversations']);
    $user->roles()->first()->permissions()->syncWithoutDetaching([$permission->id]);

    $conversation = Conversation::create(['workspace_id' => $workspace->id, 'contact_phone' => '15550001111']);

    $token = loginAs($user, $workspace);

    $response = $this->withHeader('Authorization', 'Bearer '.$token)
        ->patchJson("/api/v1/conversations/{$conversation->id}/assign", ['assignee_id' => $user->id]);

    $response->assertStatus(200);
    expect($conversation->fresh()->assignee_id)->toBe($user->id);
});

it('toggles a conversation between open and closed', function () {
    [$workspace, $user] = userWithRole('agent');
    $permission = Permission::firstOrCreate(['key' => 'conversations.close'], ['description' => 'Close conversations']);
    $user->roles()->first()->permissions()->syncWithoutDetaching([$permission->id]);

    $conversation = Conversation::create(['workspace_id' => $workspace->id, 'contact_phone' => '15550001111', 'status' => 'open']);

    $token = loginAs($user, $workspace);

    $this->withHeader('Authorization', 'Bearer '.$token)
        ->postJson("/api/v1/conversations/{$conversation->id}/close")
        ->assertStatus(200);
    expect($conversation->fresh()->status)->toBe('closed');

    $this->withHeader('Authorization', 'Bearer '.$token)
        ->postJson("/api/v1/conversations/{$conversation->id}/close")
        ->assertStatus(200);
    expect($conversation->fresh()->status)->toBe('open');
});

it('updates conversation tags', function () {
    [$workspace, $user] = userWithRole('agent');
    $permission = Permission::firstOrCreate(['key' => 'tags.manage'], ['description' => 'Manage tags']);
    $user->roles()->first()->permissions()->syncWithoutDetaching([$permission->id]);

    $conversation = Conversation::create(['workspace_id' => $workspace->id, 'contact_phone' => '15550001111']);

    $token = loginAs($user, $workspace);

    $response = $this->withHeader('Authorization', 'Bearer '.$token)
        ->patchJson("/api/v1/conversations/{$conversation->id}/tags", ['tags' => ['vip', 'billing']]);

    $response->assertStatus(200);
    expect($conversation->fresh()->tags)->toBe(['vip', 'billing']);
});

it('returns dashboard stats scoped to the requesting workspace', function () {
    [$workspace, $user] = userWithRole('agent');
    $permission = Permission::firstOrCreate(['key' => 'analytics.view'], ['description' => 'View dashboard and analytics']);
    $user->roles()->first()->permissions()->syncWithoutDetaching([$permission->id]);

    $open = Conversation::create(['workspace_id' => $workspace->id, 'contact_phone' => '15550001111', 'status' => 'open', 'unread_count' => 2]);
    Conversation::create(['workspace_id' => $workspace->id, 'contact_phone' => '15550002222', 'status' => 'closed']);
    Message::create([
        'workspace_id' => $workspace->id,
        'conversation_id' => $open->id,
        'direction' => 'in',
        'body' => 'Hi',
        'status' => 'delivered',
        'sent_at' => now(),
    ]);

    $token = loginAs($user, $workspace);

    $response = $this->withHeader('Authorization', 'Bearer '.$token)->getJson('/api/v1/dashboard/stats');

    $response->assertStatus(200);
    expect($response->json('data.total_conversations'))->toBe(2);
    expect($response->json('data.open_conversations'))->toBe(1);
    expect($response->json('data.unread_messages'))->toBe(2);
    expect($response->json('data.resolution_rate'))->toEqual(50.0);
    expect($response->json('data.conversations_overview'))->toHaveCount(7);
});
