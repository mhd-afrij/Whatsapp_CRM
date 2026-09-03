<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pipelines', function (Blueprint $table) {
            $table->id(); $table->foreignId('workspace_id')->constrained('workspaces')->cascadeOnDelete();
            $table->string('name', 150); $table->boolean('is_default')->default(false); $table->timestamps();
            $table->unique(['workspace_id', 'name']);
        });
        Schema::create('pipeline_stages', function (Blueprint $table) {
            $table->id(); $table->foreignId('pipeline_id')->constrained('pipelines')->cascadeOnDelete();
            $table->string('name', 100); $table->unsignedInteger('position'); $table->unsignedTinyInteger('probability_percent')->nullable();
            $table->boolean('is_won_stage')->default(false); $table->boolean('is_lost_stage')->default(false); $table->timestamps();
            $table->unique(['pipeline_id', 'position']);
        });
        Schema::create('leads', function (Blueprint $table) {
            $table->id(); $table->foreignId('workspace_id')->constrained('workspaces')->cascadeOnDelete(); $table->foreignId('contact_id')->constrained('contacts')->cascadeOnDelete();
            $table->foreignId('conversation_id')->nullable()->constrained('conversations')->nullOnDelete(); $table->string('source', 32)->default('manual');
            $table->string('source_detail')->nullable(); $table->string('campaign')->nullable(); $table->string('landing_page')->nullable(); $table->string('external_lead_id')->nullable();
            $table->string('stage', 32)->default('new'); $table->unsignedSmallInteger('score')->default(0); $table->string('temperature', 16)->default('cold');
            $table->string('property_type')->nullable(); $table->string('preferred_location')->nullable(); $table->decimal('budget_min', 12, 2)->unsigned()->nullable(); $table->decimal('budget_max', 12, 2)->unsigned()->nullable();
            $table->unsignedTinyInteger('bedrooms')->nullable(); $table->unsignedTinyInteger('bathrooms')->nullable(); $table->enum('requirement_type', ['purchase', 'rental'])->nullable();
            $table->foreignId('owner_user_id')->nullable()->constrained('users')->nullOnDelete(); $table->foreignId('assigned_team_id')->nullable()->constrained('teams')->nullOnDelete();
            $table->text('notes')->nullable(); $table->string('lost_reason')->nullable(); $table->text('lost_notes')->nullable(); $table->timestamp('converted_at')->nullable(); $table->timestamps(); $table->softDeletes();
            $table->index(['workspace_id', 'stage']); $table->index(['workspace_id', 'temperature']); $table->index('external_lead_id');
        });
        Schema::create('lead_activities', function (Blueprint $table) {
            $table->id(); $table->foreignId('workspace_id')->constrained('workspaces')->cascadeOnDelete(); $table->foreignId('lead_id')->constrained('leads')->cascadeOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete(); $table->string('activity_type', 64); $table->text('description')->nullable(); $table->json('metadata')->nullable(); $table->timestamp('occurred_at'); $table->timestamps();
            $table->index(['lead_id', 'occurred_at']);
        });
        Schema::create('lead_label', function (Blueprint $table) { $table->id(); $table->foreignId('lead_id')->constrained('leads')->cascadeOnDelete(); $table->foreignId('label_id')->constrained('labels')->cascadeOnDelete(); $table->timestamps(); $table->unique(['lead_id', 'label_id']); });
        Schema::table('deals', fn (Blueprint $table) => $table->foreignId('lead_id')->nullable()->after('workspace_id')->constrained('leads')->nullOnDelete());
        Schema::table('tasks', fn (Blueprint $table) => $table->foreignId('lead_id')->nullable()->after('contact_id')->constrained('leads')->nullOnDelete());
        Schema::table('workspace_settings', function (Blueprint $table) {
            $table->unsignedBigInteger('default_pipeline_id')->nullable();
            $table->foreign('default_pipeline_id')->references('id')->on('pipelines')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('workspace_settings', fn (Blueprint $table) => $table->dropForeign(['default_pipeline_id'])); Schema::table('tasks', fn (Blueprint $table) => $table->dropForeign(['lead_id'])); Schema::table('deals', fn (Blueprint $table) => $table->dropForeign(['lead_id']));
        Schema::table('tasks', fn (Blueprint $table) => $table->dropColumn('lead_id')); Schema::table('deals', fn (Blueprint $table) => $table->dropColumn('lead_id'));
        Schema::dropIfExists('lead_label'); Schema::dropIfExists('lead_activities'); Schema::dropIfExists('leads'); Schema::dropIfExists('pipeline_stages'); Schema::dropIfExists('pipelines');
    }
};
