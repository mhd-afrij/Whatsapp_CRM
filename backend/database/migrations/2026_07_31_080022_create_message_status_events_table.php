<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('message_status_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('message_id')->constrained('messages')->cascadeOnDelete();
            $table->enum('status', ['queued', 'sent', 'delivered', 'read', 'failed']);
            $table->timestamp('occurred_at');
            $table->json('raw_payload')->nullable();
            $table->timestamp('created_at')->nullable();

            $table->index(['message_id', 'occurred_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('message_status_events');
    }
};
