<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('deals')) {
            return;
        }

        Schema::table('deals', function (Blueprint $table) {
            if (! Schema::hasColumn('deals', 'lead_source')) {
                $table->string('lead_source', 32)->nullable()->after('title');
            }
            if (! Schema::hasColumn('deals', 'lead_priority')) {
                $table->string('lead_priority', 16)->default('medium')->after('lead_source');
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('deals')) {
            return;
        }

        Schema::table('deals', function (Blueprint $table) {
            if (Schema::hasColumn('deals', 'lead_source')) {
                $table->dropColumn('lead_source');
            }
            if (Schema::hasColumn('deals', 'lead_priority')) {
                $table->dropColumn('lead_priority');
            }
        });
    }
};
