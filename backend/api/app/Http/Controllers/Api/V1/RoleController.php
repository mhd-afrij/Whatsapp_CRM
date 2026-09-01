<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\StoreRoleRequest;
use App\Http\Requests\Admin\SyncPermissionsRequest;
use App\Http\Requests\Admin\UpdateRoleRequest;
use App\Models\Permission;
use App\Models\Role;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class RoleController extends Controller
{
    public function __construct(
        private readonly AuditLogger $auditLogger,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $roles = Role::whereNull('workspace_id')
            ->orWhere('workspace_id', $request->user()->workspace_id)
            ->with(['permissions:id,key,description'])
            ->withCount('users')
            ->orderBy('name')
            ->get(['id', 'workspace_id', 'name', 'slug', 'is_system_role', 'created_at']);

        return response()->json(['data' => $roles]);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $role = Role::where(function ($q) use ($request) {
            $q->whereNull('workspace_id')
                ->orWhere('workspace_id', $request->user()->workspace_id);
        })
            ->with(['permissions:id,key,description'])
            ->withCount('users')
            ->findOrFail($id);

        return response()->json(['data' => $role]);
    }

    public function permissions(): JsonResponse
    {
        return response()->json([
            'data' => Permission::orderBy('key')->get(['id', 'key', 'description']),
        ]);
    }

    public function store(StoreRoleRequest $request): JsonResponse
    {
        $validated = $request->validated();

        $role = Role::create([
            'workspace_id' => $request->user()->workspace_id,
            'name' => $validated['name'],
            'slug' => Str::slug($validated['name']),
            'is_system_role' => false,
        ]);

        $this->auditLogger->log(
            $request->user()->workspace_id,
            $request->user(),
            'role.created',
            'Role',
            $role->id,
            null,
            ['name' => $role->name, 'slug' => $role->slug]
        );

        return response()->json([
            'data' => $role->load('permissions'),
            'message' => 'Role created successfully.',
        ], 201);
    }

    public function update(UpdateRoleRequest $request, int $id): JsonResponse
    {
        $role = Role::where(function ($q) use ($request) {
            $q->whereNull('workspace_id')
                ->orWhere('workspace_id', $request->user()->workspace_id);
        })->findOrFail($id);

        if ($role->is_system_role) {
            return response()->json([
                'message' => 'System roles cannot be modified.',
                'code' => 'SYSTEM_ROLE_READONLY',
            ], 422);
        }

        $validated = $request->validated();

        $before = $role->only(['name', 'slug']);

        if (isset($validated['name'])) {
            $role->name = $validated['name'];
            $role->slug = Str::slug($validated['name']);
        }

        $role->save();

        $this->auditLogger->log(
            $request->user()->workspace_id,
            $request->user(),
            'role.updated',
            'Role',
            $role->id,
            $before,
            $role->only(['name', 'slug'])
        );

        return response()->json([
            'data' => $role->load('permissions'),
            'message' => 'Role updated successfully.',
        ]);
    }

    public function syncPermissions(SyncPermissionsRequest $request, int $id): JsonResponse
    {
        $role = Role::where(function ($q) use ($request) {
            $q->whereNull('workspace_id')
                ->orWhere('workspace_id', $request->user()->workspace_id);
        })->findOrFail($id);

        $validated = $request->validated();

        $before = $role->permissions->pluck('id')->toArray();

        $role->permissions()->sync($validated['permission_ids']);

        $this->auditLogger->log(
            $request->user()->workspace_id,
            $request->user(),
            'role.permissions_synced',
            'Role',
            $role->id,
            ['permission_ids' => $before],
            ['permission_ids' => $validated['permission_ids']]
        );

        return response()->json([
            'data' => $role->load('permissions'),
            'message' => 'Permissions updated successfully.',
        ]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $role = Role::where(function ($q) use ($request) {
            $q->whereNull('workspace_id')
                ->orWhere('workspace_id', $request->user()->workspace_id);
        })->withCount('users')->findOrFail($id);

        if ($role->is_system_role) {
            return response()->json([
                'message' => 'System roles cannot be deleted.',
                'code' => 'SYSTEM_ROLE_READONLY',
            ], 422);
        }

        if ($role->users_count > 0) {
            return response()->json([
                'message' => "Cannot delete role with {$role->users_count} assigned user(s). Reassign them first.",
                'code' => 'ROLE_HAS_USERS',
            ], 422);
        }

        $roleName = $role->name;
        $role->permissions()->detach();
        $role->delete();

        $this->auditLogger->log(
            $request->user()->workspace_id,
            $request->user(),
            'role.deleted',
            'Role',
            $id,
            ['name' => $roleName],
            null
        );

        return response()->json([
            'data' => null,
            'message' => 'Role deleted successfully.',
        ]);
    }
}
