<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Permission;
use App\Models\Role;
use App\Support\AuditLogger;
use App\Traits\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class RoleController extends Controller
{
    use ApiResponse;

    public function index(Request $request)
    {
        $this->authorize('viewAny', Role::class);

        $roles = Role::with('permissions')->withCount('users')->orderBy('name')->get();

        return $this->success($roles->map(fn (Role $r) => $this->payload($r)), 'OK');
    }

    public function store(Request $request)
    {
        $this->authorize('create', Role::class);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:100', Rule::unique('roles', 'name')->where('workspace_id', $request->user()->workspace_id)],
            'description' => ['nullable', 'string'],
            'permissions' => ['sometimes', 'array'],
            'permissions.*' => ['string', 'exists:permissions,name'],
        ]);

        $role = Role::create([
            'workspace_id' => $request->user()->workspace_id,
            'name' => $data['name'],
            'slug' => Str::slug($data['name']),
            'is_system' => false,
            'description' => $data['description'] ?? null,
        ]);

        if (! empty($data['permissions'])) {
            $ids = Permission::whereIn('name', $data['permissions'])->pluck('id');
            $role->permissions()->sync($ids);
        }

        AuditLogger::log('role.created', $request->user(), $role, $data, $request);

        return $this->success($this->payload($role->fresh('permissions')), 'Role created successfully.', null, 201);
    }

    public function show(Request $request, Role $role)
    {
        $this->authorize('view', $role);

        return $this->success($this->payload($role->load('permissions')), 'OK');
    }

    public function update(Request $request, Role $role)
    {
        $this->authorize('update', $role);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:100', Rule::unique('roles', 'name')->where('workspace_id', $role->workspace_id)->ignore($role->id)],
            'description' => ['nullable', 'string'],
            'permissions' => ['sometimes', 'array'],
            'permissions.*' => ['string', 'exists:permissions,name'],
        ]);

        if ($role->is_system && (array_key_exists('permissions', $data) || array_key_exists('name', $data))) {
            return $this->error('System roles cannot be renamed or have their permissions changed.', null, 422);
        }

        $before = array_intersect_key(
            array_merge($role->only(['name', 'description']), [
                'permissions' => $role->permissions()->pluck('permissions.name')->all(),
            ]),
            $data
        );

        $role->fill($request->only(['name', 'description']))->save();

        if (array_key_exists('permissions', $data)) {
            $ids = Permission::whereIn('name', $data['permissions'])->pluck('id');
            $role->permissions()->sync($ids);
        }

        AuditLogger::log('role.updated', $request->user(), $role, $data, $request, $before);

        return $this->success($this->payload($role->fresh('permissions')), 'Role updated successfully.');
    }

    public function destroy(Request $request, Role $role)
    {
        $this->authorize('delete', $role);

        if ($role->is_system) {
            return $this->error('System roles cannot be deleted.', null, 422);
        }

        if ($role->users()->exists()) {
            return $this->error('Cannot delete a role that is still assigned to users.', null, 422);
        }

        $role->delete();

        AuditLogger::log('role.deleted', $request->user(), $role, [], $request);

        return $this->success(null, 'Role deleted successfully.');
    }

    protected function payload(Role $role): array
    {
        return [
            'id' => $role->id,
            'name' => $role->name,
            'slug' => $role->slug,
            'description' => $role->description,
            'is_system' => (bool) $role->is_system,
            'users_count' => $role->users_count ?? $role->users()->count(),
            'permissions' => $role->permissions->pluck('name'),
        ];
    }
}
