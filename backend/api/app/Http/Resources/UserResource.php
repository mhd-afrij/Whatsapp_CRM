<?php

namespace App\Http\Resources;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin User */
class UserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'uuid' => $this->uuid,
            'name' => $this->name,
            'email' => $this->email,
            'avatar_path' => $this->avatar_path,
            'status' => $this->status,
            'last_login_at' => $this->last_login_at,
            'workspace' => new WorkspaceResource($this->whenLoaded('workspace')),
            'roles' => $this->whenLoaded('roles', fn () => $this->roles->pluck('slug')),
            'permissions' => $this->whenLoaded('roles', fn () => $this->roles
                ->loadMissing('permissions')
                ->flatMap(fn ($role) => $role->permissions->pluck('key'))
                ->unique()
                ->values()),
        ];
    }
}
