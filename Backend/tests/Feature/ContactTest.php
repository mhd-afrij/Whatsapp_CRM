<?php

namespace Tests\Feature;

use App\Models\Contact;
use App\Models\Conversation;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Tests\CreatesWorkspaceUsers;
use Tests\TestCase;

class ContactTest extends TestCase
{
    use CreatesWorkspaceUsers, RefreshDatabase;

    public function test_user_without_permission_cannot_list_contacts(): void
    {
        $this->seedRbac();
        $workspace = Workspace::query()->firstOrFail();
        $user = User::factory()->create(['workspace_id' => $workspace->id]);

        $this->asUser($user)->getJson('/api/v1/contacts')
            ->assertStatus(403)
            ->assertJsonPath('success', false);
    }

    public function test_agent_can_list_contacts_scoped_to_their_workspace(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');

        Contact::factory()->count(2)->create(['workspace_id' => $agent->workspace_id]);

        $otherWorkspace = Workspace::factory()->create();
        Contact::factory()->count(3)->create(['workspace_id' => $otherWorkspace->id]);

        $response = $this->asUser($agent)->getJson('/api/v1/contacts')->assertOk();

        $response->assertJsonCount(2, 'data');
        $this->assertSame(2, $response->json('meta.total'));
    }

    public function test_search_filters_by_name_email_or_phone(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');

        Contact::factory()->create(['workspace_id' => $agent->workspace_id, 'full_name' => 'Jane Doe', 'phone_number' => '+254700000001']);
        Contact::factory()->create(['workspace_id' => $agent->workspace_id, 'full_name' => 'John Smith', 'phone_number' => '+254700000002']);

        $response = $this->asUser($agent)->getJson('/api/v1/contacts?search=Jane')->assertOk();
        $response->assertJsonCount(1, 'data');
        $this->assertSame('Jane Doe', $response->json('data.0.full_name'));
    }

    public function test_sort_and_pagination_work(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');

        Contact::factory()->create(['workspace_id' => $agent->workspace_id, 'full_name' => 'Alice']);
        Contact::factory()->create(['workspace_id' => $agent->workspace_id, 'full_name' => 'Bob']);
        Contact::factory()->create(['workspace_id' => $agent->workspace_id, 'full_name' => 'Carol']);

        $response = $this->asUser($agent)
            ->getJson('/api/v1/contacts?sort=full_name&direction=asc&per_page=2')
            ->assertOk();

        $response->assertJsonCount(2, 'data');
        $this->assertSame('Alice', $response->json('data.0.full_name'));
        $this->assertSame(3, $response->json('meta.total'));
        $this->assertSame(2, $response->json('meta.last_page'));
    }

    public function test_cannot_view_a_contact_belonging_to_another_workspace(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');

        $otherWorkspace = Workspace::factory()->create();
        $foreign = Contact::factory()->create(['workspace_id' => $otherWorkspace->id]);

        $this->asUser($agent)->getJson("/api/v1/contacts/{$foreign->id}")->assertStatus(404);
    }

    public function test_agent_can_create_a_contact(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');

        $response = $this->asUser($agent)->postJson('/api/v1/contacts', [
            'full_name' => 'New Contact',
            'phone_number' => '+254700000099',
            'email' => 'new@example.com',
        ])->assertCreated();

        $this->assertDatabaseHas('contacts', ['full_name' => 'New Contact', 'workspace_id' => $agent->workspace_id]);
        $this->assertDatabaseHas('contact_activities', ['description' => 'Contact created']);
        $this->assertDatabaseHas('audit_logs', ['action' => 'contact.created', 'user_id' => $agent->id]);
        $this->assertNull($response->json('data.duplicate_of'));
    }

    public function test_viewer_cannot_create_a_contact(): void
    {
        $this->seedRbac();
        $viewer = $this->userWithRole('Viewer');

        $this->asUser($viewer)->postJson('/api/v1/contacts', [
            'full_name' => 'Nope',
        ])->assertStatus(403);
    }

