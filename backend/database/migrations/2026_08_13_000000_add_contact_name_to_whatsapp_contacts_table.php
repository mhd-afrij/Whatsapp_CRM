<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Saved (address-book) display name for a WhatsApp contact, written by the
     * gateway from Baileys `contacts.upsert` events (see the gateway's
     * contacts-pipeline). Preferred over push_name for display in the CRM UI.
     */
    public function up(): void
    {
        Schema::table('whatsapp_contacts', function (Blueprint $table) {
            $table->string('contact_name')->nullable()->after('push_name');
        });
    }

    public function down(): void
    {
        Schema::table('whatsapp_contacts', function (Blueprint $table) {
            $table->dropColumn('contact_name');
        });
    }
};
