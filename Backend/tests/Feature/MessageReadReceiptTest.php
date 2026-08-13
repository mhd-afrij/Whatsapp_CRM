<?php

namespace Tests\Feature;

use App\Models\Conversation;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\CreatesWorkspaceUsers;
use Tests\TestCase;

/**
 * The gateway's status pipeline stamps delivered_at/read_at on the messages
 * table (first receipt wins) and the backend must surface those timestamps to
 * the inbox so the tick tooltip can show "Delivered at 13:40" / "Read at 13:40".
 * messages is gateway-owned, so fixture rows are inserted via the query builder
 * (mirrors MessageUniqueConstraintTest's pattern).
 */
class MessageReadReceiptTest extends TestCase
{
    use CreatesWorkspaceUsers, RefreshDatabase;

    private function insertMessage(Conversation $conversation, array $overrides = []): int
    {
        return DB::table('messages')->insertGetId(array_merge([
            'workspace_id' => $conversation->workspace_id,
            'conversation_id' => $conversation->id,
            'whatsapp_message_id' => 'WA_'.uniqid(),
            'direction' => 'outbound',
            'sender_type' => 'user',
            'message_type' => 'text',
            'body' => 'hello',
            'status' => 'read',
            'created_at' => now(),
            'updated_at' => now(),
        ], $overrides));
    }

    public function test_messages_endpoint_serializes_delivered_and_read_timestamps(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $conversation = Conversation::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'assigned_user_id' => $agent->id,
        ]);

        $messageId = $this->insertMessage($conversation, [
            'delivered_at' => now()->subMinutes(5),
            'read_at' => now(),
        ]);

        $response = $this->asUser($agent)
            ->getJson("/api/v1/conversations/{$conversation->id}/messages")
            ->assertOk();

        $message = collect($response->json('data'))->firstWhere('id', $messageId);
        $this->assertNotNull($message, 'expected the fixture message in the response');

        $this->assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/', $message['delivered_at']);
        $this->assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/', $message['read_at']);
    }

    public function test_messages_endpoint_null_timestamps_for_a_sent_not_yet_read_message(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $conversation = Conversation::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'assigned_user_id' => $agent->id,
        ]);

        $messageId = $this->insertMessage($conversation, ['status' => 'sent', 'delivered_at' => null, 'read_at' => null]);

        $response = $this->asUser($agent)
            ->getJson("/api/v1/conversations/{$conversation->id}/messages")
            ->assertOk();

        $message = collect($response->json('data'))->firstWhere('id', $messageId);
        $this->assertNull($message['delivered_at']);
        $this->assertNull($message['read_at']);
    }
}
