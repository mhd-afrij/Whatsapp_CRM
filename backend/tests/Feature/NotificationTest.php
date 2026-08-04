<?php

namespace Tests\Feature;

use App\Console\Commands\NotifyNewMessagesOnAssignedConversations;
use App\Console\Commands\NotifyOverdueTasks;
use App\Console\Commands\NotifyWhatsappConnectionEvents;
use App\Models\Conversation;
use App\Models\Notification;
use App\Models\NotificationPreference;
use App\Models\Task;
use App\Models\Workspace;
use App\Notifications\AppNotificationMail;
use App\Services\NotificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification as NotificationFacade;
use Tests\CreatesWorkspaceUsers;
use Tests\TestCase;

class NotificationTest extends TestCase
{
    use RefreshDatabase, CreatesWorkspaceUsers;

    protected function setUp(): void
    {
        parent::setUp();

        // Every NotificationService::notify() call best-effort relays to the gateway;
        // fake the HTTP call so tests never depend on a real gateway process and never
        // wait out a real connection attempt.
        Http::fake([
            '*/internal/whatsapp/events/emit' => Http::response(['success' => true, 'message' => 'OK', 'data' => null], 200),
        ]);
    }

    public function test_conversation_assignment_notifies_the_new_assignee(): void
    {
        $this->seedRbac();
        $manager = $this->userWithRole('Manager');
        $agent = $this->userWithRole('Agent');
        $conversation = Conversation::factory()->create([
            'workspace_id' => $manager->workspace_id,
            'assigned_user_id' => $manager->id,
        ]);

        $this->asUser($manager)->patchJson("/api/v1/conversations/{$conversation->id}/assign", [
            'assigned_user_id' => $agent->id,
        ])->assertOk();

        $this->assertDatabaseHas('notifications', [
            'user_id' => $agent->id,
            'type' => 'conversation.assigned',
        ]);

        Http::assertSent(fn ($request) => str_contains($request->url(), '/internal/whatsapp/events/emit')
            && $request['event'] === 'notification.created'
            && $request['userId'] === $agent->id);
    }

    public function test_task_assignment_notifies_the_assignee(): void
    {
        $this->seedRbac();
        $manager = $this->userWithRole('Manager');
        $agent = $this->userWithRole('Agent');

        $this->asUser($manager)->postJson('/api/v1/tasks', [
            'title' => 'Call the client',
            'assignee_id' => $agent->id,
        ])->assertCreated();

        $this->assertDatabaseHas('notifications', [
            'user_id' => $agent->id,
            'type' => 'task.assigned',
        ]);
    }

    public function test_unread_listing_mark_read_and_mark_all_read(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');

        NotificationService::notify($agent, 'task.assigned', ['task_id' => 1]);
        NotificationService::notify($agent, 'task.assigned', ['task_id' => 2]);
        NotificationService::notify($agent, 'task.assigned', ['task_id' => 3]);

        $unread = $this->asUser($agent)->getJson('/api/v1/notifications?unread=1')->assertOk();
        $this->assertSame(3, $unread->json('meta.unread_count'));
        $this->assertCount(3, $unread->json('data'));

        $firstId = $unread->json('data.0.id');
        $this->asUser($agent)->patchJson("/api/v1/notifications/{$firstId}/read")
            ->assertOk()
            ->assertJsonPath('data.read_at', fn ($v) => $v !== null);

        $afterOneRead = $this->asUser($agent)->getJson('/api/v1/notifications?unread=1')->assertOk();
        $this->assertSame(2, $afterOneRead->json('meta.unread_count'));

        $this->asUser($agent)->postJson('/api/v1/notifications/mark-all-read')->assertOk();

        $afterAllRead = $this->asUser($agent)->getJson('/api/v1/notifications?unread=1')->assertOk();
        $this->assertSame(0, $afterAllRead->json('meta.unread_count'));
    }

    public function test_user_never_sees_or_marks_another_users_notification(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $otherAgent = $this->userWithRole('Agent');

        $theirs = NotificationService::notify($otherAgent, 'task.assigned', ['task_id' => 1]);

        $list = $this->asUser($agent)->getJson('/api/v1/notifications')->assertOk();
        $this->assertCount(0, $list->json('data'));

        $this->asUser($agent)->patchJson("/api/v1/notifications/{$theirs->id}/read")
            ->assertStatus(404);
    }

    public function test_notification_is_workspace_scoped(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');

        $otherWorkspace = Workspace::factory()->create();
        $otherUser = \App\Models\User::factory()->create(['workspace_id' => $otherWorkspace->id]);
        $foreignNotification = Notification::create([
            'workspace_id' => $otherWorkspace->id,
            'user_id' => $otherUser->id,
            'type' => 'task.assigned',
            'data' => [],
        ]);

        $this->asUser($agent)->patchJson("/api/v1/notifications/{$foreignNotification->id}/read")
            ->assertStatus(404);
    }

    public function test_in_app_preference_off_suppresses_the_notification_row(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');

        NotificationPreference::create([
            'user_id' => $agent->id,
            'notification_type' => 'task.assigned',
            'in_app_enabled' => false,
            'email_enabled' => false,
        ]);

        $result = NotificationService::notify($agent, 'task.assigned', ['task_id' => 1]);

        $this->assertNull($result);
        $this->assertDatabaseMissing('notifications', ['user_id' => $agent->id, 'type' => 'task.assigned']);
    }

