<?php

namespace Tests\Feature;

use App\Models\Workspace;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * messages is a gateway-owned table (see docs/DATA_OWNERSHIP.md) whose Eloquent
 * model is read-only from the backend, so these tests insert directly via the
 * DB facade to simulate the gateway's write path while still exercising the
 * real schema constraint.
 */
class MessageUniqueConstraintTest extends TestCase
{
    use RefreshDatabase;

    private function makeConversation(int $workspaceId): int
    {
        $waContactId = DB::table('whatsapp_contacts')->insertGetId([
            'workspace_id' => $workspaceId,
            'wa_jid' => '15550001111@s.whatsapp.net',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return DB::table('conversations')->insertGetId([
            'workspace_id' => $workspaceId,
            'whatsapp_contact_id' => $waContactId,
            'status' => 'open',
            'unread_count' => 0,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function test_duplicate_whatsapp_message_id_within_the_same_workspace_is_rejected(): void
    {
        $workspace = Workspace::factory()->create();
        $conversationId = $this->makeConversation($workspace->id);

        $base = [
            'workspace_id' => $workspace->id,
            'conversation_id' => $conversationId,
            'whatsapp_message_id' => 'WA_MSG_ABC123',
            'direction' => 'inbound',
            'sender_type' => 'contact',
            'message_type' => 'text',
            'body' => 'hello',
            'status' => 'delivered',
            'created_at' => now(),
            'updated_at' => now(),
        ];

        DB::table('messages')->insert($base);

        $this->expectException(QueryException::class);

        DB::table('messages')->insert($base);
    }

    public function test_the_same_whatsapp_message_id_is_allowed_across_different_workspaces(): void
    {
        $workspaceA = Workspace::factory()->create();
        $workspaceB = Workspace::factory()->create();

        $conversationA = $this->makeConversation($workspaceA->id);
        $conversationB = $this->makeConversation($workspaceB->id);

        DB::table('messages')->insert([
            'workspace_id' => $workspaceA->id,
            'conversation_id' => $conversationA,
            'whatsapp_message_id' => 'WA_MSG_SHARED',
            'direction' => 'inbound',
            'sender_type' => 'contact',
            'message_type' => 'text',
            'body' => 'hi from A',
            'status' => 'delivered',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('messages')->insert([
            'workspace_id' => $workspaceB->id,
            'conversation_id' => $conversationB,
            'whatsapp_message_id' => 'WA_MSG_SHARED',
            'direction' => 'inbound',
            'sender_type' => 'contact',
            'message_type' => 'text',
            'body' => 'hi from B',
            'status' => 'delivered',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->assertSame(2, DB::table('messages')->where('whatsapp_message_id', 'WA_MSG_SHARED')->count());
    }
}
