<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('conversations', function (Blueprint $table) {
            $table->timestamp('blocked_at')->nullable()->after('starred_at');
            $table->timestamp('reported_at')->nullable()->after('blocked_at');
            $table->string('report_reason', 500)->nullable()->after('reported_at');

            $table->index(['workspace_id', 'blocked_at']);
        });
    }

    public function down(): void
    {
        Schema::table('conversations', function (Blueprint $table) {
            $table->dropIndex(['workspace_id', 'blocked_at']);
            $table->dropColumn(['blocked_at', 'reported_at', 'report_reason']);
        });
    }
};
