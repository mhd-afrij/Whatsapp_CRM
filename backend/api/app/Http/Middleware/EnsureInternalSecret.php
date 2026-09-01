<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Guards service-to-service webhook routes (e.g. the whatsapp-sync callback)
 * that have no authenticated user, mirroring the x-internal-secret check
 * whatsapp-sync itself uses for its own /internal/* routes.
 */
class EnsureInternalSecret
{
    public function handle(Request $request, Closure $next): Response
    {
        $secret = config('services.whatsapp_sync.webhook_secret');

        if ($secret && $request->header('x-internal-secret') !== $secret) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        return $next($request);
    }
}
