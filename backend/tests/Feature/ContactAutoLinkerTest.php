<?php

namespace Tests\Feature;

use App\Models\Contact;
use App\Models\Conversation;
use App\Models\WhatsappContact;
use App\Models\Workspace;
use App\Services\ContactAutoLinker;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\CreatesWorkspaceUsers;
use Tests\TestCase;

/**
 * Spec §8 acceptance tests for the duplicate-contact/conversation fix:
 * the WhatsApp phone number is the ONLY customer identity - one number means
 * one contact and one conversation, no matter how the pushName/profile name
 * changes between messages (or how many workspaces hold the same number).
 */
class ContactAutoLinkerTest extends TestCase
{
    use CreatesWorkspaceUsers, RefreshDatabase;

    /**
     * Seeds the gateway side of an inbound thread: an (unlinked)
     * whatsapp_contact plus its conversation - contact_id stays NULL because
     * CRM columns are backend-owned and provisioned lazily by the linker.
     *
     * @return array{0: int, 1: int} [whatsapp_contact_id, conversation_id]
     */
    private function seedInboundThread(int $workspaceId, array $overrides = []): array
    {
        $waId = DB::table('whatsapp_contacts')->insertGetId(array_merge([
            'workspace_id' => $workspaceId,
            'wa_jid' => '94765655026@s.whatsapp.net',
            'push_name' => 'MOHAMED BATHURUDEEN',
            'phone_number' => '94765655026',
            'created_at' => now(),
            'updated_at' => now(),
        ], $overrides));

        $conversationId = DB::table('conversations')->insertGetId([
            'workspace_id' => $workspaceId,
            'whatsapp_contact_id' => $waId,
            'status' => 'open',
            'unread_count' => 0,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return [$waId, $conversationId];
    }

    private function runAutoLinker(int $conversationId): void
    {
        (new ContactAutoLinker())->ensureForConversations(new Collection([
            Conversation::query()->findOrFail($conversationId),
        ]));
    }

    public function test_incoming_reply_with_a_different_push_name_reuses_saved_contact_and_conversation(): void
    {
        // Spec §8, test case 1: contact saved as "+94765655026" / MOHAMED
        // BATHURUDEEN; the reply arrives under a different WhatsApp profile
        // name - same contact, same conversation, message attaches to both.
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $this->actingAs($agent);
        $workspaceId = $agent->workspace_id;

        $saved = Contact::factory()->create([
            'workspace_id' => $workspaceId,
            'full_name' => 'MOHAMED BATHURUDEEN',
            'phone_number' => '+94765655026',
            'source' => 'manual',
        ]);

        [$waId, $conversationId] = $this->seedInboundThread($workspaceId, [
            'push_name' => 'MOHAMED BATHURUDEEN MOHAMED AFRI',
        ]);

        $this->runAutoLinker($conversationId);

        $this->assertDatabaseCount('contacts', 1);
        $this->assertDatabaseHas('whatsapp_contacts', ['id' => $waId, 'contact_id' => $saved->id]);
        $this->assertDatabaseHas('conversations', ['id' => $conversationId, 'contact_id' => $saved->id]);
        // pushName is display-only - it never overwrites the saved name.
        $this->assertDatabaseHas('contacts', ['id' => $saved->id, 'full_name' => 'MOHAMED BATHURUDEEN']);
    }

    public function test_unknown_phone_number_creates_one_contact_and_links_its_conversation(): void
    {
        // Spec §8, test case 2: a brand-new number creates exactly one contact
        // and one conversation, linked together.
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $this->actingAs($agent);
        $workspaceId = $agent->workspace_id;

        [$waId, $conversationId] = $this->seedInboundThread($workspaceId);

        $this->runAutoLinker($conversationId);

        $this->assertDatabaseCount('contacts', 1);
        $contact = Contact::query()->firstOrFail();
        $this->assertSame($workspaceId, $contact->workspace_id);
        $this->assertSame('94765655026', $contact->normalized_phone_number);
        $this->assertSame(Contact::SOURCE_WHATSAPP, $contact->source);
        $this->assertDatabaseHas('whatsapp_contacts', ['id' => $waId, 'contact_id' => $contact->id]);
        $this->assertDatabaseHas('conversations', ['id' => $conversationId, 'contact_id' => $contact->id]);
    }

    public function test_ten_push_name_changes_yield_exactly_one_contact_and_one_conversation(): void
    {
        // Spec §8, test case 3: same number changes its WhatsApp name 10
        // times - still one contact, one conversation, one link.
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $this->actingAs($agent);
        $workspaceId = $agent->workspace_id;

        [$waId, $conversationId] = $this->seedInboundThread($workspaceId);

        for ($i = 1; $i <= 10; $i++) {
            DB::table('whatsapp_contacts')
                ->where('id', $waId)
                ->update(['push_name' => "MOHAMED BATHURUDEEN MOHAMED AFRI v{$i}", 'updated_at' => now()]);

            $this->runAutoLinker($conversationId);
        }

        $this->assertDatabaseCount('contacts', 1);
        $contactId = Contact::query()->firstOrFail()->id;
        $this->assertSame($conversationId, (int) DB::table('conversations')
            ->where('workspace_id', $workspaceId)
            ->where('whatsapp_contact_id', $waId)
            ->value('id'));
        $this->assertSame(1, Conversation::query()->where('contact_id', $contactId)->count());
        $this->assertDatabaseHas('whatsapp_contacts', ['id' => $waId, 'contact_id' => $contactId]);
    }

    public function test_notify_path_without_a_user_links_within_the_conversation_workspace_only(): void
    {
        // Regression guard (spec §5/§7): the gateway notify hook runs with NO
        // authenticated user, where WorkspaceScope resolves no workspace and
        // leaves queries floating. A same-numbered contact in ANOTHER workspace
        // (created first, so an unscoped lookup would prefer its lower id) must
        // never be matched - identity is (workspace, normalized phone).
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $workspaceId = $agent->workspace_id;

        $otherWorkspace = Workspace::factory()->create();
        $foreign = Contact::factory()->create([
            'workspace_id' => $otherWorkspace->id,
            'full_name' => 'Foreign Tenant Contact',
            'phone_number' => '+94765655026',
            'source' => 'manual',
        ]);

        [$waId, $conversationId] = $this->seedInboundThread($workspaceId);

        // Deliberately NOT actingAs(): mirrors the internal notify endpoint.
        $this->runAutoLinker($conversationId);

        $local = Contact::withoutGlobalScopes()
            ->where('workspace_id', $workspaceId)
            ->where('normalized_phone_number', '94765655026')
            ->firstOrFail();

        $this->assertNotSame($foreign->id, $local->id);
        $this->assertDatabaseHas('whatsapp_contacts', ['id' => $waId, 'contact_id' => $local->id]);
        $this->assertDatabaseHas('conversations', ['id' => $conversationId, 'contact_id' => $local->id]);
        $this->assertDatabaseHas('contacts', ['id' => $foreign->id, 'full_name' => 'Foreign Tenant Contact']);
    }

    public function test_empty_contact_name_is_filled_from_whatsapp_name_when_linking(): void
    {
        // Spec §2: when the existing contact's name is empty it may be filled
        // from the WhatsApp name - but an existing name is never replaced.
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $this->actingAs($agent);
        $workspaceId = $agent->workspace_id;

        $existing = Contact::factory()->create([
            'workspace_id' => $workspaceId,
            'full_name' => null,
            'phone_number' => '+94765655026',
            'source' => Contact::SOURCE_IMPORT,
        ]);

        [$waId, $conversationId] = $this->seedInboundThread($workspaceId, [
            'push_name' => 'MOHAMED BATHURUDEEN MOHAMED AFRI',
        ]);

        $this->runAutoLinker($conversationId);

        $this->assertDatabaseCount('contacts', 1);
        $this->assertDatabaseHas('contacts', ['id' => $existing->id, 'full_name' => 'MOHAMED BATHURUDEEN MOHAMED AFRI']);
        $this->assertDatabaseHas('whatsapp_contacts', ['id' => $waId, 'contact_id' => $existing->id]);
    }

    public function test_resolution_logs_expose_the_phone_identity_fields(): void
    {
        // Spec §7: every resolution emits the documented structured payload so
        // duplicate reports can be diagnosed from the logs alone.
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $this->actingAs($agent);
        $workspaceId = $agent->workspace_id;

        [$waId, $conversationId] = $this->seedInboundThread($workspaceId);

        \Illuminate\Support\Facades\Log::shouldReceive('info')
            ->once()
            ->withArgs(function (string $message, array $context) use ($conversationId) {
                return $message === 'WhatsApp contact/conversation identity resolution'
                    && $context['phone_received'] === '94765655026'
                    && $context['normalized_phone'] === '94765655026'
                    && $context['contact_found'] === true
                    && $context['contact_id'] !== null
                    && $context['conversation_found'] === true
                    && $context['conversation_id'] === $conversationId
                    && $context['action'] === 'create_new_contact';
            });

        $this->runAutoLinker($conversationId);

        // The persisted outcome the log describes: one contact, fully linked.
        $this->assertDatabaseCount('contacts', 1);
        $this->assertDatabaseHas('whatsapp_contacts', ['id' => $waId, 'contact_id' => Contact::query()->firstOrFail()->id]);
        $this->assertDatabaseHas('conversations', ['id' => $conversationId, 'contact_id' => Contact::query()->firstOrFail()->id]);
    }
}
