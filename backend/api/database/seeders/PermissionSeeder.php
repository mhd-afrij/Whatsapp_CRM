<?php

namespace Database\Seeders;

use App\Models\Permission;
use Illuminate\Database\Seeder;

class PermissionSeeder extends Seeder
{
    /**
     * The permission catalog. Keys follow the "<module>.<action>" convention
     * from CLAUDE.md §2.2. This is the full set available to the custom-role
     * permission matrix (spec §18.3) — new modules append here, they are
     * never removed once a role may depend on them.
     */
    public const CATALOG = [
        'workspace.manage' => 'Manage workspace settings and ownership',
        'conversations.view' => 'View conversations',
        'conversations.assign' => 'Assign or reassign conversations',
        'conversations.claim' => 'Claim an unassigned conversation',
        'conversations.close' => 'Close or reopen conversations',
        'messages.send' => 'Send messages in a conversation',
        'customers.view' => 'View customer records',
        'customers.create' => 'Create customer records',
        'customers.update' => 'Update customer records',
        'customers.delete' => 'Delete or archive customer records',
        'customers.merge' => 'Merge duplicate customer records',
        'leads.view' => 'View leads and pipeline',
        'leads.create' => 'Create leads',
        'leads.update' => 'Update lead details',
        'leads.move_stage' => 'Move a lead between pipeline stages',
        'leads.delete' => 'Delete leads',
        'notes.create' => 'Create internal notes',
        'notes.delete' => 'Delete internal notes',
        'tags.manage' => 'Create, apply, and merge tags',
        'tasks.view' => 'View tasks',
        'tasks.create' => 'Create tasks',
        'tasks.assign' => 'Assign tasks to teammates',
        'tasks.complete' => 'Complete or cancel tasks',
        'analytics.view' => 'View dashboard and analytics',
        'reports.generate' => 'Generate and export reports',
        'users.view' => 'View team members',
        'users.invite' => 'Invite new team members',
        'users.suspend' => 'Suspend or restore team members',
        'roles.manage' => 'Manage roles and the permission matrix',
        'teams.manage' => 'Manage teams',
        'audit.view' => 'View the audit log',
        'settings.general.manage' => 'Manage general workspace settings',
        'settings.crm.manage' => 'Manage CRM settings (pipeline, custom fields, tags defaults)',
        'settings.security.manage' => 'Manage security settings',
        'settings.notifications.manage' => 'Manage notification settings',
        'settings.whatsapp.manage' => 'Manage the WhatsApp connection',
    ];

    public function run(): void
    {
        foreach (self::CATALOG as $key => $description) {
            Permission::updateOrCreate(['key' => $key], ['description' => $description]);
        }
    }
}
