<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('calendar_events', function (Blueprint $table) {
            if (! Schema::hasColumn('calendar_events', 'description')) {
                $table->text('description')->nullable()->after('location');
            }
            if (! Schema::hasColumn('calendar_events', 'is_all_day')) {
                $table->boolean('is_all_day')->default(false)->after('description');
            }
            if (! Schema::hasColumn('calendar_events', 'contact_id')) {
                $table->foreignId('contact_id')->nullable()->after('kind')->constrained('contacts')->nullOnDelete();
            }
            if (! Schema::hasColumn('calendar_events', 'lead_id')) {
                $table->foreignId('lead_id')->nullable()->after('contact_id')->constrained('leads')->nullOnDelete();
            }
            if (! Schema::hasColumn('calendar_events', 'deal_id')) {
                $table->foreignId('deal_id')->nullable()->after('lead_id')->constrained('deals')->nullOnDelete();
            }
            if (! Schema::hasColumn('calendar_events', 'reminder_minutes')) {
                $table->unsignedInteger('reminder_minutes')->nullable()->after('deal_id');
            }

            if (! Schema::hasIndex('calendar_events', ['workspace_id', 'contact_id'])) {
                $table->index(['workspace_id', 'contact_id']);
            }
            if (! Schema::hasIndex('calendar_events', ['workspace_id', 'lead_id'])) {
                $table->index(['workspace_id', 'lead_id']);
            }
            if (! Schema::hasIndex('calendar_events', ['workspace_id', 'deal_id'])) {
                $table->index(['workspace_id', 'deal_id']);
            }
        });
    }

    public function down(): void
    {
        Schema::table('calendar_events', function (Blueprint $table) {
            $table->dropIndex(['workspace_id', 'contact_id']);
            $table->dropIndex(['workspace_id', 'lead_id']);
            $table->dropIndex(['workspace_id', 'deal_id']);
            $table->dropConstrainedForeignId('deal_id');
            $table->dropConstrainedForeignId('lead_id');
            $table->dropConstrainedForeignId('contact_id');
            $table->dropColumn(['description', 'is_all_day', 'reminder_minutes']);
        });
    }
};