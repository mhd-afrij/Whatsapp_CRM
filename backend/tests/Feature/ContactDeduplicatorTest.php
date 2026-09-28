<?php

namespace Tests\Feature;

use App\Models\Contact;
use App\Models\Conversation;
use App\Models\Lead;
use App\Models\WhatsappContact;
use App\Services\ContactAutoLinker;
use App\Services\ContactDeduplicator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\CreatesWorkspaceUsers;
use Tests\TestCase;

class ContactDeduplicatorTest extends TestCase
{
    use CreatesWorkspaceUsers, RefreshDatabase;

    private function insertWhatsappContact(int $workspaceId, array $overrides = []): int
    {
        return DB::table('whatsapp_contacts')->insertGetId(array_merge([
            'workspace_id' => $workspaceId,
            'wa_jid' => '94771234567@s.whatsapp.net',
            'push_name' => 'MOHAMED BATH...',
            'phone_number' => '94771234567',
            'created_at' => now(),
            'updated_at' => now(),
        ], $overrides));
    }

    /**
     * Seeds a legacy duplicate pair (two *active* contacts sharing one number).
     * Pre-migration databases legitimately contained such pairs, so the dedup
     * feature must be able to see/predict them - but the current schema's
     * active_phone_key unique index forbids creating them. Recreate the legacy
     * state by suspending the index for the inserts; the calling test restores
     * it (via restoreActivePhoneIndex) once its merge has removed the pair.
     */
    private function createLegacyDuplicatePair(int $workspaceId, array $manualOverrides = [], array $autoOverrides = []): array
    {
        DB::statement('ALTER TABLE contacts DROP INDEX contacts_ws_active_phone_unique');
        $manual = Contact::factory()->create(array_merge([
            'workspace_id' => $workspaceId,
            'full_name' => 'Mr Blvck',
            'phone_number' => '+94771234567',
            'source' => 'manual',
        ], $manualOverrides));
        $auto = Contact::factory()->create(array_merge([
            'workspace_id' => $workspaceId,
            'full_name' => 'MOHAMED BATH...',
            'phone_number' => '94771234567',
            'source' => 'whatsapp',
        ], $autoOverrides));

        return [$manual, $auto];
    }

    private function restoreActivePhoneIndex(): void
    {
        DB::statement('ALTER TABLE contacts ADD UNIQUE `contacts_ws_active_phone_unique` (`workspace_id`, `active_phone_key`)');
    }

    protected function tearDown(): void
    {
        try {
            DB::statement('ALTER TABLE contacts ADD UNIQUE `contacts_ws_active_phone_unique` (`workspace_id`, `active_phone_key`)');
        } catch (\Illuminate\Database\QueryException) {
            // A legacy duplicate pair still exists (e.g. the dry-run test's
            // preview was the point) - the test body restored it where possible.
        }
        parent::tearDown();
    }

    public function test_auto_linker_links_a_reply_to_an_archived_contact_by_phone_instead_of_creating_a_duplicate(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $this->actingAs($agent);
        $workspaceId = $agent->workspace_id;

        // Manually saved contact, since archived.
        $contact = Contact::factory()->create([
            'workspace_id' => $workspaceId,
            'full_name' => 'Mr Blvck',
            'phone_number' => '+94771234567',
            'source' => 'manual',
        ]);
        $contact->delete();

        // The same number replies - an unlinked whatsapp_contact with the push name.
        $waId = $this->insertWhatsappContact($workspaceId);

        $linker = new ContactAutoLinker();
        $linker->ensureForWhatsappContact(WhatsappContact::find($waId));

        // Linked to the archived saved contact - no "MOHAMED BATH..." duplicate.
        $this->assertDatabaseHas('whatsapp_contacts', ['id' => $waId, 'contact_id' => $contact->id]);
        $this->assertDatabaseCount('contacts', 1);
    }

    public function test_auto_linker_matches_an_existing_contact_instead_of_creating_from_push_name(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $this->actingAs($agent);
        $workspaceId = $agent->workspace_id;

        $contact = Contact::factory()->create([
            'workspace_id' => $workspaceId,
            'full_name' => 'Mr Blvck',
            'phone_number' => '+94771234567',
            'source' => 'manual',
        ]);

        $waId = $this->insertWhatsappContact($workspaceId);

        (new ContactAutoLinker())->ensureForWhatsappContact(WhatsappContact::find($waId));

        $this->assertDatabaseHas('whatsapp_contacts', ['id' => $waId, 'contact_id' => $contact->id]);
        $this->assertDatabaseCount('contacts', 1);
        $this->assertDatabaseHas('contacts', ['id' => $contact->id, 'full_name' => 'Mr Blvck']);
    }

