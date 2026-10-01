<?php

namespace Tests\Feature;

use App\Models\Contact;
use App\Models\Conversation;
use App\Models\WhatsappAccount;
use App\Services\ContactAutoLinker;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Tests\CreatesWorkspaceUsers;
use Tests\TestCase;
use Tests\TruncatesDatabaseBetweenTests;

/**
 * Guards the canonical-identity contract (spec §3/§7): one real WhatsApp
 * number is one whatsapp_contacts row, and one identity is one conversation per
 * connection.
 *
 * These tests exercise the migration itself, and the unique keys it adds are
 * exactly what makes the legacy duplicates the merge exists for impossible to
 * create. So the merge test rewinds the schema to the pre-migration world,
 * seeds the state a live upgrade would actually face, and then re-runs the
 * migration over it.
 *
 * That rewind is DDL, which would implicitly commit RefreshDatabase's wrapping
 * transaction (stranding the test's rows and defeating its cleanup), so this
 * file uses DatabaseTruncation instead: the schema is migrated once per
 * process and each test starts from truncated tables with no open transaction.
 *
 * It also truncates on tearDown (TruncatesDatabaseBetweenTests) so this class
 * commits nothing that the next RefreshDatabase class would see as fixture data.
 */
class CanonicalIdentityMergeTest extends TestCase
{
    use CreatesWorkspaceUsers, TruncatesDatabaseBetweenTests;

    private const CONVERSATION_INDEX = 'conversations_ws_wcid_acct_unique';

    private const CONTACT_INDEX = 'whatsapp_contacts_ws_phone_unique';

    /**
     * A test that fails after dropping the keys must not leave the schema
     * un-armoured: the schema is migrated once per process, so a missing key
     * would silently leak into every later test class.
     */
    protected function tearDown(): void
    {
        $this->replayCanonicalIdentityMigration();

        parent::tearDown();
    }

    private function seedWc(int $ws, array $o = []): int
    {
        return DB::table('whatsapp_contacts')->insertGetId(array_merge([
            'workspace_id' => $ws,
            'wa_jid' => '94771234567@s.whatsapp.net',
            'push_name' => 'MOHAMED BATH...',
            'phone_number' => '94771234567',
            'created_at' => now(),
            'updated_at' => now(),
        ], $o));
    }

    private function seedConv(int $ws, int $wc, array $o = []): int
    {
        return DB::table('conversations')->insertGetId(array_merge([
            'workspace_id' => $ws,
            'whatsapp_contact_id' => $wc,
            'status' => 'open',
            'unread_count' => 0,
            'created_at' => now(),
            'updated_at' => now(),
        ], $o));
    }

