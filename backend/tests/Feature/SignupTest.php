<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\CreatesWorkspaceUsers;
use Tests\TestCase;

/**
 * Self-service registration (onboarding Step 1): workspace + Owner role
 * creation, username/email normalization and uniqueness, RBAC safety (never
 * Super Administrator), owner protection, and session token expiry. The
 * WhatsApp number is intentionally NOT part of signup anymore - it is
 * collected later in the onboarding wizard (see OnboardingTest).
 */
class SignupTest extends TestCase
{
    use CreatesWorkspaceUsers, RefreshDatabase;

    protected function signupPayload(array $overrides = []): array
    {
        return array_merge([
            'name' => 'John Silva',
            'email' => 'john@company.com',
            'username' => 'john_silva',
            'password' => 'Secret123!',
            'password_confirmation' => 'Secret123!',
        ], $overrides);
    }

    public function test_signup_creates_workspace_and_assigns_owner_role(): void
    {
        $response = $this->postJson('/api/v1/auth/signup', $this->signupPayload());

        $response->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonStructure(['data' => ['token', 'access_token', 'user' => ['id', 'email', 'username', 'roles', 'role_keys', 'permissions'], 'workspace' => ['id', 'name']]])
            ->assertJsonPath('data.workspace.name', "John Silva's Workspace");

        $user = User::query()->where('email', 'john@company.com')->firstOrFail();
        $this->assertTrue(Hash::check('Secret123!', $user->password));
        $this->assertTrue($user->roles()->where('name', 'Owner')->exists());
        $this->assertFalse($user->roles()->where('name', 'Super Administrator')->exists());
        $this->assertSame(['user'], $user->roleKeys());
        $this->assertFalse($user->isSuperAdmin());

        // A fresh workspace got its full system-role tree seeded.
        $workspace = Workspace::query()->findOrFail($user->workspace_id);
        $this->assertSame(6, Role::query()->where('workspace_id', $workspace->id)->where('is_system', true)->count());
        $this->assertDatabaseHas('workspace_settings', ['workspace_id' => $workspace->id]);
        $this->assertDatabaseHas('audit_logs', ['action' => 'auth.signup', 'user_id' => $user->id]);

        // The Owner holds the full permission catalog (full control of their workspace).
        $this->assertContains('roles.manage', $response->json('data.user.permissions'));
        $this->assertContains('workspace.settings.manage', $response->json('data.user.permissions'));
        $this->assertContains('contacts.delete', $response->json('data.user.permissions'));

        // Signup is Step 1 only: username stored, onboarding starts at 'account_created',
        // and NO whatsapp_accounts slot exists yet (it is provisioned at Step 4).
        $this->assertSame('john_silva', $user->username);
        $this->assertSame('account_created', $response->json('data.user.onboarding_step'));
        $this->assertDatabaseMissing('whatsapp_connections', ['workspace_id' => $workspace->id]);
    }

    public function test_signup_normalizes_email_case_and_whitespace(): void
    {
        $this->postJson('/api/v1/auth/signup', $this->signupPayload([
            'email' => '  JOHN@Company.COM  ',
        ]))->assertStatus(201);

        $this->assertDatabaseHas('users', ['email' => 'john@company.com']);
    }

    public function test_signup_normalizes_username_case(): void
    {
        $this->postJson('/api/v1/auth/signup', $this->signupPayload([
            'username' => 'JOHN_SILVA ',
        ]))->assertStatus(201);

        $this->assertDatabaseHas('users', ['username' => 'john_silva']);
    }

    public function test_signup_rejects_duplicate_email_even_across_workspaces(): void
    {
        $this->seedRbac();
        User::query()->create([
            'workspace_id' => Workspace::query()->firstOrFail()->id,
            'name' => 'Existing',
            'email' => 'taken@example.com',
            'password' => Hash::make('Secret123!'),
        ]);

        $this->postJson('/api/v1/auth/signup', $this->signupPayload(['email' => 'taken@example.com']))
            ->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonStructure(['errors' => ['email']]);

        // No second workspace was created for the failed attempt.
        $this->assertSame(1, Workspace::query()->count());
    }

    public function test_signup_rejects_duplicate_username(): void
    {
        $this->postJson('/api/v1/auth/signup', $this->signupPayload())->assertStatus(201);

        $this->postJson('/api/v1/auth/signup', $this->signupPayload([
            'email' => 'second@company.com',
            'username' => 'john_silva',
        ]))->assertStatus(422)
            ->assertJsonStructure(['errors' => ['username']]);
    }

    public function test_signup_requires_valid_username(): void
    {
        // Missing, too short, and invalid characters are all rejected.
        $this->postJson('/api/v1/auth/signup', $this->signupPayload([
            'email' => 'a@example.com',
            'username' => '',
        ]))->assertStatus(422)
            ->assertJsonStructure(['errors' => ['username']]);

        $this->postJson('/api/v1/auth/signup', $this->signupPayload([
            'email' => 'b@example.com',
            'username' => 'ab',
        ]))->assertStatus(422)
            ->assertJsonStructure(['errors' => ['username']]);

        $this->postJson('/api/v1/auth/signup', $this->signupPayload([
            'email' => 'c@example.com',
            'username' => 'has space',
        ]))->assertStatus(422)
            ->assertJsonStructure(['errors' => ['username']]);

        // A 4th request would hit the 3/min IP rate limit; dash rejection is
        // covered by the regex rule above — no need to test it separately.
    }

