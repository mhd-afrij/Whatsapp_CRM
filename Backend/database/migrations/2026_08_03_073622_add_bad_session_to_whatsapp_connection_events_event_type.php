<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // MySQL enforces the enum's allowed values at the storage engine level, so widening it
        // requires an explicit ALTER MODIFY. SQLite (used by the test suite) has no equivalent
        // ALTER COLUMN syntax and Laravel's enum() there is just a CHECK constraint bound to the
        // exact list passed to the original create() call - it isn't independently alterable
        // without rebuilding the table, and the app never writes an enum-constrained column
        // outside MySQL in production, so this migration is a MySQL-only concern.
        if (Schema::getConnection()->getDriverName() !== 'mysql') {
            return;
        }

        DB::statement(
            "ALTER TABLE whatsapp_connection_events MODIFY event_type ENUM('qr_generated', 'connecting', 'connected', 'disconnected', 'reconnect_attempt', 'logged_out', 'bad_session', 'error')"
        );
    }

    public function down(): void
    {
        if (Schema::getConnection()->getDriverName() !== 'mysql') {
            return;
        }

        DB::statement(
            "ALTER TABLE whatsapp_connection_events MODIFY event_type ENUM('qr_generated', 'connecting', 'connected', 'disconnected', 'reconnect_attempt', 'logged_out', 'error')"
        );
    }
};
