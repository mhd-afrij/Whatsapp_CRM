<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('conversations', function (Blueprint $table) {
            $table->timestamp('archived_at')->nullable()->after('closed_by');
            $table->timestamp('pinned_at')->nullable()->after('archived_at');
            $table->timestamp('muted_until')->nullable()->after('pinned_at');
            $table->timestamp('starred_at')->nullable()->after('muted_until');

            $table->index(['workspace_id', 'archived_at']);
            $table->index(['workspace_id', 'pinned_at']);
            $table->index(['workspace_id', 'starred_at']);
        });

        Schema::table('messages', function (Blueprint $table) {
            $table->timestamp('starred_at')->nullable()->after('sent_at');

            $table->index(['conversation_id', 'starred_at']);
        });
    }

    public function down(): void
    {
        Schema::table('messages', function (Blueprint $table) {
            $table->dropIndex(['conversation_id', 'starred_at']);
            $table->dropColumn('starred_at');
        });

        Schema::table('conversations', function (Blueprint $table) {
            $table->dropIndex(['workspace_id', 'archived_at']);
            $table->dropIndex(['workspace_id', 'pinned_at']);
            $table->dropIndex(['workspace_id', 'starred_at']);
            $table->dropColumn(['archived_at', 'pinned_at', 'muted_until', 'starred_at']);
        });
    }
};
