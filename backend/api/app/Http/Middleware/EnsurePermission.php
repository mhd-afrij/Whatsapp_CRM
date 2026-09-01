<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * CLAUDE.md rule 7 "Authorization": permission middleware on every protected
 * endpoint. Route usage: ->middleware('permission:conversations.assign')
 */
class EnsurePermission
{
    public function handle(Request $request, Closure $next, string $permissionKey): Response
    {
        $user = $request->user();

        if (! $user || ! $user->hasPermission($permissionKey)) {
            return response()->json([
                'message' => 'You do not have permission to perform this action.',
                'code' => 'FORBIDDEN',
                'errors' => null,
                'request_id' => $request->attributes->get('correlation_id'),
            ], 403);
        }

        return $next($request);
    }
}
