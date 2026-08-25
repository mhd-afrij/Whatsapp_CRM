<?php

namespace Tests\Feature;

use App\Models\Contact;
use App\Models\Conversation;
use App\Models\InternalNote;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\CreatesWorkspaceUsers;
use Tests\TestCase;

class InternalNoteTest extends TestCase
{
    use CreatesWorkspaceUsers, RefreshDatabase;

    public function test_viewer_cannot_create_a_note(): void
    {
        $this->seedRbac();
        $viewer = $this->userWithRole('Viewer');
        $contact = Contact::factory()->create(['workspace_id' => $viewer->workspace_id]);

        $this->asUser($viewer)->postJson('/api/v1/notes', [
            'contact_id' => $contact->id,
            'body' => 'hello',
        ])->assertStatus(403);
    }

    public function test_agent_can_create_a_note_on_a_conversation(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $conversation = Conversation::factory()->create(['workspace_id' => $agent->workspace_id]);

        $response = $this->asUser($agent)->postJson('/api/v1/notes', [
            'conversation_id' => $conversation->id,
            'body' => 'Customer wants a discount',
        ])->assertStatus(201);

        $this->assertDatabaseHas('internal_notes', [
            'id' => $response->json('data.id'),
            'author_id' => $agent->id,
            'conversation_id' => $conversation->id,
        ]);
    }

    public function test_note_requires_a_link_to_conversation_contact_or_deal(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');

        $this->asUser($agent)->postJson('/api/v1/notes', ['body' => 'orphan note'])
            ->assertStatus(422);
    }

    public function test_mention_creates_note_mention_row_and_notification(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $mentioned = $this->userWithRole('Manager', ['name' => 'Bob', 'email' => 'bob@example.com']);
        $conversation = Conversation::factory()->create(['workspace_id' => $agent->workspace_id]);

        $response = $this->asUser($agent)->postJson('/api/v1/notes', [
            'conversation_id' => $conversation->id,
            'body' => 'ping @bob for review',
        ])->assertStatus(201);

        $noteId = $response->json('data.id');

        $this->assertDatabaseHas('note_mentions', [
            'internal_note_id' => $noteId,
            'mentioned_user_id' => $mentioned->id,
        ]);

        $this->assertDatabaseHas('notifications', [
            'user_id' => $mentioned->id,
            'type' => 'note.mention',
        ]);
    }

    public function test_author_can_update_and_delete_own_note(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $conversation = Conversation::factory()->create(['workspace_id' => $agent->workspace_id]);
        $note = InternalNote::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'conversation_id' => $conversation->id,
            'author_id' => $agent->id,
        ]);

        $this->asUser($agent)->patchJson("/api/v1/notes/{$note->id}", ['body' => 'updated'])->assertOk();
        $this->assertDatabaseHas('internal_notes', ['id' => $note->id, 'body' => 'updated']);

        $this->asUser($agent)->deleteJson("/api/v1/notes/{$note->id}")->assertOk();
        $this->assertDatabaseMissing('internal_notes', ['id' => $note->id]);
    }

    public function test_non_author_agent_cannot_update_or_delete_others_note(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $otherAgent = $this->userWithRole('Agent');
        $conversation = Conversation::factory()->create(['workspace_id' => $agent->workspace_id]);
        $note = InternalNote::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'conversation_id' => $conversation->id,
            'author_id' => $otherAgent->id,
        ]);

        $this->asUser($agent)->patchJson("/api/v1/notes/{$note->id}", ['body' => 'hacked'])
            ->assertStatus(403);
        $this->asUser($agent)->deleteJson("/api/v1/notes/{$note->id}")
            ->assertStatus(403);
    }

    public function test_admin_with_manage_any_can_delete_others_note(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');
        $agent = $this->userWithRole('Agent');
        $conversation = Conversation::factory()->create(['workspace_id' => $agent->workspace_id]);
        $note = InternalNote::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'conversation_id' => $conversation->id,
            'author_id' => $agent->id,
        ]);

        $this->asUser($admin)->deleteJson("/api/v1/notes/{$note->id}")->assertOk();
        $this->assertDatabaseMissing('internal_notes', ['id' => $note->id]);
    }

    public function test_non_private_note_visible_to_non_manager_agent_but_private_hidden(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $author = $this->userWithRole('Manager');
        $conversation = Conversation::factory()->create(['workspace_id' => $agent->workspace_id]);

        InternalNote::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'conversation_id' => $conversation->id,
            'author_id' => $author->id,
            'is_private' => false,
        ]);
        InternalNote::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'conversation_id' => $conversation->id,
            'author_id' => $author->id,
            'is_private' => true,
        ]);

        $response = $this->asUser($agent)->getJson("/api/v1/notes?conversation_id={$conversation->id}")->assertOk();
        $this->assertCount(1, $response->json('data'));
    }
}
