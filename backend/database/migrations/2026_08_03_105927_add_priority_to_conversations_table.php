<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('conversations', function (Blueprint $table) {
            $table->enum('priority', ['low', 'normal', 'high', 'urgent'])->default('normal')->after('status');
            $table->index(['workspace_id', 'priority']);
        });
    }

    public function down(): void
    {
        Schema::table('conversations', function (Blueprint $table) {
            $table->dropIndex(['workspace_id', 'priority']);
            $table->dropColumn('priority');
        });
    }
};
