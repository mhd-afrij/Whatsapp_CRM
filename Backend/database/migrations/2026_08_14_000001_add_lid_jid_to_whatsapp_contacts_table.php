<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * WhatsApp contacts with phone-number privacy enabled are identified by an
 * opaque LID (Linked ID) jid like "176974261706752@lid" whose numeric part is
 * NOT their real phone number. The gateway (whatsapp-gateway) now resolves
 * these to the canonical phone-number jid via a `lid_jid` alias column on the
 * whatsapp_contacts row (see src/whatsapp/message-repository.ts::setLidJid).
 *
 * Without this column, an inbound @lid message splits one person into two
 * whatsapp_contacts rows, and the backend's ContactAutoLinker fabricates a
 * duplicate CRM contact from the fake 15-digit "phone" number.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('whatsapp_contacts', 'lid_jid')) {
            return;
        }

        Schema::table('whatsapp_contacts', function (Blueprint $table) {
            $table->string('lid_jid')->nullable()->after('wa_jid');
            // Lookups are always workspace-scoped, matching the unique key on
            // (workspace_id, wa_jid) - keep them indexed the same way.
            $table->index(['workspace_id', 'lid_jid']);
        });
    }

    public function down(): void
    {
        if (Schema::hasColumn('whatsapp_contacts', 'lid_jid')) {
            Schema::table('whatsapp_contacts', function (Blueprint $table) {
                $table->dropIndex(['workspace_id', 'lid_jid']);
                $table->dropColumn('lid_jid');
            });
        }
    }
};
