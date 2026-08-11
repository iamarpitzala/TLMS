const express = require('express');
const { pool, istTimestamp } = require('../db');
const { requireLogin, requireOperator, requireAdmin } = require('../middleware/auth');
const audit = require('../middleware/audit');
const router = express.Router();

// Compute trial balance in 3 fixed queries regardless of account count
async function computeTrialBalance(date_from, date_to) {
  const params = [];
  const df = date_from ? (params.push(date_from), `AND le.entry_date >= $${params.length}`) : '';
  const dt = date_to   ? (params.push(date_to),   `AND le.entry_date <= $${params.length}`) : '';

  // Query 1: all accounts
  // Query 2: aggregated debit/credit sums per account in one pass
  // Query 3: all ledger entries in one pass (with verified_by join)
  const [accsRes, sumsRes, entriesRes] = await Promise.all([
    pool.query(`SELECT * FROM accounts WHERE is_active=1 ORDER BY account_name`),

    pool.query(`
      SELECT
        le.account_id,
        SUM(CASE WHEN le.entry_type = 'debit'  THEN le.amount ELSE 0 END) AS debit_total,
        SUM(CASE WHEN le.entry_type = 'credit' THEN le.amount ELSE 0 END) AS credit_total
      FROM ledger_entries le
      WHERE 1=1 ${df} ${dt}
      GROUP BY le.account_id
    `, params),

    pool.query(`
      SELECT le.*, u.username AS verified_by_name,
        t.amount AS tx_base_amount
      FROM ledger_entries le
      LEFT JOIN users u ON le.verified_by = u.id
      LEFT JOIN transactions t ON le.transaction_id = t.id
      WHERE le.entry_type IN ('debit','credit') ${df} ${dt}
      ORDER BY le.account_id, le.entry_date ASC, le.id ASC
    `, params)
  ]);

  // Index results by account_id for O(1) lookup
  const sumsMap   = {};
  const entriesMap = {};
  sumsRes.rows.forEach(r => { sumsMap[r.account_id] = r; });
  entriesRes.rows.forEach(r => {
    if (!entriesMap[r.account_id]) entriesMap[r.account_id] = [];
    entriesMap[r.account_id].push(r);
  });

  return accsRes.rows.map(acc => {
    const opening     = acc.opening_amount || 0;
    const sums        = sumsMap[acc.id] || { debit_total: 0, credit_total: 0 };
    const debitTotal  = parseFloat(sums.debit_total)  || 0;
    const creditTotal = parseFloat(sums.credit_total) || 0;
    const entries     = entriesMap[acc.id] || [];

    const openingCredit = opening >= 0 ? opening : 0;
    const openingDebit  = opening < 0  ? Math.abs(opening) : 0;
    const closingNet    = opening + creditTotal - debitTotal;
    const closingCredit = closingNet >= 0 ? closingNet : 0;
    const closingDebit  = closingNet < 0  ? Math.abs(closingNet) : 0;
    const verifiedEntries = entries.filter(e => e.is_verified).length;

    return {
      account_id:       acc.id,
      account_name:     acc.account_name,
      opening_credit:   parseFloat(openingCredit.toFixed(2)),
      opening_debit:    parseFloat(openingDebit.toFixed(2)),
      closing_credit:   parseFloat(closingCredit.toFixed(2)),
      closing_debit:    parseFloat(closingDebit.toFixed(2)),
      is_verified:      entries.length > 0 && verifiedEntries === entries.length,
      total_entries:    entries.length,
      verified_entries: verifiedEntries,
      entries
    };
  });
}

// GET /api/trial-balance
router.get('/', requireLogin, async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    const rows = await computeTrialBalance(date_from, date_to);

    const totalAccounts       = rows.length;
    const verifiedAccounts    = rows.filter(r => r.is_verified).length;
    const pendingVerification = totalAccounts - verifiedAccounts;
    const verificationPct     = totalAccounts > 0
      ? parseFloat(((verifiedAccounts / totalAccounts) * 100).toFixed(1)) : 0;

    res.json({ data: rows, summary: { totalAccounts, verifiedAccounts, pendingVerification, verificationPct } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/trial-balance/entries/:id/verify
router.patch('/entries/:id/verify', requireOperator, async (req, res) => {
  try {
    const entry = (await pool.query('SELECT * FROM ledger_entries WHERE id=$1', [req.params.id])).rows[0];
    if (!entry) return res.status(404).json({ error: 'Ledger entry not found' });
    if (entry.is_locked) return res.status(403).json({ error: 'Entry is locked; only Administrator can unlock' });

    const now = istTimestamp();
    await pool.query(
      `UPDATE ledger_entries SET is_verified=1, verified_by=$1, verified_at=$2, is_locked=1 WHERE id=$3`,
      [req.session.user.id, now, req.params.id]
    );

    audit(req, 'verify', 'ledger_entries', entry.id,
      { is_verified: 0, is_locked: 0 },
      { is_verified: 1, is_locked: 1, amount: entry.amount, entry_type: entry.entry_type }
    );

    const updated = (await pool.query('SELECT * FROM ledger_entries WHERE id=$1', [req.params.id])).rows[0];
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/trial-balance/entries/:id/unlock
router.patch('/entries/:id/unlock', requireAdmin, async (req, res) => {
  try {
    const entry = (await pool.query('SELECT * FROM ledger_entries WHERE id=$1', [req.params.id])).rows[0];
    if (!entry) return res.status(404).json({ error: 'Ledger entry not found' });

    const { field, new_value } = req.body;

    audit(req, 'unlock', 'ledger_entries', entry.id,
      { is_locked: 1, is_verified: 1 },
      { is_locked: 0, is_verified: 0, field, new_value }
    );

    if (field && new_value !== undefined) {
      const allowed = ['particulars', 'message', 'brokerage', 'amount', 'entry_date'];
      if (!allowed.includes(field)) return res.status(400).json({ error: 'Field not editable: ' + field });
      await pool.query(
        `UPDATE ledger_entries SET is_locked=0, is_verified=0, ${field}=$1 WHERE id=$2`,
        [new_value, entry.id]
      );
    } else {
      await pool.query('UPDATE ledger_entries SET is_locked=0, is_verified=0 WHERE id=$1', [entry.id]);
    }

    const updated = (await pool.query('SELECT * FROM ledger_entries WHERE id=$1', [req.params.id])).rows[0];
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