    public function test_creating_a_contact_with_a_duplicate_phone_number_is_flagged_not_blocked(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');

        $existing = Contact::factory()->create(['workspace_id' => $agent->workspace_id, 'phone_number' => '+254711111111']);

        $response = $this->asUser($agent)->postJson('/api/v1/contacts', [
            'full_name' => 'Duplicate Guy',
            'phone_number' => '+254711111111',
        ])->assertCreated();

        $this->assertSame($existing->id, $response->json('data.duplicate_of.id'));
        // The new contact was still created, not silently rejected.
        $this->assertSame(2, Contact::query()->where('phone_number', '+254711111111')->count());
    }

    public function test_owner_can_update_their_own_contact_without_blanket_edit_permission(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $contact = Contact::factory()->create(['workspace_id' => $agent->workspace_id, 'owner_user_id' => $agent->id]);

        $this->asUser($agent)->patchJson("/api/v1/contacts/{$contact->id}", [
            'full_name' => 'Updated Name',
        ])->assertOk()->assertJsonPath('data.full_name', 'Updated Name');

        $this->assertDatabaseHas('audit_logs', ['action' => 'contact.updated', 'user_id' => $agent->id]);
    }

    public function test_manager_can_update_a_contact_via_blanket_permission(): void
    {
        $this->seedRbac();
        $manager = $this->userWithRole('Manager');
        $contact = Contact::factory()->create(['workspace_id' => $manager->workspace_id]);

        $this->asUser($manager)->patchJson("/api/v1/contacts/{$contact->id}", [
            'company' => 'Acme',
        ])->assertOk()->assertJsonPath('data.company', 'Acme');
    }

    public function test_viewer_cannot_update_a_contact_they_do_not_own(): void
    {
        $this->seedRbac();
        $viewer = $this->userWithRole('Viewer');
        $contact = Contact::factory()->create(['workspace_id' => $viewer->workspace_id]);

        $this->asUser($viewer)->patchJson("/api/v1/contacts/{$contact->id}", [
            'full_name' => 'Nope',
        ])->assertStatus(403);
    }

    public function test_admin_can_archive_and_restore_a_contact(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');
        $contact = Contact::factory()->create(['workspace_id' => $admin->workspace_id]);

        $this->asUser($admin)->deleteJson("/api/v1/contacts/{$contact->id}")->assertOk();
        $this->assertSoftDeleted('contacts', ['id' => $contact->id]);

        // The archived (soft-deleted) contact must still be viewable so the
        // recreate/restore flow can open it before restoring (spec §20).
        $this->asUser($admin)
            ->getJson("/api/v1/contacts/{$contact->id}")
            ->assertOk()
            ->assertJsonPath('data.deleted_at', fn ($v) => $v !== null);

        // Archived contacts appear in the archived list view, not the active list.
        $this->asUser($admin)->getJson('/api/v1/contacts')->assertJsonCount(0, 'data');
        $this->asUser($admin)
            ->getJson('/api/v1/contacts?archived=true')
            ->assertOk()
            ->assertJsonPath('data.0.id', $contact->id);

        $this->asUser($admin)->postJson("/api/v1/contacts/{$contact->id}/restore")->assertOk();
        $this->assertDatabaseHas('contacts', ['id' => $contact->id, 'deleted_at' => null]);
    }

    public function test_agent_cannot_archive_a_contact(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $contact = Contact::factory()->create(['workspace_id' => $agent->workspace_id]);

        $this->asUser($agent)->deleteJson("/api/v1/contacts/{$contact->id}")->assertStatus(403);
    }

    public function test_csv_import_reports_valid_invalid_and_duplicate_rows(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $existing = Contact::factory()->create(['workspace_id' => $agent->workspace_id, 'phone_number' => '+254722222222']);

        $csv = "full_name,email,company,job_title,phone_number\n"
            ."Valid Person,valid@example.com,Acme,Manager,+254733333333\n"
            ."Bad Email,not-an-email,Acme,Manager,+254744444444\n"
            .",,,,\n"
            ."Dup Person,dup@example.com,Acme,Manager,+254722222222\n";

        $file = UploadedFile::fake()->createWithContent('contacts.csv', $csv);

        $response = $this->asUser($agent)
            ->postJson('/api/v1/contacts/import', ['file' => $file])
            ->assertOk();

        $data = $response->json('data');
        $this->assertCount(2, $data['created']); // Valid Person + Dup Person
        $this->assertCount(2, $data['failed']); // Bad Email + empty row
        $this->assertCount(1, $data['duplicates']);
        $this->assertSame($existing->id, $data['duplicates'][0]['duplicate_of_contact_id']);
    }

