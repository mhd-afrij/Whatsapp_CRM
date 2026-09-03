<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('workspaces', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->string('name');
            $table->string('slug')->unique();
            $table->string('timezone')->default('UTC');
            $table->enum('status', ['active', 'suspended'])->default('active');
            $table->timestampsTz(3);
            $table->softDeletesTz('deleted_at', 3);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('workspaces');
    }
};
