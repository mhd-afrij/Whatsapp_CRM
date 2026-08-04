<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('whatsapp_session_credentials', function (Blueprint $table) {
            $table->id();
            $table->foreignId('whatsapp_session_id')->constrained('whatsapp_sessions')->cascadeOnDelete();
            $table->string('key_name', 100);
            $table->longText('value');
            $table->timestamps();

            $table->unique(['whatsapp_session_id', 'key_name']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('whatsapp_session_credentials');
    }
};
