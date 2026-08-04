<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\WhatsappConnectionEvent;
use App\Services\GatewayClient;
use App\Support\AuditLogger;
use App\Traits\ApiResponse;
use Illuminate\Http\Request;
use RuntimeException;

class WhatsappController extends Controller
{
    use ApiResponse;

    public function __construct(protected GatewayClient $gateway)
    {
    }

    public function status(Request $request)
    {
        try {
            $result = $this->gateway->status();
        } catch (RuntimeException $e) {
            return $this->failure($e->getMessage(), 'gateway_unreachable', 502);
        }

        return $this->success($result['data'] ?? null, $result['message'] ?? 'OK');
    }

    public function qr(Request $request)
    {
        try {
            $result = $this->gateway->status();
        } catch (RuntimeException $e) {
            return $this->failure($e->getMessage(), 'gateway_unreachable', 502);
        }

        $data = $result['data'] ?? [];

        return $this->success([
            'status' => $data['status'] ?? null,
            'qrCode' => $data['qrCode'] ?? null,
            'qrExpiresAt' => $data['qrExpiresAt'] ?? null,
        ], 'OK');
    }

    public function connect(Request $request)
    {
        try {
            $result = $this->gateway->connect();
        } catch (RuntimeException $e) {
            return $this->failure($e->getMessage(), 'gateway_unreachable', 502);
        }

        AuditLogger::log('whatsapp.connect', $request->user(), null, [], $request);

        return $this->success($result['data'] ?? null, $result['message'] ?? 'Connection initiated');
    }

    public function disconnect(Request $request)
    {
        try {
            $result = $this->gateway->disconnect();
        } catch (RuntimeException $e) {
            return $this->failure($e->getMessage(), 'gateway_unreachable', 502);
        }

        AuditLogger::log('whatsapp.disconnect', $request->user(), null, [], $request);

        return $this->success($result['data'] ?? null, $result['message'] ?? 'Disconnected');
    }

    public function reconnect(Request $request)
    {
        try {
            $result = $this->gateway->reconnect();
        } catch (RuntimeException $e) {
            return $this->failure($e->getMessage(), 'gateway_unreachable', 502);
        }

        AuditLogger::log('whatsapp.reconnect', $request->user(), null, [], $request);

        return $this->success($result['data'] ?? null, $result['message'] ?? 'Reconnection initiated');
    }

    /**
     * Connection-event history is a gateway-owned, read-only table
     * (whatsapp_connection_events - see docs/DATA_OWNERSHIP.md), so this
     * reads straight from the database rather than proxying to the gateway.
     */
    public function connectionHistory(Request $request)
    {
        $limit = (int) $request->integer('limit', 50);
        $limit = max(1, min($limit, 200));

        $events = WhatsappConnectionEvent::query()
            ->where('workspace_id', $request->user()->workspace_id)
            ->orderByDesc('occurred_at')
            ->limit($limit)
            ->get(['id', 'event_type', 'metadata', 'occurred_at']);

        return $this->success($events, 'OK');
    }
}