    public function test_merge_duplicates_keeps_the_manual_contact_and_repoints_everything(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $this->actingAs($agent);
        $workspaceId = $agent->workspace_id;

        [$manual, $auto] = $this->createLegacyDuplicatePair($workspaceId, ['email' => null], ['email' => 'bath@example.com']);

        // Records linked to the auto-created duplicate.
        $waId = $this->insertWhatsappContact($workspaceId, ['contact_id' => $auto->id]);
        $conversation = Conversation::factory()->create([
            'workspace_id' => $workspaceId,
            'contact_id' => $auto->id,
        ]);
        $lead = Lead::factory()->create([
            'workspace_id' => $workspaceId,
            'contact_id' => $auto->id,
        ]);

        $report = (new ContactDeduplicator())->mergeDuplicates($workspaceId);

        $this->assertSame(1, $report['merged']);
        $this->assertSame(1, $report['deleted']);

        $this->assertDatabaseMissing('contacts', ['id' => $auto->id]);
        $this->assertDatabaseHas('whatsapp_contacts', ['id' => $waId, 'contact_id' => $manual->id]);
        $this->assertDatabaseHas('conversations', ['id' => $conversation->id, 'contact_id' => $manual->id]);
        $this->assertDatabaseHas('leads', ['id' => $lead->id, 'contact_id' => $manual->id]);

        // Missing CRM fields on the survivor were enriched from the victim.
        $this->assertDatabaseHas('contacts', ['id' => $manual->id, 'email' => 'bath@example.com']);

        $this->restoreActivePhoneIndex();
    }

    public function test_merge_duplicates_endpoint_requires_contacts_delete_permission(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');

        $this->asUser($agent)->postJson('/api/v1/contacts/merge-duplicates', ['dry_run' => true])
            ->assertStatus(403)
            ->assertJsonPath('success', false);
    }

    public function test_merge_duplicates_endpoint_previews_with_dry_run(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');
        $this->actingAs($admin);
        $workspaceId = $admin->workspace_id;

        $this->createLegacyDuplicatePair($workspaceId);

        $response = $this->asUser($admin)->postJson('/api/v1/contacts/merge-duplicates', ['dry_run' => true])
            ->assertOk();

        $this->assertSame(1, $response->json('data.groups'));
        $this->assertSame(1, count($response->json('data.details.0.merged')));
        // Preview changes nothing.
        $this->assertSame(0, $response->json('data.merged'));
        $this->assertSame(0, $response->json('data.deleted'));
        $this->assertDatabaseCount('contacts', 2);
        $this->assertDatabaseHas('audit_logs', ['action' => 'contacts.merge_duplicates_preview']);

        // The preview left the legacy pair untouched - merge it now so the
        // schema's active_phone_key index can be restored for later tests.
        (new ContactDeduplicator())->mergeDuplicates($workspaceId);
        $this->restoreActivePhoneIndex();
    }

    public function test_merge_duplicates_endpoint_merges_and_repoints_records(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');
        $this->actingAs($admin);
        $workspaceId = $admin->workspace_id;

        [$manual, $auto] = $this->createLegacyDuplicatePair($workspaceId);

        $waId = $this->insertWhatsappContact($workspaceId, ['contact_id' => $auto->id]);
        $conversation = Conversation::factory()->create([
            'workspace_id' => $workspaceId,
            'contact_id' => $auto->id,
        ]);

        $response = $this->asUser($admin)->postJson('/api/v1/contacts/merge-duplicates')
            ->assertOk();

        $this->assertSame(1, $response->json('data.merged'));
        $this->assertSame(1, $response->json('data.deleted'));
        $this->assertDatabaseMissing('contacts', ['id' => $auto->id]);
        $this->assertDatabaseHas('whatsapp_contacts', ['id' => $waId, 'contact_id' => $manual->id]);
        $this->assertDatabaseHas('conversations', ['id' => $conversation->id, 'contact_id' => $manual->id]);
        $this->assertDatabaseHas('audit_logs', ['action' => 'contacts.merge_duplicates']);

        $this->restoreActivePhoneIndex();
    }

