<?php

namespace App\Http\Middleware;

use Illuminate\Auth\Middleware\Authenticate as IlluminateAuthenticate;
use Illuminate\Http\Request;

class Authenticate extends IlluminateAuthenticate
{
    /**
     * Override the default redirect-to-login behaviour for API routes.
     *
     * The parent implementation calls route('login') which doesn't exist in
     * this API-only app, causing a RouteNotFoundException (500) instead of
     * a clean AuthenticationException (401). Returning null tells Laravel to
     * let the exception bubble up so the renderable handler in bootstrap/app
     * can format it as a JSON envelope.
     */
    protected function redirectTo(Request $request): ?string
    {
        if ($request->is('api/*')) {
            return null;
        }

        return parent::redirectTo($request);
    }
}