    private function seedMsg(int $ws, int $conv, string $body, string $waId): void
    {
        DB::table('messages')->insert([
            'workspace_id' => $ws,
            'conversation_id' => $conv,
            'whatsapp_message_id' => $waId,
            'direction' => 'inbound',
            'sender_type' => 'contact',
            'message_type' => 'text',
            'body' => $body,
            'status' => 'sent',
            'sent_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    /** Workspace owned by a freshly-seeded user (the RBAC seeder ships one). */
    private function workspaceId(): int
    {
        $this->seedRbac();

        return $this->userWithRole('Agent')->workspace_id;
    }

    private function indexExists(string $table, string $index): bool
    {
        return DB::selectOne(
            'SELECT 1 AS ok FROM information_schema.STATISTICS
             WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ? LIMIT 1',
            [$table, $index]
        ) !== null;
    }

    /** Asserts the canonical-identity unique key refuses this write. */
    private function assertDuplicateRejected(callable $write): void
    {
        try {
            $write();
        } catch (QueryException $e) {
            $this->assertStringContainsString('Duplicate entry', $e->getMessage());

            return;
        }

        $this->fail('The canonical-identity unique key accepted a duplicate identity.');
    }

    /**
     * Rewinds to the schema production has *before* this migration runs - the
     * only state in which the legacy duplicates can exist. Exercises down() too.
     */
    private function rewindCanonicalIdentitySchema(): void
    {
        Artisan::call('migrate:rollback', ['--step' => 1, '--force' => true]);

        $this->assertFalse(
            $this->indexExists('conversations', self::CONVERSATION_INDEX),
            'down() left the conversations identity key in place.'
        );
        $this->assertFalse(
            $this->indexExists('whatsapp_contacts', self::CONTACT_INDEX),
            'down() left the whatsapp_contacts phone key in place.'
        );
    }

    /** Replays the real migration (the only pending one at this point). */
    private function replayCanonicalIdentityMigration(): void
    {
        if ($this->indexExists('conversations', self::CONVERSATION_INDEX)
            && $this->indexExists('whatsapp_contacts', self::CONTACT_INDEX)) {
            return;
        }

        Artisan::call('migrate', ['--force' => true]);
    }

    public function test_the_unique_keys_reject_duplicates_but_keep_null_accounts_distinct(): void
    {
        $ws = $this->workspaceId();

        $this->assertTrue($this->indexExists('whatsapp_contacts', self::CONTACT_INDEX));

        $wcId = $this->seedWc($ws);

        // One canonical row per number: a second row for the same phone is out.
        $this->assertDuplicateRejected(fn () => $this->seedWc($ws, ['wa_jid' => '94771234567@s.whatsapp.net-legacy']));

        // An unresolved @lid row (phone_number IS NULL) still coexists, because
        // MySQL keeps NULLs distinct in a unique index - the alias is only
        // folded into the canonical row once WhatsApp shares the mapping.
        $this->assertNotNull($this->seedWc($ws, ['wa_jid' => '171421389074673@lid', 'phone_number' => null]));

        $this->assertTrue($this->indexExists('conversations', self::CONVERSATION_INDEX));

        // A NULL account (row written before connections existed) and a real
        // connection are two different threads for the same identity, which is
        // what a multi-account inbox needs.
        $this->seedConv($ws, $wcId, ['whatsapp_account_id' => null]);
        $account = WhatsappAccount::factory()->create(['workspace_id' => $ws]);
        $this->seedConv($ws, $wcId, ['whatsapp_account_id' => $account->id]);

        // The gap a plain (workspace_id, whatsapp_contact_id,
        // whatsapp_account_id) key would leave open: NULL never equals NULL, so
        // both of these would have been accepted without the COALESCE key part.
        $this->assertDuplicateRejected(fn () => $this->seedConv($ws, $wcId, ['whatsapp_account_id' => null]));
        $this->assertDuplicateRejected(fn () => $this->seedConv($ws, $wcId, ['whatsapp_account_id' => $account->id]));

        $this->assertSame(2, DB::table('conversations')->where('whatsapp_contact_id', $wcId)->count());
    }

    public function test_migration_folds_legacy_duplicates_without_losing_messages(): void
    {
        $ws = $this->workspaceId();

        // Legacy state: one human stored as two whatsapp_contacts rows that
        // share a phone number, each owning its own thread.
        $this->rewindCanonicalIdentitySchema();

        $keeperWc = $this->seedWc($ws, ['wa_jid' => '94771234567@s.whatsapp.net']);
        $dupeWc = $this->seedWc($ws, ['wa_jid' => '94771234567@s.whatsapp.net-dup', 'lid_jid' => '171421389074673@lid']);

        $keeperConv = $this->seedConv($ws, $keeperWc, ['unread_count' => 2]);
        $dupeConv = $this->seedConv($ws, $dupeWc, ['unread_count' => 3]);
        $this->seedMsg($ws, $keeperConv, 'keeper thread message', 'WA_KEEPER_1');
        $this->seedMsg($ws, $dupeConv, 'dupe thread message', 'WA_DUPE_1');

        $this->replayCanonicalIdentityMigration();

        // The duplicate row and its thread are gone, the surviving row picked up
        // the alias, and neither message was lost in the fold.
        $this->assertDatabaseMissing('whatsapp_contacts', ['id' => $dupeWc]);
        $this->assertDatabaseHas('whatsapp_contacts', ['id' => $keeperWc, 'lid_jid' => '171421389074673@lid']);
        $this->assertDatabaseMissing('conversations', ['id' => $dupeConv]);
        $this->assertDatabaseHas('conversations', ['id' => $keeperConv, 'unread_count' => 5]);
        $this->assertSame(2, DB::table('messages')->where('conversation_id', $keeperConv)->count());

        // Merge-first, then armour: the replayed migration re-installed both
        // keys, so the duplicate it just folded can never come back.
        $this->assertTrue($this->indexExists('conversations', self::CONVERSATION_INDEX));
        $this->assertTrue($this->indexExists('whatsapp_contacts', self::CONTACT_INDEX));
        $this->assertDuplicateRejected(fn () => $this->seedConv($ws, $keeperWc, ['whatsapp_account_id' => null]));
    }

    public function test_migration_merges_null_account_conversations_for_one_identity(): void
    {
        $ws = $this->workspaceId();

        // The exact bug this migration closes: two threads for one identity,
        // both with a NULL account, so a plain unique key would have let them be.
        $this->rewindCanonicalIdentitySchema();

        $wcId = $this->seedWc($ws);
        $keeper = $this->seedConv($ws, $wcId, ['whatsapp_account_id' => null, 'unread_count' => 1]);
        $dupe = $this->seedConv($ws, $wcId, ['whatsapp_account_id' => null, 'unread_count' => 4]);
        $this->seedMsg($ws, $keeper, 'keeper msg', 'WA_NULL_KEEP');
        $this->seedMsg($ws, $dupe, 'dupe msg', 'WA_NULL_DUPE');

        $this->replayCanonicalIdentityMigration();

        $this->assertDatabaseMissing('conversations', ['id' => $dupe]);
        $this->assertDatabaseHas('conversations', ['id' => $keeper, 'unread_count' => 5]);
        $this->assertSame(2, DB::table('messages')->where('conversation_id', $keeper)->count());
    }

    public function test_contact_resolution_links_reply_to_saved_contact(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $this->actingAs($agent);
        $ws = $agent->workspace_id;

        $saved = Contact::factory()->create([
            'workspace_id' => $ws,
            'full_name' => 'MOHAMED BATHURUDEEN',
            'phone_number' => '+94771234567',
            'source' => 'manual',
        ]);

        $waId = $this->seedWc($ws, ['push_name' => 'CHANGED NAME']);
        $convId = $this->seedConv($ws, $waId);

        (new ContactAutoLinker())->ensureForConversations(new Collection([
            Conversation::query()->findOrFail($convId),
        ]));

        $this->assertDatabaseCount('contacts', 1);
        $this->assertDatabaseHas('whatsapp_contacts', ['id' => $waId, 'contact_id' => $saved->id]);
        $this->assertDatabaseHas('conversations', ['id' => $convId, 'contact_id' => $saved->id]);
    }
}

