<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * whatsapp_sync_checkpoints is gateway-owned (see docs/DATA_OWNERSHIP.md); the
 * gateway persists the per-workspace historical-sync run state (state,
 * timestamps, processed/failed counters) as JSON in the cursor column. The
 * default varchar(255) is too small for that payload once a run has real
 * totals, so widen the column to TEXT.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('whatsapp_sync_checkpoints', function (Blueprint $table) {
            $table->text('cursor')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('whatsapp_sync_checkpoints', function (Blueprint $table) {
            $table->string('cursor')->nullable()->change();
        });
    }
};
