// Daily backup script — checkpoint WAL then copy tlms.db to backups/tlms_YYYYMMDD.db
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const src = path.join(__dirname, '..', 'tlms.db');
const backupDir = path.join(__dirname, '..', 'backups');

if (!fs.existsSync(src)) {
  console.log('Database not found, nothing to backup.');
  process.exit(0);
}

// ─── Step 1: Checkpoint WAL into main db file ─────────────────────────────
// This ensures all pending writes are flushed before we copy the file.
try {
  const db = new Database(src);
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.close();
  console.log('WAL checkpoint complete.');
} catch (err) {
  console.error('WAL checkpoint failed:', err.message);
  // Don't abort — still attempt the backup with whatever is in the main file
}

// ─── Step 2: Copy db file to backups/ ─────────────────────────────────────
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const dest = path.join(backupDir, `tlms_${today}.db`);

fs.copyFileSync(src, dest);
console.log(`Backup created: ${dest}`);

// ─── Step 3: Keep last 30 backups ─────────────────────────────────────────
const files = fs.readdirSync(backupDir)
  .filter(f => f.startsWith('tlms_') && f.endsWith('.db'))
  .sort();

if (files.length > 30) {
  const toDelete = files.slice(0, files.length - 30);
  toDelete.forEach(f => {
    fs.unlinkSync(path.join(backupDir, f));
    console.log(`Removed old backup: ${f}`);
  });
}

console.log(`Done. ${Math.min(files.length, 30)} backup(s) retained.`);
