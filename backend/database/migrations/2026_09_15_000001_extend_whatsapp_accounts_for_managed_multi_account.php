<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Extends whatsapp_accounts (created in 2026_09_14_000015) for the managed
 * multi-account feature while preserving the gateway's real architecture:
 * ONE live Baileys session per workspace. Multiple whatsapp_accounts rows are
 * allowed as managed slots, but is_active marks the single row mapped to the
 * real gateway session, so the per-workspace unique index is dropped in favor
 * of a plain index and the default flips to false.
 *
 * Existing deployments whose workspace already has a paired gateway session
 * get one account row backfilled from whatsapp_account_settings / the live
 * whatsapp_sessions row, so the working connection keeps an ACTIVE account.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('whatsapp_accounts', function (Blueprint $table) {
            $table->dropUnique(['workspace_id']);
        });

        Schema::table('whatsapp_accounts', function (Blueprint $table) {
            $table->boolean('is_active')->default(false)->change();
            $table->boolean('auto_reply_enabled')->default(false)->after('status');
            $table->string('routing_mode', 40)->default('default')->after('assigned_team_id');
            // Mirrored from the gateway's whatsapp_sessions.device_id when a
            // real connection reports it (Baileys device metadata); never
            // invented client-side. Nullable because Baileys often does not
            // expose a friendly device label at all.
            $table->string('device_name', 120)->nullable()->after('phone_number');
        });

        // Backfill one managed account per workspace that already has gateway
        // session state but no whatsapp_accounts row yet (the table was never
        // written to before this feature).
        $workspaces = DB::table('whatsapp_sessions')
            ->join('workspaces', 'workspaces.id', '=', 'whatsapp_sessions.workspace_id')
            ->leftJoin('whatsapp_accounts', 'whatsapp_accounts.workspace_id', '=', 'whatsapp_sessions.workspace_id')
            ->leftJoin('whatsapp_account_settings', function ($join) {
                $join->on('whatsapp_account_settings.workspace_id', '=', 'whatsapp_sessions.workspace_id')
                    ->where('whatsapp_account_settings.is_default', true);
            })
            ->whereNull('whatsapp_accounts.id')
            ->groupBy(
                'whatsapp_sessions.workspace_id',
                'whatsapp_sessions.phone_number',
                'whatsapp_sessions.status',
                'whatsapp_sessions.last_connected_at',
                'whatsapp_account_settings.display_name',
                'workspaces.name',
            )
            ->select(
                'whatsapp_sessions.workspace_id',
                'whatsapp_sessions.phone_number',
                'whatsapp_sessions.status',
                'whatsapp_sessions.last_connected_at',
                'whatsapp_account_settings.display_name',
                'workspaces.name as workspace_name',
            )
            ->get();

        foreach ($workspaces as $workspace) {
            DB::table('whatsapp_accounts')->insert([
                'workspace_id' => $workspace->workspace_id,
                'name' => $workspace->display_name ?? ($workspace->phone_number ? 'WhatsApp '.$workspace->phone_number : 'WhatsApp account'),
                'display_name' => $workspace->display_name ?? ($workspace->phone_number ? 'WhatsApp '.$workspace->phone_number : 'WhatsApp account'),
                'phone_number' => $workspace->phone_number,
                'provider' => 'baileys',
                // Only a genuinely connected gateway session earns is_active.
                'status' => $workspace->status === 'connected' ? 'connected' : 'disconnected',
                'is_active' => $workspace->status === 'connected',
                'last_connected_at' => $workspace->last_connected_at,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        Schema::table('whatsapp_accounts', function (Blueprint $table) {
            $table->dropColumn(['auto_reply_enabled', 'routing_mode', 'device_name']);
        });

        Schema::table('whatsapp_accounts', function (Blueprint $table) {
            $table->boolean('is_active')->default(true)->change();
            $table->unique('workspace_id');
        });
    }
};