    public function test_merge_duplicates_never_crosses_workspace_boundaries(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $this->actingAs($agent);
        $workspaceId = $agent->workspace_id;

        // A second workspace with a contact on the SAME normalized number.
        $otherWorkspace = \App\Models\Workspace::factory()->create();
        $otherContact = Contact::factory()->create([
            'workspace_id' => $otherWorkspace->id,
            'full_name' => 'Other Workspace Contact',
            'phone_number' => '+94771234567',
            'source' => 'manual',
        ]);

        // Duplicate pair inside the agent's workspace only.
        [$manual, $auto] = $this->createLegacyDuplicatePair($workspaceId);

        $report = (new ContactDeduplicator())->mergeDuplicates($workspaceId);

        // Only the agent's workspace pair was merged; the other workspace's
        // same-numbered contact is untouched and not counted in the group.
        $this->assertSame(1, $report['groups']);
        $this->assertSame(1, $report['deleted']);
        $this->assertDatabaseMissing('contacts', ['id' => $auto->id]);
        $this->assertDatabaseHas('contacts', ['id' => $manual->id]);
        $this->assertDatabaseHas('contacts', ['id' => $otherContact->id, 'full_name' => 'Other Workspace Contact']);

        $this->restoreActivePhoneIndex();
    }

    public function test_merge_duplicates_dry_run_changes_nothing(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $this->actingAs($agent);
        $workspaceId = $agent->workspace_id;

        [$manual, $auto] = $this->createLegacyDuplicatePair($workspaceId);

        $report = (new ContactDeduplicator())->mergeDuplicates($workspaceId, true);

        $this->assertSame(1, $report['groups']);
        $this->assertSame(0, $report['merged']);
        $this->assertSame(0, $report['deleted']);
        $this->assertDatabaseHas('contacts', ['id' => $manual->id]);
        $this->assertDatabaseHas('contacts', ['id' => $auto->id]);

        // Merge for real so the index can come back for the tests that follow.
        (new ContactDeduplicator())->mergeDuplicates($workspaceId);
        $this->restoreActivePhoneIndex();
    }

    public function test_auto_linker_links_two_jids_of_one_number_to_a_single_contact(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $this->actingAs($agent);
        $workspaceId = $agent->workspace_id;

        // Pre-fix data: two whatsapp_contacts rows for ONE number, each carrying
        // a different push name - exactly the "Mohamed Suraimy" / "Suraimy"
        // duplicate pair. The linker must resolve them to one contact.
        $waPush = $this->insertWhatsappContact($workspaceId, [
            'wa_jid' => '94752112249@s.whatsapp.net',
            'phone_number' => '94752112249',
            'push_name' => 'Mohamed Suraimy',
        ]);
        $waSaved = $this->insertWhatsappContact($workspaceId, [
            'wa_jid' => '94752112249',
            'phone_number' => '94752112249',
            'push_name' => 'Suraimy',
        ]);

        $linker = new ContactAutoLinker();
        $linker->ensureForWhatsappContact(WhatsappContact::find($waPush));
        $linker->ensureForWhatsappContact(WhatsappContact::find($waSaved));

        $this->assertDatabaseCount('contacts', 1);
        $linkedTo = DB::table('whatsapp_contacts')->where('id', $waSaved)->value('contact_id');
        $this->assertNotNull($linkedTo);
        $this->assertDatabaseHas('whatsapp_contacts', ['id' => $waPush, 'contact_id' => $linkedTo]);
    }

    public function test_merge_contacts_merges_a_pair_that_phone_dedup_cannot_see(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $this->actingAs($agent);
        $workspaceId = $agent->workspace_id;

        // A LID-poisoned row created a fake 15-digit "phone" contact next to the
        // real one. mergeDuplicates() groups by normalized phone so it can never
        // pair these two - mergeContacts() by id can (the migration's heal step).
        $real = Contact::factory()->create([
            'workspace_id' => $workspaceId,
            'full_name' => 'Suraimy',
            'phone_number' => '+94752112249',
            'email' => null,
            'source' => 'manual',
        ]);
        $fake = Contact::factory()->create([
            'workspace_id' => $workspaceId,
            'full_name' => 'Mohamed Suraimy',
            'phone_number' => '176974261706752',
            'email' => 'suraimy@example.com',
            'source' => 'whatsapp',
        ]);

        $waId = $this->insertWhatsappContact($workspaceId, ['contact_id' => $fake->id]);
        $conversation = Conversation::factory()->create([
            'workspace_id' => $workspaceId,
            'contact_id' => $fake->id,
        ]);

        $this->assertTrue((new ContactDeduplicator())->mergeContacts($real->id, $fake->id));

        $this->assertDatabaseMissing('contacts', ['id' => $fake->id]);
        $this->assertDatabaseCount('contacts', 1);
        $this->assertDatabaseHas('whatsapp_contacts', ['id' => $waId, 'contact_id' => $real->id]);
        $this->assertDatabaseHas('conversations', ['id' => $conversation->id, 'contact_id' => $real->id]);
        $this->assertDatabaseHas('contacts', ['id' => $real->id, 'email' => 'suraimy@example.com']);
    }

