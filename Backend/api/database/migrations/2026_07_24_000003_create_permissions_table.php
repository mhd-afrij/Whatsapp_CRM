<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('permissions', function (Blueprint $table) {
            $table->id();
            $table->string('key')->unique(); // e.g. "conversations.assign"
            $table->string('description');
            $table->timestampsTz(3);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('permissions');
    }
};
