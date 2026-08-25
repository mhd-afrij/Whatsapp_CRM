<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('whatsapp_sync_checkpoints', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workspace_id')->constrained('workspaces')->cascadeOnDelete();
            $table->string('checkpoint_type', 64);
            $table->string('cursor')->nullable();
            $table->timestamp('last_synced_at')->nullable();
            $table->timestamps();

            $table->unique(['workspace_id', 'checkpoint_type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('whatsapp_sync_checkpoints');
    }
};
