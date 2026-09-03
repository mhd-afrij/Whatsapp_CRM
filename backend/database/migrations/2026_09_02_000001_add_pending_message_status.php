<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('messages') || ! Schema::hasTable('message_status_events')) {
            return;
        }

        $driver = Schema::getConnection()->getDriverName();
        if (! in_array($driver, ['mysql', 'mariadb'], true)) {
            return;
        }

        DB::statement("ALTER TABLE messages MODIFY status ENUM('queued','pending','sent','delivered','read','failed') NOT NULL");
        DB::statement("ALTER TABLE message_status_events MODIFY status ENUM('queued','pending','sent','delivered','read','failed') NOT NULL");
    }

    public function down(): void
    {
        if (! Schema::hasTable('messages') || ! Schema::hasTable('message_status_events')) {
            return;
        }

        $driver = Schema::getConnection()->getDriverName();
        if (! in_array($driver, ['mysql', 'mariadb'], true)) {
            return;
        }

        DB::table('messages')->where('status', 'pending')->update(['status' => 'queued']);
        DB::table('message_status_events')->where('status', 'pending')->update(['status' => 'queued']);
        DB::statement("ALTER TABLE messages MODIFY status ENUM('queued','sent','delivered','read','failed') NOT NULL");
        DB::statement("ALTER TABLE message_status_events MODIFY status ENUM('queued','sent','delivered','read','failed') NOT NULL");
    }
};
