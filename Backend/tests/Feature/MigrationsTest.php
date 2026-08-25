<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class MigrationsTest extends TestCase
{
    use RefreshDatabase;

    private const EXPECTED_TABLES = [
        'workspaces', 'workspace_settings', 'users', 'roles', 'permissions',
        'role_user', 'permission_role', 'teams', 'team_user', 'invitations',
        'whatsapp_sessions', 'whatsapp_session_credentials', 'whatsapp_connection_events',
        'whatsapp_sync_checkpoints', 'workspace_sync_assignments', 'whatsapp_contacts', 'contacts', 'conversations',
        'conversation_assignments', 'conversation_participants', 'messages', 'message_media',
        'message_status_events', 'message_reactions', 'message_dispatch_queue',
        'message_processing_failures', 'leads', 'pipelines', 'pipeline_stages', 'deals',
        'deal_stage_history', 'contact_activities', 'internal_notes', 'note_mentions', 'tasks',
        'task_comments', 'task_reminders', 'labels', 'contact_label', 'conversation_label',
        'lead_label', 'deal_label', 'notifications', 'notification_preferences', 'audit_logs',
        'user_presence', 'saved_filters',
    ];

    public function test_all_phase_2_tables_exist_after_migrating(): void
    {
        foreach (self::EXPECTED_TABLES as $table) {
            $this->assertTrue(Schema::hasTable($table), "Expected table [$table] to exist.");
        }
    }

    public function test_every_tenant_table_has_a_workspace_id_column(): void
    {
        $tenantTables = [
            'workspace_settings', 'users', 'roles', 'teams', 'invitations',
            'whatsapp_sessions', 'whatsapp_connection_events', 'whatsapp_sync_checkpoints',
            'workspace_sync_assignments',
            'whatsapp_contacts', 'contacts', 'conversations', 'messages', 'message_dispatch_queue',
            'message_processing_failures', 'leads', 'pipelines', 'deals', 'contact_activities',
            'internal_notes', 'tasks', 'labels', 'notifications', 'audit_logs', 'saved_filters',
        ];

        foreach ($tenantTables as $table) {
            $this->assertTrue(
                Schema::hasColumn($table, 'workspace_id'),
                "Expected table [$table] to have a workspace_id column."
            );
        }
    }

    public function test_soft_delete_tables_have_deleted_at_column(): void
    {
        foreach (['users', 'contacts', 'leads', 'deals', 'tasks'] as $table) {
            $this->assertTrue(
                Schema::hasColumn($table, 'deleted_at'),
                "Expected table [$table] to have a deleted_at column."
            );
        }
    }

    public function test_deals_value_amount_is_a_decimal_money_column(): void
    {
        $columns = Schema::getColumns('deals');
        $column = collect($columns)->firstWhere('name', 'value_amount');

        $this->assertNotNull($column);
        // SQLite (used for the test suite) reports DECIMAL(12,2) columns under its
        // "numeric" type affinity rather than echoing "decimal" literally; MySQL reports
        // "decimal(12,2)" verbatim. Accept both so the assertion is driver-agnostic.
        $this->assertTrue(
            str_contains(strtolower($column['type']), 'decimal')
                || str_contains(strtolower($column['type']), 'numeric'),
            "Expected value_amount column type to be decimal/numeric, got [{$column['type']}]."
        );
    }
}
