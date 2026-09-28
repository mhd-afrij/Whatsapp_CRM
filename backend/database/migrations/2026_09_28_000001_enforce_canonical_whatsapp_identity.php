<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Hard guarantee for the one-identity-one-thread rule.
 *
 * The gateway resolves @lid payloads to their canonical phone-number jid via
 * key.senderPn before it writes, so these keys are the backstop for any other
 * writer (seeder, tinker, a future sync job).
 *
 *   whatsapp_contacts: UNIQUE (workspace_id, phone_number)
 *     One canonical row per real number. NULLs are distinct in a MySQL/MariaDB
 *     unique index, so @lid rows that have not been resolved yet
 *     (phone_number IS NULL) stay free and can still be created.
 *
 *   conversations: UNIQUE (workspace_id, whatsapp_contact_id, whatsapp_account_key)
 *     One thread per identity PER CONNECTION. A multi-account inbox legitimately
 *     runs the same person on two connections, so the account belongs in the key.
 *     It has to be null-normalised, because a plain composite key would not
 *     contain the real bug this migration exists to close: two threads for one
 *     identity whose whatsapp_account_id is NULL, where NULL never equals NULL
 *     and the duplicate sails straight through.
 *
 * On the null-normalisation: a MySQL 8 functional index over
 * COALESCE(whatsapp_account_id, 0) is not an option, it needs 8.0.13+ and this
 * app runs on MariaDB 10.4 (port 3306). A STORED generated column is the
 * portable form and is verified working on that server.
 *
 * Merge first, then armour. The unique keys are what make these duplicates
 * impossible to create, so they are added last, over already-folded data. The
 * merge is a real data migration, not a guard: it repoints every foreign key
 * that pointed at a duplicate and only then deletes it.
 */
