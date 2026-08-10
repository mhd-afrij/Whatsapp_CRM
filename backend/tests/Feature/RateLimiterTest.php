<?php

namespace Tests\Feature;

use App\Models\Contact;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\CreatesWorkspaceUsers;
use Tests\TestCase;

/**
 * Phase 18 gap fill (flagged as a to-do at the end of Phase 17): the Phase 17
 * rate limiters (password-reset, invitation-accept, invitation-create, search,
 * export) were added to routes/api.php + AppServiceProvider but had no test
 * asserting the throttle actually engages at its documented limit.
 */
class RateLimiterTest extends TestCase
{
    use CreatesWorkspaceUsers, RefreshDatabase;

    public function test_password_reset_request_is_throttled_after_five_attempts_per_minute(): void
    {
        $this->seedRbac();
        User::factory()->create(['email' => 'throttle-target@example.com']);

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/v1/auth/forgot-password', ['email' => 'throttle-target@example.com'])
                ->assertStatus(200);
        }

        $this->postJson('/api/v1/auth/forgot-password', ['email' => 'throttle-target@example.com'])
            ->assertStatus(429);
    }

    public function test_invitation_accept_is_throttled_after_ten_attempts_per_minute(): void
    {
        $this->seedRbac();

        // The invitation-accept limiter keys by token+ip (see AppServiceProvider), so
        // repeated attempts against the *same* bogus token are what exercises the limit -
        // a brute-force/replay attempt against one token, not a spread across many.
        for ($i = 0; $i < 10; $i++) {
            $this->postJson('/api/v1/auth/invitations/accept', [
                'token' => 'bogus-token-fixed',
                'password' => 'Password123!',
                'password_confirmation' => 'Password123!',
                'name' => 'Someone',
            ])->assertStatus(422);
        }

        $this->postJson('/api/v1/auth/invitations/accept', [
            'token' => 'bogus-token-fixed',
            'password' => 'Password123!',
            'password_confirmation' => 'Password123!',
            'name' => 'Someone',
        ])->assertStatus(429);
    }

    public function test_invitation_create_is_throttled_after_ten_per_minute_per_user(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');

        for ($i = 0; $i < 10; $i++) {
            $this->asUser($admin)->postJson('/api/v1/auth/invitations', [
                'email' => "invitee{$i}@example.com",
                'role_id' => Role::query()->where('name', 'Agent')->firstOrFail()->id,
            ])->assertStatus(201);
        }

        $this->asUser($admin)->postJson('/api/v1/auth/invitations', [
            'email' => 'invitee-final@example.com',
            'role_id' => Role::query()->where('name', 'Agent')->firstOrFail()->id,
        ])->assertStatus(429);
    }

    public function test_search_is_throttled_after_sixty_per_minute_per_user(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $this->asUser($agent);

        for ($i = 0; $i < 60; $i++) {
            $this->getJson('/api/v1/search?q=test')->assertStatus(200);
        }

        $this->getJson('/api/v1/search?q=test')->assertStatus(429);
    }

    public function test_contacts_export_is_throttled_after_ten_per_minute_per_user(): void
    {
        $this->seedRbac();
        $manager = $this->userWithRole('Manager');
        Contact::factory()->count(1)->create(['workspace_id' => $manager->workspace_id]);
        $this->asUser($manager);

        for ($i = 0; $i < 10; $i++) {
            $this->getJson('/api/v1/contacts/export')->assertStatus(200);
        }

        $this->getJson('/api/v1/contacts/export')->assertStatus(429);
    }
}
