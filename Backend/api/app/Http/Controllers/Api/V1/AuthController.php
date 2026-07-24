<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\ForgotPasswordRequest;
use App\Http\Requests\Auth\LoginRequest;
use App\Http\Requests\Auth\RefreshRequest;
use App\Http\Requests\Auth\ResetPasswordRequest;
use App\Http\Resources\UserResource;
use App\Models\PasswordResetToken;
use App\Models\User;
use App\Models\Workspace;
use App\Notifications\ResetPasswordNotification;
use App\Services\AuditLogger;
use App\Services\RefreshTokenInvalidException;
use App\Services\RefreshTokenReuseException;
use App\Services\RefreshTokenService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;

class AuthController extends Controller
{
    public function __construct(
        private readonly RefreshTokenService $refreshTokens,
        private readonly AuditLogger $auditLogger,
    ) {}

    public function login(LoginRequest $request): JsonResponse
    {
        $workspaceSlug = (string) $request->input('workspace');
        $email = (string) $request->input('email');
        $password = (string) $request->input('password');

        $key = 'login:'.$request->ip().'|'.strtolower($email);

        if (RateLimiter::tooManyAttempts($key, 5)) {
            return $this->errorResponse(
                'Too many login attempts. Please try again later.',
                'RATE_LIMITED',
                429,
            );
        }

        $workspace = Workspace::where('slug', $workspaceSlug)
            ->where('status', 'active')
            ->first();

        $user = $workspace
            ? User::where('workspace_id', $workspace->id)
                ->where('email', $email)
                ->first()
            : null;

        if (! $workspace || ! $user || ! Hash::check($password, $user->password)) {
            RateLimiter::hit($key, 60);

            return $this->errorResponse('Invalid credentials.', 'INVALID_CREDENTIALS', 401);
        }

        if ($user->status === 'suspended') {
            return $this->errorResponse('This account has been suspended.', 'ACCOUNT_SUSPENDED', 403);
        }

        if ($user->status !== 'active') {
            return $this->errorResponse('This account has not been activated yet.', 'ACCOUNT_INACTIVE', 403);
        }

        RateLimiter::clear($key);

        $accessToken = $user->createToken('access', ['*'], now()->addMinutes(15));
        $refresh = $this->refreshTokens->issue($user);

        $user->forceFill(['last_login_at' => now()])->save();

        $this->auditLogger->log($workspace->id, $user, 'auth.login', 'User', $user->id);

        return $this->tokenResponse($user, $accessToken->plainTextToken, $refresh['token']);
    }

    public function refresh(RefreshRequest $request): JsonResponse
    {
        try {
            $rotated = $this->refreshTokens->rotate((string) $request->input('refresh_token'));
        } catch (RefreshTokenReuseException) {
            return $this->errorResponse(
                'This refresh token has already been used. All sessions for this account have been revoked as a precaution.',
                'REFRESH_TOKEN_REUSE_DETECTED',
                401,
            );
        } catch (RefreshTokenInvalidException) {
            return $this->errorResponse('Invalid or expired refresh token.', 'INVALID_REFRESH_TOKEN', 401);
        }

        $user = $rotated['model']->user;
        $accessToken = $user->createToken('access', ['*'], now()->addMinutes(15));

        return $this->tokenResponse($user, $accessToken->plainTextToken, $rotated['token']);
    }

    public function logout(Request $request): JsonResponse
    {
        $user = $request->user();

        if ($request->filled('refresh_token')) {
            $this->refreshTokens->revoke((string) $request->input('refresh_token'));
        }

        $request->user()->currentAccessToken()?->delete();

        $this->auditLogger->log($user->workspace_id, $user, 'auth.logout', 'User', $user->id);

        return response()->json(['data' => null, 'message' => 'Logged out successfully.']);
    }

    public function me(Request $request): JsonResponse
    {
        $user = $request->user()->load(['workspace', 'roles.permissions']);

        return response()->json(['data' => new UserResource($user)]);
    }

    public function sessions(Request $request): JsonResponse
    {
        $sessions = $request->user()->refreshTokens()
            ->whereNull('revoked_at')
            ->where('expires_at', '>', now())
            ->orderByDesc('created_at')
            ->get(['id', 'ip_address', 'user_agent', 'created_at', 'expires_at']);

        return response()->json(['data' => $sessions]);
    }

    public function destroySession(Request $request, int $session): JsonResponse
    {
        $request->user()->refreshTokens()
            ->where('id', $session)
            ->whereNull('revoked_at')
            ->update(['revoked_at' => now()]);

        return response()->json(['data' => null, 'message' => 'Session revoked.']);
    }

    public function forgotPassword(ForgotPasswordRequest $request): JsonResponse
    {
        $workspace = Workspace::where('slug', (string) $request->input('workspace'))->first();

        $user = $workspace
            ? User::where('workspace_id', $workspace->id)->where('email', (string) $request->input('email'))->first()
            : null;

        // Always return a generic success response, whether or not the
        // account exists, to avoid leaking account existence.
        if ($user) {
            $raw = Str::random(64);

            PasswordResetToken::create([
                'user_id' => $user->id,
                'token_hash' => hash('sha256', $raw),
                'expires_at' => now()->addHour(),
            ]);

            $user->notify(new ResetPasswordNotification($raw));
        }

        return response()->json([
            'data' => null,
            'message' => 'If an account with that email exists, a password reset link has been sent.',
        ]);
    }

    public function resetPassword(ResetPasswordRequest $request): JsonResponse
    {
        $tokenHash = hash('sha256', (string) $request->input('token'));

        $resetToken = PasswordResetToken::where('token_hash', $tokenHash)
            ->whereNull('used_at')
            ->where('expires_at', '>', now())
            ->first();

        if (! $resetToken) {
            return $this->errorResponse('This password reset link is invalid or has expired.', 'INVALID_RESET_TOKEN', 422);
        }

        $user = $resetToken->user;
        $user->forceFill(['password' => (string) $request->input('password')])->save();
        $resetToken->forceFill(['used_at' => now()])->save();

        $this->refreshTokens->revokeAllForUser($user);
        $user->tokens()->delete();

        $this->auditLogger->log($user->workspace_id, null, 'auth.password_reset', 'User', $user->id);

        return response()->json(['data' => null, 'message' => 'Password has been reset successfully.']);
    }

    private function tokenResponse(User $user, string $accessToken, string $refreshToken): JsonResponse
    {
        return response()->json([
            'data' => [
                'access_token' => $accessToken,
                'refresh_token' => $refreshToken,
                'token_type' => 'Bearer',
                'expires_in' => 15 * 60,
                'user' => new UserResource($user->load(['workspace', 'roles.permissions'])),
            ],
        ]);
    }

    private function errorResponse(string $message, string $code, int $status): JsonResponse
    {
        return response()->json([
            'message' => $message,
            'code' => $code,
            'errors' => null,
        ], $status);
    }
}