    public function test_viewer_cannot_import_contacts(): void
    {
        $this->seedRbac();
        $viewer = $this->userWithRole('Viewer');

        $file = UploadedFile::fake()->createWithContent('contacts.csv', "full_name\nX\n");

        $this->asUser($viewer)->postJson('/api/v1/contacts/import', ['file' => $file])->assertStatus(403);
    }

    public function test_csv_export_returns_workspace_contacts_only(): void
    {
        $this->seedRbac();
        $manager = $this->userWithRole('Manager');
        Contact::factory()->create(['workspace_id' => $manager->workspace_id, 'full_name' => 'Exported One']);

        $otherWorkspace = Workspace::factory()->create();
        Contact::factory()->create(['workspace_id' => $otherWorkspace->id, 'full_name' => 'Not Exported']);

        $response = $this->asUser($manager)->get('/api/v1/contacts/export')->assertOk();

        $content = $response->streamedContent();
        $this->assertStringContainsString('Exported One', $content);
        $this->assertStringNotContainsString('Not Exported', $content);
    }

    public function test_agent_cannot_export_contacts(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');

        $this->asUser($agent)->get('/api/v1/contacts/export')->assertStatus(403);
    }

    public function test_phone_numbers_are_normalized_and_deduplicated_across_formats(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');

        $first = Contact::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'phone_number' => '+94771234567',
        ]);

        $this->assertSame('94771234567', $first->normalized_phone_number);

        // "0771234567" (national format) and "+94771234567" (E.164) both
        // normalize to the same key, so the second create must be flagged as
        // a duplicate of the first even though the raw strings differ (spec §4).
        $response = $this->asUser($agent)->postJson('/api/v1/contacts', [
            'full_name' => 'Local Format',
            'phone_number' => '0771234567',
        ])->assertCreated();

        $this->assertSame($first->id, $response->json('data.duplicate_of.id'));
    }

    public function test_search_matches_normalized_phone_numbers(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');

        Contact::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'full_name' => 'Normalized Searcher',
            'phone_number' => '+94771234567',
        ]);

        // Searching the local format finds the E.164-stored contact (spec §14).
        $response = $this->asUser($agent)->getJson('/api/v1/contacts?search=0771234567')->assertOk();
        $response->assertJsonCount(1, 'data');
        $this->assertSame('Normalized Searcher', $response->json('data.0.full_name'));
    }

    public function test_crm_enrichment_fields_are_created_and_updated(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');

        $response = $this->asUser($agent)->postJson('/api/v1/contacts', [
            'full_name' => 'Rich Contact',
            'phone_number' => '+94770000001',
            'address' => '1 Main Street',
            'city' => 'Colombo',
            'country' => 'LK',
            'timezone' => 'Asia/Colombo',
            'status' => 'active',
            'source' => 'import',
        ])->assertCreated();

        $contactId = $response->json('data.contact.id');
        $this->assertDatabaseHas('contacts', [
            'id' => $contactId,
            'address' => '1 Main Street',
            'city' => 'Colombo',
            'country' => 'LK',
            'timezone' => 'Asia/Colombo',
            'status' => 'active',
            'source' => 'import',
        ]);

        $this->asUser($agent)->patchJson("/api/v1/contacts/{$contactId}", [
            'status' => 'inactive',
            'city' => 'Kandy',
        ])->assertOk()
            ->assertJsonPath('data.city', 'Kandy')
            ->assertJsonPath('data.status', 'inactive');
    }

    public function test_index_filters_by_status_source_whatsapp_and_recently_contacted(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');

        // Only $recent has any contact activity (stored last_contacted_at); the
        // other two have none, so recently_contacted=1 must return just it.
        $active = Contact::factory()->create(['workspace_id' => $agent->workspace_id, 'status' => 'active', 'source' => 'manual']);
        $inactive = Contact::factory()->create(['workspace_id' => $agent->workspace_id, 'status' => 'inactive', 'source' => 'import']);
        $inactive->update(['last_contacted_at' => now()->subDays(30)]);

        $whatsappId = DB::table('whatsapp_contacts')->insertGetId([
            'workspace_id' => $agent->workspace_id,
            'wa_jid' => '94770000002@s.whatsapp.net',
            'phone_number' => '94770000002',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $linked = Contact::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'whatsapp_contact_id' => $whatsappId,
            'last_contacted_at' => now(),
        ]);

        $this->asUser($agent)->getJson('/api/v1/contacts?status=active')
            ->assertOk()->assertJsonCount(2, 'data');
        $this->asUser($agent)->getJson('/api/v1/contacts?status=inactive')
            ->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $inactive->id);
        $this->asUser($agent)->getJson('/api/v1/contacts?source=import')
            ->assertOk()->assertJsonCount(1, 'data');
        $this->asUser($agent)->getJson('/api/v1/contacts?whatsapp=connected')
            ->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $linked->id);
        $this->asUser($agent)->getJson('/api/v1/contacts?whatsapp=unavailable')
            ->assertOk()->assertJsonCount(2, 'data');
        $this->asUser($agent)->getJson('/api/v1/contacts?recently_contacted=1')
            ->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $linked->id);
    }

    public function test_inbox_read_auto_creates_a_crm_contact_for_an_unknown_whatsapp_number(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');

        // Gateway-owned fixtures: an unknown whatsapp_contact with a fresh
        // conversation, never linked to any CRM contact (spec §5).
        $conversation = Conversation::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'assigned_user_id' => $agent->id,
        ]);
        $whatsappContactId = $conversation->whatsapp_contact_id;

        $this->assertNull(DB::table('whatsapp_contacts')->where('id', $whatsappContactId)->value('contact_id'));

        $this->asUser($agent)->getJson('/api/v1/conversations')->assertOk();

        // The inbox read provisioned a CRM Contact (source=whatsapp) and linked it.
        $contactId = DB::table('whatsapp_contacts')->where('id', $whatsappContactId)->value('contact_id');
        $this->assertNotNull($contactId);
        $this->assertDatabaseHas('contacts', [
            'id' => $contactId,
            'source' => 'whatsapp',
            'status' => 'active',
        ]);
        $this->assertDatabaseHas('contact_activities', [
            'contact_id' => $contactId,
            'description' => 'Contact created from a WhatsApp conversation',
        ]);

        // Idempotent: a second read does not create a duplicate.
        $this->asUser($agent)->getJson('/api/v1/conversations')->assertOk();
        $this->assertSame($contactId, DB::table('whatsapp_contacts')->where('id', $whatsappContactId)->value('contact_id'));
        $this->assertSame(1, Contact::query()->where('source', 'whatsapp')->count());
    }

    public function test_last_contacted_at_is_derived_from_conversation_activity(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');

        $whatsappId = DB::table('whatsapp_contacts')->insertGetId([
            'workspace_id' => $agent->workspace_id,
            'wa_jid' => '94770000003@s.whatsapp.net',
            'phone_number' => '94770000003',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $contact = Contact::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'whatsapp_contact_id' => $whatsappId,
            'last_contacted_at' => null,
        ]);
        DB::table('conversations')->insertGetId([
            'workspace_id' => $agent->workspace_id,
            'whatsapp_contact_id' => $whatsappId,
            'contact_id' => $contact->id,
            'status' => 'open',
            'last_message_at' => now()->subHour(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->asUser($agent)->getJson("/api/v1/contacts/{$contact->id}")->assertOk();
        $this->assertNotNull($response->json('data.last_contacted_at'));
    }
}
