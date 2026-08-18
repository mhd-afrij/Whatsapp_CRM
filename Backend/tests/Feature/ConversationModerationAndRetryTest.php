<?php

namespace Tests\Feature;

use App\Models\Conversation;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\CreatesWorkspaceUsers;
use Tests\TestCase;

class ConversationModerationAndRetryTest extends TestCase
{
    use CreatesWorkspaceUsers, RefreshDatabase;

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

    public function test_agent_can_clear_conversation_messages_via_gateway(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $conversation = Conversation::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'assigned_user_id' => $agent->id,
        ]);

        Http::fake([
            '*/internal/whatsapp/conversations/*/messages' => Http::response([
                'success' => true,
                'message' => 'Conversation cleared',
                'data' => ['conversationId' => $conversation->id, 'messagesDeleted' => 4],
            ]),
        ]);

        $response = $this->asUser($agent)->deleteJson("/api/v1/conversations/{$conversation->id}/messages")
            ->assertOk();

        $response->assertJsonPath('data.messages_deleted', 4);

        Http::assertSent(function ($request) use ($conversation) {
            return $request->method() === 'DELETE'
                && str_contains($request->url(), "/internal/whatsapp/conversations/{$conversation->id}/messages")
                && $request['workspaceId'] == $conversation->workspace_id;
        });
    }

    public function test_agent_can_delete_conversation_via_gateway(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $conversation = Conversation::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'assigned_user_id' => $agent->id,
        ]);

        Http::fake([
            '*/internal/whatsapp/conversations/*' => Http::response([
                'success' => true,
                'message' => 'Conversation deleted',
                'data' => ['conversationId' => $conversation->id],
            ]),
        ]);

        $this->asUser($agent)->deleteJson("/api/v1/conversations/{$conversation->id}")
            ->assertOk()
            ->assertJsonPath('data.conversation_id', $conversation->id);

        Http::assertSent(function ($request) use ($conversation) {
            return $request->method() === 'DELETE'
                && str_contains($request->url(), "/internal/whatsapp/conversations/{$conversation->id}")
                && $request['workspaceId'] == $conversation->workspace_id;
        });
    }

    public function test_agent_can_block_and_unblock_a_conversation(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $conversation = Conversation::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'assigned_user_id' => $agent->id,
        ]);

        Http::fake(['*' => Http::response(['success' => true, 'message' => 'ok', 'data' => null])]);

        $this->asUser($agent)->patchJson("/api/v1/conversations/{$conversation->id}/block")
            ->assertOk()
            ->assertJsonPath('data.blocked_at', fn ($value) => $value !== null);

        $this->assertNotNull($conversation->fresh()->blocked_at);

        $this->asUser($agent)->patchJson("/api/v1/conversations/{$conversation->id}/unblock")
            ->assertOk()
            ->assertJsonPath('data.blocked_at', null);

        $this->assertNull($conversation->fresh()->blocked_at);
    }

    public function test_agent_can_report_a_conversation(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $conversation = Conversation::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'assigned_user_id' => $agent->id,
        ]);

        Http::fake(['*' => Http::response(['success' => true, 'message' => 'ok', 'data' => null])]);

        $this->asUser($agent)->patchJson("/api/v1/conversations/{$conversation->id}/report", [
            'reason' => 'Spam messages',
        ])->assertOk()->assertJsonPath('data.reported_at', fn ($value) => $value !== null);

        $fresh = $conversation->fresh();
        $this->assertNotNull($fresh->reported_at);
        $this->assertSame('Spam messages', $fresh->report_reason);
    }

    public function test_report_requires_a_reason(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $conversation = Conversation::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'assigned_user_id' => $agent->id,
        ]);

        $this->asUser($agent)->patchJson("/api/v1/conversations/{$conversation->id}/report", [])
            ->assertStatus(422);
    }

    public function test_viewer_cannot_clear_or_block_conversations(): void
    {
        $this->seedRbac();
        $viewer = $this->userWithRole('Viewer');
        $conversation = Conversation::factory()->create([
            'workspace_id' => $viewer->workspace_id,
            'assigned_user_id' => $viewer->id,
        ]);

        $this->asUser($viewer)->deleteJson("/api/v1/conversations/{$conversation->id}/messages")->assertForbidden();
        $this->asUser($viewer)->patchJson("/api/v1/conversations/{$conversation->id}/block")->assertForbidden();
        $this->asUser($viewer)->patchJson("/api/v1/conversations/{$conversation->id}/report", ['reason' => 'x'])->assertForbidden();
    }

    public function test_retrying_a_failed_outbound_message_redispatches_to_gateway(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $conversation = Conversation::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'assigned_user_id' => $agent->id,
        ]);

        $messageId = $this->insertMessage($conversation, [
            'direction' => 'outbound',
            'sender_type' => 'user',
            'sender_user_id' => $agent->id,
            'message_type' => 'text',
            'body' => 'Please reply',
            'status' => 'failed',
        ]);

        Http::fake([
            '*/internal/whatsapp/messages/send' => Http::response([
                'success' => true,
                'message' => 'Message enqueued for delivery',
                'data' => ['message' => ['id' => $messageId]],
            ], 202),
        ]);

        $this->asUser($agent)->postJson("/api/v1/conversations/{$conversation->id}/messages/{$messageId}/retry")
            ->assertCreated()
            ->assertJsonPath('data.id', $messageId);

        Http::assertSent(function ($request) {
            return str_contains($request->url(), '/internal/whatsapp/messages/send')
                && $request['content'] === 'Please reply'
                && $request['conversationId'] !== null
                && ! empty($request['idempotencyKey']);
        });
    }

    public function test_only_failed_outbound_messages_sent_by_the_user_can_be_retried(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $otherAgent = $this->userWithRole('Agent');
        $conversation = Conversation::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'assigned_user_id' => $agent->id,
        ]);

        $sentMessage = $this->insertMessage($conversation, [
            'direction' => 'outbound', 'sender_type' => 'user', 'sender_user_id' => $agent->id, 'status' => 'sent',
        ]);
        $othersMessage = $this->insertMessage($conversation, [
            'direction' => 'outbound', 'sender_type' => 'user', 'sender_user_id' => $otherAgent->id, 'status' => 'failed',
        ]);
        $inboundMessage = $this->insertMessage($conversation, [
            'direction' => 'inbound', 'sender_type' => 'contact', 'status' => 'delivered',
        ]);

        Http::fake();

        $this->asUser($agent)->postJson("/api/v1/conversations/{$conversation->id}/messages/{$sentMessage}/retry")
            ->assertStatus(422);
        $this->asUser($agent)->postJson("/api/v1/conversations/{$conversation->id}/messages/{$othersMessage}/retry")
            ->assertStatus(403);
        $this->asUser($agent)->postJson("/api/v1/conversations/{$conversation->id}/messages/{$inboundMessage}/retry")
            ->assertStatus(403);

        Http::assertNothingSent();
    }

    public function test_user_can_update_their_own_profile(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');

        $this->asUser($agent)->patchJson('/api/v1/auth/me', [
            'name' => 'New Name',
            'about' => 'Selling widgets since 2024',
        ])->assertOk()
            ->assertJsonPath('data.name', 'New Name')
            ->assertJsonPath('data.about', 'Selling widgets since 2024');

        $this->assertSame('New Name', $agent->fresh()->name);
        $this->assertSame('Selling widgets since 2024', $agent->fresh()->about);
    }

    public function test_auth_me_returns_the_about_field(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $agent->forceFill(['about' => 'Agent bio'])->save();

        $this->asUser($agent)->getJson('/api/v1/auth/me')
            ->assertOk()
            ->assertJsonPath('data.about', 'Agent bio');
    }
}
