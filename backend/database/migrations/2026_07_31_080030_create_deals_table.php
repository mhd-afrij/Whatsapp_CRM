<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('deals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workspace_id')->constrained('workspaces')->cascadeOnDelete();
            $table->foreignId('lead_id')->nullable()->constrained('leads')->nullOnDelete();
            $table->foreignId('contact_id')->constrained('contacts')->cascadeOnDelete();
            $table->foreignId('pipeline_id')->constrained('pipelines')->cascadeOnDelete();
            $table->foreignId('pipeline_stage_id')->constrained('pipeline_stages')->cascadeOnDelete();
            $table->string('title');
            $table->decimal('value_amount', 12, 2)->nullable();
            $table->char('value_currency', 3)->default('USD');
            $table->foreignId('owner_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->date('expected_close_date')->nullable();
            $table->enum('status', ['open', 'won', 'lost'])->default('open');
            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('deals');
    }
};
