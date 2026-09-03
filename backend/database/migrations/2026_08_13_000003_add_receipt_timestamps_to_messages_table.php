<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Schema-drift fix: the "show delivered/read receipt timestamps" inbox feature
 * shipped tests + gateway writes + frontend reads, but no migration ever added
 * the columns. The gateway's updateMessageStatus() stamps them
 * (whatsapp-gateway/src/whatsapp/message-repository.ts) and MessageReadReceiptTest
 * asserts their serialization - a fresh install would fail on the first
 * delivery receipt with "Unknown column 'delivered_at'".
 */
return new class extends Migration
{
    public function up(): void
    {
        // Guard against local dev databases where the columns were already added
        // by hand during gateway testing; a fresh install still needs them.
        if (Schema::hasColumn('messages', 'delivered_at')) {
            return;
        }

        Schema::table('messages', function (Blueprint $table) {
            $table->timestamp('delivered_at')->nullable()->after('sent_at');
            $table->timestamp('read_at')->nullable()->after('delivered_at');

            $table->index(['conversation_id', 'delivered_at']);
            $table->index(['conversation_id', 'read_at']);
        });
    }

    public function down(): void
    {
        if (Schema::hasColumn('messages', 'delivered_at')) {
            Schema::table('messages', function (Blueprint $table) {
                $table->dropIndex(['conversation_id', 'delivered_at']);
                $table->dropIndex(['conversation_id', 'read_at']);
                $table->dropColumn(['delivered_at', 'read_at']);
            });
        }
    }
};
