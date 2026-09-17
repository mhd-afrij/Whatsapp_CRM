<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Renames whatsapp_accounts → whatsapp_connections and adds the columns
 * required by the multi-account connection spec: session_id, failure_reason,
 * connected_at, last_seen_at, disconnected_at, sync_state, qr_expires_at.
 *
 * Backfills connected_at/disconnected_at from the existing timestamp columns.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::rename('whatsapp_accounts', 'whatsapp_connections');

        Schema::table('whatsapp_connections', function (Blueprint $table) {
            $table->string('session_id', 64)->nullable()->after('status');
            $table->text('failure_reason')->nullable()->after('last_error_message');
            $table->timestamp('connected_at')->nullable()->after('last_connected_at');
            $table->timestamp('last_seen_at')->nullable()->after('connected_at');
            $table->timestamp('disconnected_at')->nullable()->after('last_seen_at');
            $table->string('sync_state', 40)->default('idle')->after('disconnected_at');
            $table->timestamp('qr_expires_at')->nullable()->after('sync_state');
        });

        // Backfill new timestamp columns from existing data.
        DB::table('whatsapp_connections')
            ->whereNotNull('last_connected_at')
            ->update(['connected_at' => DB::raw('last_connected_at')]);

        DB::table('whatsapp_connections')
            ->whereNotNull('last_disconnected_at')
            ->update(['disconnected_at' => DB::raw('last_disconnected_at')]);
        // ponytail: skip cosmetic index rename — MariaDB doesn't support RENAME INDEX.
        // The original idx_whatsapp_accounts_wia is functional on the renamed table.
    }

    public function down(): void
    {
        Schema::table('whatsapp_connections', function (Blueprint $table) {
            $table->dropColumn([
                'session_id', 'failure_reason', 'connected_at',
                'last_seen_at', 'disconnected_at', 'sync_state', 'qr_expires_at',
            ]);
        });

        Schema::rename('whatsapp_connections', 'whatsapp_accounts');
    }
};
