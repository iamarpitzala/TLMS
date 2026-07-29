// Daily backup script — copy tlms.db to backups/tlms_YYYYMMDD.db
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'tlms.db');
const backupDir = path.join(__dirname, '..', 'backups');

if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const dest = path.join(backupDir, `tlms_${today}.db`);

if (!fs.existsSync(src)) {
  console.log('Database not found, nothing to backup.');
  process.exit(0);
}

fs.copyFileSync(src, dest);
console.log(`Backup created: ${dest}`);

// Keep last 30 backups
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
