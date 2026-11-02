/**
 * One-off backfill for WhatsApp LID (Linked ID) contacts created before the
 * LID resolution fix (PostgreSQL compatible).
 *
 * Run:  node scripts/backfill-lid-contacts.mjs [--delete]
 */
import pg from 'pg';
import fs from 'node:fs';

const args = process.argv.slice(2);
const DELETE = args.includes('--delete');

function loadEnv() {
  const out = {};
  for (const file of ['.env', '.env.example']) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
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
  const client = new pg.Client({
    connectionString: env.DATABASE_URL || undefined,
    host: env.PGHOST || env.DB_HOST || '127.0.0.1',
    port: Number(env.PGPORT || env.DB_PORT || 5432),
    user: env.PGUSER || env.DB_USERNAME || 'postgres',
    password: env.PGPASSWORD || env.DB_PASSWORD || '',
    database: env.PGDATABASE || env.DB_DATABASE || 'postgres',
    ssl: env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });

  await client.connect();

  const { rows: lidRows } = await client.query(
    `SELECT wc.id, wc.workspace_id, wc.wa_jid, wc.phone_number, wc.contact_id
     FROM whatsapp_contacts wc WHERE wc.wa_jid LIKE '%@lid' ORDER BY wc.id`,
  );
  console.log(`Found ${lidRows.length} LID whatsapp_contacts\n`);

  for (const lid of lidRows) {
    // 1. The LID numeric part is not a real phone number - never keep it.
    if (lid.phone_number !== null) {
      await client.query('UPDATE whatsapp_contacts SET phone_number = NULL, updated_at = NOW() WHERE id = $1', [lid.id]);
      console.log(`  [1] cleared fake phone_number on LID row #${lid.id} (${lid.wa_jid})`);
    }

    // 2. If the mapping is known, fold conversations onto the canonical row.
    const { rows: pnRows } = await client.query(
      'SELECT id FROM whatsapp_contacts WHERE workspace_id = $1 AND lid_jid = $2 LIMIT 1',
      [lid.workspace_id, lid.wa_jid],
    );
    if (pnRows.length === 0) continue;
    const pnId = pnRows[0].id;

    const { rows: pnConvs } = await client.query(
      'SELECT id FROM conversations WHERE workspace_id = $1 AND whatsapp_contact_id = $2 LIMIT 1',
      [lid.workspace_id, pnId],
    );
    const { rows: lidConvs } = await client.query(
      'SELECT id FROM conversations WHERE workspace_id = $1 AND whatsapp_contact_id = $2',
      [lid.workspace_id, lid.id],
    );

    if (lidConvs.length === 0) {
      console.log(`  [2] LID row #${lid.id} -> PN row #${pnId}: no conversations to move`);
      continue;
    }

    if (pnConvs.length === 0) {
      await client.query(
        'UPDATE conversations SET whatsapp_contact_id = $1, updated_at = NOW() WHERE workspace_id = $2 AND whatsapp_contact_id = $3',
        [pnId, lid.workspace_id, lid.id],
      );
      console.log(`  [2] moved ${lidConvs.length} conversation(s) from LID row #${lid.id} to PN row #${pnId}`);
      continue;
    }

    const targetId = pnConvs[0].id;
    for (const conv of lidConvs) {
      const sourceId = conv.id;
      await client.query('UPDATE messages SET conversation_id = $1, updated_at = NOW() WHERE conversation_id = $2', [targetId, sourceId]);
      await client.query(
        `UPDATE conversations
         SET last_message_at = GREATEST(COALESCE(last_message_at, '1970-01-01'::timestamp), COALESCE((SELECT MAX(sent_at) FROM messages WHERE conversation_id = $1), last_message_at)),
             last_message_preview = COALESCE((SELECT body FROM messages WHERE conversation_id = $2 ORDER BY sent_at DESC LIMIT 1), last_message_preview),
             unread_count = unread_count + (SELECT COUNT(*) FROM messages WHERE conversation_id = $3 AND direction = 'inbound' AND status = 'sent'),
             updated_at = NOW()
         WHERE id = $4`,
        [targetId, targetId, targetId, targetId],
      );
      await client.query('DELETE FROM conversations WHERE id = $1', [sourceId]);
      console.log(`  [2] folded conversation #${sourceId} into conversation #${targetId} (PN row #${pnId})`);
    }
  }

  // 3. Junk CRM contacts fabricated from LID numbers.
  const { rows: junk } = await client.query(
    `SELECT c.id, c.workspace_id, c.full_name, c.phone_number, wc.id AS wc_id
     FROM contacts c
     JOIN whatsapp_contacts wc ON wc.contact_id = c.id
     WHERE wc.wa_jid LIKE '%@lid'
       AND c.source = 'whatsapp'
       AND c.phone_number IS NOT NULL`,
  );
  console.log(`\nJunk CRM contacts fabricated from LID numbers: ${junk.length}`);
  for (const c of junk) {
    const { rows: convs } = await client.query('SELECT COUNT(*) AS n FROM conversations WHERE contact_id = $1', [c.id]);
    const { rows: labels } = await client.query('SELECT COUNT(*) AS n FROM contact_label WHERE contact_id = $1', [c.id]);
    const { rows: activities } = await client.query('SELECT COUNT(*) AS n FROM contact_activities WHERE contact_id = $1', [c.id]);
    const stillReferenced = Number(convs[0].n) > 0 || Number(labels[0].n) > 0 || Number(activities[0].n) > 1;
    console.log(`  #${c.id} "${c.full_name}" phone=${c.phone_number} (convs=${convs[0].n}, labels=${labels[0].n}, activities=${activities[0].n}) ${stillReferenced ? 'KEPT (still referenced)' : 'clean'}`);

    if (!DELETE || stillReferenced) continue;
    await client.query('UPDATE whatsapp_contacts SET contact_id = NULL, updated_at = NOW() WHERE id = $1', [c.wc_id]);
    await client.query('DELETE FROM contact_activities WHERE contact_id = $1', [c.id]);
    await client.query('DELETE FROM contacts WHERE id = $1', [c.id]);
    console.log(`  -> deleted junk contact #${c.id}`);
  }

  await client.end();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
