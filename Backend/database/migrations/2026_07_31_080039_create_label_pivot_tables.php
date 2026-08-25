<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('contact_label', function (Blueprint $table) {
            $table->foreignId('label_id')->constrained('labels')->cascadeOnDelete();
            $table->foreignId('contact_id')->constrained('contacts')->cascadeOnDelete();
            $table->timestamp('created_at')->nullable();

            $table->primary(['label_id', 'contact_id']);
        });

        Schema::create('conversation_label', function (Blueprint $table) {
            $table->foreignId('label_id')->constrained('labels')->cascadeOnDelete();
            $table->foreignId('conversation_id')->constrained('conversations')->cascadeOnDelete();
            $table->timestamp('created_at')->nullable();

            $table->primary(['label_id', 'conversation_id']);
        });

        Schema::create('lead_label', function (Blueprint $table) {
            $table->foreignId('label_id')->constrained('labels')->cascadeOnDelete();
            $table->foreignId('lead_id')->constrained('leads')->cascadeOnDelete();
            $table->timestamp('created_at')->nullable();

            $table->primary(['label_id', 'lead_id']);
        });

        Schema::create('deal_label', function (Blueprint $table) {
            $table->foreignId('label_id')->constrained('labels')->cascadeOnDelete();
            $table->foreignId('deal_id')->constrained('deals')->cascadeOnDelete();
            $table->timestamp('created_at')->nullable();

            $table->primary(['label_id', 'deal_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('deal_label');
        Schema::dropIfExists('lead_label');
        Schema::dropIfExists('conversation_label');
        Schema::dropIfExists('contact_label');
    }
};
