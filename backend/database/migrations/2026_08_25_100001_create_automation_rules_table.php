<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('automation_rules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workspace_id')->constrained()->cascadeOnDelete();
            $table->string('name', 120);
            $table->string('trigger_type', 40);
            $table->string('trigger_value', 255)->nullable();
            $table->json('actions');
            $table->boolean('is_active')->default(false);
            $table->unsignedInteger('run_count')->default(0);
            $table->timestamp('last_run_at')->nullable();
            $table->timestamps();
            $table->index(['workspace_id', 'is_active', 'trigger_type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('automation_rules');
    }
};