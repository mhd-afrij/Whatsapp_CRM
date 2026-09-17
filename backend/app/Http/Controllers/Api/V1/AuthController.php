<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\AcceptInvitationRequest;
use App\Http\Requests\Auth\ForgotPasswordRequest;
use App\Http\Requests\Auth\InviteUserRequest;
use App\Http\Requests\Auth\LoginRequest;
use App\Http\Requests\Auth\RegisterUserRequest;
use App\Http\Requests\Auth\ResetPasswordRequest;
use App\Models\Invitation;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Models\WhatsappAccount;
use App\Models\Workspace;
use App\Notifications\InvitationNotification;
use App\Support\AuditLogger;
use App\Support\PhoneNumber;
use App\Traits\ApiResponse;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
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

        $token = $this->issueToken($user, (bool) ($data['remember_me'] ?? false));

        $user->forceFill(['last_login_at' => now()])->save();

        AuditLogger::log('auth.login', $user, $user, [], $request);

        return $this->success([
            'token' => $token,
            'access_token' => $token,
            'user' => $this->userPayload($user),
        ], 'Logged in successfully.');
    }

    public function logout(Request $request)
    {
        $user = $request->user();

        $user->currentAccessToken()?->delete();

        AuditLogger::log('auth.logout', $user, $user, [], $request);

        return $this->success(null, 'Logged out successfully.');
    }

    /**
     * POST /api/v1/auth/signup
     *
     * Self-service registration: creates a brand-new workspace with the caller
     * as its Owner. The Owner role carries the full permission catalog but does
     * NOT trigger isSuperAdmin(), so platform-level privileges are never
     * obtainable through public signup.
     *
     * This is onboarding Step 1 (account). The workspace is created with a
     * provisional name and onboarding_step 'account_created'; Steps 2-3 update
     * workspace metadata and the WhatsApp number, then the connection wizard
     * runs and a successful (or explicitly skipped) link marks onboarding
     * 'completed' - see the onboarding endpoints below.
     */
    public function signup(RegisterUserRequest $request)
    {
        $data = $request->validated();

        // Global duplicate check — accounts are unique across all workspaces
        // (including soft-deleted ones, which can be restored via invitation accept).
        if (User::withTrashed()->where('email', $data['email'])->exists()) {
            throw ValidationException::withMessages([
                'email' => ['An account with this email already exists. Please sign in.'],
            ]);
        }

        $workspaceName = $data['name']."'s Workspace";

        $user = DB::transaction(function () use ($data, $workspaceName) {
            $workspace = Workspace::create([
                'name' => $workspaceName,
                'slug' => static::uniqueSlug($workspaceName),
                'timezone' => 'UTC',
                'is_active' => true,
                // Brand-new self-service workspace: walk the onboarding wizard.
                'onboarding_step' => 'account_created',
            ]);

            // Seed every system role (including the Owner role) for this workspace.
            // seedForWorkspace is idempotent and reuses the same definitions as the
            // RolePermissionSeeder that runs at initial setup.
            RolePermissionSeeder::seedForWorkspace($workspace);

            $ownerRole = Role::query()
                ->where('workspace_id', $workspace->id)
                ->where('slug', 'owner')
                ->firstOrFail();

            $user = User::create([
                'workspace_id' => $workspace->id,
                'name' => $data['name'],
                'email' => $data['email'],
                'username' => $data['username'],
                'password' => $data['password'],
                'is_active' => true,
                'email_verified_at' => now(),
            ]);

            $user->roles()->attach($ownerRole->id);

            // Create the workspace_settings row so the workspace is fully formed;
            // WorkspaceSettingController also handles a missing row lazily, but
            // creating it here avoids any race with the first settings fetch.
            $workspace->settings()->create(['workspace_id' => $workspace->id]);

            return $user;
        });

        AuditLogger::log('auth.signup', $user, $user, ['workspace' => $workspaceName], $request);

        $token = $this->issueToken($user);

        return $this->success([
            'token' => $token,
            'access_token' => $token,
            'user' => $this->userPayload($user),
            'workspace' => ['id' => $user->workspace_id, 'name' => $workspaceName],
        ], 'Account created successfully.', null, 201);
    }

    /**
     * GET /api/v1/auth/username-available?username=...
     * Onboarding Step 1 live availability check for the signup handle. Cheap
     * global (with-trashed) lookup so the wizard can validate before submit.
     */
    public function usernameAvailable(Request $request)
    {
        $data = $request->validate([
            'username' => ['required', 'string', 'min:3', 'max:30', 'regex:/^[a-zA-Z0-9_]+$/'],
        ]);

        $username = strtolower(trim($data['username']));

        return $this->success([
            'username' => $username,
            'available' => ! User::withTrashed()->where('username', $username)->exists(),
        ], 'OK');
    }

    /**
     * GET /api/v1/auth/onboarding
     * Resumable onboarding state for the wizard. Everything the frontend needs
     * to pick up where it left off after a refresh/logout: the current step,
     * the account fields collected so far, the registered WhatsApp number, and
     * whether the connection has completed.
     */
    public function onboardingStatus(Request $request)
    {
        $user = $request->user();
        $workspace = Workspace::query()->findOrFail($user->workspace_id);

        return $this->success([
            'onboarding_step' => $workspace->onboarding_step,
            'workspace' => [
                'id' => $workspace->id,
                'name' => $workspace->name,
                'country' => $workspace->country,
                'whatsapp_number' => $workspace->whatsapp_number,
                'whatsapp_display_name' => $workspace->whatsapp_display_name,
            ],
            'user' => [
                'name' => $user->name,
                'email' => $user->email,
                'username' => $user->username,
                'position' => $user->position,
            ],
        ], 'OK');
    }

    /**
     * POST /api/v1/auth/onboarding/workspace
     * Onboarding Steps 2-3: workspace identity + the operator's position
     * (profile metadata only - the RBAC role is still the seeded Owner) and
     * the WhatsApp display name. Idempotent: re-submitting after a refresh
     * updates the stored values instead of erroring.
     */
    public function onboardingWorkspace(Request $request)
    {
        $user = $request->user();
        $workspace = Workspace::query()->findOrFail($user->workspace_id);

        $data = $request->validate([
            'workspace_name' => ['required', 'string', 'max:150'],
            'position' => ['required', 'string', 'max:120'],
            'whatsapp_display_name' => ['required', 'string', 'max:120'],
        ]);

        $name = trim($data['workspace_name']);

        $workspace->forceFill([
            'name' => $name,
            'slug' => static::uniqueSlug($name, $workspace->id),
            'whatsapp_display_name' => trim($data['whatsapp_display_name']),
        ])->save();

        $user->forceFill(['position' => trim($data['position'])])->save();

        if ($workspace->onboarding_step === 'account_created') {
            $workspace->forceFill(['onboarding_step' => 'workspace_pending'])->save();
        }

        AuditLogger::log('onboarding.workspace', $user, $workspace, $data, $request);

        return $this->success($this->userPayload($user), 'Workspace details saved.');
    }

    /**
     * POST /api/v1/auth/onboarding/whatsapp
     * Onboarding Step 4: register the WhatsApp number that will be linked.
     * Normalizes it through the shared PhoneNumber helper (mirror of the
     * frontend/gateway) and pre-creates the managed whatsapp_accounts slot in
     * a disconnected, inactive state - connection happens later via the real
     * gateway QR/pairing flow, never here.
     */
    public function onboardingWhatsapp(Request $request)
    {
        $user = $request->user();
        $workspace = Workspace::query()->findOrFail($user->workspace_id);

        $data = $request->validate([
            'country' => ['required', 'string', 'max:100'],
            // International dialing code WITHOUT the leading '+' (e.g. "94"),
            // matching the frontend's PhoneNumberInput dialCode.
            'country_code' => ['required', 'string', 'regex:/^[0-9]{1,4}$/'],
            'mobile_number' => ['required', 'string', 'regex:/^[0-9][0-9 ]{5,19}$/'],
        ]);

        $digits = PhoneNumber::normalize($data['mobile_number'], $data['country_code']);
        $workspace->forceFill([
            // workspace.whatsapp_number keeps the display '+...' form (settings UI),
            'whatsapp_number' => '+'.$digits,
            'country' => $data['country'],
            'onboarding_step' => 'whatsapp_connection_pending',
        ])->save();

        // Reuse the existing managed slot if one exists (e.g. the number was
        // re-submitted after a refresh); otherwise provision the slot.
        // whatsapp_accounts.phone_number stores bare E.164 digits to match the
        // gateway/frontend normalize convention used everywhere else.
        $account = $workspace->whatsappAccounts()->first();

        if (! $account) {
            $account = $workspace->whatsappAccounts()->create([
                'name' => $workspace->whatsapp_display_name ?: $workspace->name,
                'phone_number' => $digits,
                'provider' => WhatsappAccount::PROVIDER_BAILEYS,
                'status' => 'disconnected',
                'is_active' => false,
                'auto_reply_enabled' => false,
                'routing_mode' => 'default',
                'created_by' => $user->id,
            ]);
        } else {
            $account->forceFill(['phone_number' => $digits])->save();
        }

        AuditLogger::log('onboarding.whatsapp', $user, $workspace, ['phone_number' => $digits], $request);

        return $this->success([
            'onboarding_step' => $workspace->onboarding_step,
            'whatsapp_account' => ['id' => $account->id, 'phone_number' => $account->phone_number],
        ], 'WhatsApp number saved. Connect your device to continue.');
    }

    /**
     * POST /api/v1/auth/onboarding/complete
     * Marks onboarding 'completed'. Two paths:
     *   - { skip: true }  the "Connect Later" path - onboarding is complete but
     *     the managed account slot honestly stays disconnected/inactive.
     *   - { skip: false } the connected path - ONLY honored once the gateway
     *     actually reports the linked session as connected (mirrored onto the
     *     active whatsapp_accounts slot by WhatsappAccountService). A DB write
     *     alone never fakes a successful onboarding.
     */
    public function onboardingComplete(Request $request)
    {
        $user = $request->user();
        $workspace = Workspace::query()->findOrFail($user->workspace_id);

        $data = $request->validate([
            'skip' => ['sometimes', 'boolean'],
        ]);

        $skip = (bool) ($data['skip'] ?? false);

        if (! $skip) {
            // Under concurrency every connection runs its own session, so
            // "a connection is live" - not any is_active routing flag - is
            // what unblocks onboarding. The account row's status is mirrored
            // from the gateway session by WhatsappAccountService.
            $connected = WhatsappAccount::query()
                ->where('workspace_id', $workspace->id)
                ->where('status', 'connected')
                ->exists();

            if (! $connected) {
                return $this->error(
                    'WhatsApp is not connected yet. Connect your device or choose Connect Later.',
                    null,
                    409
                );
            }
        }

        $workspace->forceFill(['onboarding_step' => 'completed'])->save();

        AuditLogger::log('onboarding.completed', $user, $workspace, ['skip' => $skip], $request);

        return $this->success($this->userPayload($user), 'Onboarding complete. Welcome to WhatsCRM!');
    }

    public function me(Request $request)
    {
        return $this->success($this->userPayload($request->user()), 'Current user retrieved.');
    }

    /**
     * PATCH /api/v1/auth/me
     * Lets the signed-in user update their own profile (display name and
     * short bio). Email/roles/teams are admin-owned (UserController::update);
     * this endpoint never crosses a workspace or user boundary.
     */
    public function updateMe(Request $request)
    {
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'about' => ['sometimes', 'nullable', 'string', 'max:1000'],
        ]);

        $request->user()->fill(array_intersect_key($data, ['name' => true, 'about' => true]))->save();

        AuditLogger::log('user.profile_updated', $request->user(), $request->user(), $data, $request);

        return $this->success($this->userPayload($request->user()), 'Profile updated successfully.');
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

        $role = Role::query()->whereKey($data['role_id'])->firstOrFail();

        if ((in_array($role->slug, ['super_admin', 'super-administrator'], true) || $role->name === 'Super Administrator') && ! $actor->isSuperAdmin()) {
            return $this->error('Only a super admin can invite another super admin.', null, 403);
        }

        $plainToken = Str::random(64);
        $tokenHash = hash('sha256', $plainToken);
        $invitation = Invitation::create([
            'workspace_id' => $actor->workspace_id,
            'email' => $data['email'],
            'first_name' => $data['first_name'] ?? null,
            'last_name' => $data['last_name'] ?? null,
            'message' => $data['message'] ?? null,
            'role_id' => $data['role_id'],
            'invited_by' => $actor->id,
            'token' => $tokenHash,
            'token_hash' => $tokenHash,
            'status' => 'pending',
            'expires_at' => now()->addDays(7),
        ])->setPlainToken($plainToken);

        if ($data['send_email'] ?? true) {
            $invitation->loadMissing('workspace', 'role', 'inviter');
            $invitation->notify(new InvitationNotification($invitation));
        }

        AuditLogger::log('invitation.created', $actor, $invitation, ['email' => $invitation->email], $request);

        return $this->success([
            'id' => $invitation->id,
            'email' => $invitation->email,
            'expires_at' => $invitation->expires_at,
        ], 'Invitation created successfully.', null, 201);
    }


    public function acceptInvitationFromToken(Request $request, string $token)
    {
        $request->merge(['token' => $token]);

        return $this->acceptInvitation($request);
    }

    public function acceptInvitation(Request $request)
    {
        $data = $request->validate([
            'token' => ['required', 'string'],
            'name' => ['required', 'string', 'max:255'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        $tokenHash = hash('sha256', $data['token']);
        $invitation = Invitation::where('token_hash', $tokenHash)
            ->orWhere('token', $data['token'])
            ->first();

        if (! $invitation || $invitation->status !== 'pending') {
            return $this->error('This invitation is invalid or has already been used.', null, 422);
        }

        if ($invitation->expires_at->isPast()) {
            $invitation->update(['status' => 'expired']);

            return $this->error('This invitation has expired.', null, 422);
        }

        $user = User::withTrashed()
            ->where('workspace_id', $invitation->workspace_id)
            ->where('email', $invitation->email)
            ->first();

        if ($user && $user->trashed()) {
            $user->restore();
        }

        if (! $user) {
            $user = User::create([
                'workspace_id' => $invitation->workspace_id,
                'name' => $data['name'],
                'email' => $invitation->email,
                'password' => Hash::make($data['password']),
                'is_active' => true,
                'email_verified_at' => now(),
            ]);
        } else {
            $user->forceFill([
                'name' => $user->name ?: $data['name'],
                'password' => $user->password ?: Hash::make($data['password']),
                'is_active' => true,
                'email_verified_at' => $user->email_verified_at ?? now(),
            ])->save();
        }

        $user->roles()->sync([$invitation->role_id]);

        $invitation->update(['status' => 'accepted', 'accepted_at' => now()]);

        AuditLogger::log('invitation.accepted', $user, $invitation, [], $request);

        $token = $this->issueToken($user);

        return $this->success([
            'token' => $token,
            'access_token' => $token,
            'user' => $this->userPayload($user),
        ], 'Invitation accepted. Welcome!', null, 201);
    }

    protected function userPayload(User $user): array
    {
        $permissionNames = $user->isSuperAdmin()
            ? Permission::pluck('name')
            : $user->permissionNames();

        // Safety net: a superadmin must never be reported as permission-less,
        // even if the permissions table was truncated or the seeder ran before
        // newer catalog entries were added. The middleware's isSuperAdmin()
        // bypass already allows every request server-side; this keeps the
        // frontend's UX-layer gate (RequirePermission) consistent with that.
        if ($user->isSuperAdmin() && $permissionNames->isEmpty()) {
            $permissionNames = collect([
                'dashboard.view_workspace', 'dashboard.view_own',
                'conversations.view', 'contacts.view', 'leads.manage', 'tasks.manage',
                'analytics.view', 'analytics.export', 'reports.view',
                'users.view', 'users.manage', 'roles.view', 'roles.manage',
                'teams.view', 'teams.manage', 'invitations.manage',
                'workspace.settings.manage', 'whatsapp.connection.manage',
                'templates.use', 'templates.manage', 'webhooks.view', 'webhooks.manage', 'webhooks.test',
                'audit_logs.view', 'notifications.manage_own', 'dlq.manage',
                'campaigns.view', 'campaigns.create', 'campaigns.update', 'campaigns.delete', 'campaigns.send',
                'contacts.create', 'contacts.edit', 'contacts.delete', 'contacts.export', 'contacts.import',
                'deals.manage', 'search.global', 'saved_filters.manage_own', 'saved_filters.share',
            ]);
        }

        return [
            'id' => $user->id,
            'name' => $user->name,
            'username' => $user->username,
            'position' => $user->position,
            'email' => $user->email,
            'about' => $user->about,
            'workspace_id' => $user->workspace_id,
            'onboarding_step' => $user->workspace?->onboarding_step ?? 'completed',
            'is_active' => $user->is_active,
            'roles' => $user->roles()->pluck('name'),
            'role_keys' => $user->roleKeys(),
            'permissions' => $permissionNames,
        ];
    }

    /**
     * Generate a URL-safe, collision-free slug for a workspace name. When
     * $exceptId is given, the slug stays unique against every OTHER workspace
     * so an onboarding rename can keep the same slug base.
     */
    protected static function uniqueSlug(string $name, ?int $exceptId = null): string
    {
        $base = Str::slug($name) ?: 'workspace';
        $slug = $base;
        $i = 1;

        while (Workspace::query()
            ->when($exceptId !== null, fn ($q) => $q->whereKeyNot($exceptId))
            ->where('slug', $slug)
            ->exists()) {
            $slug = $base.'-'.($i++);
        }

        return $slug;
    }

    /**
     * Issue a session token with a finite lifetime. Short session by default
     * (8h); remembering the device extends it to 30 days. Sanctum's guard
     * rejects tokens whose expires_at is in the past, so this rotates the
     * session whenever the user re-authenticates.
     */
    protected function issueToken(User $user, bool $rememberMe = false): string
    {
        $expiresAt = $rememberMe ? now()->addDays(30) : now()->addHours(8);

        return $user->createToken('api', ['*'], $expiresAt)->plainTextToken;
    }
}
