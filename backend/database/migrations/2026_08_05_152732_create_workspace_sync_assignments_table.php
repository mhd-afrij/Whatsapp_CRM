<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Lease-based session lock, one row per workspace (docs/04-database-design.md §2).
 *
 * Coordinates which gateway instance currently owns the WhatsApp session for a
 * workspace so two gateway replicas never connect the same session
 * simultaneously (Baileys auth state is not safe for concurrent writers and a
 * second connect forces a re-pair on the first). The gateway acquires a row
 * before opening a socket, refreshes `last_heartbeat_at`/`lease_expires_at`
 * on an interval, and releases on graceful shutdown; a crashed instance is
 * recoverable because the lease simply expires (stale row is re-taken on the
 * next acquire attempt).
 *
 * The backend owns this migration; runtime writes are gateway-only (see
 * docs/DATA_OWNERSHIP.md).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('workspace_sync_assignments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workspace_id')->unique()->constrained('workspaces')->cascadeOnDelete();
            $table->string('gateway_instance_id', 100);
            $table->enum('status', ['acquired', 'released', 'expired'])->default('acquired');
            $table->timestamp('acquired_at')->useCurrent();
            $table->timestamp('last_heartbeat_at')->nullable();
            $table->timestamp('lease_expires_at')->useCurrent();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('workspace_sync_assignments');
    }
};
