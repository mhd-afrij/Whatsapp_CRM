<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('message_dispatch_queue', function (Blueprint $table) {
            $table->string('idempotency_key', 191)->nullable()->after('requested_by_user_id');
            $table->unique(['workspace_id', 'idempotency_key'], 'message_dispatch_queue_workspace_id_idempotency_key_unique');
        });
    }

    public function down(): void
    {
        Schema::table('message_dispatch_queue', function (Blueprint $table) {
            $table->dropUnique('message_dispatch_queue_workspace_id_idempotency_key_unique');
            $table->dropColumn('idempotency_key');
        });
    }
};
