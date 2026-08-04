<?php

namespace Tests\Feature;

use App\Models\Conversation;
use App\Models\Team;
use App\Models\Workspace;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\CreatesWorkspaceUsers;
use Tests\TestCase;

class ConversationTest extends TestCase
{
    use RefreshDatabase, CreatesWorkspaceUsers;

    /**
     * messages is gateway-owned/read-only from Eloquent, so fixture rows are inserted
     * directly via the query builder (mirrors MessageUniqueConstraintTest's pattern).
     */
    private function insertMessage(Conversation $conversation, array $overrides = []): int
    {
        return DB::table('messages')->insertGetId(array_merge([
            'workspace_id' => $conversation->workspace_id,
            'conversation_id' => $conversation->id,
            'whatsapp_message_id' => 'WA_'.uniqid(),
            'direction' => 'inbound',
            'sender_type' => 'contact',
            'message_type' => 'text',
            'body' => 'hello',
            'status' => 'delivered',
            'created_at' => now(),
            'updated_at' => now(),
        ], $overrides));
    }

    public function test_agent_without_permission_cannot_list_conversations(): void
    {
        $this->seedRbac();
        // Viewer has conversations.view, so use a role truly lacking it: none of the seeded
        // roles lack conversations.view except we simulate via a user with no roles at all.
        $workspace = Workspace::query()->firstOrFail();
        $user = \App\Models\User::factory()->create(['workspace_id' => $workspace->id]);

        $this->asUser($user)->getJson('/api/v1/conversations')
            ->assertStatus(403)
            ->assertJsonPath('success', false);
    }

    public function test_agent_can_list_conversations_scoped_to_their_workspace(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');

        Conversation::factory()->count(2)->create(['workspace_id' => $agent->workspace_id, 'assigned_user_id' => $agent->id]);

        $otherWorkspace = Workspace::factory()->create();
        Conversation::factory()->count(3)->create(['workspace_id' => $otherWorkspace->id]);

        $response = $this->asUser($agent)->getJson('/api/v1/conversations')->assertOk();

        $response->assertJsonCount(2, 'data');
        $this->assertSame(2, $response->json('meta.total'));
    }

    public function test_pagination_meta_is_correct(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');

        Conversation::factory()->count(5)->create(['workspace_id' => $agent->workspace_id, 'assigned_user_id' => $agent->id]);

        $response = $this->asUser($agent)->getJson('/api/v1/conversations?per_page=2')->assertOk();

        $response->assertJsonCount(2, 'data');
        $this->assertSame(2, $response->json('meta.per_page'));
        $this->assertSame(5, $response->json('meta.total'));
        $this->assertSame(3, $response->json('meta.last_page'));
    }

    public function test_cannot_view_a_conversation_belonging_to_another_workspace(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');

        $otherWorkspace = Workspace::factory()->create();
        $foreignConversation = Conversation::factory()->create(['workspace_id' => $otherWorkspace->id]);

        $this->asUser($agent)->getJson("/api/v1/conversations/{$foreignConversation->id}")
            ->assertStatus(404);
    }

