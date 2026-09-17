<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\Scopes\WorkspaceScope;
use App\Models\WhatsappAccount;
use App\Models\Workspace;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\CreatesWorkspaceUsers;
use Tests\TestCase;

/**
 * Multi-step onboarding wizard (backend-determined state).
 *
 * State machine on workspaces.onboarding_step:
 *   account_created (signup) -> workspace_pending (Step 2)
 *     -> whatsapp_connection_pending (Step 3) -> completed (Step 4/skip)
 *
 * Connection is NEVER fabricated here: non-skip completion only honors a
 * gateway-confirmed 'connected' mirror on the active account slot; the
 * "Connect Later" (skip=true) path completes without touching the gateway.
 *
 * A NEW signup is created per test so the workspace lifecycle is exercised
 * end to end. Signup is rate-limited to 3/min per IP; tests stay under that
 * (one signup per test, fresh workspace each time).
 */
class OnboardingTest extends TestCase
{
    use CreatesWorkspaceUsers, RefreshDatabase;

    protected function signup(): User
    {
        $response = $this->postJson('/api/v1/auth/signup', [
            'name' => 'John Silva',
            'email' => 'john@company.com',
            'username' => 'john_silva',
            'password' => 'Secret123!',
            'password_confirmation' => 'Secret123!',
        ])->assertStatus(201);

        return User::query()->where('email', 'john@company.com')->firstOrFail();
    }

    protected function completeWorkspaceStep(User $user, array $overrides = []): void
    {
        $this->asUser($user)->postJson('/api/v1/auth/onboarding/workspace', array_merge([
            'workspace_name' => 'Silva Digital',
            'position' => 'Operations Director',
            'whatsapp_display_name' => 'John at Silva Digital',
        ], $overrides))->assertOk();
    }

    protected function completeWhatsappStep(User $user): int
    {
        $response = $this->asUser($user)->postJson('/api/v1/auth/onboarding/whatsapp', [
            'country' => 'Sri Lanka',
            'country_code' => '94',
            'mobile_number' => '77 123 4567',
        ])->assertOk();

        return $response->json('data.whatsapp_account.id');
    }

    /** Ask the service-layer to mirror a gateway-confirmed connection. */
    protected function markConnected(User $user, int $accountId): void
    {
        // Bypass WorkspaceScope — tests call this outside an authenticated HTTP
        // context, so the scope's resolver returns null and would add
        // WHERE workspace_id IS NULL, matching zero rows.
        WhatsappAccount::query()
            ->withoutGlobalScope(WorkspaceScope::class)
            ->whereKey($accountId)
            ->update(['is_active' => true, 'status' => 'connected']);
    }

    // ------------------------------------------------------------------
    // Username availability (public, rate-limited)
    // ------------------------------------------------------------------

    public function test_username_available_reports_true_for_free_username(): void
    {
        $this->getJson('/api/v1/auth/username-available?username=free_slot')
            ->assertOk()
            ->assertJsonPath('data.available', true)
            ->assertJsonPath('data.username', 'free_slot');
    }

    public function test_username_archive_reports_taken_and_is_case_insensitive(): void
    {
        $this->postJson('/api/v1/auth/signup', [
            'name' => 'Jane Roe',
            'email' => 'jane@company.com',
            'username' => 'jane_roe',
            'password' => 'Secret123!',
            'password_confirmation' => 'Secret123!',
        ])->assertStatus(201);

        $this->getJson('/api/v1/auth/username-available?username=Jane_ROE')
            ->assertOk()
            ->assertJsonPath('data.available', false);
    }

    public function test_username_available_rejects_invalid_username(): void
    {
        $this->getJson('/api/v1/auth/username-available?username=has%20space')
            ->assertStatus(422)
            ->assertJsonStructure(['errors' => ['username']]);
    }

    public function test_username_available_is_public_and_rate_limited(): void
    {
        for ($i = 0; $i < 30; $i++) {
            $this->getJson("/api/v1/auth/username-available?username=probe_{$i}")->assertOk();
        }

        $this->getJson('/api/v1/auth/username-available?username=over_limit')
            ->assertStatus(429);
    }

    // ------------------------------------------------------------------
    // Wizard state machine
    // ------------------------------------------------------------------

    public function test_signup_starts_at_account_created_with_no_whatsapp_slot(): void
    {
        $user = $this->signup();

        $this->assertSame('account_created', $user->workspace->onboarding_step);

        $response = $this->asUser($user)->getJson('/api/v1/auth/onboarding')->assertOk();
        $this->assertSame('account_created', $response->json('data.onboarding_step'));
        $this->assertSame('John Silva', $response->json('data.user.name'));
        $this->assertSame("John Silva's Workspace", $response->json('data.workspace.name'));
        $this->assertSame('john_silva', $response->json('data.user.username'));
    }

    public function test_onboarding_state_is_backend_scoped_and_requires_auth(): void
    {
        $this->getJson('/api/v1/auth/onboarding')->assertUnauthorized();

        $user = $this->signup();
        $other = $this->signupOther();
        $this->asUser($user)->getJson('/api/v1/auth/onboarding')
            ->assertJsonPath('data.workspace.name', "John Silva's Workspace");

        $this->asUser($other)->getJson('/api/v1/auth/onboarding')
            ->assertJsonPath('data.workspace.name', "Jane Roe's Workspace");
    }

