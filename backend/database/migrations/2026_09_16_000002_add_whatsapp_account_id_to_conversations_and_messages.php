<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Adds whatsapp_account_id (FK → whatsapp_connections) to conversations and
 * messages so every thread and message is attributable to a specific WhatsApp
 * connection. Backfills existing rows with the workspace's active connection.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('conversations', function (Blueprint $table) {
            $table->foreignId('whatsapp_account_id')
                ->nullable()
                ->after('whatsapp_contact_id')
                ->constrained('whatsapp_connections')
                ->nullOnDelete();
            $table->index(['workspace_id', 'whatsapp_account_id'], 'idx_conversations_waid');
        });

        Schema::table('messages', function (Blueprint $table) {
            $table->foreignId('whatsapp_account_id')
                ->nullable()
                ->after('conversation_id')
                ->constrained('whatsapp_connections')
                ->nullOnDelete();
            $table->index(['workspace_id', 'whatsapp_account_id'], 'idx_messages_waid');
        });

        // Backfill: link existing conversations to the workspace's active connection.
        DB::statement("
            UPDATE conversations c
            INNER JOIN (
                SELECT workspace_id, id AS whatsapp_account_id
                FROM whatsapp_connections
                WHERE is_active = 1
            ) wa ON wa.workspace_id = c.workspace_id
            SET c.whatsapp_account_id = wa.whatsapp_account_id
            WHERE c.whatsapp_account_id IS NULL
        ");

        // Backfill: link existing messages via their conversation's account.
        DB::statement("
            UPDATE messages m
            INNER JOIN conversations c ON c.id = m.conversation_id
            SET m.whatsapp_account_id = c.whatsapp_account_id
            WHERE m.whatsapp_account_id IS NULL AND c.whatsapp_account_id IS NOT NULL
        ");
    }

    public function down(): void
    {
        Schema::table('messages', function (Blueprint $table) {
            $table->dropIndex('idx_messages_waid');
            $table->dropForeign(['whatsapp_account_id']);
            $table->dropColumn('whatsapp_account_id');
        });

        Schema::table('conversations', function (Blueprint $table) {
            $table->dropIndex('idx_conversations_waid');
            $table->dropForeign(['whatsapp_account_id']);
            $table->dropColumn('whatsapp_account_id');
        });
    }
};
