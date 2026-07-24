<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('leads', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workspace_id')->constrained('workspaces')->cascadeOnDelete();
            $table->string('title');
            $table->string('customer_name');
            $table->string('value')->nullable();
            $table->string('stage')->default('new');
            $table->string('agent_name')->nullable();
            $table->date('expected_close_date')->nullable();
            $table->timestampsTz(3);
            $table->softDeletesTz('deleted_at', 3);

            $table->index(['workspace_id', 'stage']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('leads');
    }
};
