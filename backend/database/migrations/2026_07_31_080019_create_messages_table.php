<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workspace_id')->constrained('workspaces')->cascadeOnDelete();
            $table->foreignId('conversation_id')->constrained('conversations')->cascadeOnDelete();
            $table->string('whatsapp_message_id', 128);
            $table->enum('direction', ['inbound', 'outbound']);
            $table->enum('sender_type', ['contact', 'user', 'system']);
            $table->foreignId('sender_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->enum('message_type', ['text', 'image', 'video', 'audio', 'document', 'sticker', 'location', 'contact_card', 'template', 'system']);
            $table->text('body')->nullable();
            $table->enum('status', ['queued', 'sent', 'delivered', 'read', 'failed']);
            $table->unsignedBigInteger('replied_to_message_id')->nullable();
            $table->boolean('is_deleted_for_everyone')->default(false);
            $table->timestamp('sent_at')->nullable();
            $table->timestamps();

            $table->unique(['workspace_id', 'whatsapp_message_id']);
            $table->index(['conversation_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('messages');
    }
};
