const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const db = new Database(path.join(__dirname, 'tlms.db'));

// WAL mode for performance with large datasets
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── IST timestamp helper ─────────────────────────────────────────────────
// SQLite datetime('now') always returns UTC. We register a custom function
// so all timestamps stored in the DB are in IST (UTC+5:30).
function nowIST() {
  const now = new Date();
  // Offset UTC by +5:30
  const ist = new Date(now.getTime() + (5 * 60 + 30) * 60 * 1000);
  return ist.toISOString().slice(0, 19).replace('T', ' ');
}
db.function('now_ist', nowIST);

// Convenience export so routes can use the same function
function istTimestamp() {
  return nowIST();
}

// IST date only (YYYY-MM-DD)
function istDate() {
  return nowIST().slice(0, 10);
}

function init() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('administrator','operator','viewer')),
      created_at TEXT DEFAULT (now_ist())
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_name TEXT NOT NULL UNIQUE,
      mobile_number TEXT,
      opening_amount REAL NOT NULL DEFAULT 0,
      balance_date TEXT,
      group_name TEXT,
      parent_account TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (now_ist()),
      updated_at TEXT DEFAULT (now_ist())
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      voucher_number TEXT NOT NULL UNIQUE,
      transaction_date TEXT NOT NULL DEFAULT (date(now_ist())),
      transaction_city TEXT,
      token_details TEXT,
      amount REAL NOT NULL,
      wallet_city TEXT,
      debit_party_id INTEGER REFERENCES accounts(id),
      debit_rate REAL DEFAULT 0,
      debit_commission REAL DEFAULT 0,
      remarks TEXT,
      message TEXT,
      credit_wallet_city TEXT,
      credit_party_id INTEGER REFERENCES accounts(id),
      credit_rate REAL DEFAULT 0,
      credit_commission REAL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Pending Verification',
      created_by INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (now_ist())
    );

    CREATE TABLE IF NOT EXISTS ledger_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL REFERENCES accounts(id),
      transaction_id INTEGER REFERENCES transactions(id),
      entry_date TEXT NOT NULL,
      entry_type TEXT NOT NULL CHECK(entry_type IN ('debit','credit','commission_debit','commission_credit')),
      particulars TEXT,
      message TEXT,
      brokerage REAL DEFAULT 0,
      amount REAL NOT NULL,
      is_verified INTEGER NOT NULL DEFAULT 0,
      verified_by INTEGER REFERENCES users(id),
      verified_at TEXT,
      is_locked INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (now_ist())
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_id INTEGER REFERENCES users(id),
      actor_name TEXT,
      action TEXT NOT NULL,
      table_name TEXT,
      record_id INTEGER,
      field_name TEXT,
      old_value TEXT,
      new_value TEXT,
      timestamp TEXT DEFAULT (now_ist())
    );

    CREATE TABLE IF NOT EXISTS voucher_counter (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      last_seq INTEGER NOT NULL DEFAULT 0
    );

    INSERT OR IGNORE INTO voucher_counter(id, last_seq) VALUES(1, 0);

    CREATE INDEX IF NOT EXISTS idx_ledger_account ON ledger_entries(account_id);
    CREATE INDEX IF NOT EXISTS idx_ledger_date ON ledger_entries(entry_date);
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date);
    CREATE INDEX IF NOT EXISTS idx_transactions_debit ON transactions(debit_party_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_credit ON transactions(credit_party_id);
  `);

  // ── Migrations for existing databases ──────────────────────────────────
  const txCols = db.prepare('PRAGMA table_info(transactions)').all().map(c => c.name);
  if (!txCols.includes('verified_by')) {
    db.exec('ALTER TABLE transactions ADD COLUMN verified_by INTEGER REFERENCES users(id)');
  }
  if (!txCols.includes('verified_at')) {
    db.exec('ALTER TABLE transactions ADD COLUMN verified_at TEXT');
  }

  // Seed default users if none exist
  const count = db.prepare('SELECT COUNT(*) as c FROM users').get();
  if (count.c === 0) {
    const adminHash = bcrypt.hashSync('admin123', 10);
    db.prepare("INSERT INTO users(username,password_hash,role) VALUES(?,?,?)").run('admin', adminHash, 'administrator');
    const opHash = bcrypt.hashSync('operator123', 10);
    db.prepare("INSERT INTO users(username,password_hash,role) VALUES(?,?,?)").run('operator', opHash, 'operator');
    const vHash = bcrypt.hashSync('viewer123', 10);
    db.prepare("INSERT INTO users(username,password_hash,role) VALUES(?,?,?)").run('viewer', vHash, 'viewer');
    console.log('Default users seeded: admin/admin123, operator/operator123, viewer/viewer123');
  }
}

function nextVoucherNumber() {
  const today = istDate().replace(/-/g, '');
  const row = db.prepare('SELECT last_seq FROM voucher_counter WHERE id=1').get();
  const seq = row.last_seq + 1;
  db.prepare('UPDATE voucher_counter SET last_seq=? WHERE id=1').run(seq);
  return `VCH-${today}-${String(seq).padStart(5, '0')}`;
}

module.exports = { db, init, nextVoucherNumber, istTimestamp, istDate };
