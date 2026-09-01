<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('calendar_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workspace_id')->constrained('workspaces')->cascadeOnDelete();
            $table->string('title');
            $table->dateTimeTz('starts_at', 3);
            $table->dateTimeTz('ends_at', 3)->nullable();
            $table->string('location')->nullable();
            $table->string('kind')->default('follow_up');
            $table->timestamps();
            $table->softDeletes();

            $table->index(['workspace_id', 'starts_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('calendar_events');
    }
};
