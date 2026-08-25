<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Adds the CRM enrichment fields the Contact Management spec requires on top
 * of the existing identity/WhatsApp columns. WhatsApp-origin profile data
 * (profile picture, last seen, push/saved name) intentionally stays on
 * `whatsapp_contacts` (gateway-owned) rather than being duplicated here.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('contacts', function (Blueprint $table) {
            $table->string('address')->nullable()->after('job_title');
            $table->string('city', 100)->nullable()->after('address');
            $table->string('country', 100)->nullable()->after('city');
            $table->string('timezone', 64)->nullable()->after('country');
            $table->string('status', 20)->default('active')->after('timezone');
            $table->string('source', 30)->nullable()->after('status');
            $table->string('normalized_phone_number', 32)->nullable()->after('phone_number');
            $table->timestamp('last_contacted_at')->nullable()->after('updated_at');
        });

        Schema::table('contacts', function (Blueprint $table) {
            // Dedup + lookups: workspace-scoped normalized phone is the primary
            // matching key (spec §4) - "0771234567" and "+94771234567" both
            // normalize to "94771234567" and must resolve to one contact.
            $table->index(['workspace_id', 'normalized_phone_number']);
            $table->index(['workspace_id', 'status']);
            $table->index(['workspace_id', 'created_at']);
            $table->index(['workspace_id', 'updated_at']);
            $table->index(['workspace_id', 'last_contacted_at']);
        });
    }

    public function down(): void
    {
        Schema::table('contacts', function (Blueprint $table) {
            $table->dropIndex(['workspace_id', 'normalized_phone_number']);
            $table->dropIndex(['workspace_id', 'status']);
            $table->dropIndex(['workspace_id', 'created_at']);
            $table->dropIndex(['workspace_id', 'updated_at']);
            $table->dropIndex(['workspace_id', 'last_contacted_at']);
        });

        Schema::table('contacts', function (Blueprint $table) {
            $table->dropColumn([
                'address', 'city', 'country', 'timezone', 'status',
                'source', 'normalized_phone_number', 'last_contacted_at',
            ]);
        });
    }
};
