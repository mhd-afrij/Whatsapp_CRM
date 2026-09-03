<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::disableForeignKeyConstraints();

        // Drop pivot table first
        Schema::dropIfExists('lead_label');

        // Drop child tables
        Schema::dropIfExists('lead_activities');
        Schema::dropIfExists('leads');

        // Drop pipeline stages before pipelines
        Schema::dropIfExists('pipeline_stages');
        Schema::dropIfExists('pipelines');

        // Remove lead_id FK columns from other tables
        Schema::table('deals', function (Blueprint $table) {
            $table->dropForeign(['lead_id']);
            $table->dropColumn('lead_id');
        });

        Schema::table('tasks', function (Blueprint $table) {
            $table->dropForeign(['lead_id']);
            $table->dropColumn('lead_id');
        });

        Schema::table('workspace_settings', function (Blueprint $table) {
            $table->dropForeign(['default_pipeline_id']);
            $table->dropColumn('default_pipeline_id');
        });

        Schema::enableForeignKeyConstraints();
    }

    public function down(): void
    {
        Schema::disableForeignKeyConstraints();

        Schema::table('workspace_settings', function (Blueprint $table) {
            $table->unsignedBigInteger('default_pipeline_id')->nullable();
            $table->foreign('default_pipeline_id')->references('id')->on('pipelines')->nullOnDelete();
        });

        Schema::table('tasks', function (Blueprint $table) {
            $table->unsignedBigInteger('lead_id')->nullable();
            $table->foreign('lead_id')->references('id')->on('leads')->nullOnDelete();
        });

        Schema::table('deals', function (Blueprint $table) {
            $table->unsignedBigInteger('lead_id')->nullable();
            $table->foreign('lead_id')->references('id')->on('leads')->nullOnDelete();
        });

        Schema::create('pipelines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workspace_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->boolean('is_default')->default(false);
            $table->timestamps();
        });

        Schema::create('pipeline_stages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('pipeline_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->unsignedInteger('position')->default(0);
            $table->boolean('is_won_stage')->default(false);
            $table->boolean('is_lost_stage')->default(false);
            $table->decimal('probability_percent', 5, 2)->nullable();
            $table->timestamps();
        });

        Schema::create('leads', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignId('contact_id')->constrained()->cascadeOnDelete();
            $table->string('stage')->default('new');
            $table->string('temperature')->default('warm');
            $table->integer('score')->default(0);
            $table->string('source')->nullable();
            $table->string('source_detail')->nullable();
            $table->string('campaign')->nullable();
            $table->foreignId('owner_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('assigned_team_id')->nullable()->constrained('teams')->nullOnDelete();
            $table->string('property_type')->nullable();
            $table->string('preferred_location')->nullable();
            $table->decimal('budget_min', 12, 2)->nullable();
            $table->decimal('budget_max', 12, 2)->nullable();
            $table->unsignedInteger('bedrooms')->nullable();
            $table->unsignedInteger('bathrooms')->nullable();
            $table->string('requirement_type')->nullable();
            $table->text('notes')->nullable();
            $table->string('lost_reason')->nullable();
            $table->timestamp('lost_at')->nullable();
            $table->string('converted_at')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('lead_activities', function (Blueprint $table) {
            $table->id();
            $table->foreignId('lead_id')->constrained()->cascadeOnDelete();
            $table->foreignId('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignId('creator_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('activity_type');
            $table->text('description')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamp('occurred_at');
            $table->timestamps();
        });

        Schema::create('lead_label', function (Blueprint $table) {
            $table->id();
            $table->foreignId('lead_id')->constrained()->cascadeOnDelete();
            $table->foreignId('label_id')->constrained()->cascadeOnDelete();
            $table->timestamps();
        });

        Schema::enableForeignKeyConstraints();
    }
};
