<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Delivered/read timestamps on the gateway-owned `messages` table.
 *
 * The status lifecycle (queued -> sent -> delivered -> read) is driven by
 * Baileys receipts; `delivered_at`/`read_at` capture when the recipient's
 * device acknowledged and when it reported reading, so the inbox can show
 * "Delivered at 13:40" / "Read at 13:40". The full transition audit trail
 * stays in `message_status_events`.
 *
 * NOTE: this table is gateway-owned (see docs/DATA_OWNERSHIP.md); the backend
 * only reads these columns. Timestamps are written by the gateway's status
 * pipeline (whatsapp-gateway/src/whatsapp/status-pipeline.ts).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('messages', function (Blueprint $table) {
            $table->timestamp('delivered_at')->nullable()->after('sent_at');
            $table->timestamp('read_at')->nullable()->after('delivered_at');
        });
    }

    public function down(): void
    {
        Schema::table('messages', function (Blueprint $table) {
            $table->dropColumn(['delivered_at', 'read_at']);
        });
    }
};
