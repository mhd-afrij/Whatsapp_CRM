<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     *
     * Order matters: workspace before roles/permissions (roles are
     * workspace-scoped), permissions before role_permission mapping, and the
     * admin user after roles exist so it can be attached to Super Administrator.
     */
    public function run(): void
    {
        $this->call([
            WorkspaceSeeder::class,
            PermissionSeeder::class,
            RolePermissionSeeder::class,
            AdminUserSeeder::class,
        ]);
    }
}
