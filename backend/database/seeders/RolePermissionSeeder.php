<?php

namespace Database\Seeders;

use App\Models\Permission;
use App\Models\Role;
use App\Models\Workspace;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

/**
 * Seeds the 5 system roles (is_system = true) for a workspace and grants each
 * one the permissions from docs/07-permission-matrix.md. A matrix cell of
 * Y / Own / Team all grant the base permission string — record-level "Own"/
 * "Team" scoping is enforced later by policies, not by separate permission
 * strings (see doc's "Enforcement Points" §2).
 */
class RolePermissionSeeder extends Seeder
{
    /**
     * @return array<string, array{slug: string, description: string, permissions: array<int, string>}>
     */
    public static function roleDefinitions(): array
    {
        // 'Y', 'Own', 'Team' => grant. 'N' => omit.
        $matrix = [
            'contacts.view' => ['Super Administrator', 'Administrator', 'Manager', 'Agent', 'Viewer'],
            'contacts.create' => ['Super Administrator', 'Administrator', 'Manager', 'Agent'],
            'contacts.edit' => ['Super Administrator', 'Administrator', 'Manager', 'Agent'],
            'contacts.delete' => ['Super Administrator', 'Administrator'],
            'contacts.export' => ['Super Administrator', 'Administrator', 'Manager'],
            // Import is functionally a bulk create; grant to the same roles as contacts.create.
            'contacts.import' => ['Super Administrator', 'Administrator', 'Manager', 'Agent'],

            'conversations.view' => ['Super Administrator', 'Administrator', 'Manager', 'Agent', 'Viewer'],
            'conversations.view_all' => ['Super Administrator', 'Administrator'],
            'conversations.reply' => ['Super Administrator', 'Administrator', 'Manager', 'Agent'],
            'conversations.assign' => ['Super Administrator', 'Administrator', 'Manager'],
            'conversations.close' => ['Super Administrator', 'Administrator', 'Manager', 'Agent'],
            'conversations.reopen' => ['Super Administrator', 'Administrator', 'Manager'],
            'conversations.change_priority' => ['Super Administrator', 'Administrator', 'Manager', 'Agent'],
            'conversations.delete' => ['Super Administrator'],

            'deals.manage' => ['Super Administrator', 'Administrator', 'Manager', 'Agent'],
            'leads.manage' => ['Super Administrator', 'Administrator', 'Manager', 'Agent'],
            'reports.view' => ['Super Administrator', 'Administrator', 'Manager', 'Agent', 'Viewer'],

            'tasks.manage' => ['Super Administrator', 'Administrator', 'Manager', 'Agent'],
            'tasks.view_team' => ['Super Administrator', 'Administrator', 'Manager', 'Agent'],

            'notes.create' => ['Super Administrator', 'Administrator', 'Manager', 'Agent'],
            'notes.view_private' => ['Super Administrator', 'Administrator', 'Manager'],
            'notes.manage_any' => ['Super Administrator', 'Administrator'],

            'labels.manage' => ['Super Administrator', 'Administrator', 'Manager'],

            'users.view' => ['Super Administrator', 'Administrator', 'Manager'],
            'users.manage' => ['Super Administrator', 'Administrator'],
            'roles.view' => ['Super Administrator', 'Administrator'],
            'roles.manage' => ['Super Administrator'],
            'teams.view' => ['Super Administrator', 'Administrator', 'Manager'],
            'teams.manage' => ['Super Administrator', 'Administrator'],
            'invitations.manage' => ['Super Administrator', 'Administrator'],

            'workspace.settings.manage' => ['Super Administrator', 'Administrator'],
            'whatsapp.connection.manage' => ['Super Administrator', 'Administrator'],

            'notifications.manage_own' => ['Super Administrator', 'Administrator', 'Manager', 'Agent', 'Viewer'],

            'audit_logs.view' => ['Super Administrator', 'Administrator'],

            'search.global' => ['Super Administrator', 'Administrator', 'Manager', 'Agent', 'Viewer'],
            'saved_filters.manage_own' => ['Super Administrator', 'Administrator', 'Manager', 'Agent', 'Viewer'],
            'saved_filters.share' => ['Super Administrator', 'Administrator', 'Manager'],

            'dashboard.view_workspace' => ['Super Administrator', 'Administrator', 'Manager', 'Viewer'],
            'dashboard.view_own' => ['Super Administrator', 'Administrator', 'Manager', 'Agent', 'Viewer'],

            // See PermissionSeeder for why these two exist beyond the original doc matrix.
            'analytics.view' => ['Super Administrator', 'Administrator', 'Manager', 'Viewer'],
            'analytics.export' => ['Super Administrator', 'Administrator', 'Manager'],

            'dlq.manage' => ['Super Administrator', 'Administrator'],

            // Campaigns module - per docs/07-permission-matrix.md: managers have
            // read-only visibility, only admins compose/send.
            'campaigns.view' => ['Super Administrator', 'Administrator', 'Manager'],
            'campaigns.create' => ['Super Administrator', 'Administrator'],
            'campaigns.update' => ['Super Administrator', 'Administrator'],
            'campaigns.delete' => ['Super Administrator', 'Administrator'],
            'campaigns.send' => ['Super Administrator', 'Administrator'],

            // Phantom-permission fixes (see PermissionSeeder) - these were always
            // enforced by routes/policies but never seeded, so grant them to the
            // roles that were already relying on them in practice (agents use
            // saved replies from the inbox composer).
            'templates.use' => ['Super Administrator', 'Administrator', 'Manager', 'Agent'],
            'templates.manage' => ['Super Administrator', 'Administrator'],
        ];

        $roles = [
            'Super Administrator' => 'Full unrestricted access, including role/permission management and irreversible actions.',
            'Administrator' => 'Operational control over the whole workspace; cannot edit roles/permissions or hard-delete conversations.',
            'Manager' => 'Full visibility and management within their team(s); no workspace-admin or role-admin capability.',
            'Agent' => 'Day-to-day operator; manages their own contacts/deals/tasks and replies to assigned/team conversations.',
            'Viewer' => 'Read-only across contacts, conversations, dashboards, and reports.',
        ];

        $definitions = [];

        foreach ($roles as $name => $description) {
            $definitions[$name] = [
                'slug' => Str::slug($name),
                'description' => $description,
                'permissions' => [],
            ];
        }

        foreach ($matrix as $permission => $grantedRoles) {
            foreach ($grantedRoles as $roleName) {
                $definitions[$roleName]['permissions'][] = $permission;
            }
        }

        return $definitions;
    }

    public function run(): void
    {
        $workspaces = Workspace::query()->get();

        foreach ($workspaces as $workspace) {
            foreach (static::roleDefinitions() as $name => $definition) {
                $role = Role::query()->firstOrCreate(
                    ['workspace_id' => $workspace->id, 'name' => $name],
                    [
                        'slug' => $definition['slug'],
                        'is_system' => true,
                        'description' => $definition['description'],
                    ]
                );

                $permissionIds = Permission::query()
                    ->whereIn('name', $definition['permissions'])
                    ->pluck('id');

                $role->permissions()->syncWithoutDetaching($permissionIds);
            }
        }
    }
}
