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

        $manual = Contact::factory()->create([
            'workspace_id' => $workspaceId,
            'full_name' => 'Mr Blvck',
            'phone_number' => '+94771234567',
            'email' => null,
            'source' => 'manual',
        ]);
        $auto = Contact::factory()->create([
            'workspace_id' => $workspaceId,
            'full_name' => 'MOHAMED BATH...',
            'phone_number' => '94771234567',
            'email' => 'bath@example.com',
            'source' => 'whatsapp',
        ]);

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

        Contact::factory()->create([
            'workspace_id' => $workspaceId,
            'full_name' => 'Mr Blvck',
            'phone_number' => '+94771234567',
            'source' => 'manual',
        ]);
        Contact::factory()->create([
            'workspace_id' => $workspaceId,
            'full_name' => 'MOHAMED BATH...',
            'phone_number' => '94771234567',
            'source' => 'whatsapp',
        ]);

        $response = $this->asUser($admin)->postJson('/api/v1/contacts/merge-duplicates', ['dry_run' => true])
            ->assertOk();

        $this->assertSame(1, $response->json('data.groups'));
        $this->assertSame(1, count($response->json('data.details.0.merged')));
        // Preview changes nothing.
        $this->assertSame(0, $response->json('data.merged'));
        $this->assertSame(0, $response->json('data.deleted'));
        $this->assertDatabaseCount('contacts', 2);
        $this->assertDatabaseHas('audit_logs', ['action' => 'contacts.merge_duplicates_preview']);
    }

    public function test_merge_duplicates_endpoint_merges_and_repoints_records(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');
        $this->actingAs($admin);
        $workspaceId = $admin->workspace_id;

        $manual = Contact::factory()->create([
            'workspace_id' => $workspaceId,
            'full_name' => 'Mr Blvck',
            'phone_number' => '+94771234567',
            'source' => 'manual',
        ]);
        $auto = Contact::factory()->create([
            'workspace_id' => $workspaceId,
            'full_name' => 'MOHAMED BATH...',
            'phone_number' => '94771234567',
            'source' => 'whatsapp',
        ]);

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
        $manual = Contact::factory()->create([
            'workspace_id' => $workspaceId,
            'full_name' => 'Mr Blvck',
            'phone_number' => '+94771234567',
            'source' => 'manual',
        ]);
        $auto = Contact::factory()->create([
            'workspace_id' => $workspaceId,
            'full_name' => 'MOHAMED BATH...',
            'phone_number' => '94771234567',
            'source' => 'whatsapp',
        ]);

        $report = (new ContactDeduplicator())->mergeDuplicates($workspaceId);

        // Only the agent's workspace pair was merged; the other workspace's
        // same-numbered contact is untouched and not counted in the group.
        $this->assertSame(1, $report['groups']);
        $this->assertSame(1, $report['deleted']);
        $this->assertDatabaseMissing('contacts', ['id' => $auto->id]);
        $this->assertDatabaseHas('contacts', ['id' => $manual->id]);
        $this->assertDatabaseHas('contacts', ['id' => $otherContact->id, 'full_name' => 'Other Workspace Contact']);
    }

    public function test_merge_duplicates_dry_run_changes_nothing(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $this->actingAs($agent);
        $workspaceId = $agent->workspace_id;

        $manual = Contact::factory()->create([
            'workspace_id' => $workspaceId,
            'full_name' => 'Mr Blvck',
            'phone_number' => '+94771234567',
            'source' => 'manual',
        ]);
        $auto = Contact::factory()->create([
            'workspace_id' => $workspaceId,
            'full_name' => 'MOHAMED BATH...',
            'phone_number' => '94771234567',
            'source' => 'whatsapp',
        ]);

        $report = (new ContactDeduplicator())->mergeDuplicates($workspaceId, true);

        $this->assertSame(1, $report['groups']);
        $this->assertSame(0, $report['merged']);
        $this->assertSame(0, $report['deleted']);
        $this->assertDatabaseHas('contacts', ['id' => $manual->id]);
        $this->assertDatabaseHas('contacts', ['id' => $auto->id]);
    }
}
