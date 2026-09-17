<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Multi-step workspace onboarding (see docs/onboarding/README.md).
     *
     * users:
     *   - username: globally unique signup handle, collected in onboarding
     *     Step 1. Nullable for account rows created via invitation accept
     *     (which predate this feature) and for the platform super admin.
     *   - position: free-text job title/profile metadata (Owner, Director,
     *     Manager, Agent, ...). Explicitly NOT an RBAC role - the creator's
     *     access tier comes from the seeded workspace Owner role.
     *
     * workspaces:
     *   - onboarding_step: backend-determined wizard state. Existing
     *     workspaces (invitation-based, transferred, super-admin managed)
     *     are born 'completed' so only self-service signups walk the wizard.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('username', 60)->nullable()->unique()->after('email');
            $table->string('position', 120)->nullable()->after('about');
        });

        Schema::table('workspaces', function (Blueprint $table) {
            $table->string('onboarding_step', 40)->default('completed')->after('is_active');
            // The user-facing WhatsApp display name chosen in onboarding Step 2.
            // Survives as workspace-level metadata so the flow is resumable
            // even if the managed whatsapp_accounts slot is created later.
            $table->string('whatsapp_display_name', 120)->nullable()->after('onboarding_step');
        });
    }

    public function down(): void
    {
        Schema::table('workspaces', function (Blueprint $table) {
            $table->dropColumn('onboarding_step');
        });

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['username', 'position']);
        });
    }
};