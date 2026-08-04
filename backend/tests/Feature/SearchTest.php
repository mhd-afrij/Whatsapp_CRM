<?php

namespace Tests\Feature;

use App\Models\Contact;
use App\Models\Deal;
use App\Models\Lead;
use App\Models\Task;
use App\Models\Workspace;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\CreatesWorkspaceUsers;
use Tests\TestCase;

class SearchTest extends TestCase
{
    use RefreshDatabase, CreatesWorkspaceUsers;

    public function test_search_returns_breakdown_across_categories(): void
    {
        $this->seedRbac();
        $manager = $this->userWithRole('Manager');

        Contact::factory()->create(['workspace_id' => $manager->workspace_id, 'full_name' => 'Zephyr Alpha']);
        Deal::factory()->create(['workspace_id' => $manager->workspace_id, 'title' => 'Zephyr Renewal']);
        Task::factory()->create(['workspace_id' => $manager->workspace_id, 'title' => 'Follow up with Zephyr']);

        $response = $this->asUser($manager)->getJson('/api/v1/search?q=Zephyr')->assertOk();

        $this->assertSame(1, $response->json('data.categories.contacts.total'));
        $this->assertSame(1, $response->json('data.categories.deals.total'));
        $this->assertSame(1, $response->json('data.categories.tasks.total'));
    }

    public function test_search_excludes_categories_user_lacks_permission_for(): void
    {
        $this->seedRbac();
        // Viewer: contacts.view=Y, leads.manage=N, deals.manage=N, tasks.manage/view_team=N,
        // conversations.view=Y.
        $viewer = $this->userWithRole('Viewer');

        Lead::factory()->create(['workspace_id' => $viewer->workspace_id]);

        $response = $this->asUser($viewer)->getJson('/api/v1/search?q=a')->assertOk();

        $categories = $response->json('data.categories');
        $this->assertArrayHasKey('contacts', $categories);
        $this->assertArrayNotHasKey('leads', $categories);
        $this->assertArrayNotHasKey('deals', $categories);
        $this->assertArrayNotHasKey('tasks', $categories);
    }

    public function test_search_is_workspace_scoped(): void
    {
        $this->seedRbac();
        $manager = $this->userWithRole('Manager');

        // A contact in a different workspace must never appear in this workspace's results.
        $otherWorkspace = Workspace::factory()->create();
        Contact::factory()->create(['workspace_id' => $otherWorkspace->id, 'full_name' => 'Unique Other Workspace Name']);

        $response = $this->asUser($manager)->getJson('/api/v1/search?q=Unique Other Workspace Name')->assertOk();

        $this->assertSame(0, $response->json('data.categories.contacts.total'));
    }

    public function test_search_category_param_returns_paginated_full_results(): void
    {
        $this->seedRbac();
        $manager = $this->userWithRole('Manager');

        Contact::factory()->count(20)->create(['workspace_id' => $manager->workspace_id, 'full_name' => 'Searchable Person']);

        $response = $this->asUser($manager)
            ->getJson('/api/v1/search?q=Searchable&category=contacts&per_page=5')
            ->assertOk();

        $this->assertSame(20, $response->json('meta.total'));
        $this->assertSame(5, $response->json('meta.per_page'));
        $this->assertCount(5, $response->json('data.items'));
        $this->assertSame(4, $response->json('meta.last_page'));
    }

    public function test_search_category_param_rejects_category_without_permission(): void
    {
        $this->seedRbac();
        $viewer = $this->userWithRole('Viewer');

        $this->asUser($viewer)->getJson('/api/v1/search?q=a&category=leads')
            ->assertStatus(403)
            ->assertJsonPath('success', false);
    }

    public function test_search_empty_query_returns_empty_breakdown(): void
    {
        $this->seedRbac();
        $manager = $this->userWithRole('Manager');

        $this->asUser($manager)->getJson('/api/v1/search?q=')
            ->assertOk()
            ->assertJsonPath('data.categories', []);
    }
}
