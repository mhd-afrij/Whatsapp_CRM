<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Re-establishes data-integrity guarantees and denormalized-query indexes
 * around the lead/pipeline domain re-creation (2026_08_19_123641 drop,
 * 2026_08_24_000002 restore), in a way that adapts to the server's behavior:
 *
 *  - On MariaDB, dropping the parent tables with FK checks disabled leaves the
 *    referencing FKs on `deals` / `deal_stage_history` in place (they silently
 *    resolve to the re-created parents), so they must NOT be re-created there.
 *  - On standard MySQL, those FKs are dropped with the parent tables, so the
 *    orphaned rows need deleting and the constraints re-adding.
 *
 * The migration therefore inspects the live schema (information_schema) and
 * only fills the gaps that actually exist, alongside:
 *   - composite indexes for the deal list / task list / inbox hot paths;
 *   - replacement of the message_reactions 3-column unique (which allowed
 *     per-identity duplicates because NULLs never collide in MySQL) with two
 *     per-identity uniques, after de-duping existing rows.
 *
 * MySQL-family only: SQLite cannot express grouped FKs with ON DELETE clauses
 * through the plain ALTER syntax and is already schema-clean in tests.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::getConnection()->getDriverName() !== 'mysql') {
            return;
        }

        Schema::disableForeignKeyConstraints();

        try {
            // 1. deals: re-link pipeline columns only when the constraint really
            //    is gone; MariaDB keeps it across the check-disabled drop.
            $pipelineFkExists = $this->foreignKeyExists('deals', 'deals_pipeline_id_foreign');
            $stageFkExists = $this->foreignKeyExists('deals', 'deals_pipeline_stage_id_foreign');

            if (! $pipelineFkExists || ! $stageFkExists) {
                // Orphans whose pipeline/stage rows never came back (original
                // semantics were cascade-on-delete, so under a restored schema
                // those deals would have been deleted too). Delete before adding
                // constraints or MySQL refuses the ALTER.
                DB::table('deals')
                    ->whereNotIn('pipeline_id', DB::table('pipelines')->select('id'))
                    ->orWhereNotIn('pipeline_stage_id', DB::table('pipeline_stages')->select('id'))
                    ->delete();
            }

            if (! $pipelineFkExists) {
                $this->dropIndexIfExists('deals', 'deals_pipeline_id_index');
                $this->dropIndexIfExists('deals', 'deals_pipeline_id_foreign');
                Schema::table('deals', fn (Blueprint $table) => $table->foreign('pipeline_id')
                    ->references('id')->on('pipelines')->cascadeOnDelete());
            }
            if (! $stageFkExists) {
                $this->dropIndexIfExists('deals', 'deals_pipeline_stage_id_index');
                $this->dropIndexIfExists('deals', 'deals_pipeline_stage_id_foreign');
                Schema::table('deals', fn (Blueprint $table) => $table->foreign('pipeline_stage_id')
                    ->references('id')->on('pipeline_stages')->cascadeOnDelete());
            }

            // 2. deal_stage_history: same gap-filling for from/to stage links.
            if (! $this->foreignKeyExists('deal_stage_history', 'deal_stage_history_from_stage_id_foreign')) {
                $this->dropIndexIfExists('deal_stage_history', 'deal_stage_history_from_stage_id_foreign');
                Schema::table('deal_stage_history', fn (Blueprint $table) => $table->foreign('from_stage_id')
                    ->references('id')->on('pipeline_stages')->nullOnDelete());
            }
            if (! $this->foreignKeyExists('deal_stage_history', 'deal_stage_history_to_stage_id_foreign')) {
                $this->dropIndexIfExists('deal_stage_history', 'deal_stage_history_to_stage_id_foreign');
                Schema::table('deal_stage_history', fn (Blueprint $table) => $table->foreign('to_stage_id')
                    ->references('id')->on('pipeline_stages')->cascadeOnDelete());
            }

            // 3. Hot-path composite indexes used by the list endpoints.
            if (! $this->indexExists('deals', 'deals_workspace_id_status_index')) {
                Schema::table('deals', fn (Blueprint $table) => $table->index(['workspace_id', 'status']));
            }
            if (! $this->indexExists('tasks', 'tasks_workspace_id_status_assignee_id_index')) {
                Schema::table('tasks', fn (Blueprint $table) => $table->index(['workspace_id', 'status', 'assignee_id']));
            }
            if (! $this->indexExists('messages', 'messages_conversation_id_sent_at_index')) {
                Schema::table('messages', fn (Blueprint $table) => $table->index(['conversation_id', 'sent_at']));
            }

            // 4. message_reactions: the original (message_id, whatsapp_contact_id,
            //    user_id) unique allowed duplicates because each identity column
            //    is NULLable and MySQL never dedupes NULLs. Swap for two
            //    per-identity uniques after de-duping existing rows (newest wins).
            DB::statement(
                'DELETE r1 FROM message_reactions r1
                 JOIN message_reactions r2
                   ON r1.message_id = r2.message_id
                  AND COALESCE(r1.user_id, 0) = COALESCE(r2.user_id, 0)
                  AND COALESCE(r1.whatsapp_contact_id, 0) = COALESCE(r2.whatsapp_contact_id, 0)
                  AND r1.id < r2.id
                 WHERE r1.user_id IS NOT NULL OR r1.whatsapp_contact_id IS NOT NULL',
            );

            if ($this->indexExists('message_reactions', 'message_reactions_message_id_whatsapp_contact_id_user_id_unique')) {
                DB::statement('ALTER TABLE message_reactions DROP INDEX message_reactions_message_id_whatsapp_contact_id_user_id_unique');
            }
            if (! $this->indexExists('message_reactions', 'message_reactions_message_id_user_id_unique')) {
                Schema::table('message_reactions', fn (Blueprint $table) => $table->unique(['message_id', 'user_id']));
            }
            if (! $this->indexExists('message_reactions', 'message_reactions_message_id_whatsapp_contact_id_unique')) {
                Schema::table('message_reactions', fn (Blueprint $table) => $table->unique(['message_id', 'whatsapp_contact_id']));
            }
        } finally {
            Schema::enableForeignKeyConstraints();
        }
    }

    public function down(): void
    {
        if (Schema::getConnection()->getDriverName() !== 'mysql') {
            return;
        }

        Schema::disableForeignKeyConstraints();

        try {
            if ($this->indexExists('message_reactions', 'message_reactions_message_id_user_id_unique')) {
                Schema::table('message_reactions', fn (Blueprint $table) => $table->dropUnique(['message_id', 'user_id']));
            }
            if ($this->indexExists('message_reactions', 'message_reactions_message_id_whatsapp_contact_id_unique')) {
                Schema::table('message_reactions', fn (Blueprint $table) => $table->dropUnique(['message_id', 'whatsapp_contact_id']));
            }
            if (! $this->indexExists('message_reactions', 'message_reactions_message_id_whatsapp_contact_id_user_id_unique')) {
                Schema::table('message_reactions', fn (Blueprint $table) => $table->unique(['message_id', 'whatsapp_contact_id', 'user_id']));
            }

            if ($this->indexExists('messages', 'messages_conversation_id_sent_at_index')) {
                Schema::table('messages', fn (Blueprint $table) => $table->dropIndex(['conversation_id', 'sent_at']));
            }
            if ($this->indexExists('tasks', 'tasks_workspace_id_status_assignee_id_index')) {
                Schema::table('tasks', fn (Blueprint $table) => $table->dropIndex(['workspace_id', 'status', 'assignee_id']));
            }
            if ($this->indexExists('deals', 'deals_workspace_id_status_index')) {
                Schema::table('deals', fn (Blueprint $table) => $table->dropIndex(['workspace_id', 'status']));
            }

            if (! $this->foreignKeyExists('deal_stage_history', 'deal_stage_history_from_stage_id_foreign')) {
                Schema::table('deal_stage_history', fn (Blueprint $table) => $table->dropForeign(['from_stage_id']));
            }
            if (! $this->foreignKeyExists('deal_stage_history', 'deal_stage_history_to_stage_id_foreign')) {
                Schema::table('deal_stage_history', fn (Blueprint $table) => $table->dropForeign(['to_stage_id']));
            }

            if (! $this->foreignKeyExists('deals', 'deals_pipeline_id_foreign')) {
                Schema::table('deals', fn (Blueprint $table) => $table->dropForeign(['pipeline_id']));
            }
            if (! $this->foreignKeyExists('deals', 'deals_pipeline_stage_id_foreign')) {
                Schema::table('deals', fn (Blueprint $table) => $table->dropForeign(['pipeline_stage_id']));
            }
        } finally {
            Schema::enableForeignKeyConstraints();
        }
    }

    private function foreignKeyExists(string $table, string $constraint): bool
    {
        return DB::selectOne(
            'SELECT 1 FROM information_schema.KEY_COLUMN_USAGE
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1',
            [$table, $constraint],
        ) !== null;
    }

    private function indexExists(string $table, string $index): bool
    {
        return collect(DB::select('SHOW INDEX FROM `'.$table.'`'))
            ->contains(fn ($row) => ($row->Key_name ?? $row->key_name) === $index);
    }

    private function dropIndexIfExists(string $table, string $index): void
    {
        if ($this->indexExists($table, $index) && ! $this->foreignKeyExists($table, $index)) {
            DB::statement("ALTER TABLE {$table} DROP INDEX `{$index}`");
        }
    }
};