<?php

namespace Tests\Feature;

use App\Models\CalendarEvent;
use App\Models\Task;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\CreatesWorkspaceUsers;
use Tests\TestCase;

class CalendarDayOverviewTest extends TestCase
{
    use CreatesWorkspaceUsers, RefreshDatabase;

    private function seedDay(): array
    {
        $this->seedRbac();
        $user = $this->userWithRole('Agent');

        return [$user, $this->asUser($user)];
    }

    public function test_unauthenticated_requests_are_rejected(): void
    {
        $this->seedRbac();

        $this->getJson('/api/v1/calendar-events')->assertUnauthorized();
        $this->getJson('/api/v1/notes')->assertUnauthorized();
        $this->getJson('/api/v1/tasks')->assertUnauthorized();
    }

    public function test_agent_can_create_and_list_calendar_events_for_a_date(): void
    {
        [$user, $requester] = $this->seedDay();

        $create = $requester->postJson('/api/v1/calendar-events', [
            'title' => 'Call with Acme',
            'starts_at' => '2026-08-20T10:00:00',
            'ends_at' => '2026-08-20T11:00:00',
            'kind' => 'call',
        ])->assertStatus(201);

        $create->assertJsonPath('data.title', 'Call with Acme');
        $create->assertJsonPath('data.kind', 'call');

        $this->assertDatabaseHas('calendar_events', [
            'workspace_id' => $user->workspace_id,
            'title' => 'Call with Acme',
        ]);

        $list = $requester->getJson('/api/v1/calendar-events?date=2026-08-20')->assertOk();
        $this->assertCount(1, $list->json('data'));

        // A different date returns nothing.
        $empty = $requester->getJson('/api/v1/calendar-events?date=2026-08-21')->assertOk();
        $this->assertCount(0, $empty->json('data'));
    }

    public function test_calendar_events_can_be_updated_and_deleted(): void
    {
        [, $requester] = $this->seedDay();

        $eventId = $requester->postJson('/api/v1/calendar-events', [
            'title' => 'Follow-up',
            'starts_at' => '2026-08-22T09:00:00',
            'kind' => 'follow_up',
        ])->json('data.id');

        $requester->patchJson("/api/v1/calendar-events/{$eventId}", [
            'title' => 'Follow-up (moved)',
        ])->assertOk()->assertJsonPath('data.title', 'Follow-up (moved)');

        $requester->deleteJson("/api/v1/calendar-events/{$eventId}")->assertOk();
        $this->assertSoftDeleted('calendar_events', ['id' => $eventId]);
    }

    public function test_calendar_events_are_workspace_isolated(): void
    {
        [, $requester] = $this->seedDay();

        $otherWorkspace = Workspace::factory()->create();
        $otherUser = User::factory()->create(['workspace_id' => $otherWorkspace->id]);
        $foreign = CalendarEvent::create([
            'workspace_id' => $otherWorkspace->id,
            'title' => 'Foreign event',
            'starts_at' => '2026-08-20T10:00:00',
        ]);

        $list = $requester->getJson('/api/v1/calendar-events?date=2026-08-20')->assertOk();
        $ids = collect($list->json('data'))->pluck('id')->all();
        $this->assertNotContains($foreign->id, $ids);

        $requester->deleteJson("/api/v1/calendar-events/{$foreign->id}")->assertNotFound();
    }

    public function test_note_can_be_pinned_to_a_calendar_date(): void
    {
        [$user, $requester] = $this->seedDay();

        $create = $requester->postJson('/api/v1/notes', [
            'calendar_date' => '2026-08-20',
            'body' => 'Prepare the quarterly review deck.',
        ])->assertStatus(201);

        $create->assertJsonPath('data.calendar_date', '2026-08-20');

        $list = $requester->getJson('/api/v1/notes?calendar_date=2026-08-20')->assertOk();
        $this->assertCount(1, $list->json('data'));
        $this->assertSame('Prepare the quarterly review deck.', $list->json('data.0.body'));

        // Notes without an entity but also without a date are rejected.
        $requester->postJson('/api/v1/notes', ['body' => 'Orphaned'])->assertStatus(422);
    }

    public function test_tasks_index_filters_by_due_date(): void
    {
        [$user, $requester] = $this->seedDay();

        Task::create([
            'workspace_id' => $user->workspace_id,
            'title' => 'Due today',
            'due_at' => '2026-08-20 12:00:00',
            'priority' => 'medium',
            'status' => 'open',
            'assignee_id' => $user->id,
            'created_by' => $user->id,
        ]);

        Task::create([
            'workspace_id' => $user->workspace_id,
            'title' => 'Due another day',
            'due_at' => '2026-08-21 12:00:00',
            'priority' => 'medium',
            'status' => 'open',
            'assignee_id' => $user->id,
            'created_by' => $user->id,
        ]);

        $list = $requester->getJson('/api/v1/tasks?due_date=2026-08-20')->assertOk();
        $titles = collect($list->json('data'))->pluck('title')->all();
        $this->assertContains('Due today', $titles);
        $this->assertNotContains('Due another day', $titles);
    }
}
