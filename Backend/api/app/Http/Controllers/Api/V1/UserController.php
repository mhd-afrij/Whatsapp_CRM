<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\Role;
use App\Models\User;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class UserController extends Controller
{
    public function __construct(private readonly AuditLogger $auditLogger) {}

    public function index(Request $request): JsonResponse
    {
        $users = User::where('workspace_id', $request->user()->workspace_id)
            ->with('roles:id,name,slug')
            ->orderBy('name')
            ->get(['id', 'uuid', 'name', 'email', 'avatar_path', 'status', 'last_login_at']);

        return response()->json(['data' => $users]);
    }

    public function store(Request $request): JsonResponse
    {
        $workspaceId = $request->user()->workspace_id;

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', "unique:users,email,NULL,id,workspace_id,{$workspaceId}"],
            'role' => ['required', 'string', 'exists:roles,slug'],
        ]);

        $role = $this->resolveRole($workspaceId, $data['role']);

        $temporaryPassword = Str::password(16);

        $user = User::create([
            'workspace_id' => $workspaceId,
            'uuid' => (string) Str::uuid(),
            'name' => $data['name'],
            'email' => $data['email'],
            'password' => $temporaryPassword,
            'status' => 'active',
        ]);

        $user->roles()->sync([$role->id]);

        $this->auditLogger->log(
            workspaceId: $workspaceId,
            actor: $request->user(),
            action: 'user.invited',
            entityType: 'user',
            entityId: $user->id,
            afterState: ['name' => $user->name, 'email' => $user->email, 'role' => $role->slug],
        );

        return response()->json([
            'data' => new UserResource($user->load('roles')),
            'temporary_password' => $temporaryPassword,
        ], 201);
    }

    public function update(Request $request, User $user): JsonResponse
    {
        abort_unless($user->workspace_id === $request->user()->workspace_id, 404);

        $workspaceId = $request->user()->workspace_id;

        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'email' => ['sometimes', 'required', 'email', 'max:255', "unique:users,email,{$user->id},id,workspace_id,{$workspaceId}"],
            'role' => ['sometimes', 'required', 'string', 'exists:roles,slug'],
        ]);

        $before = ['name' => $user->name, 'email' => $user->email, 'role' => $user->roles->first()?->slug];

        $user->fill(collect($data)->except('role')->all())->save();

        if (array_key_exists('role', $data)) {
            $role = $this->resolveRole($workspaceId, $data['role']);

            $user->roles()->sync([$role->id]);
        }

        $this->auditLogger->log(
            workspaceId: $workspaceId,
            actor: $request->user(),
            action: 'user.updated',
            entityType: 'user',
            entityId: $user->id,
            beforeState: $before,
            afterState: ['name' => $user->name, 'email' => $user->email, 'role' => $user->roles->first()?->slug],
        );

        return response()->json(['data' => new UserResource($user->load('roles'))]);
    }

    public function suspend(Request $request, User $user): JsonResponse
    {
        abort_unless($user->workspace_id === $request->user()->workspace_id, 404);
        abort_if($user->id === $request->user()->id, 422, 'You cannot suspend your own account.');

        $data = $request->validate([
            'status' => ['required', 'in:active,suspended'],
        ]);

        $before = ['status' => $user->status];
        $user->status = $data['status'];
        $user->save();

        $this->auditLogger->log(
            workspaceId: $request->user()->workspace_id,
            actor: $request->user(),
            action: $data['status'] === 'suspended' ? 'user.suspended' : 'user.restored',
            entityType: 'user',
            entityId: $user->id,
            beforeState: $before,
            afterState: ['status' => $user->status],
        );

        return response()->json(['data' => new UserResource($user->load('roles'))]);
    }

    private function resolveRole(int $workspaceId, string $slug): Role
    {
        return Role::where(function ($query) use ($workspaceId) {
            $query->whereNull('workspace_id')->orWhere('workspace_id', $workspaceId);
        })->where('slug', $slug)->firstOrFail();
    }
}