    public function test_signup_rejects_invalid_email_short_password_and_mismatched_confirmation(): void
    {
        $this->postJson('/api/v1/auth/signup', $this->signupPayload(['email' => 'not-an-email']))
            ->assertStatus(422)
            ->assertJsonStructure(['errors' => ['email']]);

        $this->postJson('/api/v1/auth/signup', $this->signupPayload([
            'email' => 'short@example.com',
            'password' => 'short',
            'password_confirmation' => 'Different123!',
            'name' => '  ',
        ]))->assertStatus(422)
            ->assertJsonStructure(['errors']);
    }

    public function test_owner_can_manage_roles_and_customers_in_their_own_workspace(): void
    {
        $this->postJson('/api/v1/auth/signup', $this->signupPayload())->assertStatus(201);
        $owner = User::query()->where('email', 'john@company.com')->firstOrFail();

        // Owner can create a custom role (roles.manage).
        $createRole = $this->asUser($owner)->postJson('/api/v1/roles', [
            'name' => 'Support Supervisor',
            'description' => 'Can manage support conversations and agents.',
            'permissions' => ['contacts.view', 'conversations.reply'],
        ]);
        $createRole->assertStatus(201)->assertJsonPath('data.name', 'Support Supervisor');

        // Owner can create a contact.
        $this->asUser($owner)->postJson('/api/v1/contacts', [
            'full_name' => 'Customer One',
            'email' => 'customer1@example.com',
        ])->assertStatus(201);
    }

    public function test_agent_still_gets_403_for_protected_endpoints(): void
    {
        $this->postJson('/api/v1/auth/signup', $this->signupPayload())->assertStatus(201);
        $owner = User::query()->where('email', 'john@company.com')->firstOrFail();

        // Signup the Agent role into the SAME signup workspace (via RolePermissionSeeder).
        $agentRole = Role::query()->where('name', 'Agent')->first();
        $agent = User::query()->create([
            'workspace_id' => $owner->workspace_id,
            'name' => 'Agent One',
            'email' => 'agent1@company.com',
            'password' => Hash::make('Secret123!'),
            'is_active' => true,
        ]);
        $agent->roles()->attach($agentRole);

        // Agent manually calls the DELETE contacts endpoint (has no contacts.delete).
        $contact = $this->asUser($owner)->postJson('/api/v1/contacts', [
            'full_name' => 'Target',
            'email' => 'target@example.com',
        ])->json('data.contact');

        $this->asUser($agent)->deleteJson("/api/v1/contacts/{$contact['id']}")
            ->assertStatus(403);

        // Agent cannot create roles either.
        $this->asUser($agent)->postJson('/api/v1/roles', [
            'name' => 'Rogue Role',
            'permissions' => [],
        ])->assertStatus(403);
    }

    public function test_signup_is_rate_limited(): void
    {
        for ($i = 0; $i < 3; $i++) {
            $this->postJson('/api/v1/auth/signup', $this->signupPayload([
                'email' => "rate{$i}@example.com",
                'username' => "rate_limiter{$i}",
            ]))->assertStatus(201);
        }

        // Rate limiter keys by IP only; the 4th request exceeds 3/min.
        $this->postJson('/api/v1/auth/signup', $this->signupPayload([
            'email' => 'rate4@example.com',
            'username' => 'rate_limiter4',
        ]))->assertStatus(429);
    }

    public function test_whatsapp_number_is_no_longer_accepted_at_signup(): void
    {
        // The WhatsApp number moved to onboarding Step 4; it is simply ignored
        // at signup (no 422 raised) and the slot is created later by the wizard.
        $response = $this->postJson('/api/v1/auth/signup', $this->signupPayload([
            'whatsapp_number' => '+94771234567',
        ]))->assertStatus(201);

        $workspace = Workspace::query()->firstOrFail();
        $this->assertNull($workspace->whatsapp_number);
        $this->assertDatabaseMissing('whatsapp_connections', ['workspace_id' => $workspace->id]);
        $this->assertSame('account_created', $response->json('data.user.onboarding_step'));
    }

    public function test_login_remember_me_controls_token_expiry(): void
    {
        $this->postJson('/api/v1/auth/signup', $this->signupPayload())->assertStatus(201);
        $user = User::query()->where('email', 'john@company.com')->firstOrFail();

        $this->postJson('/api/v1/auth/login', [
            'email' => 'john@company.com',
            'password' => 'Secret123!',
        ])->assertOk();

        $this->postJson('/api/v1/auth/login', [
            'email' => 'john@company.com',
            'password' => 'Secret123!',
            'remember_me' => true,
        ])->assertOk();

        $expiries = $user->tokens()->pluck('expires_at');
        $this->assertSame(3, $expiries->count());

        $this->assertTrue($user->tokens()->first()->expires_at->between(
            now()->addHours(7),
            now()->addHours(9)
        ), 'default session token should expire after ~8 hours');

        $this->assertTrue($user->tokens()->latest('id')->first()->expires_at->between(
            now()->addDays(29),
            now()->addDays(31)
        ), 'remember-me token should expire after ~30 days');
    }
}