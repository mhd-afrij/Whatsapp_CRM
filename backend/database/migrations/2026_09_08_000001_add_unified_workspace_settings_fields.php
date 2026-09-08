<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('workspaces', function (Blueprint $table) {
            if (! Schema::hasColumn('workspaces', 'business_category')) {
                $table->string('business_category', 120)->nullable()->after('slug');
            }
            if (! Schema::hasColumn('workspaces', 'country')) {
                $table->string('country', 100)->nullable()->after('business_category');
            }
            if (! Schema::hasColumn('workspaces', 'language')) {
                $table->string('language', 20)->default('en')->after('timezone');
            }
        });

        Schema::table('workspace_settings', function (Blueprint $table) {
            if (! Schema::hasColumn('workspace_settings', 'inbox_settings')) {
                $table->json('inbox_settings')->nullable()->after('branding');
            }
            if (! Schema::hasColumn('workspace_settings', 'contact_settings')) {
                $table->json('contact_settings')->nullable()->after('inbox_settings');
            }
            if (! Schema::hasColumn('workspace_settings', 'lead_sales_settings')) {
                $table->json('lead_sales_settings')->nullable()->after('contact_settings');
            }
            if (! Schema::hasColumn('workspace_settings', 'integration_settings')) {
                $table->json('integration_settings')->nullable()->after('lead_sales_settings');
            }
        });
    }

    public function down(): void
    {
        Schema::table('workspace_settings', function (Blueprint $table) {
            foreach (['integration_settings', 'lead_sales_settings', 'contact_settings', 'inbox_settings'] as $column) {
                if (Schema::hasColumn('workspace_settings', $column)) {
                    $table->dropColumn($column);
                }
            }
        });

        Schema::table('workspaces', function (Blueprint $table) {
            foreach (['language', 'country', 'business_category'] as $column) {
                if (Schema::hasColumn('workspaces', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
