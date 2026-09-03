<?php

namespace Database\Seeders;

use App\Models\Role;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Database\Seeder;

/**
 * Local-development-only demo data: one workspace and one user per system
 * role, so the login screen and permission matrix are exercisable without
 * hand-crafting accounts. Only run in non-production environments — see
 * DatabaseSeeder.
 */
class DemoWorkspaceSeeder extends Seeder
{
    private const DEMO_PASSWORD = 'password12345';

    private const USERS = [
        ['role' => 'owner', 'name' => 'Olivia Owner', 'email' => 'owner@demo.test'],
        ['role' => 'administrator', 'name' => 'Adam Admin', 'email' => 'admin@demo.test'],
        ['role' => 'team_lead', 'name' => 'Tara Lead', 'email' => 'lead@demo.test'],
        ['role' => 'agent', 'name' => 'Alex Agent', 'email' => 'agent@demo.test'],
    ];

    public function run(): void
    {
        $workspace = Workspace::updateOrCreate(
            ['slug' => 'demo'],
            ['name' => 'Demo Workspace', 'timezone' => 'UTC', 'status' => 'active'],
        );

        $roles = Role::whereNull('workspace_id')->get()->keyBy('slug');

        foreach (self::USERS as $definition) {
            $user = User::updateOrCreate(
                ['workspace_id' => $workspace->id, 'email' => $definition['email']],
                [
                    'name' => $definition['name'],
                    'password' => self::DEMO_PASSWORD,
                    'status' => 'active',
                    'email_verified_at' => now(),
                ],
            );

            $user->roles()->sync([$roles[$definition['role']]->id]);
        }
    }
}
