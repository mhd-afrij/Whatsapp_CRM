<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The gateway's inbound handler now resolves contacts by normalized phone
 * number as a fallback when the exact wa_jid misses (see
 * whatsapp-gateway/src/whatsapp/message-repository.ts::findOrCreateWhatsappContact),
 * so a reply whose jid drifted from the row created at send time reuses the
 * existing whatsapp_contact instead of splitting one person into two rows.
 * That lookup is always workspace-scoped - index it the same way as the
 * (workspace_id, wa_jid) unique key.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasIndex('whatsapp_contacts', ['workspace_id', 'phone_number'])) {
            Schema::table('whatsapp_contacts', function (Blueprint $table) {
                $table->index(['workspace_id', 'phone_number']);
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasIndex('whatsapp_contacts', ['workspace_id', 'phone_number'])) {
            Schema::table('whatsapp_contacts', function (Blueprint $table) {
                $table->dropIndex(['workspace_id', 'phone_number']);
            });
        }
    }
};
