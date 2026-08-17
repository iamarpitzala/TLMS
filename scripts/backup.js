// Daily Postgres backup script
// Dumps the database using pg_dump and uploads to Cloudflare R2 (S3-compatible)
// Requires: @aws-sdk/client-s3 (npm install @aws-sdk/client-s3)
//
// Required env vars:
//   DATABASE_URL          — postgres connection string
//   R2_ACCOUNT_ID         — Cloudflare account ID
//   R2_ACCESS_KEY_ID      — R2 access key
//   R2_SECRET_ACCESS_KEY  — R2 secret key
//   R2_BUCKET             — R2 bucket name
//   R2_ENDPOINT           — https://<account_id>.r2.cloudflarestorage.com  (optional, built from R2_ACCOUNT_ID)

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { execSync } = require('child_process');
const { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const fs   = require('fs');
const path = require('path');

// ─── Config ──────────────────────────────────────────────────────────────────
const DATABASE_URL       = process.env.DATABASE_URL;
const R2_ACCOUNT_ID      = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID   = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_KEY      = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET          = process.env.R2_BUCKET || 'tlms-backups';
const R2_ENDPOINT        = process.env.R2_ENDPOINT || `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
const RETAIN_DAYS        = parseInt(process.env.BACKUP_RETAIN_DAYS || '30');

if (!DATABASE_URL) { console.error('DATABASE_URL is not set'); process.exit(1); }
if (!R2_ACCESS_KEY_ID || !R2_SECRET_KEY) { console.error('R2 credentials not set'); process.exit(1); }

// ─── Step 1: pg_dump to a temp file ──────────────────────────────────────────
const timestamp  = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
const dumpFile   = path.join('/tmp', `tlms_${timestamp}.sql`);
const objectKey  = `tlms_${timestamp}.sql`;

console.log(`[backup] Dumping database to ${dumpFile}...`);
try {
  execSync(`pg_dump "${DATABASE_URL}" -F p -f "${dumpFile}"`, { stdio: 'inherit' });
  console.log('[backup] pg_dump complete.');
} catch (err) {
  console.error('[backup] pg_dump failed:', err.message);
  process.exit(1);
}

// ─── Step 2: Upload to R2 ────────────────────────────────────────────────────
const s3 = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId:     R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_KEY,
  },
});

(async () => {
  try {
    console.log(`[backup] Uploading ${objectKey} to R2 bucket "${R2_BUCKET}"...`);
    const fileStream = fs.createReadStream(dumpFile);
    await s3.send(new PutObjectCommand({
      Bucket:      R2_BUCKET,
      Key:         objectKey,
      Body:        fileStream,
      ContentType: 'application/sql',
    }));
    console.log('[backup] Upload complete.');
  } catch (err) {
    console.error('[backup] Upload failed:', err.message);
    process.exit(1);
  } finally {
    fs.unlinkSync(dumpFile); // clean up temp file
  }

  // ─── Step 3: Prune old backups (keep last RETAIN_DAYS) ─────────────────────
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
    console.warn('[backup] Pruning failed (non-fatal):', err.message);
  }
})();
