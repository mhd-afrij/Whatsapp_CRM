<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('whatsapp_sessions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workspace_id')->unique()->constrained('workspaces')->cascadeOnDelete();
            $table->enum('status', ['initializing', 'qr_pending', 'connected', 'disconnected', 'logged_out']);
            $table->string('phone_number', 32)->nullable();
            $table->string('device_id', 64)->nullable();
            $table->timestamp('last_connected_at')->nullable();
            $table->timestamp('last_disconnected_at')->nullable();
            $table->string('disconnect_reason')->nullable();
            $table->text('qr_code')->nullable();
            $table->timestamp('qr_expires_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('whatsapp_sessions');
    }
};
