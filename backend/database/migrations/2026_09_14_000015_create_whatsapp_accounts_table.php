<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * WhatsApp accounts (ONE per workspace by design - the CRM maps each workspace
 * to its own Baileys session/gateway instance, so a workspace is never allowed
 * to manage multiple accounts). The account holds the display metadata +
 * connection bookkeeping; the actual authenticated session lives in the
 * gateway and its whatsapp_sessions row (which the backend only reads).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('whatsapp_accounts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workspace_id')->unique()->constrained('workspaces')->cascadeOnDelete();
            $table->string('name', 120)->nullable();
            $table->string('phone_number', 32)->nullable();
            $table->string('display_name', 120)->nullable();
            $table->string('provider', 32)->default('baileys');
            $table->string('status', 40)->default('disconnected');
            $table->foreignId('assigned_team_id')->nullable()->constrained('teams')->nullOnDelete();
            $table->boolean('is_active')->default(true);
            $table->timestamp('last_connected_at')->nullable();
            $table->timestamp('last_disconnected_at')->nullable();
            $table->timestamp('last_heartbeat_at')->nullable();
            $table->string('last_error_code', 60)->nullable();
            $table->text('last_error_message')->nullable();
            $table->json('routing_settings')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['workspace_id', 'is_active'], 'idx_whatsapp_accounts_wia');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('whatsapp_accounts');
    }
};