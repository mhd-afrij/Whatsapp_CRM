<?php

namespace Database\Seeders;

use App\Models\Permission;
use Illuminate\Database\Seeder;

/**
 * Seeds the global permission catalog from docs/07-permission-matrix.md.
 * Permissions are not per-workspace (see docs/04-database-design.md), so this
 * only needs to run once regardless of workspace count.
 */
class PermissionSeeder extends Seeder
{
    /**
     * @return array<int, array{name: string, group: string}>
     */
    public static function catalog(): array
    {
        return [
            ['name' => 'contacts.view', 'group' => 'contacts'],
            ['name' => 'contacts.create', 'group' => 'contacts'],
            ['name' => 'contacts.edit', 'group' => 'contacts'],
            ['name' => 'contacts.delete', 'group' => 'contacts'],
            ['name' => 'contacts.export', 'group' => 'contacts'],
            // Kept in the catalog (so admins can grant/deny it in the Role Admin UI) but
            // the import route itself is still gated on contacts.create - importing IS
            // creating, and gating on a second permission would 403 every existing
            // workspace until re-seeded (see docs/07-permission-matrix.md).
            ['name' => 'contacts.import', 'group' => 'contacts'],

            ['name' => 'conversations.view', 'group' => 'conversations'],
            ['name' => 'conversations.view_all', 'group' => 'conversations'],
            ['name' => 'conversations.reply', 'group' => 'conversations'],
            ['name' => 'conversations.assign', 'group' => 'conversations'],
            ['name' => 'conversations.close', 'group' => 'conversations'],
            ['name' => 'conversations.reopen', 'group' => 'conversations'],
            ['name' => 'conversations.change_priority', 'group' => 'conversations'],
            ['name' => 'conversations.delete', 'group' => 'conversations'],

            ['name' => 'deals.manage', 'group' => 'leads_deals'],
            ['name' => 'reports.view', 'group' => 'leads_deals'],

            ['name' => 'tasks.manage', 'group' => 'tasks'],
            ['name' => 'tasks.view_team', 'group' => 'tasks'],

            ['name' => 'notes.create', 'group' => 'notes'],
            ['name' => 'notes.view_private', 'group' => 'notes'],
            ['name' => 'notes.manage_any', 'group' => 'notes'],

            ['name' => 'labels.manage', 'group' => 'labels'],

            ['name' => 'users.view', 'group' => 'admin'],
            ['name' => 'users.manage', 'group' => 'admin'],
            ['name' => 'roles.view', 'group' => 'admin'],
            ['name' => 'roles.manage', 'group' => 'admin'],
            ['name' => 'teams.view', 'group' => 'admin'],
            ['name' => 'teams.manage', 'group' => 'admin'],
            ['name' => 'invitations.manage', 'group' => 'admin'],

            ['name' => 'workspace.settings.manage', 'group' => 'workspace'],
            ['name' => 'whatsapp.connection.manage', 'group' => 'workspace'],

            ['name' => 'notifications.manage_own', 'group' => 'notifications'],

            ['name' => 'audit_logs.view', 'group' => 'audit'],

            ['name' => 'search.global', 'group' => 'search'],
            ['name' => 'saved_filters.manage_own', 'group' => 'search'],
            ['name' => 'saved_filters.share', 'group' => 'search'],

            ['name' => 'dashboard.view_workspace', 'group' => 'dashboard'],
            ['name' => 'dashboard.view_own', 'group' => 'dashboard'],

            // Phase 13/14 (analytics) addition - not in the original docs/07-permission-matrix.md
            // table, which only defined dashboard.view_workspace/view_own. analytics.view gates
            // the chart/report endpoints (a superset of the summary cards, workspace-wide
            // aggregate data), analytics.export gates the CSV export job specifically. Granted
            // to the same roles as dashboard.view_workspace / contacts.export respectively -
            // see RolePermissionSeeder for the exact matrix and PROJECT_STATUS.md Phase 13 for
            // the reasoning.
            ['name' => 'analytics.view', 'group' => 'analytics'],
            ['name' => 'analytics.export', 'group' => 'analytics'],
        ];
    }

    public function run(): void
    {
        foreach (static::catalog() as $permission) {
            Permission::query()->firstOrCreate(
                ['name' => $permission['name']],
                ['group' => $permission['group']]
            );
        }
    }
}
