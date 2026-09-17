<?php

namespace Tests\Feature;

use App\Models\Team;
use App\Models\WhatsappAccount;
use App\Models\Workspace;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\CreatesWorkspaceUsers;
use Tests\TestCase;

class WhatsappAccountTest extends TestCase
{
    use CreatesWorkspaceUsers, RefreshDatabase;

    // ------------------------------------------------------------------
    // Permissions
    // ------------------------------------------------------------------

    public function test_agent_cannot_create_whatsapp_account(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');

        $this->asUser($agent)->postJson('/api/v1/whatsapp/accounts', [
            'name' => 'Customer Support',
        ])->assertForbidden();

        $this->assertDatabaseCount('whatsapp_connections', 0);
    }

    public function test_agent_cannot_list_whatsapp_accounts(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');

        $this->asUser($agent)->getJson('/api/v1/whatsapp/accounts')->assertForbidden();
    }

    // ------------------------------------------------------------------
    // Create + validation
    // ------------------------------------------------------------------

    public function test_administrator_can_create_account_and_it_starts_disconnected(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');

        $response = $this->asUser($admin)->postJson('/api/v1/whatsapp/accounts', [
            'name' => 'Customer Support',
            'mobileNumber' => '94771234567',
            'autoReplyEnabled' => false,
            'routingMode' => 'default',
        ])->assertCreated();

        $response->assertJsonPath('data.name', 'Customer Support');
        $response->assertJsonPath('data.status', 'disconnected');
        $response->assertJsonPath('data.is_active', false);
        // The intended number is stored, but the account is NOT reported
        // connected - only a real gateway pairing flips the status.
        $response->assertJsonPath('data.phone_number', '94771234567');
        $response->assertJsonPath('data.session_status', 'disconnected');

        $this->assertDatabaseHas('whatsapp_connections', [
            'workspace_id' => $admin->workspace_id,
            'name' => 'Customer Support',
            'status' => 'disconnected',
            'is_active' => false,
        ]);
    }

    public function test_create_auto_generates_name_when_not_provided(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');

        $response = $this->asUser($admin)->postJson('/api/v1/whatsapp/accounts', [])->assertCreated();

        // Name should be auto-generated
        $response->assertJsonPath('data.status', 'disconnected');
        $response->assertJsonPath('data.is_active', false);
        $this->assertDatabaseCount('whatsapp_connections', 1);
    }

    public function test_create_rejects_short_name(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');

        $this->asUser($admin)->postJson('/api/v1/whatsapp/accounts', [
            'name' => 'A',
        ])->assertStatus(422);
    }

    public function test_create_rejects_invalid_routing_mode(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');

        $this->asUser($admin)->postJson('/api/v1/whatsapp/accounts', [
            'name' => 'Customer Support',
            'routingMode' => 'telepathy',
        ])->assertStatus(422);
    }

    public function test_create_rejects_team_from_another_workspace(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');
        $otherWorkspace = Workspace::factory()->create();
        $foreignTeam = Team::create(['workspace_id' => $otherWorkspace->id, 'name' => 'Foreign Team']);

        $this->asUser($admin)->postJson('/api/v1/whatsapp/accounts', [
            'name' => 'Customer Support',
            'assignedTeamId' => $foreignTeam->id,
        ])->assertStatus(422);
    }

    public function test_create_rejects_duplicate_name_case_insensitively(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');

        WhatsappAccount::factory()->create([
            'workspace_id' => $admin->workspace_id,
            'name' => 'Customer Support',
        ]);

        $response = $this->asUser($admin)->postJson('/api/v1/whatsapp/accounts', [
            'name' => 'customer support',
        ])->assertStatus(409);

        $response->assertJsonPath('message', 'An account with this name already exists in this workspace.');
    }

    public function test_workspace_id_from_client_is_ignored(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');

        $this->asUser($admin)->postJson('/api/v1/whatsapp/accounts', [
            'name' => 'Customer Support',
            'mobileNumber' => '94771234567',
            'workspace_id' => 999999,
        ])->assertCreated();

        $this->assertDatabaseMissing('whatsapp_connections', ['workspace_id' => 999999]);
    }