    public function test_workspace_step_saves_metadata_and_advances_state(): void
    {
        $user = $this->signup();

        $this->completeWorkspaceStep($user);

        $workspace = Workspace::query()->findOrFail($user->workspace_id);
        $this->assertSame('Silva Digital', $workspace->name);
        $this->assertSame('silva-digital', $workspace->slug);
        $this->assertSame('John at Silva Digital', $workspace->whatsapp_display_name);
        $this->assertSame('workspace_pending', $workspace->onboarding_step);
        $this->assertSame('Operations Director', $user->fresh()->position);
    }

    public function test_workspace_step_is_idempotent_on_resume(): void
    {
        $user = $this->signup();

        $this->completeWorkspaceStep($user, ['workspace_name' => 'First Name']);
        $this->completeWorkspaceStep($user, ['workspace_name' => 'Renamed Co']);

        $this->assertSame('Renamed Co', $user->workspace->fresh()->name);
        $this->assertSame('renamed-co', $user->workspace->fresh()->slug);
    }

    public function test_workspace_step_validates_required_fields(): void
    {
        $user = $this->signup();

        $this->asUser($user)->postJson('/api/v1/auth/onboarding/workspace', [
            'workspace_name' => '',
            'position' => '',
            'whatsapp_display_name' => '',
        ])->assertStatus(422)
            ->assertJsonStructure(['errors' => ['workspace_name', 'position', 'whatsapp_display_name']]);
    }

    public function test_whatsapp_step_normalizes_number_creates_slot_and_advances_state(): void
    {
        $user = $this->signup();
        $this->completeWorkspaceStep($user);

        $accountId = $this->completeWhatsappStep($user);

        $workspace = Workspace::query()->findOrFail($user->workspace_id);
        $this->assertSame('+94771234567', $workspace->whatsapp_number);
        $this->assertSame('whatsapp_connection_pending', $workspace->onboarding_step);

        $slot = WhatsappAccount::query()->findOrFail($accountId);
        $this->assertSame($workspace->id, $slot->workspace_id);
        $this->assertSame('John at Silva Digital', $slot->name);
        $this->assertSame('94771234567', $slot->phone_number);
        $this->assertSame('disconnected', $slot->status);
        $this->assertFalse($slot->is_active);
        $this->assertSame('baileys', $slot->provider);
        $this->assertSame($user->id, $slot->created_by);
    }

    public function test_whatsapp_step_is_idempotent_and_does_not_duplicate_slots(): void
    {
        $user = $this->signup();
        $this->completeWorkspaceStep($user);

        $first = $this->completeWhatsappStep($user);
        $second = $this->completeWhatsappStep($user);

        $this->assertSame($first, $second);
        $this->assertSame(1, WhatsappAccount::query()->where('workspace_id', $user->workspace_id)->count());
    }

    public function test_whatsapp_step_validates_country_and_number(): void
    {
        $user = $this->signup();
        $this->completeWorkspaceStep($user);

        $this->asUser($user)->postJson('/api/v1/auth/onboarding/whatsapp', [
            'country' => '',
            'country_code' => '',
            'mobile_number' => '',
        ])->assertStatus(422)
            ->assertJsonStructure(['errors' => ['country', 'country_code', 'mobile_number']]);

        $this->asUser($user)->postJson('/api/v1/auth/onboarding/whatsapp', [
            'country' => 'Narnia',
            'country_code' => 'not-a-code',
            'mobile_number' => 'abc',
        ])->assertStatus(422);
    }

    public function test_complete_does_not_advance_without_real_connection(): void
    {
        $user = $this->signup();
        $this->completeWorkspaceStep($user);
        $this->completeWhatsappStep($user);

        $this->asUser($user)->postJson('/api/v1/auth/onboarding/complete', ['skip' => false])
            ->assertStatus(409);

        $this->assertSame('whatsapp_connection_pending', $user->workspace->fresh()->onboarding_step);
    }

    public function test_complete_honors_gateway_confirmed_connection(): void
    {
        $user = $this->signup();
        $this->completeWorkspaceStep($user);
        $accountId = $this->completeWhatsappStep($user);
        $this->markConnected($user, $accountId);

        $this->asUser($user)->postJson('/api/v1/auth/onboarding/complete', ['skip' => false])
            ->assertOk()
            ->assertJsonPath('data.onboarding_step', 'completed');

        $this->assertDatabaseHas('workspaces', ['id' => $user->workspace_id, 'onboarding_step' => 'completed']);

        // /auth/me surfaces the completed state too.
        $this->asUser($user)->getJson('/api/v1/auth/me')
            ->assertOk()
            ->assertJsonPath('data.onboarding_step', 'completed')
            ->assertJsonPath('data.username', 'john_silva')
            ->assertJsonPath('data.position', 'Operations Director');
    }

    public function test_complete_with_skip_leaves_account_honestly_disconnected(): void
    {
        $user = $this->signup();
        $this->completeWorkspaceStep($user);
        $accountId = $this->completeWhatsappStep($user);

        $this->asUser($user)->postJson('/api/v1/auth/onboarding/complete', ['skip' => true])
            ->assertOk()
            ->assertJsonPath('data.onboarding_step', 'completed');

        // The account stays disconnected/inactive - nothing was fabricated.
        $slot = WhatsappAccount::query()->findOrFail($accountId);
        $this->assertSame('disconnected', $slot->status);
        $this->assertFalse($slot->is_active);
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    protected function signupOther(): User
    {
        $this->postJson('/api/v1/auth/signup', [
            'name' => 'Jane Roe',
            'email' => 'jane@company.com',
            'username' => 'jane_roe',
            'password' => 'Secret123!',
            'password_confirmation' => 'Secret123!',
        ])->assertStatus(201);

        return User::query()->where('email', 'jane@company.com')->firstOrFail();
    }
}