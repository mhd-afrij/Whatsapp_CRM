<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('message_dispatch_queue', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workspace_id')->constrained('workspaces')->cascadeOnDelete();
            $table->foreignId('conversation_id')->constrained('conversations')->cascadeOnDelete();
            $table->foreignId('requested_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->json('payload');
            $table->string('bullmq_job_id', 100)->nullable();
            $table->enum('status', ['pending', 'processing', 'sent', 'failed'])->default('pending');
            $table->unsignedInteger('attempts')->default(0);
            $table->foreignId('message_id')->nullable()->constrained('messages')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('message_dispatch_queue');
    }
};
