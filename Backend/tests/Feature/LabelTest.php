<?php

namespace Tests\Feature;

use App\Models\Contact;
use App\Models\Deal;
use App\Models\Label;
use App\Models\Lead;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\CreatesWorkspaceUsers;
use Tests\TestCase;

class LabelTest extends TestCase
{
    use CreatesWorkspaceUsers, RefreshDatabase;

    public function test_agent_cannot_create_label(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');

        $this->asUser($agent)->postJson('/api/v1/labels', [
            'name' => 'VIP',
            'color_hex' => '#FF0000',
        ])->assertStatus(403)->assertJsonPath('success', false);
    }

    public function test_manager_can_create_update_and_delete_label(): void
    {
        $this->seedRbac();
        $manager = $this->userWithRole('Manager');

        $create = $this->asUser($manager)->postJson('/api/v1/labels', [
            'name' => 'VIP',
            'color_hex' => '#FF0000',
        ])->assertStatus(201)->assertJsonPath('success', true);

        $labelId = $create->json('data.id');

        $this->asUser($manager)->patchJson("/api/v1/labels/{$labelId}", [
            'name' => 'VIP Customer',
            'color_hex' => '#00FF00',
        ])->assertOk()->assertJsonPath('data.name', 'VIP Customer');

        $this->asUser($manager)->deleteJson("/api/v1/labels/{$labelId}")
            ->assertOk()->assertJsonPath('success', true);

        $this->assertDatabaseMissing('labels', ['id' => $labelId]);
    }

    public function test_any_authenticated_user_can_list_labels(): void
    {
        $this->seedRbac();
        $viewer = $this->userWithRole('Viewer');
        Label::factory()->create(['workspace_id' => $viewer->workspace_id, 'name' => 'Hot Lead']);

        $this->asUser($viewer)->getJson('/api/v1/labels')
            ->assertOk()
            ->assertJsonPath('success', true);
    }

    public function test_deleting_label_cascades_pivot_rows_without_orphans(): void
    {
        $this->seedRbac();
        $manager = $this->userWithRole('Manager');

        $label = Label::factory()->create(['workspace_id' => $manager->workspace_id]);
        $contact = Contact::factory()->create(['workspace_id' => $manager->workspace_id]);
        $contact->labels()->attach($label->id, ['created_at' => now()]);

        $this->assertDatabaseHas('contact_label', ['label_id' => $label->id, 'contact_id' => $contact->id]);

        $this->asUser($manager)->deleteJson("/api/v1/labels/{$label->id}")->assertOk();

        $this->assertDatabaseMissing('labels', ['id' => $label->id]);
        $this->assertDatabaseMissing('contact_label', ['label_id' => $label->id]);
        $this->assertDatabaseHas('contacts', ['id' => $contact->id]);
    }

    public function test_attach_and_detach_label_on_contact(): void
    {
        $this->seedRbac();
        $manager = $this->userWithRole('Manager');
        $label = Label::factory()->create(['workspace_id' => $manager->workspace_id]);
        $contact = Contact::factory()->create(['workspace_id' => $manager->workspace_id]);

        $this->asUser($manager)->postJson("/api/v1/contacts/{$contact->id}/labels/{$label->id}")
            ->assertOk();
        $this->assertDatabaseHas('contact_label', ['label_id' => $label->id, 'contact_id' => $contact->id]);

        $this->asUser($manager)->deleteJson("/api/v1/contacts/{$contact->id}/labels/{$label->id}")
            ->assertOk();
        $this->assertDatabaseMissing('contact_label', ['label_id' => $label->id, 'contact_id' => $contact->id]);
    }

    public function test_viewer_cannot_attach_label_to_contact(): void
    {
        $this->seedRbac();
        $viewer = $this->userWithRole('Viewer');
        $label = Label::factory()->create(['workspace_id' => $viewer->workspace_id]);
        $contact = Contact::factory()->create(['workspace_id' => $viewer->workspace_id]);

        // Viewer lacks contacts.view? Actually Viewer has contacts.view=Y but no edit/create.
        $this->asUser($viewer)->postJson("/api/v1/contacts/{$contact->id}/labels/{$label->id}")
            ->assertStatus(403);
    }

    public function test_contacts_list_filters_by_labels_any_match(): void
    {
        $this->seedRbac();
        $manager = $this->userWithRole('Manager');

        $labelA = Label::factory()->create(['workspace_id' => $manager->workspace_id]);
        $labelB = Label::factory()->create(['workspace_id' => $manager->workspace_id]);

        $withA = Contact::factory()->create(['workspace_id' => $manager->workspace_id]);
        $withA->labels()->attach($labelA->id, ['created_at' => now()]);

        $withB = Contact::factory()->create(['workspace_id' => $manager->workspace_id]);
        $withB->labels()->attach($labelB->id, ['created_at' => now()]);

        Contact::factory()->create(['workspace_id' => $manager->workspace_id]); // no label

        $response = $this->asUser($manager)
            ->getJson('/api/v1/contacts?'.http_build_query(['labels' => [$labelA->id, $labelB->id]]))
            ->assertOk();

        $this->assertSame(2, $response->json('meta.total'));
    }

    public function test_leads_list_filters_by_labels(): void
    {
        $this->seedRbac();
        $manager = $this->userWithRole('Manager');
        $label = Label::factory()->create(['workspace_id' => $manager->workspace_id]);

        $matching = Lead::factory()->create(['workspace_id' => $manager->workspace_id]);
        $matching->labels()->attach($label->id, ['created_at' => now()]);
        Lead::factory()->create(['workspace_id' => $manager->workspace_id]);

        $response = $this->asUser($manager)
            ->getJson('/api/v1/leads?'.http_build_query(['labels' => [$label->id]]))
            ->assertOk();

        $this->assertSame(1, $response->json('meta.total'));
    }

    public function test_deals_list_filters_by_labels(): void
    {
        $this->seedRbac();
        $manager = $this->userWithRole('Manager');
        $label = Label::factory()->create(['workspace_id' => $manager->workspace_id]);

        $matching = Deal::factory()->create(['workspace_id' => $manager->workspace_id]);
        $matching->labels()->attach($label->id, ['created_at' => now()]);
        Deal::factory()->create(['workspace_id' => $manager->workspace_id]);

        $response = $this->asUser($manager)
            ->getJson('/api/v1/deals?'.http_build_query(['labels' => [$label->id]]))
            ->assertOk();

        $this->assertSame(1, $response->json('meta.total'));
    }
}