    // ------------------------------------------------------------------
    // Workspace isolation
    // ------------------------------------------------------------------

    public function test_user_cannot_read_update_or_delete_another_workspaces_account(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');
        $otherWorkspace = Workspace::factory()->create();
        $foreign = WhatsappAccount::factory()->create(['workspace_id' => $otherWorkspace->id]);

        $this->asUser($admin)->getJson("/api/v1/whatsapp/accounts/{$foreign->id}")->assertNotFound();
        $this->asUser($admin)->patchJson("/api/v1/whatsapp/accounts/{$foreign->id}", [
            'name' => 'Hijacked',
        ])->assertNotFound();
        $this->asUser($admin)->deleteJson("/api/v1/whatsapp/accounts/{$foreign->id}")->assertNotFound();

        // And it never appears in the list either.
        $list = $this->asUser($admin)->getJson('/api/v1/whatsapp/accounts')->assertOk();
        $list->assertJsonMissing(['name' => $foreign->name]);
    }

    public function test_foreign_account_cannot_be_connected(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');
        $otherWorkspace = Workspace::factory()->create();
        $foreign = WhatsappAccount::factory()->create(['workspace_id' => $otherWorkspace->id]);

        $this->asUser($admin)->postJson("/api/v1/whatsapp/accounts/{$foreign->id}/connect")->assertNotFound();
    }

    // ------------------------------------------------------------------
    // Index payload
    // ------------------------------------------------------------------

    public function test_index_returns_workspace_accounts_with_team(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');
        $team = Team::create(['workspace_id' => $admin->workspace_id, 'name' => 'Support Team']);

        WhatsappAccount::factory()->create([
            'workspace_id' => $admin->workspace_id,
            'name' => 'Customer Support',
            'assigned_team_id' => $team->id,
        ]);

        $response = $this->asUser($admin)->getJson('/api/v1/whatsapp/accounts')->assertOk();

        $response->assertJsonPath('data.0.name', 'Customer Support');
        $response->assertJsonPath('data.0.assigned_team.name', 'Support Team');
        $response->assertJsonPath('data.0.status', 'disconnected');
    }

    // ------------------------------------------------------------------
    // Update / delete
    // ------------------------------------------------------------------

    public function test_administrator_can_update_account(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');
        $account = WhatsappAccount::factory()->create(['workspace_id' => $admin->workspace_id]);

        $response = $this->asUser($admin)->patchJson("/api/v1/whatsapp/accounts/{$account->id}", [
            'name' => 'Sales WhatsApp',
            'autoReplyEnabled' => true,
            'routingMode' => 'team_only',
        ])->assertOk();

        $response->assertJsonPath('data.name', 'Sales WhatsApp');
        $response->assertJsonPath('data.auto_reply_enabled', true);

        $this->assertDatabaseHas('whatsapp_connections', [
            'id' => $account->id,
            'name' => 'Sales WhatsApp',
            'auto_reply_enabled' => true,
            'routing_mode' => 'team_only',
        ]);
    }

    public function test_update_enforces_duplicate_name(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');
        $account = WhatsappAccount::factory()->create(['workspace_id' => $admin->workspace_id, 'name' => 'First']);
        WhatsappAccount::factory()->create(['workspace_id' => $admin->workspace_id, 'name' => 'Second']);

        $this->asUser($admin)->patchJson("/api/v1/whatsapp/accounts/{$account->id}", [
            'name' => 'second',
        ])->assertStatus(409);
    }

    public function test_administrator_can_delete_disconnected_account(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');
        $account = WhatsappAccount::factory()->create([
            'workspace_id' => $admin->workspace_id,
            'status' => 'disconnected',
        ]);

        $this->asUser($admin)->deleteJson("/api/v1/whatsapp/accounts/{$account->id}")->assertOk();

        $this->assertDatabaseMissing('whatsapp_connections', ['id' => $account->id]);
    }

    // ------------------------------------------------------------------
    // Gateway-backed actions (HTTP faked like WhatsappConnectionTest)
    // ------------------------------------------------------------------

