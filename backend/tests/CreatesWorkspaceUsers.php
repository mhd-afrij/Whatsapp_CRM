<?php

namespace Tests;

use App\Models\Role;
use App\Models\User;
use App\Models\Workspace;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\WorkspaceSeeder;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;

trait CreatesWorkspaceUsers
{
    protected function seedRbac(): void
    {
        $this->seed(WorkspaceSeeder::class);
        $this->seed(PermissionSeeder::class);
        $this->seed(RolePermissionSeeder::class);
    }

    protected function userWithRole(string $roleName, array $attributes = []): User
    {
        $workspace = Workspace::query()->firstOrFail();
        $role = Role::query()->where('name', $roleName)->firstOrFail();

        $user = User::factory()->create(array_merge([
            'workspace_id' => $workspace->id,
            'password' => Hash::make('Password123!'),
            'is_active' => true,
        ], $attributes));

        $user->roles()->attach($role->id);

        return $user;
    }

    /**
     * Laravel's auth guards memoize the resolved user on the guard singleton, which persists
     * across multiple ->getJson()/->postJson() calls within a single test method (the
     * Application instance is not rebooted between requests). Without forgetting guards first,
     * a second request authenticated with a *different* user's token would incorrectly resolve
     * to the first request's cached user. Call this before every authenticated request that
     * uses a token different from the immediately preceding one.
     */
    protected function asUser(User $user): static
    {
        Auth::forgetGuards();

        $token = $user->createToken('api')->plainTextToken;

        return $this->withHeader('Authorization', "Bearer $token");
    }
}