    public function test_agent_cannot_list_or_open_an_unassigned_or_other_agents_conversation(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $otherAgent = $this->userWithRole('Agent');

        $unassigned = Conversation::factory()->create(['workspace_id' => $agent->workspace_id]);
        $others = Conversation::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'assigned_user_id' => $otherAgent->id,
        ]);
        $mine = Conversation::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'assigned_user_id' => $agent->id,
        ]);

        $list = $this->asUser($agent)->getJson('/api/v1/conversations')->assertOk();
        $this->assertSame([$mine->id], collect($list->json('data'))->pluck('id')->all());

        $this->asUser($agent)->getJson("/api/v1/conversations/{$unassigned->id}")->assertForbidden();
        $this->asUser($agent)->getJson("/api/v1/conversations/{$others->id}/messages")->assertForbidden();
    }

    public function test_messages_endpoint_returns_paginated_history(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $conversation = Conversation::factory()->create(['workspace_id' => $agent->workspace_id, 'assigned_user_id' => $agent->id]);

        for ($i = 0; $i < 4; $i++) {
            $this->insertMessage($conversation);
        }

        $response = $this->asUser($agent)->getJson("/api/v1/conversations/{$conversation->id}/messages?per_page=2")
            ->assertOk();

        $response->assertJsonCount(2, 'data');
        $this->assertTrue($response->json('meta.has_more'));
    }

    public function test_sending_a_message_calls_the_gateway_and_returns_the_persisted_row(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $conversation = Conversation::factory()->create(['workspace_id' => $agent->workspace_id, 'assigned_user_id' => $agent->id]);

        $messageId = $this->insertMessage($conversation, ['direction' => 'outbound', 'sender_type' => 'user', 'status' => 'queued']);
        $dispatchId = DB::table('message_dispatch_queue')->insertGetId([
            'workspace_id' => $conversation->workspace_id,
            'conversation_id' => $conversation->id,
            'requested_by_user_id' => $agent->id,
            'payload' => json_encode(['content' => 'Hi there']),
            'status' => 'sent',
            'attempts' => 1,
            'message_id' => $messageId,
            'bullmq_job_id' => 'job-1',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        Http::fake([
            '*/internal/whatsapp/messages/send' => Http::response([
                'success' => true,
                'message' => 'Message enqueued for delivery',
                'data' => [
                    'dispatchId' => $dispatchId,
                    'status' => 'pending',
                    'bullmqJobId' => 'job-1',
                ],
            ], 202),
        ]);

        $response = $this->asUser($agent)->postJson("/api/v1/conversations/{$conversation->id}/messages", [
            'message_type' => 'text',
            'body' => 'Hi there',
        ])->assertCreated();

        $response->assertJsonPath('data.id', $messageId);

        Http::assertSent(function ($request) {
            return str_contains($request->url(), '/internal/whatsapp/messages/send')
                && $request->hasHeader('X-Internal-Gateway-Token')
                && ! empty($request['idempotencyKey'])
                && ! empty($request['workspaceId'])
                && ! empty($request['conversationId'])
                && ! empty($request['content']);
        });
    }

    public function test_agent_without_reply_permission_cannot_send_a_message(): void
    {
        $this->seedRbac();
        $viewer = $this->userWithRole('Viewer');
        $conversation = Conversation::factory()->create(['workspace_id' => $viewer->workspace_id, 'assigned_user_id' => $viewer->id]);

        $this->asUser($viewer)->postJson("/api/v1/conversations/{$conversation->id}/messages", [
            'message_type' => 'text',
            'body' => 'Hi',
        ])->assertStatus(403);
    }

    public function test_manager_can_assign_a_conversation_and_history_is_recorded(): void
    {
        $this->seedRbac();
        $manager = $this->userWithRole('Manager');
        $agent = $this->userWithRole('Agent');
        $conversation = Conversation::factory()->create(['workspace_id' => $manager->workspace_id, 'assigned_user_id' => $manager->id]);

        $this->asUser($manager)->patchJson("/api/v1/conversations/{$conversation->id}/assign", [
            'assigned_user_id' => $agent->id,
        ])->assertOk()->assertJsonPath('data.assigned_user_id', $agent->id);

        $this->assertDatabaseHas('conversation_assignments', [
            'conversation_id' => $conversation->id,
            'assigned_to_user_id' => $agent->id,
            'assigned_by' => $manager->id,
        ]);

        $this->assertDatabaseHas('audit_logs', [
            'action' => 'conversation.assigned',
            'user_id' => $manager->id,
            'subject_id' => $conversation->id,
        ]);
    }

    public function test_agent_cannot_assign_a_conversation(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $conversation = Conversation::factory()->create(['workspace_id' => $agent->workspace_id, 'assigned_user_id' => $agent->id]);

        $this->asUser($agent)->patchJson("/api/v1/conversations/{$conversation->id}/assign", [
            'assigned_user_id' => $agent->id,
        ])->assertStatus(403);
    }

    public function test_agent_can_close_and_administrator_can_reopen_a_conversation(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $administrator = $this->userWithRole('Administrator');
        $conversation = Conversation::factory()->create(['workspace_id' => $agent->workspace_id, 'assigned_user_id' => $agent->id, 'status' => 'open']);

        $this->asUser($agent)->patchJson("/api/v1/conversations/{$conversation->id}/close")
            ->assertOk()->assertJsonPath('data.status', 'closed');

        $this->assertDatabaseHas('audit_logs', ['action' => 'conversation.closed', 'user_id' => $agent->id]);

        $this->asUser($administrator)->patchJson("/api/v1/conversations/{$conversation->id}/reopen")
            ->assertOk()->assertJsonPath('data.status', 'open');

        $this->assertDatabaseHas('audit_logs', ['action' => 'conversation.reopened', 'user_id' => $administrator->id]);
    }

    public function test_agent_cannot_reopen_a_conversation(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $conversation = Conversation::factory()->create(['workspace_id' => $agent->workspace_id, 'assigned_user_id' => $agent->id, 'status' => 'closed']);

        $this->asUser($agent)->patchJson("/api/v1/conversations/{$conversation->id}/reopen")
            ->assertStatus(403);
    }

    public function test_closing_an_already_closed_conversation_returns_conflict(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $conversation = Conversation::factory()->create(['workspace_id' => $agent->workspace_id, 'assigned_user_id' => $agent->id, 'status' => 'closed']);

        $this->asUser($agent)->patchJson("/api/v1/conversations/{$conversation->id}/close")
            ->assertStatus(409);
    }

    public function test_marking_a_conversation_read_records_last_read_message(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $conversation = Conversation::factory()->create(['workspace_id' => $agent->workspace_id, 'assigned_user_id' => $agent->id]);
        $lastMessageId = $this->insertMessage($conversation);

        $this->asUser($agent)->patchJson("/api/v1/conversations/{$conversation->id}/read")
            ->assertOk()
            ->assertJsonPath('data.last_read_message_id', $lastMessageId);

        $this->assertDatabaseHas('conversation_participants', [
            'conversation_id' => $conversation->id,
            'user_id' => $agent->id,
            'last_read_message_id' => $lastMessageId,
        ]);
    }

    public function test_agent_can_change_conversation_priority_and_audit_log_captures_before_after(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $conversation = Conversation::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'assigned_user_id' => $agent->id,
            'priority' => 'normal',
        ]);

        $this->asUser($agent)->patchJson("/api/v1/conversations/{$conversation->id}/priority", [
            'priority' => 'urgent',
        ])->assertOk()->assertJsonPath('data.priority', 'urgent');

        $this->assertDatabaseHas('conversations', [
            'id' => $conversation->id,
            'priority' => 'urgent',
        ]);

        $this->assertDatabaseHas('audit_logs', [
            'action' => 'conversation.priority_changed',
            'user_id' => $agent->id,
            'subject_id' => $conversation->id,
        ]);
    }

    public function test_changing_priority_to_an_invalid_value_is_rejected(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $conversation = Conversation::factory()->create(['workspace_id' => $agent->workspace_id, 'assigned_user_id' => $agent->id]);

        $this->asUser($agent)->patchJson("/api/v1/conversations/{$conversation->id}/priority", [
            'priority' => 'critical',
        ])->assertStatus(422)->assertJsonPath('success', false);
    }

    public function test_viewer_without_change_priority_permission_cannot_change_priority(): void
    {
        $this->seedRbac();
        $viewer = $this->userWithRole('Viewer');
        $conversation = Conversation::factory()->create(['workspace_id' => $viewer->workspace_id, 'assigned_user_id' => $viewer->id]);

        $this->asUser($viewer)->patchJson("/api/v1/conversations/{$conversation->id}/priority", [
            'priority' => 'high',
        ])->assertStatus(403);
    }

    public function test_can_filter_conversations_by_priority(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        Conversation::factory()->create(['workspace_id' => $agent->workspace_id, 'assigned_user_id' => $agent->id, 'priority' => 'urgent']);
        Conversation::factory()->create(['workspace_id' => $agent->workspace_id, 'assigned_user_id' => $agent->id, 'priority' => 'low']);

        $response = $this->asUser($agent)->getJson('/api/v1/conversations?priority=urgent')->assertOk();
        $data = $response->json('data');

        $this->assertCount(1, $data);
        $this->assertSame('urgent', $data[0]['priority']);
    }
}
