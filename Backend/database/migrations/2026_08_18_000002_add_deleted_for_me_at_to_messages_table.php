<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * WhatsApp-style "Delete for me": hides a message from the workspace's inbox
 * (the contact's copy is untouched and no revoke is sent). The messages table
 * is gateway-owned, but schema is managed by Laravel migrations — the gateway
 * writes `deleted_for_me_at` via its internal API and both the gateway and the
 * backend's read-side queries filter on it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('messages', function (Blueprint $table) {
            $table->timestamp('deleted_for_me_at')->nullable()->after('read_at');

            $table->index(['conversation_id', 'deleted_for_me_at']);
        });
    }

    public function down(): void
    {
        Schema::table('messages', function (Blueprint $table) {
            $table->dropIndex(['conversation_id', 'deleted_for_me_at']);
            $table->dropColumn('deleted_for_me_at');
        });
    }
};
