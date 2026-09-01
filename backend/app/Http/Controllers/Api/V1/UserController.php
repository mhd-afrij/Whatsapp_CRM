<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Invitation;
use App\Models\Role;
use App\Models\User;
use App\Notifications\InvitationNotification;
use App\Support\AuditLogger;
use App\Traits\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class UserController extends Controller
{
    use ApiResponse;

    /**
     * GET /api/v1/users — minimal workspace-scoped user directory (id/name/email/active) when
     * called without admin filters, so it keeps backing assignee pickers/@mention autocomplete
     * for every role that can create tasks/notes. When the caller holds `users.view` and passes
     * any admin query params (`search`/`role_id`/`page`/`per_page`), returns the fuller admin
     * listing (paginated, with roles/teams/last_login_at) instead — same endpoint, richer
     * response gated by both permission and explicit opt-in via query params.
     */
    public function index(Request $request)
    {
        $user = $request->user();
        $isAdminQuery = $request->hasAny(['search', 'role_id', 'page', 'per_page']);

        if ($isAdminQuery && ($user->isSuperAdmin() || $user->hasPermission('users.view'))) {
            $query = User::query()->with('roles', 'teams');

            if ($search = $request->query('search')) {
                $query->where(function ($q) use ($search) {
                    $q->where('name', 'like', "%{$search}%")
                        ->orWhere('email', 'like', "%{$search}%");
                });
            }

            if ($roleId = $request->query('role_id')) {
                $query->whereHas('roles', fn ($q) => $q->where('roles.id', $roleId));
            }

            if ($request->has('is_active')) {
                $query->where('is_active', $request->boolean('is_active'));
            }

            $perPage = min((int) $request->query('per_page', 20), 100);
            $users = $query->orderBy('name')->paginate($perPage);

            $users->getCollection()->transform(fn (User $u) => $this->adminUserPayload($u));

            return $this->success($users->items(), 'OK', [
                'current_page' => $users->currentPage(),
                'last_page' => $users->lastPage(),
                'per_page' => $users->perPage(),
                'total' => $users->total(),
            ]);
        }

        $users = User::query()
            ->where('is_active', true)
            ->orderBy('name')
            ->get(['id', 'name', 'email']);

        return $this->success($users, 'OK');
    }

    public function show(Request $request, User $user)
    {
        $this->authorize('view', $user);

        $payload = $this->adminUserPayload($user);
        $payload['recent_activity'] = AuditLog::where('user_id', $user->id)
            ->orderByDesc('created_at')
            ->limit(20)
            ->get(['action', 'subject_type', 'subject_id', 'created_at']);

        return $this->success($payload, 'OK');
    }

    public function update(Request $request, User $user)
    {
        $this->authorize('update', $user);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'about' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'email' => [
                'sometimes', 'string', 'email',
                Rule::unique('users', 'email')->where('workspace_id', $user->workspace_id)->ignore($user->id),
            ],
            'role_id' => [
                'sometimes', 'integer',
                Rule::exists('roles', 'id')->where('workspace_id', $user->workspace_id),
            ],
            'team_ids' => ['sometimes', 'array'],
            'team_ids.*' => [
                'integer',
                Rule::exists('teams', 'id')->where('workspace_id', $user->workspace_id),
            ],
        ]);

        if (array_key_exists('role_id', $data)) {
            $role = Role::query()->whereKey($data['role_id'])->firstOrFail();

            if ($this->roleIsSuperAdmin($role) && ! $request->user()->isSuperAdmin()) {
                return $this->error('Only a super admin can assign the super admin role.', null, 403);
            }
        }

        $before = array_intersect_key(
            array_merge($user->only(['name', 'email']), [
                'role_id' => $user->roles()->value('roles.id'),
                'team_ids' => $user->teams()->pluck('teams.id')->all(),
            ]),
            $data
        );

        $user->fill($request->only(['name', 'email', 'about']))->save();

        if (array_key_exists('role_id', $data)) {
            // A user has exactly one role in this schema's role_user usage today
            // (single active assignment); reassigning replaces it.
            $user->roles()->sync([$data['role_id']]);
        }

        if (array_key_exists('team_ids', $data)) {
            $user->teams()->sync($data['team_ids']);
        }

        AuditLogger::log('user.updated', $request->user(), $user, $data, $request, $before);

        return $this->success($this->adminUserPayload($user->fresh(['roles', 'teams'])), 'User updated successfully.');
    }

    public function resendInvitation(Request $request, Invitation $invitation)
    {
        $this->authorize('resendInvitation', $invitation);

        if ($invitation->status !== 'pending') {
            return $this->error('Only pending invitations can be resent.', null, 422);
        }

        $invitation->forceFill(['expires_at' => now()->addDays(7)])->save();
        $invitation->notify(new InvitationNotification($invitation));

        AuditLogger::log('invitation.resent', $request->user(), $invitation, [], $request);

        return $this->success([
            'id' => $invitation->id,
            'email' => $invitation->email,
            'expires_at' => $invitation->expires_at,
        ], 'Invitation resent successfully.');
    }

    public function suspend(Request $request, User $user)
    {
        if ($request->user()->is($user)) {
            return $this->error('You cannot suspend your own account.', null, 422);
        }

        $this->authorize('suspend', $user);

        $user->forceFill(['is_active' => false])->save();
        $user->tokens()->delete();

        AuditLogger::log('user.suspended', $request->user(), $user, [], $request);

        return $this->success(['id' => $user->id, 'is_active' => $user->is_active], 'User suspended successfully.');
    }

    public function reactivate(Request $request, User $user)
    {
        $this->authorize('reactivate', $user);

        $user->forceFill(['is_active' => true])->save();

        AuditLogger::log('user.reactivated', $request->user(), $user, [], $request);

        return $this->success(['id' => $user->id, 'is_active' => $user->is_active], 'User reactivated successfully.');
    }

    protected function roleIsSuperAdmin(Role $role): bool
    {
        return in_array($role->slug, ['super_admin', 'super-administrator'], true)
            || $role->name === 'Super Administrator';
    }

    protected function adminUserPayload(User $user): array
    {
        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'about' => $user->about,
            'is_active' => $user->is_active,
            'last_login_at' => $user->last_login_at,
            'roles' => $user->roles->map(fn (Role $r) => ['id' => $r->id, 'name' => $r->name, 'slug' => $r->slug]),
            'role_keys' => $user->roleKeys(),
            'teams' => $user->teams->map(fn ($t) => ['id' => $t->id, 'name' => $t->name, 'is_lead' => (bool) $t->pivot->is_lead]),
            'created_at' => $user->created_at,
        ];
    }
}
