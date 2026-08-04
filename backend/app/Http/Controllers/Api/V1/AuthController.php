<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\AcceptInvitationRequest;
use App\Http\Requests\Auth\ForgotPasswordRequest;
use App\Http\Requests\Auth\InviteUserRequest;
use App\Http\Requests\Auth\LoginRequest;
use App\Http\Requests\Auth\ResetPasswordRequest;
use App\Models\Invitation;
use App\Models\Role;
use App\Models\User;
use App\Notifications\InvitationNotification;
use App\Support\AuditLogger;
use App\Traits\ApiResponse;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    use ApiResponse;

    public function login(LoginRequest $request)
    {
        $data = $request->validated();

        $user = User::where('email', $data['email'])->first();

        if (! $user || ! Hash::check($data['password'], $user->password)) {
            // When the email matches a real user, attribute the audit log to their workspace
            // (as the subject, not the actor — the credentials were never verified).
            AuditLogger::log('auth.login.failed', null, $user, ['email' => $data['email']], $request);

            throw ValidationException::withMessages([
                'email' => ['These credentials do not match our records.'],
            ]);
        }

        if (! $user->is_active) {
            AuditLogger::log('auth.login.failed', $user, $user, ['reason' => 'suspended'], $request);

            return $this->error('Your account has been suspended. Please contact your administrator.', null, 403);
        }

        $token = $user->createToken($data['device_name'] ?? 'api')->plainTextToken;

        $user->forceFill(['last_login_at' => now()])->save();

        AuditLogger::log('auth.login', $user, $user, [], $request);

        return $this->success([
            'token' => $token,
            'user' => $this->userPayload($user),
        ], 'Logged in successfully.');
    }

    public function logout(\Illuminate\Http\Request $request)
    {
        $user = $request->user();

        $user->currentAccessToken()?->delete();

        AuditLogger::log('auth.logout', $user, $user, [], $request);

        return $this->success(null, 'Logged out successfully.');
    }

    public function me(\Illuminate\Http\Request $request)
    {
        return $this->success($this->userPayload($request->user()), 'Current user retrieved.');
    }

    public function forgotPassword(ForgotPasswordRequest $request)
    {
        $status = Password::sendResetLink($request->only('email'));

        // Always respond success regardless of whether the email exists, to avoid
        // leaking which addresses are registered.
        return $this->success(null, 'If that email address is in our system, a password reset link has been sent.');
    }

    public function resetPassword(ResetPasswordRequest $request)
    {
        $status = Password::reset(
            $request->only('email', 'password', 'password_confirmation', 'token'),
            function (User $user, string $password) {
                $user->forceFill(['password' => Hash::make($password)])->save();
                $user->tokens()->delete();

                event(new PasswordReset($user));

                AuditLogger::log('auth.password_reset', $user, $user);
            }
        );

        if ($status !== Password::PASSWORD_RESET) {
            return $this->error('Unable to reset password. The link may be invalid or expired.', null, 422);
        }

        return $this->success(null, 'Password has been reset successfully.');
    }

    public function invite(InviteUserRequest $request)
    {
        $actor = $request->user();
        $data = $request->validated();

        $invitation = Invitation::create([
            'workspace_id' => $actor->workspace_id,
            'email' => $data['email'],
            'role_id' => $data['role_id'],
            'invited_by' => $actor->id,
            'token' => Str::random(64),
            'status' => 'pending',
            'expires_at' => now()->addDays(7),
        ]);

        $invitation->notify(new InvitationNotification($invitation));

        AuditLogger::log('invitation.created', $actor, $invitation, ['email' => $invitation->email], $request);

        return $this->success([
            'id' => $invitation->id,
            'email' => $invitation->email,
            'expires_at' => $invitation->expires_at,
        ], 'Invitation created successfully.', null, 201);
    }

    public function acceptInvitation(AcceptInvitationRequest $request)
    {
        $data = $request->validated();

        $invitation = Invitation::where('token', $data['token'])->first();

        if (! $invitation || $invitation->status !== 'pending') {
            return $this->error('This invitation is invalid or has already been used.', null, 422);
        }

        if ($invitation->expires_at->isPast()) {
            $invitation->update(['status' => 'expired']);

            return $this->error('This invitation has expired.', null, 422);
        }

        $user = User::create([
            'workspace_id' => $invitation->workspace_id,
            'name' => $data['name'],
            'email' => $invitation->email,
            'password' => Hash::make($data['password']),
            'is_active' => true,
            'email_verified_at' => now(),
        ]);

        $user->roles()->attach($invitation->role_id);

        $invitation->update(['status' => 'accepted', 'accepted_at' => now()]);

        AuditLogger::log('invitation.accepted', $user, $invitation, [], $request);

        $token = $user->createToken('api')->plainTextToken;

        return $this->success([
            'token' => $token,
            'user' => $this->userPayload($user),
        ], 'Invitation accepted. Welcome!', null, 201);
    }

    protected function userPayload(User $user): array
    {
        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'workspace_id' => $user->workspace_id,
            'is_active' => $user->is_active,
            'roles' => $user->roles()->pluck('name'),
            'permissions' => $user->isSuperAdmin()
                ? \App\Models\Permission::pluck('name')
                : $user->permissionNames(),
        ];
    }
}
