<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     *
     * PermissionSeeder and RoleSeeder are the permission catalog and system
     * roles — safe (idempotent) in every environment. DemoWorkspaceSeeder
     * creates a demo workspace and one login per role and is local-dev only.
     */
    public function run(): void
    {
        $this->call([
            PermissionSeeder::class,
            RoleSeeder::class,
        ]);

        if (! app()->environment('production')) {
            $this->call(DemoWorkspaceSeeder::class);
            $this->call(CrmDemoSeeder::class);
            $this->call(WhatsAppDemoSeeder::class);
        }
    }
}
