<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('contact_tags', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workspace_id')->constrained('workspaces')->cascadeOnDelete();
            $table->string('name', 100);
            $table->string('color', 20)->default('#22c55e');
            $table->string('description', 500)->nullable();
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();

            $table->unique(['workspace_id', 'name']);
            $table->index(['workspace_id', 'sort_order'], 'idx_contact_tags_ws');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('contact_tags');
    }
};