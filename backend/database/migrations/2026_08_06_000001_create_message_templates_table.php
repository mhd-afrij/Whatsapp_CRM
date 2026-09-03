<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('message_templates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workspace_id')->constrained('workspaces')->cascadeOnDelete();
            $table->string('name', 120);
            $table->string('shortcut', 40)->nullable();
            $table->text('content');
            $table->string('category', 60)->nullable();
            $table->boolean('is_active')->default(true);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['workspace_id', 'is_active']);
            $table->index(['workspace_id', 'category']);
            $table->index(['workspace_id', 'shortcut']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('message_templates');
    }
};
