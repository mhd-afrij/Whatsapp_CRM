<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leads', function (Blueprint $table) {
            if (Schema::hasIndex('leads', ['workspace_id', 'temperature'])) {
                $table->dropIndex(['workspace_id', 'temperature']);
            }
            if (Schema::hasIndex('leads', ['temperature'])) {
                $table->dropIndex(['temperature']);
            }
            $table->dropColumn('temperature');
        });
    }

    public function down(): void
    {
        Schema::table('leads', function (Blueprint $table) {
            $table->string('temperature', 16)->default('cold')->after('score');
            $table->index(['workspace_id', 'temperature']);
        });
    }
};