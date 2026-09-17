<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('routing_rules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workspace_id')->constrained('workspaces')->cascadeOnDelete();
            $table->string('name', 150);
            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('priority')->default(0);
            $table->json('conditions')->nullable();
            $table->json('actions')->nullable();
            $table->timestamps();

            $table->index(['workspace_id', 'is_active'], 'idx_routing_rules_wa');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('routing_rules');
    }
};