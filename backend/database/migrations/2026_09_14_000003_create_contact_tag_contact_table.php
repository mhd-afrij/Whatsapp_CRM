<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('contact_tag_contact', function (Blueprint $table) {
            $table->id();
            $table->foreignId('contact_tag_id')->constrained('contact_tags')->cascadeOnDelete();
            $table->foreignId('contact_id')->constrained('contacts')->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['contact_tag_id', 'contact_id'], 'idx_contact_tag_contact_unique');
            $table->index('contact_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('contact_tag_contact');
    }
};