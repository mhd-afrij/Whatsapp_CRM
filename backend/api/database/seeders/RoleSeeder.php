<?php

namespace Database\Seeders;

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Seeder;

class RoleSeeder extends Seeder
{
    /**
     * System roles per CLAUDE.md §2.1. workspace_id stays null — these are
     * shared templates available to every workspace, not duplicated per
     * workspace. "System roles cannot be deleted" (spec §18.3).
     */
    private const ROLES = [
        'owner' => [
            'name' => 'Owner',
            'permissions' => '*',
        ],
        'administrator' => [
            'name' => 'Administrator',
            'permissions' => '*',
        ],
        'team_lead' => [
            'name' => 'Team Lead',
            'permissions' => [
                'conversations.view', 'conversations.assign', 'conversations.claim', 'conversations.close',
                'messages.send',
                'customers.view', 'customers.create', 'customers.update', 'customers.merge',
                'leads.view', 'leads.create', 'leads.update', 'leads.move_stage',
                'notes.create', 'notes.delete',
                'tags.manage',
                'tasks.view', 'tasks.create', 'tasks.assign', 'tasks.complete',
                'analytics.view', 'reports.generate',
                'users.view',
                'audit.view',
            ],
        ],
        'agent' => [
            'name' => 'Agent',
            'permissions' => [
                'conversations.view', 'conversations.claim',
                'messages.send',
                'customers.view', 'customers.create', 'customers.update',
                'leads.view', 'leads.create', 'leads.move_stage',
                'notes.create',
                'tags.manage',
                'tasks.view', 'tasks.create', 'tasks.complete',
            ],
        ],
    ];

    public function run(): void
    {
        $allPermissionIds = Permission::pluck('id', 'key');

        foreach (self::ROLES as $slug => $config) {
            $role = Role::updateOrCreate(
                ['workspace_id' => null, 'slug' => $slug],
                ['name' => $config['name'], 'is_system_role' => true],
            );

            $permissionIds = $config['permissions'] === '*'
                ? $allPermissionIds->values()
                : collect($config['permissions'])->map(fn ($key) => $allPermissionIds[$key]);

            $role->permissions()->sync($permissionIds);
        }
    }
}
