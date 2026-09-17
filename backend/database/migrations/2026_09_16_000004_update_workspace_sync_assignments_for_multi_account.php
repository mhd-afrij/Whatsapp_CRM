<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Changes workspace_sync_assignments from a single lease per workspace to a
 * composite lease per (workspace, whatsapp_account) so multiple concurrent
 * Baileys sessions can be coordinated independently.
 */
return new class extends Migration
{
    public function up(): void
    {
        // The unique index on workspace_id is the backing index for the FK
        // to workspaces. Drop the FK first, then the unique, then recreate
        // everything with the new schema.
        Schema::table('workspace_sync_assignments', function (Blueprint $table) {
            $table->dropForeign('workspace_sync_assignments_workspace_id_foreign');
            $table->dropUnique('workspace_sync_assignments_workspace_id_unique');
        });

        Schema::table('workspace_sync_assignments', function (Blueprint $table) {
            // Add the account FK.
            $table->foreignId('whatsapp_account_id')
                ->nullable()
                ->after('workspace_id')
                ->constrained('whatsapp_connections')
                ->nullOnDelete();

            // Composite unique: one lease per (workspace, account).
            $table->unique(
                ['workspace_id', 'whatsapp_account_id'],
                'wa_sync_workspace_account_unique',
            );

            $table->index(['whatsapp_account_id', 'gateway_instance_id'], 'idx_sync_account_instance');
        });

        // Recreate the FK on workspace_id - the composite unique covers it
        // as a left-prefix index, so MySQL/MariaDB will accept it.
        Schema::table('workspace_sync_assignments', function (Blueprint $table) {
            $table->foreign('workspace_id')
                ->references('id')
                ->on('workspaces')
                ->onDelete('cascade');
        });

        // Backfill: link existing leases to the workspace's active connection.
        DB::statement("
            UPDATE workspace_sync_assignments wsa
            INNER JOIN (
                SELECT workspace_id, id AS whatsapp_account_id
                FROM whatsapp_connections
                WHERE is_active = 1
            ) wa ON wa.workspace_id = wsa.workspace_id
            SET wsa.whatsapp_account_id = wa.whatsapp_account_id
            WHERE wsa.whatsapp_account_id IS NULL
        ");
    }

    public function down(): void
    {
        Schema::table('workspace_sync_assignments', function (Blueprint $table) {
            $table->dropIndex('idx_sync_account_instance');
            $table->dropUnique('wa_sync_workspace_account_unique');
            $table->dropForeign(['whatsapp_account_id']);
            $table->dropColumn('whatsapp_account_id');
            $table->dropForeign(['workspace_id']);
        });

        // Restore the original single-tenant unique + FK.
        Schema::table('workspace_sync_assignments', function (Blueprint $table) {
            $table->unique('workspace_id');
            $table->foreign('workspace_id')
                ->references('id')
                ->on('workspaces')
                ->onDelete('cascade');
        });
    }
};