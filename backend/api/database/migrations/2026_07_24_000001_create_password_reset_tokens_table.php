<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('password_reset_tokens', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('token_hash');
            // Nullable at the schema level only, for the same reason noted
            // in the refresh_tokens migration (MySQL strict-mode default).
            $table->timestampTz('expires_at', 3)->nullable();
            $table->timestampTz('used_at', 3)->nullable();
            $table->timestampTz('created_at', 3)->useCurrent();

            $table->index('user_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('password_reset_tokens');
    }
};
