<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('whatsapp_connection_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workspace_id')->constrained('workspaces')->cascadeOnDelete();
            $table->foreignId('whatsapp_session_id')->constrained('whatsapp_sessions')->cascadeOnDelete();
            $table->enum('event_type', ['qr_generated', 'connecting', 'connected', 'disconnected', 'reconnect_attempt', 'logged_out', 'error']);
            $table->json('metadata')->nullable();
            $table->timestamp('occurred_at');
            $table->timestamp('created_at')->nullable();

            $table->index(['whatsapp_session_id', 'occurred_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('whatsapp_connection_events');
    }
};
