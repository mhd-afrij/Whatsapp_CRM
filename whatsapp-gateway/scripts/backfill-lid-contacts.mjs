/**
 * One-off backfill for WhatsApp LID (Linked ID) contacts created before the
 * LID resolution fix (see src/whatsapp/message-repository.ts::setLidJid and
 * the `lid_jid` migration in backend/database/migrations).
 *
 * Background: contacts with phone-number privacy enabled reply through an
 * opaque `@lid` jid whose numeric part is NOT their real phone number. Old
 * gateway builds stored that fake number as `whatsapp_contacts.phone_number`
 * and the backend's ContactAutoLinker then fabricated a duplicate CRM contact
 * from it ("Aazik Ahmed" with phone "176974261706752" alongside the real
 * "Aazik" with phone "94750144774").
 *
 * What this script does:
 *   1. Nullls the fake phone_number on any remaining LID rows so the phone-
 *      based dedup in the backend/auto-linker can never match them.
 *   2. For LID rows whose lid->phone mapping is already known (a PN row has
 *      lid_jid set - e.g. from a contacts.upsert since the fix deployed),
 *      merges conversations onto the canonical PN row.
 *   3. Reports junk CRM contacts (source=whatsapp whose phone_number is a
 *      LID numeric) that are no longer referenced; with --delete they are
 *      unlinked from whatsapp_contacts and removed.
 *
 * Run:  node scripts/backfill-lid-contacts.mjs [--delete]
 */
import mysql from 'mysql2/promise';
import fs from 'node:fs';

const args = process.argv.slice(2);
const DELETE = args.includes('--delete');

function loadEnv() {
  const out = {};
  for (const file of ['.env', '.env.example']) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^(MYSQL_[A-Z_]+|DB_[A-Z_]+)=(.*)$/);
      if (!m) continue;
      const key = m[1];
      const value = m[2].trim().replace(/^["']|["']$/g, '');
      if (!(key in out)) out[key] = value;
    }
  }
  return out;
}

async function main() {
  const env = loadEnv();
  const conn = await mysql.createConnection({
    host: env.MYSQL_HOST || '127.0.0.1',
    port: Number(env.MYSQL_PORT || 3306),
    user: env.MYSQL_USER || 'root',
    password: env.MYSQL_PASSWORD || '',
    database: env.MYSQL_DATABASE || env.DB_DATABASE || 'crm_whatsapp',
    multipleStatements: false,
  });

  const [lidRows] = await conn.query(
    `SELECT wc.id, wc.workspace_id, wc.wa_jid, wc.phone_number, wc.contact_id
     FROM whatsapp_contacts wc WHERE wc.wa_jid LIKE '%@lid' ORDER BY wc.id`,
  );
  console.log(`Found ${lidRows.length} LID whatsapp_contacts\n`);

  for (const lid of lidRows) {
    // 1. The LID numeric part is not a real phone number - never keep it.
    if (lid.phone_number !== null) {
      await conn.query('UPDATE whatsapp_contacts SET phone_number = NULL, updated_at = NOW() WHERE id = ?', [lid.id]);
      console.log(`  [1] cleared fake phone_number on LID row #${lid.id} (${lid.wa_jid})`);
    }

    // 2. If the mapping is known, fold conversations onto the canonical row.
    const [pnRows] = await conn.query(
      'SELECT id FROM whatsapp_contacts WHERE workspace_id = ? AND lid_jid = ? LIMIT 1',
      [lid.workspace_id, lid.wa_jid],
    );
    if (pnRows.length === 0) continue;
    const pnId = pnRows[0].id;

    const [pnConvs] = await conn.query(
      'SELECT id FROM conversations WHERE workspace_id = ? AND whatsapp_contact_id = ? LIMIT 1',
      [lid.workspace_id, pnId],
    );
    const [lidConvs] = await conn.query(
      'SELECT id FROM conversations WHERE workspace_id = ? AND whatsapp_contact_id = ?',
      [lid.workspace_id, lid.id],
    );

    if (lidConvs.length === 0) {
      console.log(`  [2] LID row #${lid.id} -> PN row #${pnId}: no conversations to move`);
      continue;
    }

    if (pnConvs.length === 0) {
      await conn.query(
        'UPDATE conversations SET whatsapp_contact_id = ?, updated_at = NOW() WHERE workspace_id = ? AND whatsapp_contact_id = ?',
        [pnId, lid.workspace_id, lid.id],
      );
      console.log(`  [2] moved ${lidConvs.length} conversation(s) from LID row #${lid.id} to PN row #${pnId}`);
      continue;
    }

    const targetId = pnConvs[0].id;
    for (const conv of lidConvs) {
      const sourceId = conv.id;
      await conn.query('UPDATE messages SET conversation_id = ?, updated_at = NOW() WHERE conversation_id = ?', [targetId, sourceId]);
      await conn.query(
        `UPDATE conversations
         SET last_message_at = GREATEST(COALESCE(last_message_at, '1970-01-01'), COALESCE((SELECT MAX(sent_at) FROM messages WHERE conversation_id = ?), last_message_at)),
             last_message_preview = COALESCE((SELECT body FROM messages WHERE conversation_id = ? ORDER BY sent_at DESC LIMIT 1), last_message_preview),
             unread_count = unread_count + (SELECT COUNT(*) FROM messages WHERE conversation_id = ? AND direction = 'inbound' AND status = 'sent'),
             updated_at = NOW()
         WHERE id = ?`,
        [targetId, targetId, targetId, targetId],
      );
      await conn.query('DELETE FROM conversations WHERE id = ?', [sourceId]);
      console.log(`  [2] folded conversation #${sourceId} into conversation #${targetId} (PN row #${pnId})`);
    }
  }

  // 3. Junk CRM contacts fabricated from LID numbers.
  const [junk] = await conn.query(
    `SELECT c.id, c.workspace_id, c.full_name, c.phone_number, wc.id AS wc_id
     FROM contacts c
     JOIN whatsapp_contacts wc ON wc.contact_id = c.id
     WHERE wc.wa_jid LIKE '%@lid'
       AND c.source = 'whatsapp'
       AND c.phone_number IS NOT NULL`,
  );
  console.log(`\nJunk CRM contacts fabricated from LID numbers: ${junk.length}`);
  for (const c of junk) {
    const [convs] = await conn.query('SELECT COUNT(*) AS n FROM conversations WHERE contact_id = ?', [c.id]);
    const [labels] = await conn.query('SELECT COUNT(*) AS n FROM contact_label WHERE contact_id = ?', [c.id]);
    const [activities] = await conn.query('SELECT COUNT(*) AS n FROM contact_activities WHERE contact_id = ?', [c.id]);
    const stillReferenced = convs[0].n > 0 || labels[0].n > 0 || activities[0].n > 1;
    console.log(`  #${c.id} "${c.full_name}" phone=${c.phone_number} (convs=${convs[0].n}, labels=${labels[0].n}, activities=${activities[0].n}) ${stillReferenced ? 'KEPT (still referenced)' : 'clean'}`);

    if (!DELETE || stillReferenced) continue;
    await conn.query('UPDATE whatsapp_contacts SET contact_id = NULL, updated_at = NOW() WHERE id = ?', [c.wc_id]);
    await conn.query('DELETE FROM contact_activities WHERE contact_id = ?', [c.id]);
    await conn.query('DELETE FROM contacts WHERE id = ?', [c.id]);
    console.log(`  -> deleted junk contact #${c.id}`);
  }

  await conn.end();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