    public function test_merge_duplicates_folds_both_threads_into_a_single_conversation(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $this->actingAs($agent);
        $workspaceId = $agent->workspace_id;

        [$manual, $auto] = $this->createLegacyDuplicatePair($workspaceId);

        // Each duplicate owns its own thread with its own message - the exact
        // "duplicate conversations under one phone number" state (spec §6).
        $convManual = Conversation::factory()->create([
            'workspace_id' => $workspaceId,
            'contact_id' => $manual->id,
            'status' => 'open',
            'unread_count' => 3,
            'last_message_at' => now()->subHour(),
        ]);
        $convAuto = Conversation::factory()->create([
            'workspace_id' => $workspaceId,
            'contact_id' => $auto->id,
            'status' => 'open',
            'unread_count' => 2,
            'last_message_at' => now(),
        ]);

        DB::table('messages')->insert([
            [
                'workspace_id' => $workspaceId,
                'conversation_id' => $convManual->id,
                'whatsapp_message_id' => 'msg-manual-thread',
                'direction' => 'inbound',
                'sender_type' => 'contact',
                'message_type' => 'text',
                'body' => 'manual thread message',
                'status' => 'sent',
                'sent_at' => now()->subMinutes(10),
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'workspace_id' => $workspaceId,
                'conversation_id' => $convAuto->id,
                'whatsapp_message_id' => 'msg-auto-thread',
                'direction' => 'inbound',
                'sender_type' => 'contact',
                'message_type' => 'text',
                'body' => 'auto thread message',
                'status' => 'sent',
                'sent_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);

        (new ContactDeduplicator())->mergeDuplicates($workspaceId);

        $this->assertDatabaseMissing('contacts', ['id' => $auto->id]);

        // One contact -> one conversation: the most recently active thread
        // survives; the other is folded into it together with its messages,
        // and the unread counters are summed onto the survivor.
        $this->assertDatabaseMissing('conversations', ['id' => $convManual->id]);
        $this->assertDatabaseHas('conversations', [
            'id' => $convAuto->id,
            'contact_id' => $manual->id,
            'unread_count' => 5,
        ]);
        $this->assertSame(
            ['manual thread message', 'auto thread message'],
            DB::table('messages')->where('conversation_id', $convAuto->id)->orderBy('sent_at')->pluck('body')->all(),
        );
        $this->assertSame(2, DB::table('messages')->where('workspace_id', $workspaceId)->count());

        $this->restoreActivePhoneIndex();
    }

    public function test_merge_contacts_rejects_a_pair_across_workspaces(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $this->actingAs($agent);
        $workspaceId = $agent->workspace_id;

        $own = Contact::factory()->create([
            'workspace_id' => $workspaceId,
            'phone_number' => '+94752112249',
            'source' => 'manual',
        ]);
        $otherWorkspace = \App\Models\Workspace::factory()->create();
        $other = Contact::factory()->create([
            'workspace_id' => $otherWorkspace->id,
            'phone_number' => '+94799999999',
            'source' => 'manual',
        ]);

        $this->assertFalse((new ContactDeduplicator())->mergeContacts($own->id, $other->id));
        $this->assertDatabaseHas('contacts', ['id' => $own->id]);
        $this->assertDatabaseHas('contacts', ['id' => $other->id]);
    }

    public function test_unique_backstop_rejects_a_second_active_contact_for_one_number(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $this->actingAs($agent);
        $workspaceId = $agent->workspace_id;

        Contact::factory()->create([
            'workspace_id' => $workspaceId,
            'full_name' => 'Suraimy',
            'phone_number' => '+94752112249',
            'source' => 'manual',
        ]);

        // The generated active_phone_key unique index must block a racing
        // AutoLinker insert before it ever re-query can rescue it.
        $this->expectException(\Illuminate\Database\QueryException::class);
        Contact::factory()->create([
            'workspace_id' => $workspaceId,
            'full_name' => 'Mohamed Suraimy',
            'phone_number' => '94752112249',
            'source' => 'whatsapp',
        ]);
    }
}
