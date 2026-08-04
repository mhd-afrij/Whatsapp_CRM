<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('deal_stage_history', function (Blueprint $table) {
            $table->id();
            $table->foreignId('deal_id')->constrained('deals')->cascadeOnDelete();
            $table->foreignId('from_stage_id')->nullable()->constrained('pipeline_stages')->nullOnDelete();
            $table->foreignId('to_stage_id')->constrained('pipeline_stages')->cascadeOnDelete();
            $table->foreignId('moved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('moved_at');
            $table->timestamp('created_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('deal_stage_history');
    }
};
