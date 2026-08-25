<?php

namespace Tests\Feature;

use App\Models\Conversation;
use App\Models\Workspace;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
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
    use CreatesWorkspaceUsers, RefreshDatabase;

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

    /**
     * Outbound media (Phase 18 gap fill): POST /api/v1/conversations/{id}/media
     * validates an agent-attached file and proxies it to the gateway, which
     * stores it and returns a storage key the frontend echoes back as
     * `media.storage_path` when sending the message.
     */
    public function test_agent_with_conversations_reply_can_upload_media_and_get_a_storage_key(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $conversation = Conversation::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'assigned_user_id' => $agent->id,
        ]);

        Http::fake([
            '*/internal/whatsapp/media/upload' => Http::response([
                'success' => true,
                'message' => 'Media uploaded',
                'data' => [
                    'storagePath' => '1/outbound/abc-123.png',
                    'mimeType' => 'image/png',
                    'fileName' => 'photo.png',
                    'sizeBytes' => 1024,
                    'checksumSha256' => str_repeat('a', 64),
                ],
            ], 201),
        ]);

        $this->asUser($agent)
            ->post("/api/v1/conversations/{$conversation->id}/media", [
                'file' => UploadedFile::fake()->image('photo.png'),
            ])
            ->assertStatus(201)
            ->assertJsonPath('data.storagePath', '1/outbound/abc-123.png')
            ->assertJsonPath('data.mimeType', 'image/png');
    }

    public function test_upload_rejects_a_disallowed_file_type(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $conversation = Conversation::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'assigned_user_id' => $agent->id,
        ]);

        $this->asUser($agent)
            ->post("/api/v1/conversations/{$conversation->id}/media", [
                'file' => UploadedFile::fake()->create('payload.exe', 10, 'application/x-msdownload'),
            ])
            ->assertUnprocessable();
    }

    public function test_upload_requires_the_conversations_reply_permission(): void
    {
        $this->seedRbac();
        $viewer = $this->userWithRole('Viewer');
        $conversation = Conversation::factory()->create(['workspace_id' => $viewer->workspace_id]);

        $this->asUser($viewer)
            ->post("/api/v1/conversations/{$conversation->id}/media", [
                'file' => UploadedFile::fake()->image('photo.png'),
            ])
            ->assertForbidden();
    }

    public function test_upload_returns_502_when_the_gateway_is_unreachable(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $conversation = Conversation::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'assigned_user_id' => $agent->id,
        ]);

        Http::fake([
            '*/internal/whatsapp/media/upload' => Http::response(['success' => false, 'message' => 'down'], 500),
        ]);

        $this->asUser($agent)
            ->post("/api/v1/conversations/{$conversation->id}/media", [
                'file' => UploadedFile::fake()->image('photo.png'),
            ])
            ->assertStatus(502);
    }
}
