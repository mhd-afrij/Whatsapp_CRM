<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('refresh_tokens', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('token_hash'); // SHA-256 hash of the opaque refresh token — raw value is never stored.
            $table->uuid('family_id'); // Shared by a token and everything it rotates into; reuse of a revoked token in the family signals theft.
            $table->timestampTz('revoked_at', 3)->nullable();
            // Nullable at the schema level only to avoid MySQL strict-mode's
            // "invalid default value" error on NOT NULL TIMESTAMP columns
            // without a DEFAULT; the application always supplies a value.
            $table->timestampTz('expires_at', 3)->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->timestampsTz(3);

            $table->index('user_id');
            $table->index('family_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('refresh_tokens');
    }
};