    public function test_connect_returns_qr_snapshot_without_changing_active_flag(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');
        $account = WhatsappAccount::factory()->create([
            'workspace_id' => $admin->workspace_id,
            'status' => 'disconnected',
            'is_active' => false,
        ]);

        Http::fake([
            '*/internal/whatsapp/connect' => Http::response([
                'success' => true,
                'message' => 'QR pairing initiated',
                'data' => [
                    'workspaceId' => $admin->workspace_id,
                    'status' => 'qr_pending',
                    'qrCode' => 'data:image/png;base64,AAAA',
                    'qrExpiresAt' => now()->addMinute()->toIso8601String(),
                    'phoneNumber' => null,
                ],
            ]),
            '*internal/whatsapp/status*' => Http::response([
                'success' => true,
                'message' => 'OK',
                'data' => ['status' => 'qr_pending', 'qrCode' => null, 'qrExpiresAt' => null, 'phoneNumber' => null],
            ]),
        ]);

        $response = $this->asUser($admin)->postJson("/api/v1/whatsapp/accounts/{$account->id}/connect")->assertOk();

        $response->assertJsonPath('data.status', 'qr_pending');
        $response->assertJsonPath('data.qrCode', 'data:image/png;base64,AAAA');
        // Connect is per-account: it targets the account's own gateway session
        // and never touches is_active (a routing preference, not a lock).
        $this->assertDatabaseHas('whatsapp_connections', [
            'id' => $account->id,
            'is_active' => false,
        ]);
        Http::assertSent(fn ($request) => str_contains($request->url(), '/internal/whatsapp/connect')
            && $request['accountId'] == $account->id);
    }

    public function test_set_active_marks_target_routing_without_disconnecting(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');

        $first = WhatsappAccount::factory()->create([
            'workspace_id' => $admin->workspace_id,
            'status' => 'connected',
            'is_active' => true,
        ]);
        $other = WhatsappAccount::factory()->create([
            'workspace_id' => $admin->workspace_id,
            'status' => 'disconnected',
            'is_active' => false,
        ]);

        // Concurrency: every account runs its own session, so "set active"
        // is pure bookkeeping - no 409, no gateway disconnect.
        $this->asUser($admin)->postJson("/api/v1/whatsapp/accounts/{$other->id}/set-active")->assertOk();

        $this->assertDatabaseHas('whatsapp_connections', ['id' => $first->id, 'is_active' => false]);
        $this->assertDatabaseHas('whatsapp_connections', ['id' => $other->id, 'is_active' => true]);
        Http::assertNothingSent();
    }

    public function test_set_active_force_has_no_gateway_side_effects(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');

        $connected = WhatsappAccount::factory()->create([
            'workspace_id' => $admin->workspace_id,
            'status' => 'connected',
            'is_active' => true,
        ]);
        $other = WhatsappAccount::factory()->create([
            'workspace_id' => $admin->workspace_id,
            'status' => 'disconnected',
            'is_active' => false,
        ]);

        $this->asUser($admin)->postJson("/api/v1/whatsapp/accounts/{$other->id}/set-active-force")->assertOk();

        $this->assertDatabaseHas('whatsapp_connections', ['id' => $other->id, 'is_active' => true]);
        $this->assertDatabaseHas('whatsapp_connections', ['id' => $connected->id, 'is_active' => false]);
        Http::assertNothingSent();
    }

    public function test_qr_works_for_any_account_including_inactive(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');
        $slot = WhatsappAccount::factory()->create([
            'workspace_id' => $admin->workspace_id,
            'is_active' => false,
        ]);

        Http::fake([
            '*internal/whatsapp/status*' => Http::response([
                'success' => true, 'message' => 'OK',
                'data' => [
                    'status' => 'qr_pending',
                    'qrCode' => 'data:image/png;base64,BBBB',
                    'qrExpiresAt' => now()->addMinute()->toIso8601String(),
                    'phoneNumber' => null,
                ],
            ]),
        ]);

        $response = $this->asUser($admin)->postJson("/api/v1/whatsapp/accounts/{$slot->id}/qr")->assertOk();
        $response->assertJsonPath('data.qrCode', 'data:image/png;base64,BBBB');
    }

