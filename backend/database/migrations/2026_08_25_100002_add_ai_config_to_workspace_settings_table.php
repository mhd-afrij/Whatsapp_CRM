<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('workspace_settings', function (Blueprint $table) {
            $table->string('ai_provider', 20)->nullable();
            $table->string('ai_model', 120)->nullable();
            $table->text('ai_api_key')->nullable();
            $table->text('ai_business_context')->nullable();
            $table->boolean('ai_enabled')->default(false);
        });
    }

    public function down(): void
    {
        Schema::table('workspace_settings', function (Blueprint $table) {
            $table->dropColumn(['ai_provider', 'ai_model', 'ai_api_key', 'ai_business_context', 'ai_enabled']);
        });
    }
};