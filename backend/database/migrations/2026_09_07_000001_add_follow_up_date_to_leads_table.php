<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leads', function (Blueprint $table) {
            $table->date('follow_up_date')->nullable()->after('notes');
            $table->index(['workspace_id', 'follow_up_date']);
        });
    }

    public function down(): void
    {
        Schema::table('leads', function (Blueprint $table) {
            $table->dropIndex(['workspace_id', 'follow_up_date']);
            $table->dropColumn('follow_up_date');
        });
    }
};