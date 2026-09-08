<?php

namespace Tests\Feature;

use App\Models\Conversation;
use App\Models\Notification;
use App\Models\NotificationPreference;
use App\Models\Workspace;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\CreatesWorkspaceUsers;
use Tests\TestCase;

class InternalMessageNotifyTest extends TestCase
{
    use CreatesWorkspaceUsers, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config()->set('services.internal.shared_secret', 'test-internal-secret');

        // NotificationService::notify() best-effort relays to the gateway; fake the
        // HTTP call so the test never depends on a real gateway process.
        Http::fake([
            '*/internal/whatsapp/events/emit' => Http::response(['success' => true, 'message' => 'OK', 'data' => null], 200),
        ]);
    }

    private function notifyEndpoint(): string
    {
        return '/api/internal/whatsapp/messages/notify-new';
    }

    private function validPayload(Conversation $conversation, int $messageId = 555): array
    {
        return [
            'workspaceId' => $conversation->workspace_id,
            'conversationId' => $conversation->id,
            'messageId' => $messageId,
            'messageType' => 'text',
            'preview' => 'hello there',
        ];
    }

    private function postNotified(array $payload): \Illuminate\Testing\TestResponse
    {
        return $this->withHeader('X-Internal-Shared-Secret', 'test-internal-secret')
            ->postJson($this->notifyEndpoint(), $payload);
    }

    public function test_requires_the_shared_secret_header(): void
    {
        $this->postJson($this->notifyEndpoint(), ['workspaceId' => 1])
            ->assertStatus(401);
    }

    public function test_rejects_a_wrong_shared_secret(): void
    {
        $this->withHeader('X-Internal-Shared-Secret', 'wrong')
            ->postJson($this->notifyEndpoint(), ['workspaceId' => 1])
            ->assertStatus(401);
    }

    public function test_notifies_the_assignee_of_a_live_inbound_message(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $conversation = Conversation::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'assigned_user_id' => $agent->id,
        ]);

        $this->postNotified($this->validPayload($conversation))->assertStatus(202);

        $this->assertDatabaseHas('notifications', [
            'workspace_id' => $agent->workspace_id,
            'user_id' => $agent->id,
            'type' => 'conversation.new_message',
        ]);

        $this->assertDatabaseHas('notifications', [
            'type' => 'conversation.new_message',
            'data' => json_encode([
                'conversation_id' => $conversation->id,
                'message_id' => 555,
                'message_type' => 'text',
                'preview' => 'hello there',
            ]),
        ]);

        Http::assertSent(fn ($request) => str_contains($request->url(), '/internal/whatsapp/events/emit')
            && $request['event'] === 'notification.created'
            && $request['userId'] === $agent->id);
    }

    public function test_does_not_notify_when_conversation_has_no_assignee(): void
    {
        $this->seedRbac();
        $workspace = Workspace::query()->firstOrFail();
        $unassigned = Conversation::factory()->create(['workspace_id' => $workspace->id]);

        $this->postNotified($this->validPayload($unassigned))->assertStatus(202);

        $this->assertDatabaseCount('notifications', 0);
    }

    public function test_idempotent_by_message_id(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $conversation = Conversation::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'assigned_user_id' => $agent->id,
        ]);

        $payload = $this->validPayload($conversation);
        $this->postNotified($payload)->assertStatus(202);
        $this->postNotified($payload)->assertStatus(202);

        $this->assertDatabaseCount('notifications', 1);
    }

    public function test_honors_the_users_in_app_preference(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        NotificationPreference::create([
            'user_id' => $agent->id,
            'notification_type' => 'conversation.new_message',
            'in_app_enabled' => false,
            'email_enabled' => false,
        ]);
        $conversation = Conversation::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'assigned_user_id' => $agent->id,
        ]);

        $this->postNotified($this->validPayload($conversation))->assertStatus(202);

        $this->assertDatabaseCount('notifications', 0);
    }

    public function test_validates_required_fields(): void
    {
        $this->postNotified(['workspaceId' => 1])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['conversationId', 'messageId', 'messageType']);
    }
}