    // ------------------------------------------------------------------
    // Connection status (real Baileys device linking)
    // ------------------------------------------------------------------

    public function test_create_accepts_mobile_number_and_stores_normalized_digits(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');

        $response = $this->asUser($admin)->postJson('/api/v1/whatsapp/accounts', [
            'name' => 'Customer Support',
            'mobileNumber' => '+94 77 123 4567',
        ])->assertCreated();

        // Local-format input (trunk-zero style spacing) normalizes to bare
        // E.164 digits; the account is still created DISCONNECTED.
        $response->assertJsonPath('data.phone_number', '94771234567');
        $response->assertJsonPath('data.status', 'disconnected');
    }

    public function test_connection_status_works_for_any_account(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');
        $slot = WhatsappAccount::factory()->create([
            'workspace_id' => $admin->workspace_id,
            'is_active' => false,
        ]);

        Http::fake([
            '*internal/whatsapp/status*' => Http::response([
                'success' => true, 'message' => 'OK',
                'data' => [
                    'status' => 'connected',
                    'qrCode' => null,
                    'qrExpiresAt' => null,
                    'phoneNumber' => '94771234567',
                    'pairingCode' => null,
                    'pairingCodeExpiresAt' => null,
                ],
            ]),
        ]);

        $this->asUser($admin)->getJson("/api/v1/whatsapp/accounts/{$slot->id}/connection-status")
            ->assertOk()
            ->assertJsonPath('data.status', 'connected')
            ->assertJsonPath('data.connected', true);
    }

    public function test_connection_status_returns_gateway_snapshot_with_connected_flag(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');
        $account = WhatsappAccount::factory()->create([
            'workspace_id' => $admin->workspace_id,
            'is_active' => true,
            'phone_number' => '94771234567',
        ]);

        Http::fake([
            '*internal/whatsapp/status*' => Http::response([
                'success' => true, 'message' => 'OK',
                'data' => [
                    'status' => 'connected',
                    'qrCode' => null,
                    'qrExpiresAt' => null,
                    'phoneNumber' => '94771234567',
                    'pairingCode' => null,
                    'pairingCodeExpiresAt' => null,
                ],
            ]),
        ]);

        $response = $this->asUser($admin)->getJson("/api/v1/whatsapp/accounts/{$account->id}/connection-status")
            ->assertOk();

        $response->assertJsonPath('data.status', 'connected');
        $response->assertJsonPath('data.connected', true);
        $response->assertJsonPath('data.phoneNumber', '94771234567');
    }

    public function test_reconnect_works_for_any_account(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');
        $slot = WhatsappAccount::factory()->create([
            'workspace_id' => $admin->workspace_id,
            'is_active' => false,
        ]);

        Http::fake([
            '*/internal/whatsapp/reconnect' => Http::response([
                'success' => true, 'message' => 'Reconnected',
                'data' => ['status' => 'connecting', 'qrCode' => null, 'qrExpiresAt' => null, 'phoneNumber' => null],
            ]),
        ]);

        $this->asUser($admin)->postJson("/api/v1/whatsapp/accounts/{$slot->id}/reconnect")->assertOk()
            ->assertJsonPath('data.status', 'connecting');
    }

    public function test_delete_active_account_logs_gateway_session_out(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');
        $account = WhatsappAccount::factory()->create([
            'workspace_id' => $admin->workspace_id,
            'is_active' => true,
            'status' => 'connected',
        ]);

        Http::fake([
            '*/internal/whatsapp/logout' => Http::response([
                'success' => true, 'message' => 'Logged out',
                'data' => ['status' => 'auth_required', 'qrCode' => null, 'qrExpiresAt' => null, 'phoneNumber' => null],
            ]),
        ]);

        $this->asUser($admin)->deleteJson("/api/v1/whatsapp/accounts/{$account->id}")->assertOk();

        Http::assertSent(fn ($request) => str_contains($request->url(), '/internal/whatsapp/logout'));
        $this->assertDatabaseMissing('whatsapp_connections', ['id' => $account->id]);
    }
}
