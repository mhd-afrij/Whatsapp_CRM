<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('crm_notifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workspace_id')->constrained('workspaces')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('type');
            $table->string('title');
            $table->text('body')->nullable();
            $table->timestampTz('read_at', 3)->nullable();
            $table->nullableMorphs('notifiable');
            $table->timestampsTz(3);

            $table->index(['workspace_id', 'user_id', 'type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('crm_notifications');
    }
};
