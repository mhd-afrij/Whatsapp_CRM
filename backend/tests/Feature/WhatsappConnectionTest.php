<?php

namespace Tests\Feature;

use App\Models\Contact;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\CreatesWorkspaceUsers;
use Tests\TestCase;

class WhatsappConnectionTest extends TestCase
{
    use CreatesWorkspaceUsers, RefreshDatabase;

    public function test_agent_without_permission_is_forbidden_from_status(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');

        $this->asUser($agent)->getJson('/api/v1/whatsapp/status')
            ->assertStatus(403)
            ->assertJsonPath('success', false);
    }

    public function test_admin_can_fetch_status_and_it_proxies_the_gateway(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');

        Http::fake([
            '*/internal/whatsapp/status' => Http::response([
                'success' => true,
                'message' => 'OK',
                'data' => ['workspaceId' => 1, 'status' => 'connected', 'qrCode' => null, 'qrExpiresAt' => null, 'phoneNumber' => '15551234567'],
            ], 200),
        ]);

        $this->asUser($admin)->getJson('/api/v1/whatsapp/status')
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'connected')
            ->assertJsonPath('data.phoneNumber', '15551234567');

        Http::assertSent(fn ($request) => str_contains($request->url(), '/internal/whatsapp/status')
            && $request->hasHeader('X-Internal-Gateway-Token'));
    }

    public function test_admin_can_fetch_qr_from_gateway_status(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');

        Http::fake([
            '*/internal/whatsapp/status' => Http::response([
                'success' => true,
                'message' => 'OK',
                'data' => ['status' => 'qr_pending', 'qrCode' => 'data:image/png;base64,abc', 'qrExpiresAt' => '2026-07-31T10:01:00Z'],
            ], 200),
        ]);

        $this->asUser($admin)->getJson('/api/v1/whatsapp/qr')
            ->assertOk()
            ->assertJsonPath('data.qrCode', 'data:image/png;base64,abc');
    }

    public function test_connect_proxies_gateway_and_writes_audit_log(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');

        Http::fake([
            '*/internal/whatsapp/connect' => Http::response([
                'success' => true,
                'message' => 'QR pairing initiated',
                'data' => ['status' => 'connecting'],
            ], 200),
        ]);

        $this->asUser($admin)->postJson('/api/v1/whatsapp/connect')
            ->assertOk()
            ->assertJsonPath('data.status', 'connecting');

        $this->assertDatabaseHas('audit_logs', ['action' => 'whatsapp.connect', 'user_id' => $admin->id]);
    }

    public function test_disconnect_proxies_gateway_and_writes_audit_log(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');

        Http::fake([
            '*/internal/whatsapp/disconnect' => Http::response([
                'success' => true,
                'message' => 'Disconnected',
                'data' => ['status' => 'disconnected'],
            ], 200),
        ]);

        $this->asUser($admin)->postJson('/api/v1/whatsapp/disconnect')
            ->assertOk()
            ->assertJsonPath('data.status', 'disconnected');

        $this->assertDatabaseHas('audit_logs', ['action' => 'whatsapp.disconnect', 'user_id' => $admin->id]);
    }

    public function test_logout_proxies_gateway_and_writes_audit_log(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');

        Http::fake([
            '*/internal/whatsapp/logout' => Http::response([
                'success' => true,
                'message' => 'Logged out; re-authentication required',
                'data' => ['status' => 'auth_required'],
            ], 200),
        ]);

        $this->asUser($admin)->postJson('/api/v1/whatsapp/logout')
            ->assertOk()
            ->assertJsonPath('data.status', 'auth_required');

        $this->assertDatabaseHas('audit_logs', ['action' => 'whatsapp.logout', 'user_id' => $admin->id]);
    }

    public function test_reconnect_proxies_gateway_and_writes_audit_log(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');

        Http::fake([
            '*/internal/whatsapp/reconnect' => Http::response([
                'success' => true,
                'message' => 'Reconnection initiated',
                'data' => ['status' => 'reconnecting'],
            ], 200),
        ]);

        $this->asUser($admin)->postJson('/api/v1/whatsapp/reconnect')
            ->assertOk()
            ->assertJsonPath('data.status', 'reconnecting');

        $this->assertDatabaseHas('audit_logs', ['action' => 'whatsapp.reconnect', 'user_id' => $admin->id]);
    }

    public function test_agent_without_permission_is_forbidden_from_reset_data(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');

        $this->asUser($agent)->postJson('/api/v1/whatsapp/reset-data')
            ->assertStatus(403)
            ->assertJsonPath('success', false);
    }

    public function test_reset_data_proxies_gateway_archives_linked_contacts_and_writes_audit_log(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');

        // whatsapp_contacts is gateway-owned (ReadOnlyFromBackend); insert the
        // fixture via the query builder to bypass that guard in tests.
        $waContactId = DB::table('whatsapp_contacts')->insertGetId([
            'workspace_id' => $admin->workspace_id,
            'wa_jid' => '15551234567@s.whatsapp.net',
            'phone_number' => '15551234567',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $linkedContact = Contact::create([
            'workspace_id' => $admin->workspace_id,
            'whatsapp_contact_id' => $waContactId,
            'full_name' => 'Linked from WhatsApp',
        ]);
        $manualContact = Contact::create([
            'workspace_id' => $admin->workspace_id,
            'full_name' => 'Manually created',
        ]);

        Http::fake([
            '*/internal/whatsapp/reset-data' => Http::response([
                'success' => true,
                'message' => 'WhatsApp data cleared and session logged out',
                'data' => [
                    'conversations' => 4,
                    'messages' => 50,
                    'whatsappContacts' => 1,
                    'dispatches' => 0,
                    'processingFailures' => 0,
                    'checkpoints' => 0,
                    'session' => ['status' => 'auth_required'],
                ],
            ], 200),
        ]);

        $this->asUser($admin)->postJson('/api/v1/whatsapp/reset-data')
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.conversations', 4)
            ->assertJsonPath('data.messages', 50)
            ->assertJsonPath('data.archivedContacts', 1);

        Http::assertSent(fn ($request) => str_contains($request->url(), '/internal/whatsapp/reset-data')
            && $request['workspaceId'] === $admin->workspace_id);

        // Linked contact archived; manually created contact untouched.
        $this->assertSoftDeleted('contacts', ['id' => $linkedContact->id]);
        $this->assertDatabaseHas('contacts', ['id' => $manualContact->id, 'deleted_at' => null]);

        $this->assertDatabaseHas('audit_logs', [
            'action' => 'whatsapp.data_cleared',
            'user_id' => $admin->id,
        ]);
    }

    public function test_reset_data_gateway_unreachable_returns_502(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');

        Http::fake([
            '*/internal/whatsapp/reset-data' => Http::response(null, 500),
        ]);

        $this->asUser($admin)->postJson('/api/v1/whatsapp/reset-data')
            ->assertStatus(502)
            ->assertJsonPath('success', false);
    }

    public function test_gateway_unreachable_returns_502(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');

        Http::fake([
            '*/internal/whatsapp/status' => Http::response(null, 500),
        ]);

        $this->asUser($admin)->getJson('/api/v1/whatsapp/status')
            ->assertStatus(502)
            ->assertJsonPath('success', false);
    }

    public function test_connection_history_reads_from_database_scoped_to_workspace(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');

        // whatsapp_sessions / whatsapp_connection_events are gateway-owned and
        // read-only from Eloquent (ReadOnlyFromBackend); insert fixture rows
        // directly via the query builder to bypass that guard in tests.
        $sessionId = DB::table('whatsapp_sessions')->insertGetId([
            'workspace_id' => $admin->workspace_id,
            'status' => 'connected',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('whatsapp_connection_events')->insert([
            'workspace_id' => $admin->workspace_id,
            'whatsapp_session_id' => $sessionId,
            'event_type' => 'connected',
            'metadata' => json_encode(['foo' => 'bar']),
            'occurred_at' => now(),
            'created_at' => now(),
        ]);

        $response = $this->asUser($admin)->getJson('/api/v1/whatsapp/connection-history')
            ->assertOk();

        $response->assertJsonCount(1, 'data');
        $response->assertJsonPath('data.0.event_type', 'connected');
    }
}
