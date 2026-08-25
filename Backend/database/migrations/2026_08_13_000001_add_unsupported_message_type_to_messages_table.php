<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // The gateway's inbound pipeline records message types it cannot
        // decode as 'unsupported' (whatsapp-gateway/src/whatsapp/inbound-pipeline.ts)
        // rather than dropping them. The original enum omitted that value, so
        // the insert would throw the moment such a message arrived. MySQL
        // enforces enum values at the storage-engine level, so widen it with
        // an explicit ALTER MODIFY (same pattern as the bad_session change).
        if (Schema::getConnection()->getDriverName() !== 'mysql') {
            return;
        }

        DB::statement(
            "ALTER TABLE messages MODIFY message_type ENUM('text', 'image', 'video', 'audio', 'document', 'sticker', 'location', 'contact_card', 'template', 'system', 'unsupported') NOT NULL"
        );
    }

    public function down(): void
    {
        if (Schema::getConnection()->getDriverName() !== 'mysql') {
            return;
        }

        DB::statement(
            "ALTER TABLE messages MODIFY message_type ENUM('text', 'image', 'video', 'audio', 'document', 'sticker', 'location', 'contact_card', 'template', 'system') NOT NULL"
        );
    }
};
