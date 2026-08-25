<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('contacts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workspace_id')->constrained('workspaces')->cascadeOnDelete();
            $table->foreignId('whatsapp_contact_id')->nullable()->constrained('whatsapp_contacts')->nullOnDelete();
            $table->string('full_name')->nullable();
            $table->string('email')->nullable();
            $table->string('company')->nullable();
            $table->string('job_title', 150)->nullable();
            $table->string('phone_number', 32)->nullable();
            $table->json('custom_fields')->nullable();
            $table->foreignId('owner_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['workspace_id', 'phone_number']);
            $table->index(['workspace_id', 'email']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('contacts');
    }
};
