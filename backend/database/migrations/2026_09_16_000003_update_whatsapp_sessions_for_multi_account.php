<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Links whatsapp_sessions, whatsapp_session_credentials, and
 * whatsapp_connection_events to whatsapp_connections so the gateway can
 * scope sessions, credentials, and event logs to a specific WhatsApp account.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('whatsapp_sessions', function (Blueprint $table) {
            $table->foreignId('whatsapp_account_id')
                ->nullable()
                ->after('workspace_id')
                ->constrained('whatsapp_connections')
                ->nullOnDelete();
            $table->index(['workspace_id', 'whatsapp_account_id'], 'idx_whatsapp_sessions_account');
        });

        Schema::table('whatsapp_session_credentials', function (Blueprint $table) {
            $table->foreignId('whatsapp_account_id')
                ->nullable()
                ->after('whatsapp_session_id')
                ->constrained('whatsapp_connections')
                ->nullOnDelete();
        });

        Schema::table('whatsapp_connection_events', function (Blueprint $table) {
            $table->foreignId('whatsapp_account_id')
                ->nullable()
                ->after('whatsapp_session_id')
                ->constrained('whatsapp_connections')
                ->nullOnDelete();
        });

        // Backfill: link existing sessions to the workspace's active connection.
        DB::statement("
            UPDATE whatsapp_sessions ws
            INNER JOIN (
                SELECT workspace_id, id AS whatsapp_account_id
                FROM whatsapp_connections
                WHERE is_active = 1
            ) wa ON wa.workspace_id = ws.workspace_id
            SET ws.whatsapp_account_id = wa.whatsapp_account_id
            WHERE ws.whatsapp_account_id IS NULL
        ");

        // Backfill credentials.
        DB::statement("
            UPDATE whatsapp_session_credentials wsc
            INNER JOIN whatsapp_sessions ws ON ws.id = wsc.whatsapp_session_id
            SET wsc.whatsapp_account_id = ws.whatsapp_account_id
            WHERE wsc.whatsapp_account_id IS NULL AND ws.whatsapp_account_id IS NOT NULL
        ");

        // Backfill connection events.
        DB::statement("
            UPDATE whatsapp_connection_events wce
            INNER JOIN whatsapp_sessions ws ON ws.id = wce.whatsapp_session_id
            SET wce.whatsapp_account_id = ws.whatsapp_account_id
            WHERE wce.whatsapp_account_id IS NULL AND ws.whatsapp_account_id IS NOT NULL
        ");
    }

    public function down(): void
    {
        Schema::table('whatsapp_connection_events', function (Blueprint $table) {
            $table->dropForeign(['whatsapp_account_id']);
            $table->dropColumn('whatsapp_account_id');
        });

        Schema::table('whatsapp_session_credentials', function (Blueprint $table) {
            $table->dropForeign(['whatsapp_account_id']);
            $table->dropColumn('whatsapp_account_id');
        });

        Schema::table('whatsapp_sessions', function (Blueprint $table) {
            $table->dropIndex('idx_whatsapp_sessions_account');
            $table->dropForeign(['whatsapp_account_id']);
            $table->dropColumn('whatsapp_account_id');
        });
    }
};
