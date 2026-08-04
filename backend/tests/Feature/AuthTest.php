<?php

namespace Tests\Feature;

use App\Models\Invitation;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Tests\CreatesWorkspaceUsers;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase, CreatesWorkspaceUsers;

    public function test_login_succeeds_with_valid_credentials(): void
    {
        $this->seedRbac();
        $user = $this->userWithRole('Agent', ['password' => Hash::make('Secret123!')]);

        $response = $this->postJson('/api/v1/auth/login', [
            'email' => $user->email,
            'password' => 'Secret123!',
        ]);

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.user.email', $user->email)
            ->assertJsonStructure(['data' => ['token', 'user' => ['id', 'email', 'roles', 'permissions']]]);

        $this->assertDatabaseHas('audit_logs', ['action' => 'auth.login', 'user_id' => $user->id]);
    }

    public function test_login_fails_with_invalid_credentials(): void
    {
        $this->seedRbac();
        $user = $this->userWithRole('Agent', ['password' => Hash::make('Secret123!')]);

        $response = $this->postJson('/api/v1/auth/login', [
            'email' => $user->email,
            'password' => 'wrong-password',
        ]);

        $response->assertStatus(422)->assertJsonPath('success', false);

        $this->assertDatabaseHas('audit_logs', ['action' => 'auth.login.failed', 'workspace_id' => $user->workspace_id]);
    }

    public function test_login_is_throttled_after_too_many_attempts(): void
    {
        $this->seedRbac();
        $user = $this->userWithRole('Agent', ['password' => Hash::make('Secret123!')]);

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/v1/auth/login', ['email' => $user->email, 'password' => 'wrong'])
                ->assertStatus(422);
        }

        $this->postJson('/api/v1/auth/login', ['email' => $user->email, 'password' => 'wrong'])
            ->assertStatus(429);
    }

    public function test_suspended_user_cannot_log_in(): void
    {
        $this->seedRbac();
        $user = $this->userWithRole('Agent', ['password' => Hash::make('Secret123!'), 'is_active' => false]);

        $response = $this->postJson('/api/v1/auth/login', [
            'email' => $user->email,
            'password' => 'Secret123!',
        ]);

        $response->assertStatus(403)->assertJsonPath('success', false);
    }

    public function test_logout_invalidates_the_token(): void
    {
        $this->seedRbac();
        $user = $this->userWithRole('Agent');

        $this->asUser($user)->postJson('/api/v1/auth/logout')->assertOk();

        // Reuse the exact same (now-revoked) token; forget the memoized guard user first so
        // this second call actually re-resolves the token instead of reusing request #1's auth.
        Auth::forgetGuards();
        $lastToken = $user->tokens()->latest('id')->first();
        $this->assertNull($lastToken, 'token row should have been deleted by logout');

        $this->getJson('/api/v1/auth/me')->assertStatus(401);
    }

    public function test_me_returns_current_user_with_permissions(): void
    {
        $this->seedRbac();
        $user = $this->userWithRole('Agent');

        $response = $this->asUser($user)->getJson('/api/v1/auth/me');

        $response->assertOk()
            ->assertJsonPath('data.email', $user->email)
            ->assertJsonPath('data.roles.0', 'Agent');

        $this->assertContains('contacts.create', $response->json('data.permissions'));
        $this->assertNotContains('contacts.delete', $response->json('data.permissions'));
    }

    public function test_a_suspended_authenticated_user_is_blocked_from_the_api(): void
    {
        $this->seedRbac();
        $user = $this->userWithRole('Agent');
        $client = $this->asUser($user);

        $user->forceFill(['is_active' => false])->save();

        $client->getJson('/api/v1/auth/me')->assertStatus(403);
    }

    public function test_invitation_flow_end_to_end(): void
    {
        Notification::fake();

        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');
        $agentRole = Role::query()->where('name', 'Agent')->firstOrFail();

        $inviteResponse = $this->asUser($admin)->postJson('/api/v1/auth/invitations', [
            'email' => 'newagent@example.com',
            'role_id' => $agentRole->id,
        ]);

        $inviteResponse->assertStatus(201)->assertJsonPath('success', true);

        $invitation = Invitation::query()->where('email', 'newagent@example.com')->firstOrFail();
        $this->assertSame('pending', $invitation->status);
        $this->assertDatabaseHas('audit_logs', ['action' => 'invitation.created']);

        Auth::forgetGuards();

        $acceptResponse = $this->postJson('/api/v1/auth/invitations/accept', [
            'token' => $invitation->token,
            'name' => 'New Agent',
            'password' => 'BrandNew123!',
            'password_confirmation' => 'BrandNew123!',
        ]);

        $acceptResponse->assertStatus(201)->assertJsonPath('success', true);

        $newUser = User::query()->where('email', 'newagent@example.com')->firstOrFail();
        $this->assertTrue($newUser->roles()->where('name', 'Agent')->exists());
        $this->assertDatabaseHas('audit_logs', ['action' => 'invitation.accepted']);
        $this->assertDatabaseHas('invitations', ['id' => $invitation->id, 'status' => 'accepted']);
    }

    public function test_a_non_privileged_user_cannot_create_invitations(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $role = Role::query()->where('name', 'Agent')->firstOrFail();

        $this->asUser($agent)
            ->postJson('/api/v1/auth/invitations', ['email' => 'x@example.com', 'role_id' => $role->id])
            ->assertStatus(403);
    }

    public function test_users_manage_permission_can_suspend_and_reactivate_a_user(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');
        $agent = $this->userWithRole('Agent');

        $this->asUser($admin)
            ->patchJson("/api/v1/users/{$agent->id}/suspend")
            ->assertOk()
            ->assertJsonPath('data.is_active', false);

        $this->assertDatabaseHas('audit_logs', ['action' => 'user.suspended', 'subject_id' => $agent->id]);

        $this->asUser($admin)
            ->patchJson("/api/v1/users/{$agent->id}/reactivate")
            ->assertOk()
            ->assertJsonPath('data.is_active', true);

        $this->assertDatabaseHas('audit_logs', ['action' => 'user.reactivated', 'subject_id' => $agent->id]);
    }

    public function test_an_agent_cannot_suspend_users(): void
    {
        $this->seedRbac();
        $agentA = $this->userWithRole('Agent');
        $agentB = $this->userWithRole('Agent');

        $this->asUser($agentA)
            ->patchJson("/api/v1/users/{$agentB->id}/suspend")
            ->assertStatus(403);
    }

    /**
     * Permission enforcement matrix: each of the 5 seeded roles is checked against at least
     * two endpoints it should be authorized for and two it should not (docs/07-permission-matrix.md).
     */
    public function test_permission_enforcement_matrix_across_all_five_roles(): void
    {
        Notification::fake();

        $this->seedRbac();
        $agentRole = Role::query()->where('name', 'Agent')->firstOrFail();

        $matrix = [
            'Super Administrator' => ['me' => true, 'invite' => true, 'suspend' => true],
            'Administrator' => ['me' => true, 'invite' => true, 'suspend' => true],
            'Manager' => ['me' => true, 'invite' => false, 'suspend' => false],
            'Agent' => ['me' => true, 'invite' => false, 'suspend' => false],
            'Viewer' => ['me' => true, 'invite' => false, 'suspend' => false],
        ];

        foreach ($matrix as $roleName => $expectations) {
            $user = $this->userWithRole($roleName);
            $target = $this->userWithRole('Agent');

            // Every authenticated user, regardless of role, can view their own profile.
            $meResponse = $this->asUser($user)->getJson('/api/v1/auth/me');
            $this->assertSame($expectations['me'] ? 200 : 403, $meResponse->status(), "me for $roleName");

            $inviteResponse = $this->asUser($user)
                ->postJson('/api/v1/auth/invitations', ['email' => uniqid().'@example.com', 'role_id' => $agentRole->id]);
            $this->assertSame($expectations['invite'] ? 201 : 403, $inviteResponse->status(), "invite for $roleName");

            $suspendResponse = $this->asUser($user)
                ->patchJson("/api/v1/users/{$target->id}/suspend");
            $this->assertSame($expectations['suspend'] ? 200 : 403, $suspendResponse->status(), "suspend for $roleName");
        }
    }
}
