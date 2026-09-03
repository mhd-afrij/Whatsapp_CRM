<?php

namespace Database\Seeders;

use App\Models\Role;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

/**
 * Creates seeded test users for the E2E Playwright suite.
 *
 * Each user is assigned a single system role within the default workspace.
 * Password is identical for all test users so the e2e/fixtures.ts constants
 * stay in sync. Run via: php artisan db:seed --class=E2EUserSeeder
 */
class E2EUserSeeder extends Seeder
{
    public const TEST_PASSWORD = 'Password123!';

    public function run(): void
    {
        $workspace = Workspace::query()->where('slug', 'default')->firstOrFail();

        $roleMap = [
            'e2e-admin@example.com'   => 'Administrator',
            'e2e-manager@example.com' => 'Manager',
            'e2e-agent@example.com'   => 'Agent',
            'e2e-viewer@example.com'  => 'Viewer',
        ];

        foreach ($roleMap as $email => $roleName) {
            $role = Role::query()
                ->where('workspace_id', $workspace->id)
                ->where('name', $roleName)
                ->firstOrFail();

            $user = User::query()->updateOrCreate(
                ['workspace_id' => $workspace->id, 'email' => $email],
                [
                    'name' => str_replace(['@example.com', 'e2e-'], ['', ''], $email) . ' User',
                    'password' => Hash::make(static::TEST_PASSWORD),
                    'is_active' => true,
                ]
            );

            $user->roles()->syncWithoutDetaching([$role->id]);
        }
    }
}
