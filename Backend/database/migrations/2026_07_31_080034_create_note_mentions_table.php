<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('note_mentions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('internal_note_id')->constrained('internal_notes')->cascadeOnDelete();
            $table->foreignId('mentioned_user_id')->constrained('users')->cascadeOnDelete();
            $table->timestamp('notified_at')->nullable();
            $table->timestamp('created_at')->nullable();

            $table->unique(['internal_note_id', 'mentioned_user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('note_mentions');
    }
};
