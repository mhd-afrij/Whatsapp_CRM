<?php

use App\Http\Middleware\EnsureUserIsActive;
use App\Http\Middleware\RequirePermission;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // This API is Bearer-token (Sanctum personal access tokens) only, not
        // SPA cookie/session auth — the frontend never fetches a CSRF cookie
        // or sends credentials. Sanctum's stateful-domain middleware treats
        // any request from a configured stateful domain (localhost included)
        // as session-based, which enforces CSRF and breaks Bearer-token
        // requests from the Next.js dev server. Do not re-add these unless
        // the frontend auth strategy changes to cookie-based SPA auth.
        $middleware->alias([
            'active' => EnsureUserIsActive::class,
            'permission' => RequirePermission::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // Reformat every API exception into the standardized {success,message,errors} envelope
        // (see App\Traits\ApiResponse) instead of Laravel's default {message,errors} shape.
        $exceptions->render(function (ValidationException $e, Request $request) {
            if ($request->is('api/*')) {
                return response()->json([
                    'success' => false,
                    'message' => $e->getMessage(),
                    'errors' => $e->errors(),
                ], $e->status);
            }
        });

        $exceptions->render(function (AuthenticationException $e, Request $request) {
            if ($request->is('api/*')) {
                return response()->json([
                    'success' => false,
                    'message' => 'Unauthenticated.',
                    'errors' => null,
                ], 401);
            }
        });

        $exceptions->render(function (AuthorizationException $e, Request $request) {
            if ($request->is('api/*')) {
                return response()->json([
                    'success' => false,
                    'message' => $e->getMessage() ?: 'This action is unauthorized.',
                    'errors' => null,
                ], 403);
            }
        });

        // Illuminate\Foundation\Exceptions\Handler::prepareException() converts
        // AuthorizationException (from $this->authorize()/Gate::authorize()) into this
        // Symfony HTTP exception *before* the renderable callback above ever runs, so any
        // controller relying on policy authorize() rather than route-level
        // `permission:` middleware needs its own handler here to get the standard envelope.
        $exceptions->render(function (AccessDeniedHttpException $e, Request $request) {
            if ($request->is('api/*')) {
                return response()->json([
                    'success' => false,
                    'message' => $e->getMessage() ?: 'This action is unauthorized.',
                    'errors' => null,
                ], 403);
            }
        });

        $exceptions->render(function (ModelNotFoundException $e, Request $request) {
            if ($request->is('api/*')) {
                return response()->json([
                    'success' => false,
                    'message' => 'Resource not found.',
                    'errors' => null,
                ], 404);
            }
        });
    })->create();
