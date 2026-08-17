// Postgres backup — dumps via pg_dump and uploads to Cloudflare R2
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

const { execSync }  = require('child_process');
const { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const fs   = require('fs');
const path = require('path');

async function runBackup() {
  const DATABASE_URL     = process.env.DATABASE_URL;
  const R2_ACCOUNT_ID    = process.env.R2_ACCOUNT_ID;
  const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
  const R2_SECRET_KEY    = process.env.R2_SECRET_ACCESS_KEY;
  const R2_BUCKET        = process.env.R2_BUCKET_NAME || 'tlms-backups';
  const R2_ENDPOINT      = process.env.R2_ENDPOINT || `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const RETAIN_DAYS      = 3;

  if (!DATABASE_URL)                    throw new Error('DATABASE_URL is not set');
  if (!R2_ACCESS_KEY_ID || !R2_SECRET_KEY) throw new Error('R2 credentials not set');
  if (!R2_ACCOUNT_ID && !process.env.R2_ENDPOINT) throw new Error('R2_ACCOUNT_ID or R2_ENDPOINT is not set');

  // ── Step 1: pg_dump ──────────────────────────────────────────────────────
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
  const dumpFile  = path.join('/tmp', `tlms_${timestamp}.sql`);
  const objectKey = `tlms_${timestamp}.sql`;

  console.log(`[backup] Dumping database to ${dumpFile}...`);
  execSync(`pg_dump "${DATABASE_URL}" -F p -f "${dumpFile}"`, { stdio: 'inherit' });
  console.log('[backup] pg_dump complete.');

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
