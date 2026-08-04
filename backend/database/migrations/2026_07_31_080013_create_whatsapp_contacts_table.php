<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('whatsapp_contacts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workspace_id')->constrained('workspaces')->cascadeOnDelete();
            $table->string('wa_jid', 64);
            $table->string('push_name')->nullable();
            $table->string('phone_number', 32)->nullable();
            $table->string('profile_picture_url', 500)->nullable();
            $table->boolean('is_business')->default(false);
            $table->unsignedBigInteger('contact_id')->nullable();
            $table->timestamp('last_seen_at')->nullable();
            $table->timestamps();

            $table->unique(['workspace_id', 'wa_jid']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('whatsapp_contacts');
    }
};
