<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('campaign_messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workspace_id')->constrained('workspaces')->cascadeOnDelete();
            $table->foreignId('campaign_id')->constrained('campaigns')->cascadeOnDelete();
            // Contacts are soft-deleted; a hard delete removes the per-recipient
            // audit row along with the contact, matching conversations behaviour.
            $table->foreignId('contact_id')->constrained('contacts')->cascadeOnDelete();
            // Snapshot of the phone + rendered content at dispatch time.
            $table->string('phone_number', 32);
            $table->text('rendered_content')->nullable();
            $table->string('status', 20)->default('pending'); // pending|sent|failed|skipped
            $table->unsignedBigInteger('conversation_id')->nullable();
            $table->string('wa_message_id')->nullable();
            $table->unsignedBigInteger('dispatch_id')->nullable();
            $table->string('error', 1000)->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->timestamps();

            $table->unique(['campaign_id', 'contact_id']);
            $table->index(['workspace_id', 'status']);
            $table->index(['campaign_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('campaign_messages');
    }
};
