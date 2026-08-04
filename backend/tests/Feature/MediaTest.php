<?php

namespace Tests\Feature;

use App\Models\Conversation;
use App\Models\Workspace;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\CreatesWorkspaceUsers;
use Tests\TestCase;

/**
 * Phase 18 gap fill: MediaController had zero direct test coverage before this.
 * messages/message_media are gateway-owned tables (Message/MessageMedia are read-only
 * from the backend), so rows are inserted via DB facade, matching the pattern already
 * used in MessageUniqueConstraintTest.
 */
class MediaTest extends TestCase
{
    use RefreshDatabase, CreatesWorkspaceUsers;

    private function makeMessageWithMedia(int $workspaceId): array
    {
        $conversation = Conversation::factory()->create(['workspace_id' => $workspaceId]);

        $messageId = DB::table('messages')->insertGetId([
            'workspace_id' => $workspaceId,
            'conversation_id' => $conversation->id,
            'whatsapp_message_id' => 'WA_MEDIA_'.uniqid(),
            'direction' => 'inbound',
            'sender_type' => 'contact',
            'message_type' => 'image',
            'status' => 'delivered',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $mediaId = DB::table('message_media')->insertGetId([
            'message_id' => $messageId,
            'mime_type' => 'image/jpeg',
            'storage_path' => 'media/some-file.jpg',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return [$conversation, $messageId, $mediaId];
    }

    public function test_agent_with_conversations_view_can_get_a_signed_media_url(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        [$conversation, $messageId, $mediaId] = $this->makeMessageWithMedia($agent->workspace_id);

        Http::fake([
            '*/internal/whatsapp/media/*' => Http::response([
                'success' => true, 'message' => 'OK', 'data' => ['url' => 'https://signed.example/media/x'],
            ], 200),
        ]);

        $this->asUser($agent)
            ->getJson("/api/v1/conversations/{$conversation->id}/messages/{$messageId}/media/{$mediaId}/url")
            ->assertOk()
            ->assertJsonPath('data.url', 'https://signed.example/media/x');
    }

    public function test_media_not_belonging_to_the_message_returns_404(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        [$conversation, $messageId] = $this->makeMessageWithMedia($agent->workspace_id);
        [, $otherMessageId, $otherMediaId] = $this->makeMessageWithMedia($agent->workspace_id);

        $this->asUser($agent)
            ->getJson("/api/v1/conversations/{$conversation->id}/messages/{$messageId}/media/{$otherMediaId}/url")
            ->assertNotFound();
    }

    public function test_message_not_belonging_to_the_conversation_returns_404(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        [$conversation, $messageId, $mediaId] = $this->makeMessageWithMedia($agent->workspace_id);
        $otherConversation = Conversation::factory()->create(['workspace_id' => $agent->workspace_id]);

        $this->asUser($agent)
            ->getJson("/api/v1/conversations/{$otherConversation->id}/messages/{$messageId}/media/{$mediaId}/url")
            ->assertNotFound();
    }

    public function test_a_user_cannot_access_media_belonging_to_another_workspace(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $otherWorkspace = Workspace::factory()->create();
        [$conversation, $messageId, $mediaId] = $this->makeMessageWithMedia($otherWorkspace->id);

        $this->asUser($agent)
            ->getJson("/api/v1/conversations/{$conversation->id}/messages/{$messageId}/media/{$mediaId}/url")
            ->assertNotFound();
    }

    public function test_gateway_unreachable_returns_a_502_not_a_raw_500(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        [$conversation, $messageId, $mediaId] = $this->makeMessageWithMedia($agent->workspace_id);

        Http::fake([
            '*/internal/whatsapp/media/*' => Http::response(['success' => false, 'message' => 'down'], 500),
        ]);

        $this->asUser($agent)
            ->getJson("/api/v1/conversations/{$conversation->id}/messages/{$messageId}/media/{$mediaId}/url")
            ->assertStatus(502);
    }
}
