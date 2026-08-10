<?php

namespace Database\Seeders;

use App\Models\Role;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

/**
 * Seeds a single demo Super Administrator for the default workspace.
 *
 * DEV-ONLY SEED CREDENTIAL — never a real secret, never used outside local
 * dev/test seeding. See PROJECT_STATUS.md for the documented plaintext
 * placeholder password.
 */
class AdminUserSeeder extends Seeder
{
    public const EMAIL = 'admin@example.com';

    public const PLAINTEXT_PASSWORD = 'ChangeMe123!'; // dev-only seed credential, see PROJECT_STATUS.md

    public function run(): void
    {
        $workspace = Workspace::query()->where('slug', 'default')->firstOrFail();

        $user = User::query()->updateOrCreate(
            ['workspace_id' => $workspace->id, 'email' => static::EMAIL],
            [
                'name' => 'Super Admin',
                'password' => Hash::make(static::PLAINTEXT_PASSWORD),
                'is_active' => true,
            ]
        );

        $superAdminRole = Role::query()
            ->where('workspace_id', $workspace->id)
            ->where('name', 'Super Administrator')
            ->firstOrFail();

        $user->roles()->syncWithoutDetaching([$superAdminRole->id]);
    }
}