    public function test_email_preference_on_queues_the_mailable_when_mail_is_configured(): void
    {
        NotificationFacade::fake();

        $this->seedRbac();
        $agent = $this->userWithRole('Agent');

        NotificationPreference::create([
            'user_id' => $agent->id,
            'notification_type' => 'task.assigned',
            'in_app_enabled' => true,
            'email_enabled' => true,
        ]);

        config(['mail.default' => 'smtp', 'mail.mailers.smtp.host' => 'sandbox.smtp.example.com']);

        NotificationService::notify($agent, 'task.assigned', ['task_id' => 1, 'title' => 'Call client']);

        NotificationFacade::assertSentTo($agent, AppNotificationMail::class);
    }

    public function test_email_is_never_queued_when_mail_is_not_configured(): void
    {
        NotificationFacade::fake();

        $this->seedRbac();
        $agent = $this->userWithRole('Agent');

        NotificationPreference::create([
            'user_id' => $agent->id,
            'notification_type' => 'task.assigned',
            'in_app_enabled' => true,
            'email_enabled' => true,
        ]);

        // Test environment defaults MAIL_MAILER to "array" (see phpunit.xml) - treated as
        // "not really configured", same as the log driver.
        config(['mail.default' => 'array']);

        NotificationService::notify($agent, 'task.assigned', ['task_id' => 1]);

        NotificationFacade::assertNothingSent();
    }

    public function test_notification_preferences_index_defaults_and_update(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');

        $index = $this->asUser($agent)->getJson('/api/v1/notification-preferences')->assertOk();
        $this->assertGreaterThan(0, count($index->json('data')));
        $default = collect($index->json('data'))->firstWhere('notification_type', 'task.assigned');
        $this->assertTrue($default['in_app_enabled']);
        $this->assertFalse($default['email_enabled']);

        $this->asUser($agent)->patchJson('/api/v1/notification-preferences', [
            'notification_type' => 'task.assigned',
            'in_app_enabled' => false,
            'email_enabled' => true,
        ])->assertOk();

        $this->assertDatabaseHas('notification_preferences', [
            'user_id' => $agent->id,
            'notification_type' => 'task.assigned',
            'in_app_enabled' => false,
            'email_enabled' => true,
        ]);
    }

    public function test_notify_overdue_tasks_command_notifies_once_per_task(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');

        $task = Task::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'assignee_id' => $agent->id,
            'status' => 'open',
            'due_at' => now()->subDay(),
        ]);

        $this->artisan(NotifyOverdueTasks::class)->assertExitCode(0);
        $this->assertDatabaseHas('notifications', ['user_id' => $agent->id, 'type' => 'task.overdue']);
        $this->assertSame(1, Notification::where('type', 'task.overdue')->count());

        // Re-running must not double-notify for the same overdue task.
        $this->artisan(NotifyOverdueTasks::class)->assertExitCode(0);
        $this->assertSame(1, Notification::where('type', 'task.overdue')->count());
    }

    public function test_notify_new_messages_command_notifies_assignee_once(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $conversation = Conversation::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'assigned_user_id' => $agent->id,
        ]);

        \Illuminate\Support\Facades\DB::table('messages')->insert([
            'workspace_id' => $conversation->workspace_id,
            'conversation_id' => $conversation->id,
            'whatsapp_message_id' => 'wamid.test123',
            'direction' => 'inbound',
            'sender_type' => 'contact',
            'message_type' => 'text',
            'body' => 'Hello there',
            'status' => 'received',
            'sent_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->artisan(NotifyNewMessagesOnAssignedConversations::class)->assertExitCode(0);
        $this->assertDatabaseHas('notifications', ['user_id' => $agent->id, 'type' => 'conversation.new_message']);
        $this->assertSame(1, Notification::where('type', 'conversation.new_message')->count());

        $this->artisan(NotifyNewMessagesOnAssignedConversations::class)->assertExitCode(0);
        $this->assertSame(1, Notification::where('type', 'conversation.new_message')->count());
    }

    public function test_notify_whatsapp_connection_events_command_notifies_connection_managers(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');
        $agent = $this->userWithRole('Agent');

        $session = \Illuminate\Support\Facades\DB::table('whatsapp_sessions')->insertGetId([
            'workspace_id' => $admin->workspace_id,
            'status' => 'logged_out',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        \Illuminate\Support\Facades\DB::table('whatsapp_connection_events')->insert([
            'workspace_id' => $admin->workspace_id,
            'whatsapp_session_id' => $session,
            'event_type' => 'logged_out',
            'metadata' => json_encode([]),
            'occurred_at' => now(),
            'created_at' => now(),
        ]);

        $this->artisan(NotifyWhatsappConnectionEvents::class)->assertExitCode(0);

        $this->assertDatabaseHas('notifications', [
            'user_id' => $admin->id,
            'type' => 'whatsapp.connection.reauth_required',
        ]);
        $this->assertDatabaseMissing('notifications', [
            'user_id' => $agent->id,
            'type' => 'whatsapp.connection.reauth_required',
        ]);

        $this->artisan(NotifyWhatsappConnectionEvents::class)->assertExitCode(0);
        $this->assertSame(1, Notification::where('type', 'whatsapp.connection.reauth_required')->count());
    }
}
