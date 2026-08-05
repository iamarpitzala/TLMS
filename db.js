require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

if (!process.env.DATABASE_URL) {
  console.error('FATAL: DATABASE_URL is not set in .env');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000
});

// ─── IST timestamp helpers (used by JS code, not DB defaults) ─────────────
function nowIST() {
  const now = new Date();
  const ist = new Date(now.getTime() + (5 * 60 + 30) * 60 * 1000);
  return ist.toISOString().slice(0, 19).replace('T', ' ');
}
function istTimestamp() { return nowIST(); }
function istDate()      { return nowIST().slice(0, 10); }

// ─── Schema initialisation ────────────────────────────────────────────────
async function init() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id           SERIAL PRIMARY KEY,
        username     TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role         TEXT NOT NULL CHECK(role IN ('administrator','operator','viewer')),
        is_active    INTEGER NOT NULL DEFAULT 1,
        created_at   TEXT DEFAULT NULL
      );

      CREATE TABLE IF NOT EXISTS accounts (
        id             SERIAL PRIMARY KEY,
        account_name   TEXT NOT NULL UNIQUE,
        mobile_number  TEXT,
        opening_amount REAL NOT NULL DEFAULT 0,
        balance_date   TEXT,
        group_name     TEXT,
        parent_account TEXT,
        is_active      INTEGER NOT NULL DEFAULT 1,
        created_at     TEXT DEFAULT NULL,
        updated_at     TEXT DEFAULT NULL
      );

      CREATE TABLE IF NOT EXISTS transactions (
        id                 SERIAL PRIMARY KEY,
        voucher_number     TEXT NOT NULL UNIQUE,
        transaction_date   TEXT NOT NULL,
        transaction_city   TEXT,
        token_details      TEXT,
        amount             REAL NOT NULL,
        wallet_city        TEXT,
        debit_party_id     INTEGER REFERENCES accounts(id),
        debit_rate         REAL DEFAULT 0,
        debit_commission   REAL DEFAULT 0,
        remarks            TEXT,
        message            TEXT,
        credit_wallet_city TEXT,
        credit_party_id    INTEGER REFERENCES accounts(id),
        credit_rate        REAL DEFAULT 0,
        credit_commission  REAL DEFAULT 0,
        status             TEXT NOT NULL DEFAULT 'Pending Verification',
        created_by         INTEGER REFERENCES users(id),
        verified_by        INTEGER REFERENCES users(id),
        verified_at        TEXT,
        created_at         TEXT DEFAULT NULL
      );

      CREATE TABLE IF NOT EXISTS ledger_entries (
        id             SERIAL PRIMARY KEY,
        account_id     INTEGER NOT NULL REFERENCES accounts(id),
        transaction_id INTEGER REFERENCES transactions(id),
        entry_date     TEXT NOT NULL,
        entry_type     TEXT NOT NULL CHECK(entry_type IN ('debit','credit','commission_debit','commission_credit')),
        particulars    TEXT,
        message        TEXT,
        brokerage      REAL DEFAULT 0,
        amount         REAL NOT NULL,
        is_verified    INTEGER NOT NULL DEFAULT 0,
        verified_by    INTEGER REFERENCES users(id),
        verified_at    TEXT,
        is_locked      INTEGER NOT NULL DEFAULT 0,
        created_at     TEXT DEFAULT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_log (
        id         SERIAL PRIMARY KEY,
        actor_id   INTEGER REFERENCES users(id),
        actor_name TEXT,
        action     TEXT NOT NULL,
        table_name TEXT,
        record_id  INTEGER,
        field_name TEXT,
        old_value  TEXT,
        new_value  TEXT,
        timestamp  TEXT DEFAULT NULL
      );

      CREATE TABLE IF NOT EXISTS voucher_counter (
        id       INTEGER PRIMARY KEY CHECK(id = 1),
        last_seq INTEGER NOT NULL DEFAULT 0
      );

      INSERT INTO voucher_counter(id, last_seq) VALUES(1, 0)
        ON CONFLICT(id) DO NOTHING;

      CREATE INDEX IF NOT EXISTS idx_ledger_account  ON ledger_entries(account_id);
      CREATE INDEX IF NOT EXISTS idx_ledger_date     ON ledger_entries(entry_date);
      CREATE INDEX IF NOT EXISTS idx_tx_date         ON transactions(transaction_date);
      CREATE INDEX IF NOT EXISTS idx_tx_debit        ON transactions(debit_party_id);
      CREATE INDEX IF NOT EXISTS idx_tx_credit       ON transactions(credit_party_id);
    `);

    // Seed default users if none exist
    const { rows } = await client.query('SELECT COUNT(*) AS c FROM users');
    if (parseInt(rows[0].c) === 0) {
      const adminHash = bcrypt.hashSync('admin123', 10);
      const opHash    = bcrypt.hashSync('operator123', 10);
      const vHash     = bcrypt.hashSync('viewer123', 10);
      const now       = nowIST();
      await client.query(`
        INSERT INTO users(username, password_hash, role, created_at) VALUES
          ('admin',    $1, 'administrator', $4),
          ('operator', $2, 'operator',      $4),
          ('viewer',   $3, 'viewer',        $4)
      `, [adminHash, opHash, vHash, now]);
      console.log('Default users seeded: admin/admin123, operator/operator123, viewer/viewer123');
    }

    console.log('PostgreSQL connected and schema ready.');
  } finally {
    client.release();
  }
}

// ─── Voucher number (atomic via PG transaction) ───────────────────────────
async function nextVoucherNumber() {
  const today = istDate().replace(/-/g, '');
  const { rows } = await pool.query(
    `UPDATE voucher_counter SET last_seq = last_seq + 1 WHERE id = 1 RETURNING last_seq`
  );
  const seq = rows[0].last_seq;
  return `VCH-${today}-${String(seq).padStart(5, '0')}`;
}

module.exports = { pool, init, nextVoucherNumber, istTimestamp, istDate };
