<?php

namespace Tests\Feature;

use App\Models\NotificationPreference;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\CreatesWorkspaceUsers;
use Tests\TestCase;

/**
 * Phase 18 gap fill: NotificationPreferenceController had zero direct test coverage before this.
 */
class NotificationPreferenceTest extends TestCase
{
    use CreatesWorkspaceUsers, RefreshDatabase;

    public function test_index_returns_a_default_row_for_every_known_type_when_none_saved(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');

        $response = $this->asUser($agent)->getJson('/api/v1/notification-preferences')->assertOk();

        $types = collect($response->json('data'))->pluck('notification_type');
        $this->assertTrue($types->contains('conversation.assigned'));
        $this->assertTrue($types->contains('task.reminder'));
        $this->assertGreaterThanOrEqual(9, $types->count());

        $conversationAssigned = collect($response->json('data'))
            ->firstWhere('notification_type', 'conversation.assigned');
        $this->assertTrue($conversationAssigned['in_app_enabled']);
        $this->assertFalse($conversationAssigned['email_enabled']);
    }

    public function test_update_upserts_a_preference_and_index_reflects_it(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');

        $this->asUser($agent)->patchJson('/api/v1/notification-preferences', [
            'notification_type' => 'task.reminder',
            'in_app_enabled' => false,
            'email_enabled' => true,
        ])->assertOk();

        $this->assertDatabaseHas('notification_preferences', [
            'user_id' => $agent->id,
            'notification_type' => 'task.reminder',
            'in_app_enabled' => false,
            'email_enabled' => true,
        ]);

        $response = $this->asUser($agent)->getJson('/api/v1/notification-preferences')->assertOk();
        $row = collect($response->json('data'))->firstWhere('notification_type', 'task.reminder');
        $this->assertFalse($row['in_app_enabled']);
        $this->assertTrue($row['email_enabled']);
    }

    public function test_update_rejects_an_unknown_notification_type(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');

        $this->asUser($agent)->patchJson('/api/v1/notification-preferences', [
            'notification_type' => 'not.a.real.type',
        ])->assertStatus(422);
    }

    public function test_update_with_no_type_field_is_rejected(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');

        $this->asUser($agent)->patchJson('/api/v1/notification-preferences', [
            'in_app_enabled' => false,
        ])->assertStatus(422);
    }

    public function test_preferences_are_isolated_per_user_not_shared_across_workspace(): void
    {
        $this->seedRbac();
        $agentA = $this->userWithRole('Agent');
        $agentB = $this->userWithRole('Agent');

        $this->asUser($agentA)->patchJson('/api/v1/notification-preferences', [
            'notification_type' => 'note.mention',
            'in_app_enabled' => false,
        ])->assertOk();

        $response = $this->asUser($agentB)->getJson('/api/v1/notification-preferences')->assertOk();
        $row = collect($response->json('data'))->firstWhere('notification_type', 'note.mention');
        $this->assertTrue($row['in_app_enabled']);

        $this->assertSame(1, NotificationPreference::query()->where('notification_type', 'note.mention')->count());
    }
}
