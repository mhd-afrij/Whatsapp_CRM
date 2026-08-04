<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('message_reactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('message_id')->constrained('messages')->cascadeOnDelete();
            $table->foreignId('whatsapp_contact_id')->nullable()->constrained('whatsapp_contacts')->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('emoji', 16);
            $table->timestamp('reacted_at');
            $table->timestamps();

            $table->unique(['message_id', 'whatsapp_contact_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('message_reactions');
    }
};
