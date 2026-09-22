<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('analytics_settings', function (Blueprint $table) {
            // Report-dashboard preferences (Reports page toolbar defaults).
            // Deliberately a JSON blob, NOT discrete columns: these are a small,
            // evolving set of Report UI prefs scoped to the reports module, and
            // the Analytics Settings page (which whitelists discrete columns via
            // recommendedDefaults) should not grow them.
            $table->json('report_preferences')->nullable()->after('max_export_range_days');
        });
    }

    public function down(): void
    {
        Schema::table('analytics_settings', function (Blueprint $table) {
            $table->dropColumn('report_preferences');
        });
    }
};
