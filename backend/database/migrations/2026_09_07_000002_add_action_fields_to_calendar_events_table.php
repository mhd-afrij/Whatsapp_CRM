<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('calendar_events', function (Blueprint $table) {
            $table->foreignId('lead_id')->nullable()->after('workspace_id')->constrained('leads')->nullOnDelete();
            $table->foreignId('created_by')->nullable()->after('lead_id')->constrained('users')->nullOnDelete();
            $table->dateTimeTz('reminder_at', 3)->nullable()->after('kind');
            $table->dateTimeTz('reminder_sent_at', 3)->nullable()->after('reminder_at');
            $table->dateTimeTz('completed_at', 3)->nullable()->after('reminder_sent_at');
            $table->index(['workspace_id', 'reminder_at', 'reminder_sent_at']);
        });
    }

    public function down(): void
    {
        Schema::table('calendar_events', function (Blueprint $table) {
            $table->dropIndex(['workspace_id', 'reminder_at', 'reminder_sent_at']);
            $table->dropConstrainedForeignId('lead_id');
            $table->dropConstrainedForeignId('created_by');
            $table->dropColumn(['reminder_at', 'reminder_sent_at', 'completed_at']);
        });
    }
};