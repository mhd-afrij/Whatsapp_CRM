<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->unique(['workspace_id', 'email']);
        });

        Schema::table('leads', function (Blueprint $table) {
            $table->unique(['workspace_id', 'title']);
        });

        Schema::table('tasks', function (Blueprint $table) {
            $table->unique(['workspace_id', 'title']);
        });

        Schema::table('calendar_events', function (Blueprint $table) {
            $table->unique(['workspace_id', 'title']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropUnique(['workspace_id', 'email']);
        });

        Schema::table('leads', function (Blueprint $table) {
            $table->dropUnique(['workspace_id', 'title']);
        });

        Schema::table('tasks', function (Blueprint $table) {
            $table->dropUnique(['workspace_id', 'title']);
        });

        Schema::table('calendar_events', function (Blueprint $table) {
            $table->dropUnique(['workspace_id', 'title']);
        });
    }
};
