<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sla_configs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workspace_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->integer('first_response_minutes')->default(60);
            $table->integer('followup_response_minutes')->default(240);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->unique(['workspace_id', 'name']);
        });

        Schema::create('sla_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignId('conversation_id')->constrained()->cascadeOnDelete();
            $table->foreignId('sla_config_id')->nullable()->constrained()->nullOnDelete();
            $table->string('type'); // first_response, followup_response
            $table->string('status'); // pending, within_sla, at_risk, breached, resolved
            $table->timestamp('started_at');
            $table->timestamp('deadline_at');
            $table->timestamp('resolved_at')->nullable();
            $table->timestamps();

            $table->index(['workspace_id', 'conversation_id', 'status']);
            $table->index(['workspace_id', 'status', 'deadline_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sla_events');
        Schema::dropIfExists('sla_configs');
    }
};