return new class extends Migration
{
    private const CONTACTS_KEY = 'whatsapp_contacts_ws_phone_unique';

    private const CONVERSATIONS_KEY = 'conversations_ws_wcid_acct_unique';

    private const ACCOUNT_KEY_COLUMN = 'whatsapp_account_key';

    /**
     * Tables whose conversation_id has no unique key, so a duplicate row can
     * simply be repointed at the surviving conversation.
     */
    private const CONVERSATION_CHILD_TABLES = [
        'campaign_messages',
        'conversation_assignments',
        'internal_notes',
        'leads',
        'messages',
        'message_dispatch_queue',
        'message_processing_failures',
        'sla_events',
        'tasks',
    ];

    public function up(): void
    {
        // Data merge first: the unique keys cannot be installed while the
        // duplicates they forbid still exist.
        DB::transaction(function (): void {
            $this->mergeDuplicateContacts();
            $this->mergeDuplicateConversations();
        });

        if (! $this->indexExists('whatsapp_contacts', self::CONTACTS_KEY)) {
            Schema::table('whatsapp_contacts', function (Blueprint $table) {
                $table->unique(['workspace_id', 'phone_number'], self::CONTACTS_KEY);
            });
        }

        if (! $this->columnExists('conversations', self::ACCOUNT_KEY_COLUMN)) {
            Schema::table('conversations', function (Blueprint $table) {
                $table->unsignedBigInteger(self::ACCOUNT_KEY_COLUMN)
                    ->storedAs('COALESCE(whatsapp_account_id, 0)');
            });
        }

        if (! $this->indexExists('conversations', self::CONVERSATIONS_KEY)) {
            Schema::table('conversations', function (Blueprint $table) {
                $table->unique(
                    ['workspace_id', 'whatsapp_contact_id', self::ACCOUNT_KEY_COLUMN],
                    self::CONVERSATIONS_KEY
                );
            });
        }
    }

    public function down(): void
    {
        if ($this->indexExists('conversations', self::CONVERSATIONS_KEY)) {
            Schema::table('conversations', function (Blueprint $table) {
                $table->dropUnique(self::CONVERSATIONS_KEY);
            });
        }

        if ($this->columnExists('conversations', self::ACCOUNT_KEY_COLUMN)) {
            Schema::table('conversations', function (Blueprint $table) {
                $table->dropColumn(self::ACCOUNT_KEY_COLUMN);
            });
        }

        if ($this->indexExists('whatsapp_contacts', self::CONTACTS_KEY)) {
            Schema::table('whatsapp_contacts', function (Blueprint $table) {
                $table->dropUnique(self::CONTACTS_KEY);
            });
        }
    }

    /**
     * Folds two whatsapp_contacts rows that describe the same real number into
     * the lowest-id survivor, then repoints everything that referenced the
     * duplicate. Merging contacts first also collapses the conversations they
     * each owned into one identity, which mergeDuplicateConversations() then
     * folds - the order matters, because that second merge can only see the
     * collision once the conversations share a contact row.
     */
    private function mergeDuplicateContacts(): void
    {
        $groups = DB::select(
            'SELECT workspace_id, phone_number
               FROM whatsapp_contacts
              WHERE phone_number IS NOT NULL
              GROUP BY workspace_id, phone_number
             HAVING COUNT(*) > 1'
        );

        foreach ($groups as $group) {
            $ids = $this->idsFor(
                'SELECT id FROM whatsapp_contacts
                  WHERE workspace_id = ? AND phone_number = ?
                  ORDER BY id',
                [$group->workspace_id, $group->phone_number]
            );

            $keeper = array_shift($ids);

            foreach ($ids as $dupe) {
                // A reaction row is unique per (message, contact). Repointing it
                // blind would collide with the keeper's row for the same
                // message, so the duplicate reaction is dropped first: one human
                // reacting once to a message is one reaction either way.
                DB::statement(
                    'DELETE mr FROM message_reactions mr
                       INNER JOIN message_reactions k
                         ON k.message_id = mr.message_id
                        AND k.whatsapp_contact_id = ?
                      WHERE mr.whatsapp_contact_id = ?',
                    [$keeper, $dupe]
                );
                DB::update(
                    'UPDATE message_reactions SET whatsapp_contact_id = ? WHERE whatsapp_contact_id = ?',
                    [$keeper, $dupe]
                );
                DB::update(
                    'UPDATE contacts SET whatsapp_contact_id = ? WHERE whatsapp_contact_id = ?',
                    [$keeper, $dupe]
                );

                // The @lid alias is the whole point of keeping the survivor, so
                // adopt it when the survivor does not have one yet.
                DB::statement(
                    'UPDATE whatsapp_contacts k
                        INNER JOIN whatsapp_contacts d ON d.id = ?
                        SET k.lid_jid = COALESCE(k.lid_jid, d.lid_jid),
                            k.contact_id = COALESCE(k.contact_id, d.contact_id),
                            k.push_name = COALESCE(NULLIF(k.push_name, \'\'), d.push_name),
                            k.updated_at = NOW()
                      WHERE k.id = ?',
                    [$dupe, $keeper]
                );

                DB::update(
                    'UPDATE conversations SET whatsapp_contact_id = ? WHERE whatsapp_contact_id = ?',
                    [$keeper, $dupe]
                );

                DB::delete('DELETE FROM whatsapp_contacts WHERE id = ?', [$dupe]);
            }
        }
    }

    /**
     * Folds two threads for the same identity on the same connection into one,
     * summing the unread counts and keeping the most recent thread state. The
     * group key is the null-normalised account, matching the unique key that
     * follows, so anything this leaves behind is something the key would allow.
     */
    private function mergeDuplicateConversations(): void
    {
        $groups = DB::select(
            'SELECT workspace_id, whatsapp_contact_id, COALESCE(whatsapp_account_id, 0) AS account_key
               FROM conversations
              GROUP BY workspace_id, whatsapp_contact_id, COALESCE(whatsapp_account_id, 0)
             HAVING COUNT(*) > 1'
        );

        foreach ($groups as $group) {
            $ids = $this->idsFor(
                'SELECT id FROM conversations
                  WHERE workspace_id = ?
                    AND whatsapp_contact_id = ?
                    AND COALESCE(whatsapp_account_id, 0) = ?
                  ORDER BY id',
                [$group->workspace_id, $group->whatsapp_contact_id, $group->account_key]
            );

            $keeper = array_shift($ids);

            foreach ($ids as $dupe) {
                // Pivot rows are unique per conversation, so a dupe link that the
                // keeper already has is redundant and goes; anything unique to
                // the dupe is carried over.
                DB::statement(
                    'DELETE cl FROM conversation_label cl
                       INNER JOIN conversation_label k
                         ON k.conversation_id = ? AND k.label_id = cl.label_id
                      WHERE cl.conversation_id = ?',
                    [$keeper, $dupe]
                );
                DB::statement(
                    'DELETE cp FROM conversation_participants cp
                       INNER JOIN conversation_participants k
                         ON k.conversation_id = ? AND k.user_id = cp.user_id
                      WHERE cp.conversation_id = ?',
                    [$keeper, $dupe]
                );

                foreach (['conversation_label', 'conversation_participants', ...self::CONVERSATION_CHILD_TABLES] as $table) {
                    DB::update(
                        "UPDATE {$table} SET conversation_id = ? WHERE conversation_id = ?",
                        [$keeper, $dupe]
                    );
                }

                // Unread counts are per-thread, so two threads for one person held
                // the messages separately. Folding has to add them or the
                // customer's messages silently vanish from the badge. The same
                // goes for the thread's most recent message.
                DB::statement(
                    'UPDATE conversations k
                        INNER JOIN conversations d ON d.id = ?
                        SET k.unread_count = k.unread_count + d.unread_count,
                            k.last_message_at = GREATEST(
                                COALESCE(k.last_message_at, \'1970-01-01\'),
                                COALESCE(d.last_message_at, \'1970-01-01\')
                            ),
                            k.last_message_preview = CASE
                                WHEN COALESCE(d.last_message_at, \'1970-01-01\') > COALESCE(k.last_message_at, \'1970-01-01\')
                                    THEN d.last_message_preview
                                ELSE k.last_message_preview
                            END,
                            k.contact_id = COALESCE(k.contact_id, d.contact_id),
                            k.assigned_user_id = COALESCE(k.assigned_user_id, d.assigned_user_id),
                            k.assigned_team_id = COALESCE(k.assigned_team_id, d.assigned_team_id),
                            k.updated_at = NOW()
                      WHERE k.id = ?',
                    [$dupe, $keeper]
                );

                DB::delete('DELETE FROM conversations WHERE id = ?', [$dupe]);
            }
        }
    }

    /** @return array<int, int> */
    private function idsFor(string $sql, array $bindings): array
    {
        return array_map(
            static fn ($row): int => (int) $row->id,
            DB::select($sql, $bindings)
        );
    }

    private function indexExists(string $table, string $index): bool
    {
        return DB::selectOne(
            'SELECT 1 AS ok FROM information_schema.STATISTICS
             WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ? LIMIT 1',
            [$table, $index]
        ) !== null;
    }

    private function columnExists(string $table, string $column): bool
    {
        return DB::selectOne(
            'SELECT 1 AS ok FROM information_schema.COLUMNS
             WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1',
            [$table, $column]
        ) !== null;
    }
};
