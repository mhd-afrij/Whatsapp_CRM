<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leads', function (Blueprint $table) {
            // Expand source enum to match the full spec (§3).
            $table->dropColumn('source');
        });

        Schema::table('leads', function (Blueprint $table) {
            $table->string('source', 32)->default('manual')->after('conversation_id');
            $table->string('source_detail')->nullable()->after('source');
            $table->string('campaign')->nullable()->after('source_detail');
            $table->string('landing_page')->nullable()->after('campaign');
            $table->string('external_lead_id')->nullable()->after('landing_page');

            // Expand status → stage to match lifecycle (§2).
            $table->dropColumn('status');

            // Rename and expand.  We drop + re-add because MySQL won't
            // change an enum column's values in-place reliably.
        });

        Schema::table('leads', function (Blueprint $table) {
            $table->string('stage', 32)->default('new')->after('external_lead_id');

            // Qualification / scoring (§7).
            $table->unsignedSmallInteger('score')->default(0)->after('stage');
            $table->string('temperature', 16)->default('cold')->after('score');

            // Requirements (§6).
            $table->string('property_type')->nullable()->after('temperature');
            $table->string('preferred_location')->nullable()->after('property_type');
            $table->decimal('budget_min', 12, 2)->unsigned()->nullable()->after('preferred_location');
            $table->decimal('budget_max', 12, 2)->unsigned()->nullable()->after('budget_min');
            $table->unsignedTinyInteger('bedrooms')->nullable()->after('budget_max');
            $table->unsignedTinyInteger('bathrooms')->nullable()->after('bedrooms');
            $table->enum('requirement_type', ['purchase', 'rental'])->nullable()->after('bathrooms');

            // Assignment team support (§8).
            $table->foreignId('assigned_team_id')->nullable()->constrained('teams')->nullOnDelete()->after('owner_user_id');

            // Lost / conversion tracking (§10, §11).
            $table->string('lost_reason')->nullable()->after('notes');
            $table->text('lost_notes')->nullable()->after('lost_reason');
            $table->timestamp('converted_at')->nullable()->after('lost_notes');

            // Helpful indexes for the list/search view.
            $table->index('stage');
            $table->index('score');
            $table->index('temperature');
            $table->index('assigned_team_id');
            $table->index('external_lead_id');
        });
    }

    public function down(): void
    {
        Schema::table('leads', function (Blueprint $table) {
            $table->dropIndex(['stage']);
            $table->dropIndex(['score']);
            $table->dropIndex(['temperature']);
            $table->dropIndex(['assigned_team_id']);
            $table->dropIndex(['external_lead_id']);

            $table->dropColumn([
                'source_detail', 'campaign', 'landing_page', 'external_lead_id',
                'score', 'temperature',
                'property_type', 'preferred_location', 'budget_min', 'budget_max',
                'bedrooms', 'bathrooms', 'requirement_type',
                'assigned_team_id',
                'lost_reason', 'lost_notes', 'converted_at',
            ]);

            // Revert to original enum columns.
            $table->dropColumn('source');
            $table->dropColumn('stage');
        });

        Schema::table('leads', function (Blueprint $table) {
            $table->enum('source', ['whatsapp', 'manual', 'import', 'other'])->default('whatsapp');
            $table->enum('status', ['new', 'contacted', 'qualified', 'disqualified', 'converted'])->default('new');
        });
    }
};
