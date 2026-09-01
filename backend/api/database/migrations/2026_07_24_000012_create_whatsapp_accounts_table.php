<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('whatsapp_accounts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workspace_id')->constrained('workspaces')->cascadeOnDelete();
            $table->string('phone_number')->nullable();
            $table->string('device_name')->nullable();
            $table->string('session_state')->default('unlinked');
            $table->timestampTz('linked_at', 3)->nullable();
            $table->timestampTz('last_seen_at', 3)->nullable();
            $table->timestampsTz(3);

            $table->unique('workspace_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('whatsapp_accounts');
    }
};
