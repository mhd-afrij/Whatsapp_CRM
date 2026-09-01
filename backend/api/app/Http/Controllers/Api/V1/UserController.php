<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\StoreUserRequest;
use App\Http\Requests\Admin\UpdateUserRequest;
use App\Models\Permission;
use App\Models\UserPermissionOverride;
use App\Models\User;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class UserController extends Controller
{
    public function __construct(
        private readonly AuditLogger $auditLogger,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $query = User::where('workspace_id', $request->user()->workspace_id)
            ->with([
                'roles:id,name,slug',
                'roles.permissions:id,key',
                'permissionOverrides.permission:id,key,description',
            ])
            ->orderBy('name');

        if ($request->filled('search')) {
            $search = $request->input('search');
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%");
            });
        }

        if ($request->filled('status')) {
            $query->where('status', $request->input('status'));
        }

        $users = $query->get(['id', 'uuid', 'name', 'email', 'avatar_path', 'status', 'last_login_at']);

        return response()->json(['data' => $users]);
    }

    public function store(StoreUserRequest $request): JsonResponse
    {
        $validated = $request->validated();

        $user = User::create([
            'workspace_id' => $request->user()->workspace_id,
            'name' => $validated['name'],
            'email' => $validated['email'],
            'password' => $validated['password'],
            'status' => 'active',
        ]);

        $user->roles()->sync($validated['role_ids']);

        $this->auditLogger->log(
            $request->user()->workspace_id,
            $request->user(),
            'user.created',
            'User',
            $user->id,
            null,
            ['name' => $user->name, 'email' => $user->email]
        );

        return response()->json([
            'data' => $user->load([
                'roles:id,name,slug',
                'roles.permissions:id,key,description',
                'permissionOverrides.permission:id,key,description',
            ]),
            'message' => 'User created successfully.',
        ], 201);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $user = User::where('workspace_id', $request->user()->workspace_id)
            ->with([
                'roles:id,name,slug',
                'roles.permissions:id,key,description',
                'permissionOverrides.permission:id,key,description',
            ])
            ->findOrFail($id);

        return response()->json(['data' => $user]);
    }

    public function permissions(Request $request, int $id): JsonResponse
    {
        $user = User::where('workspace_id', $request->user()->workspace_id)
            ->with([
                'roles:id,name,slug',
                'roles.permissions:id,key,description',
                'permissionOverrides.permission:id,key,description',
            ])
            ->findOrFail($id);

        return response()->json([
            'data' => [
                'user' => $user,
                'permissions' => Permission::orderBy('key')->get(['id', 'key', 'description']),
            ],
        ]);
    }

    public function update(UpdateUserRequest $request, int $id): JsonResponse
    {
        $user = User::where('workspace_id', $request->user()->workspace_id)->findOrFail($id);
        $validated = $request->validated();

        $before = $user->only(['name', 'email', 'status']);

        if (isset($validated['name'])) {
            $user->name = $validated['name'];
        }
        if (isset($validated['email'])) {
            $user->email = $validated['email'];
        }

        $user->save();

        if (array_key_exists('role_ids', $validated)) {
            $user->roles()->sync($validated['role_ids']);
        }

        $this->auditLogger->log(
            $request->user()->workspace_id,
            $request->user(),
            'user.updated',
            'User',
            $user->id,
            $before,
            $user->only(['name', 'email', 'status'])
        );

        return response()->json([
            'data' => $user->load([
                'roles:id,name,slug',
                'roles.permissions:id,key,description',
                'permissionOverrides.permission:id,key,description',
            ]),
            'message' => 'User updated successfully.',
        ]);
    }

    public function syncPermissions(Request $request, int $id): JsonResponse
    {
        $user = User::where('workspace_id', $request->user()->workspace_id)->findOrFail($id);

        $validated = $request->validate([
            'overrides' => 'required|array',
            'overrides.*.permission_id' => 'required|integer|exists:permissions,id',
            'overrides.*.effect' => 'required|string|in:grant,deny,inherit',
        ]);

        $before = $user->permissionOverrides()
            ->get(['permission_id', 'effect'])
            ->toArray();

        foreach ($validated['overrides'] as $override) {
            $permissionId = (int) $override['permission_id'];
            $effect = $override['effect'];

            if ($effect === 'inherit') {
                $user->permissionOverrides()->where('permission_id', $permissionId)->delete();
                continue;
            }

            UserPermissionOverride::updateOrCreate(
                ['user_id' => $user->id, 'permission_id' => $permissionId],
                ['effect' => $effect]
            );
        }

        $this->auditLogger->log(
            $request->user()->workspace_id,
            $request->user(),
            'user.permissions_synced',
            'User',
            $user->id,
            ['overrides' => $before],
            ['overrides' => $user->permissionOverrides()->get(['permission_id', 'effect'])->toArray()]
        );

        return response()->json([
            'data' => $user->load([
                'roles:id,name,slug',
                'roles.permissions:id,key,description',
                'permissionOverrides.permission:id,key,description',
            ]),
            'message' => 'User permissions updated successfully.',
        ]);
    }

    public function updateStatus(Request $request, int $id): JsonResponse
    {
        $user = User::where('workspace_id', $request->user()->workspace_id)->findOrFail($id);

        if ($user->id === $request->user()->id) {
            return response()->json([
                'message' => 'You cannot change your own status.',
                'code' => 'CANNOT_SELF_SUSPEND',
            ], 422);
        }

        $validated = $request->validate([
            'status' => 'required|string|in:active,suspended',
        ]);

        $before = ['status' => $user->status];
        $user->status = $validated['status'];
        $user->save();

        if ($validated['status'] === 'suspended') {
            $user->tokens()->delete();
        }

        $this->auditLogger->log(
            $request->user()->workspace_id,
            $request->user(),
            'user.status_changed',
            'User',
            $user->id,
            $before,
            ['status' => $user->status]
        );

        return response()->json([
            'data' => $user->only(['id', 'name', 'status']),
            'message' => 'User status updated.',
        ]);
    }

    public function resetPassword(Request $request, int $id): JsonResponse
    {
        $user = User::where('workspace_id', $request->user()->workspace_id)->findOrFail($id);

        $tempPassword = Str::random(12);
        $user->password = $tempPassword;
        $user->save();

        $user->tokens()->delete();

        $this->auditLogger->log(
            $request->user()->workspace_id,
            $request->user(),
            'user.password_reset',
            'User',
            $user->id,
            null,
            ['reset_by' => $request->user()->name]
        );

        return response()->json([
            'data' => ['temp_password' => $tempPassword],
            'message' => 'Password has been reset. Share the temporary password securely with the user.',
        ]);
    }

    public function resendInvite(Request $request, int $id): JsonResponse
    {
        $user = User::where('workspace_id', $request->user()->workspace_id)->findOrFail($id);

        if (! in_array($user->status, ['invited', 'suspended'], true)) {
            return response()->json([
                'message' => 'Invite can only be resent for invited or suspended users.',
                'code' => 'INVALID_INVITE_STATE',
            ], 422);
        }

        $tempPassword = Str::random(12);
        $before = ['status' => $user->status];
        $user->password = $tempPassword;
        $user->status = 'invited';
        $user->save();

        $user->tokens()->delete();

        $this->auditLogger->log(
            $request->user()->workspace_id,
            $request->user(),
            'user.invite_resent',
            'User',
            $user->id,
            $before,
            ['status' => $user->status, 'reset_by' => $request->user()->name]
        );

        return response()->json([
            'data' => [
                'temp_password' => $tempPassword,
                'status' => $user->status,
            ],
            'message' => 'Invite resent successfully. Share the temporary password securely with the user.',
        ]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $user = User::where('workspace_id', $request->user()->workspace_id)->findOrFail($id);

        if ($user->id === $request->user()->id) {
            return response()->json([
                'message' => 'You cannot delete your own account.',
                'code' => 'CANNOT_SELF_DELETE',
            ], 422);
        }

        $userName = $user->name;
        $user->tokens()->delete();
        $user->roles()->detach();
        $user->delete();

        $this->auditLogger->log(
            $request->user()->workspace_id,
            $request->user(),
            'user.deleted',
            'User',
            $id,
            ['name' => $userName],
            null
        );

        return response()->json([
            'data' => null,
            'message' => 'User deleted successfully.',
        ]);
    }

    public function avatar(Request $request, int $id): JsonResponse
    {
        $user = User::where('workspace_id', $request->user()->workspace_id)->findOrFail($id);

        $request->validate([
            'avatar' => 'required|image|max:2048',
        ]);

        $file = $request->file('avatar');
        $path = $file->store('avatars/' . $request->user()->workspace_id, 'public');

        if ($user->avatar_path) {
            Storage::disk('public')->delete($user->avatar_path);
        }

        $user->avatar_path = $path;
        $user->save();

        return response()->json([
            'data' => ['avatar_path' => $path],
            'message' => 'Avatar uploaded successfully.',
        ]);
    }
}
