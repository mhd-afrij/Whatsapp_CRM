<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Schema-drift fix: the whatsapp-gateway's `contacts.upsert` pipeline
 * (src/whatsapp/message-repository.ts::upsertContactName) persists the saved
 * address-book name into `whatsapp_contacts.contact_name`, and the backend's
 * conversation/contact serialization already reads it - but no migration ever
 * created the column, so a real deployment would fail on the first
 * `contacts.upsert` event with "Unknown column 'contact_name'".
 */
return new class extends Migration
{
    public function up(): void
    {
        // Guard against local dev databases where the column was already added
        // by hand during gateway testing; a fresh install still needs it.
        if (Schema::hasColumn('whatsapp_contacts', 'contact_name')) {
            return;
        }

        Schema::table('whatsapp_contacts', function (Blueprint $table) {
            $table->string('contact_name')->nullable()->after('push_name');
        });
    }

    public function down(): void
    {
        if (Schema::hasColumn('whatsapp_contacts', 'contact_name')) {
            Schema::table('whatsapp_contacts', function (Blueprint $table) {
                $table->dropColumn('contact_name');
            });
        }
    }
};
