<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('whatsapp_sessions', function (Blueprint $table) {
            try {
                $table->dropUnique(['workspace_id']);
            } catch (Throwable) {
                // Some local databases may already have this changed.
            }
        });

        Schema::create('whatsapp_account_settings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workspace_id')->constrained('workspaces')->cascadeOnDelete();
            $table->foreignId('whatsapp_session_id')->nullable()->constrained('whatsapp_sessions')->cascadeOnDelete();
            $table->foreignId('assigned_team_id')->nullable()->constrained('teams')->nullOnDelete();
            $table->string('display_name', 120)->nullable();
            $table->boolean('is_default')->default(false);
            $table->json('auto_reply_settings')->nullable();
            $table->timestamps();
            $table->unique(['workspace_id', 'whatsapp_session_id']);
            $table->index(['workspace_id', 'is_default']);
        });

        $sessionRows = DB::table('whatsapp_sessions')->select('id', 'workspace_id')->orderBy('id')->get();
        foreach ($sessionRows->groupBy('workspace_id') as $workspaceId => $sessions) {
            foreach ($sessions as $index => $session) {
                DB::table('whatsapp_account_settings')->insert([
                    'workspace_id' => $workspaceId,
                    'whatsapp_session_id' => $session->id,
                    'display_name' => 'WhatsApp '.($index + 1),
                    'is_default' => $index === 0,
                    'auto_reply_settings' => json_encode(['enabled' => false, 'message' => null]),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('whatsapp_account_settings');

        Schema::table('whatsapp_sessions', function (Blueprint $table) {
            try {
                $table->unique('workspace_id');
            } catch (Throwable) {
                // Restoring the historical unique constraint can fail if duplicates exist.
            }
        });
    }
};
