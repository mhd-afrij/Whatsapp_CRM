<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Adds a CRM priority (low/normal/high/urgent) to contacts, mirroring the
 * existing conversations.priority so the Contact Details CRM section can show
 * a single canonical priority per record. Defaults to 'normal'.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('contacts', function (Blueprint $table) {
            $table->string('priority', 20)->default('normal')->after('status');
            $table->index(['workspace_id', 'priority']);
        });
    }

    public function down(): void
    {
        Schema::table('contacts', function (Blueprint $table) {
            $table->dropIndex(['workspace_id', 'priority']);
            $table->dropColumn('priority');
        });
    }
};
