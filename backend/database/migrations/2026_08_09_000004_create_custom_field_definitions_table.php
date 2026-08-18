<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('custom_field_definitions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workspace_id')->constrained('workspaces')->cascadeOnDelete();
            $table->string('entity_type', 50); // 'contact', 'lead', 'deal'
            $table->string('name', 100);
            $table->string('key', 100); // machine-readable key
            $table->enum('field_type', ['text', 'number', 'select', 'date', 'boolean']);
            $table->json('options')->nullable(); // for select type: array of {label, value}
            $table->boolean('is_required')->default(false);
            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();

            $table->unique(['workspace_id', 'entity_type', 'key']);
            $table->index(['workspace_id', 'entity_type', 'is_active'], 'custom_fields_ws_entity_active_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('custom_field_definitions');
    }
};
