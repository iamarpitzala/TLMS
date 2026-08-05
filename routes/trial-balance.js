const express = require('express');
const { pool, istTimestamp } = require('../db');
const { requireLogin, requireOperator, requireAdmin } = require('../middleware/auth');
const audit = require('../middleware/audit');
const router = express.Router();

async function computeTrialBalance(date_from, date_to) {
  const { rows: accounts } = await pool.query(
    `SELECT * FROM accounts WHERE is_active = 1 ORDER BY account_name`
  );

  const results = await Promise.all(accounts.map(async acc => {
    const opening = acc.opening_amount || 0;
    const params  = [acc.id];
    const dfCond  = date_from ? `AND le.entry_date >= $2` : '';
    const dtCond  = date_to   ? `AND le.entry_date <= $${date_from ? 3 : 2}` : '';
    if (date_from) params.push(date_from);
    if (date_to)   params.push(date_to);

    const [debitRes, creditRes, entriesRes] = await Promise.all([
      pool.query(`
        SELECT COALESCE(SUM(le.amount),0) AS total FROM ledger_entries le
        WHERE le.account_id=$1 AND le.entry_type = ANY(${ '\'{"debit","commission_debit"}\'' })
        ${dfCond} ${dtCond}
      `.replace(/\$\{.*?\}/g, "'{\"debit\",\"commission_debit\"}'"), params),
      pool.query(`
        SELECT COALESCE(SUM(le.amount),0) AS total FROM ledger_entries le
        WHERE le.account_id=$1 AND le.entry_type = ANY(${ '\'{"credit","commission_credit"}\'' })
        ${dfCond} ${dtCond}
      `.replace(/\$\{.*?\}/g, "'{\"credit\",\"commission_credit\"}'"), params),
      pool.query(`
        SELECT le.*, u.username AS verified_by_name
        FROM ledger_entries le
        LEFT JOIN users u ON le.verified_by = u.id
        WHERE le.account_id=$1 ${dfCond} ${dtCond}
        ORDER BY le.entry_date ASC, le.id ASC
      `, params)
    ]);

    const debitTotal  = parseFloat(debitRes.rows[0].total)  || 0;
    const creditTotal = parseFloat(creditRes.rows[0].total) || 0;
    const entries     = entriesRes.rows;

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
  }));

  return results;
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
