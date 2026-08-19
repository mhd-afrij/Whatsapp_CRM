<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\CreatesWorkspaceUsers;
use Tests\TestCase;

class WhatsappConnectionTest extends TestCase
{
    use RefreshDatabase, CreatesWorkspaceUsers;

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
                'message' => 'Connection initiated',
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

    public function test_admin_can_fetch_health_and_it_proxies_the_gateway(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');

        Http::fake([
            '*/whatsapp/health' => Http::response([
                'status' => 'ok',
                'whatsapp' => ['status' => 'connected', 'phoneNumber' => '15551234567', 'qrPending' => false],
                'socket' => ['connected' => true, 'clients' => 3],
                'redis' => ['healthy' => true],
                'mysql' => ['healthy' => true],
            ], 200),
        ]);

        $this->asUser($admin)->getJson('/api/v1/whatsapp/health')
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'ok')
            ->assertJsonPath('data.whatsapp.status', 'connected')
            ->assertJsonPath('data.mysql.healthy', true);

        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/whatsapp/health')
            && $request->hasHeader('X-Internal-Gateway-Token'));
    }

    public function test_health_gateway_unreachable_returns_502(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');

        Http::fake([
            '*/whatsapp/health' => Http::response(null, 500),
        ]);

        $this->asUser($admin)->getJson('/api/v1/whatsapp/health')
            ->assertStatus(502)
            ->assertJsonPath('success', false);
    }

    public function test_agent_without_permission_is_forbidden_from_health(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');

        $this->asUser($agent)->getJson('/api/v1/whatsapp/health')
            ->assertStatus(403)
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
