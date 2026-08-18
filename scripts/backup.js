// Postgres backup — pure-Node SQL dump uploaded to Cloudflare R2
// Does NOT require pg_dump / psql to be installed in the container.
//
// Required env vars:
//   DATABASE_URL          — postgres connection string
//   R2_ACCOUNT_ID         — Cloudflare account ID
//   R2_ACCESS_KEY_ID      — R2 access key
//   R2_SECRET_ACCESS_KEY  — R2 secret key
//   R2_BUCKET             — R2 bucket name (default: tlms-backups)
//   BACKUP_RETAIN_DAYS    — number of daily dumps to keep (default: 30)

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { Pool }      = require('pg');
const { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const fs   = require('fs');
const path = require('path');

// ── Pure-Node SQL dump (no pg_dump binary needed) ─────────────────────────
// Exports INSERT statements for every row in every application table.
// Sequences are reset via SETVAL so restored IDs continue correctly.
async function dumpDatabase(pool, filePath) {
  const client = await pool.connect();
  const out    = fs.createWriteStream(filePath, { encoding: 'utf8' });

  const write = (line) => new Promise((res, rej) =>
    out.write(line + '\n', (err) => err ? rej(err) : res())
  );

  try {
    await write('-- TLMS database dump (pure-Node, no pg_dump)');
    await write(`-- Generated: ${new Date().toISOString()}`);
    await write('');
    await write('SET client_encoding = \'UTF8\';');
    await write('SET standard_conforming_strings = on;');
    await write('');

    // Ordered table list — respects FK dependencies
    const TABLE_ORDER = [
      'users',
      'accounts',
      'voucher_counter',
      'transactions',
      'ledger_entries',
      'audit_log',
    ];

    for (const table of TABLE_ORDER) {
      // Column metadata
      const colRes = await client.query(
        `SELECT column_name, data_type
           FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1
          ORDER BY ordinal_position`,
        [table]
      );
      if (colRes.rows.length === 0) continue; // table doesn't exist yet

      const cols    = colRes.rows.map(r => r.column_name);
      const colList = cols.map(c => `"${c}"`).join(', ');

      await write(`-- Table: ${table}`);
      await write(`TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE;`);

      const rows = await client.query(`SELECT ${colList} FROM "${table}"`);

      if (rows.rows.length > 0) {
        for (const row of rows.rows) {
          const values = cols.map(c => {
            const v = row[c];
            if (v === null || v === undefined) return 'NULL';
            if (typeof v === 'number' || typeof v === 'boolean') return String(v);
            // Escape single quotes and wrap in quotes
            return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
          });
          await write(`INSERT INTO "${table}" (${colList}) VALUES (${values.join(', ')});`);
        }
      }

      // Reset the sequence so new inserts don't collide after restore
      const seqRes = await client.query(
        `SELECT pg_get_serial_sequence('public."${table}"', $1) AS seq`,
        ['id']
      );
      const seqName = seqRes.rows[0]?.seq;
      if (seqName) {
        const maxRes = await client.query(`SELECT MAX(id) AS m FROM "${table}"`);
        const maxId  = maxRes.rows[0]?.m ?? 0;
        await write(`SELECT setval('${seqName}', ${maxId > 0 ? maxId : 1}, ${maxId > 0});`);
      }

      await write('');
    }

    await new Promise((res, rej) => out.end((err) => err ? rej(err) : res()));
  } finally {
    client.release();
  }
}

async function runBackup() {
  const DATABASE_URL     = process.env.DATABASE_URL;
  const R2_ACCOUNT_ID    = process.env.R2_ACCOUNT_ID;
  const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
  const R2_SECRET_KEY    = process.env.R2_SECRET_ACCESS_KEY;
  const R2_BUCKET        = process.env.R2_BUCKET_NAME || 'tlms-backups';
  const R2_ENDPOINT      = process.env.R2_ENDPOINT || `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const RETAIN_DAYS      = 3;

  if (!DATABASE_URL)                       throw new Error('DATABASE_URL is not set');
  if (!R2_ACCESS_KEY_ID || !R2_SECRET_KEY) throw new Error('R2 credentials not set');
  if (!R2_ACCOUNT_ID && !process.env.R2_ENDPOINT) throw new Error('R2_ACCOUNT_ID or R2_ENDPOINT is not set');

  const pool = new Pool({ connectionString: DATABASE_URL });

  // ── Step 1: dump via pure Node (no pg_dump binary) ───────────────────────
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
  const dumpFile  = path.join('/tmp', `tlms_${timestamp}.sql`);
  const objectKey = `tlms_${timestamp}.sql`;

  console.log(`[backup] Dumping database to ${dumpFile}...`);
  try {
    await dumpDatabase(pool, dumpFile);
  } finally {
    await pool.end();
  }
  console.log('[backup] Dump complete.');

  const s3 = new S3Client({
    region: 'auto',
    endpoint: R2_ENDPOINT,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_KEY },
  });

  // ── Step 2: upload ───────────────────────────────────────────────────────
  try {
    console.log(`[backup] Uploading ${objectKey} to R2 bucket "${R2_BUCKET}"...`);
    await s3.send(new PutObjectCommand({
      Bucket:      R2_BUCKET,
      Key:         objectKey,
      Body:        fs.createReadStream(dumpFile),
      ContentType: 'application/sql',
    }));
    console.log('[backup] Upload complete.');
  } finally {
    if (fs.existsSync(dumpFile)) fs.unlinkSync(dumpFile);
  }

  // ── Step 3: prune old backups ────────────────────────────────────────────
  try {
    const list = await s3.send(new ListObjectsV2Command({ Bucket: R2_BUCKET }));
    const objects = (list.Contents || [])
      .filter(o => o.Key.startsWith('tlms_') && o.Key.endsWith('.sql'))
      .sort((a, b) => a.Key.localeCompare(b.Key));

    if (objects.length > RETAIN_DAYS) {
      const toDelete = objects.slice(0, objects.length - RETAIN_DAYS);
      for (const obj of toDelete) {
        await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: obj.Key }));
        console.log(`[backup] Deleted old backup: ${obj.Key}`);
      }
    }
    console.log(`[backup] Done. ${Math.min(objects.length, RETAIN_DAYS)} backup(s) retained.`);
  } catch (err) {
    // pruning failure is non-fatal
    console.warn('[backup] Pruning failed (non-fatal):', err.message);
  }
}

// Allow direct execution: node scripts/backup.js
if (require.main === module) {
  runBackup().catch(err => {
    console.error('[backup] Failed:', err.message);
    process.exit(1);
  });
}

module.exports = { runBackup };
