<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * WhatsApp message templates ("Saved Message Templates"). This is deliberately
 * separate from the legacy message_templates (quick replies) used by the inbox
 * composer. The application is Baileys-only: there is NO Meta approval flow, so
 * provider_template_id / approval_status stay null and the UI labels these
 * "Saved Message Template" (never "Meta approved").
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('whatsapp_templates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workspace_id')->constrained('workspaces')->cascadeOnDelete();
            $table->foreignId('account_id')->nullable()->constrained('whatsapp_accounts')->nullOnDelete();
            $table->string('name', 150);
            $table->string('key', 120)->nullable();
            $table->string('category', 60)->default('general');
            $table->string('language', 20)->default('en');
            $table->string('header_type', 20)->default('none');
            $table->text('header_content')->nullable();
            $table->text('body');
            $table->text('footer')->nullable();
            $table->json('buttons_json')->nullable();
            $table->json('variables_json')->nullable();
            $table->string('provider_template_id', 120)->nullable();
            $table->string('approval_status', 30)->nullable();
            $table->boolean('is_active')->default(true);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['workspace_id', 'key']);
            $table->index(['workspace_id', 'is_active'], 'idx_whatsapp_templates_wia');
            $table->index(['workspace_id', 'category'], 'idx_whatsapp_templates_wc');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('whatsapp_templates');
    }
};