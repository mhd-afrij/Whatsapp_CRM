<?php

namespace Tests\Feature;

use App\Models\Contact;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
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

        $this->asUser($admin)->getJson("/api/v1/contacts/{$contact->id}")->assertStatus(404);

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
}
