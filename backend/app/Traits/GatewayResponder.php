<?php

namespace App\Traits;

use App\Exceptions\GatewayException;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Log;

/**
 * Shared helper for turning a classified App\Exceptions\GatewayException into a
 * standardized, safe 502 response. Reused by every backend controller that
 * talks to the whatsapp-gateway so a temporary gateway outage always surfaces
 * as the same recoverable payload:
 *
 *   {
 *     "success": false,
 *     "message": "WhatsApp gateway is temporarily unavailable.",
 *     "code": "GATEWAY_UNREACHABLE",
 *     "data": { "status": "unavailable", "retryable": true }
 *   }
 *
 * The public message and code never leak internal exception details or secrets;
 * the original error is preserved (via getPrevious) for logging only.
 */
trait GatewayResponder
{
    protected function gatewayFailure(GatewayException $e): JsonResponse
    {
        Log::warning('WhatsApp gateway failure classified', [
            'gateway_error_code' => $e->gatewayCode,
            'retryable' => $e->retryable(),
            'exception' => $e::class,
            'previous' => $e->getPrevious()?->getMessage(),
        ]);

        return $this->failure(
            $e->getMessage(),
            $e->gatewayCode,
            502,
            [
                'status' => $e->publicStatus(),
                'retryable' => $e->retryable(),
            ],
        );
    }
}
