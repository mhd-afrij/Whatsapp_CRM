<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Guards the gateway -> backend internal API routes (/api/internal/*) with a
 * shared-secret header instead of Sanctum bearer auth - the gateway has no user
 * context and must never touch the authenticated-user pipeline. Every internal
 * consumer (currently only the gateway's notifyNewMessage) sends
 * `X-Internal-Shared-Secret`, compared here with hash_equals against
 * config('services.internal.shared_secret').
 */
class EnsureInternalSecret
{
    public function handle(Request $request, Closure $next): Response
    {
        $expected = (string) config('services.internal.shared_secret');
        $provided = (string) $request->header('X-Internal-Shared-Secret', '');

        if ($expected === '' || ! hash_equals($expected, $provided)) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthenticated.',
                'errors' => null,
            ], 401);
        }

        return $next($request);
    }
}