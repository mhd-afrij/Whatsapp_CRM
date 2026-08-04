<?php

namespace Tests\Feature;

use App\Models\Notification;
use App\Models\Task;
use App\Models\TaskReminder;
use App\Models\Workspace;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\CreatesWorkspaceUsers;
use Tests\TestCase;

class TaskTest extends TestCase
{
    use RefreshDatabase, CreatesWorkspaceUsers;

    public function test_viewer_without_permission_cannot_list_tasks(): void
    {
        $this->seedRbac();
        $viewer = $this->userWithRole('Viewer');

        $this->asUser($viewer)->getJson('/api/v1/tasks')
            ->assertStatus(403)
            ->assertJsonPath('success', false);
    }

    public function test_agent_only_sees_own_tasks_by_default(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $otherAgent = $this->userWithRole('Agent');

        Task::factory()->count(2)->create([
            'workspace_id' => $agent->workspace_id,
            'assignee_id' => $agent->id,
            'created_by' => $agent->id,
        ]);
        Task::factory()->count(3)->create([
            'workspace_id' => $agent->workspace_id,
            'assignee_id' => $otherAgent->id,
            'created_by' => $otherAgent->id,
        ]);

        $response = $this->asUser($agent)->getJson('/api/v1/tasks')->assertOk();
        $this->assertSame(2, $response->json('meta.total'));
    }

    public function test_manager_can_view_team_tasks(): void
    {
        $this->seedRbac();
        $manager = $this->userWithRole('Manager');
        $agent = $this->userWithRole('Agent');

        Task::factory()->count(2)->create([
            'workspace_id' => $manager->workspace_id,
            'assignee_id' => $agent->id,
            'created_by' => $agent->id,
        ]);

        $response = $this->asUser($manager)->getJson('/api/v1/tasks?team=1')->assertOk();
        $this->assertSame(2, $response->json('meta.total'));
    }

    public function test_workspace_isolation_on_task_listing(): void
    {
        $this->seedRbac();
        $manager = $this->userWithRole('Manager');

        $otherWorkspace = Workspace::factory()->create();
        Task::factory()->count(4)->create(['workspace_id' => $otherWorkspace->id]);

        $response = $this->asUser($manager)->getJson('/api/v1/tasks?team=1')->assertOk();
        $this->assertSame(0, $response->json('meta.total'));
    }

    public function test_overdue_filter_returns_only_overdue_open_tasks(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');

        $overdue = Task::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'assignee_id' => $agent->id,
            'created_by' => $agent->id,
            'due_at' => now()->subDays(2),
            'status' => 'open',
        ]);
        Task::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'assignee_id' => $agent->id,
            'created_by' => $agent->id,
            'due_at' => now()->addDays(2),
            'status' => 'open',
        ]);
        Task::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'assignee_id' => $agent->id,
            'created_by' => $agent->id,
            'due_at' => now()->subDays(5),
            'status' => 'done',
        ]);

        $response = $this->asUser($agent)->getJson('/api/v1/tasks?overdue=1')->assertOk();
        $this->assertSame(1, $response->json('meta.total'));
        $this->assertSame($overdue->id, $response->json('data.0.id'));
    }

    public function test_upcoming_filter_returns_tasks_due_within_7_days(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');

        $upcoming = Task::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'assignee_id' => $agent->id,
            'created_by' => $agent->id,
            'due_at' => now()->addDays(3),
            'status' => 'open',
        ]);
        Task::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'assignee_id' => $agent->id,
            'created_by' => $agent->id,
            'due_at' => now()->addDays(20),
            'status' => 'open',
        ]);

        $response = $this->asUser($agent)->getJson('/api/v1/tasks?upcoming=1')->assertOk();
        $this->assertSame(1, $response->json('meta.total'));
        $this->assertSame($upcoming->id, $response->json('data.0.id'));
    }

    public function test_agent_can_create_task_linked_to_a_lead(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $lead = \App\Models\Lead::factory()->create(['workspace_id' => $agent->workspace_id]);

        $response = $this->asUser($agent)->postJson('/api/v1/tasks', [
            'title' => 'Follow up',
            'lead_id' => $lead->id,
            'priority' => 'high',
            'due_at' => now()->addDay()->toIso8601String(),
        ])->assertStatus(201);

        $this->assertDatabaseHas('tasks', [
            'id' => $response->json('data.id'),
            'lead_id' => $lead->id,
            'assignee_id' => $agent->id,
            'status' => 'open',
        ]);
    }

    public function test_complete_and_reopen_transitions(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $task = Task::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'assignee_id' => $agent->id,
            'created_by' => $agent->id,
        ]);

        $this->asUser($agent)->postJson("/api/v1/tasks/{$task->id}/complete")->assertOk();
        $this->assertDatabaseHas('tasks', ['id' => $task->id, 'status' => 'done']);
        $this->assertNotNull($task->fresh()->completed_at);

        $this->asUser($agent)->postJson("/api/v1/tasks/{$task->id}/reopen")->assertOk();
        $this->assertDatabaseHas('tasks', ['id' => $task->id, 'status' => 'open']);
        $this->assertNull($task->fresh()->completed_at);
    }

    public function test_agent_cannot_update_task_they_do_not_own(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $otherAgent = $this->userWithRole('Agent');
        $task = Task::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'assignee_id' => $otherAgent->id,
            'created_by' => $otherAgent->id,
        ]);

        $this->asUser($agent)->patchJson("/api/v1/tasks/{$task->id}", ['title' => 'hacked'])
            ->assertStatus(403);
    }

    public function test_comment_creation_and_mention_notification(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $mentioned = $this->userWithRole('Agent', ['name' => 'Jane Doe', 'email' => 'jane@example.com']);
        $task = Task::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'assignee_id' => $agent->id,
            'created_by' => $agent->id,
        ]);

        $response = $this->asUser($agent)->postJson("/api/v1/tasks/{$task->id}/comments", [
            'body' => 'Hey @jane please check this',
        ])->assertStatus(201);

        $this->assertDatabaseHas('task_comments', [
            'id' => $response->json('data.id'),
            'task_id' => $task->id,
            'author_id' => $agent->id,
        ]);

        $this->assertDatabaseHas('notifications', [
            'user_id' => $mentioned->id,
            'type' => 'task.comment_mention',
        ]);
    }

    public function test_reminder_command_creates_notification_for_due_reminder_and_skips_future(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $task = Task::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'assignee_id' => $agent->id,
            'created_by' => $agent->id,
        ]);

        $dueReminder = TaskReminder::create([
            'task_id' => $task->id,
            'remind_at' => now()->subMinutes(5),
            'channel' => 'in_app',
        ]);

        $futureReminder = TaskReminder::create([
            'task_id' => $task->id,
            'remind_at' => now()->addDay(),
            'channel' => 'in_app',
        ]);

        $this->artisan('tasks:send-reminders')->assertExitCode(0);

        $this->assertNotNull($dueReminder->fresh()->sent_at);
        $this->assertNull($futureReminder->fresh()->sent_at);

        $this->assertSame(1, Notification::query()->where('type', 'task.reminder')->where('user_id', $agent->id)->count());

        // Running again should not duplicate — sent_at is now set so it's excluded.
        $this->artisan('tasks:send-reminders')->assertExitCode(0);
        $this->assertSame(1, Notification::query()->where('type', 'task.reminder')->where('user_id', $agent->id)->count());
    }
}
