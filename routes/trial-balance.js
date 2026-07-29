const express = require('express');
const { db } = require('../db');
const { requireLogin, requireOperator, requireAdmin } = require('../middleware/auth');
const audit = require('../middleware/audit');
const router = express.Router();

function computeTrialBalance(date_from, date_to) {
  const accounts = db.prepare(`SELECT * FROM accounts WHERE is_active = 1 ORDER BY account_name`).all();

  return accounts.map(acc => {
    const opening = acc.opening_amount || 0;

    const debitSum = db.prepare(`
      SELECT COALESCE(SUM(le.amount),0) AS total
      FROM ledger_entries le
      WHERE le.account_id = ?
        AND le.entry_type IN ('debit','commission_debit')
        ${date_from ? "AND le.entry_date >= '" + date_from + "'" : ''}
        ${date_to   ? "AND le.entry_date <= '" + date_to   + "'" : ''}
    `).get(acc.id);

    const creditSum = db.prepare(`
      SELECT COALESCE(SUM(le.amount),0) AS total
      FROM ledger_entries le
      WHERE le.account_id = ?
        AND le.entry_type IN ('credit','commission_credit')
        ${date_from ? "AND le.entry_date >= '" + date_from + "'" : ''}
        ${date_to   ? "AND le.entry_date <= '" + date_to   + "'" : ''}
    `).get(acc.id);

    const openingCredit = opening >= 0 ? opening : 0;
    const openingDebit  = opening < 0  ? Math.abs(opening) : 0;
    const closingNet    = opening + creditSum.total - debitSum.total;
    const closingCredit = closingNet >= 0 ? closingNet : 0;
    const closingDebit  = closingNet < 0  ? Math.abs(closingNet) : 0;

    // Ledger entries for this account in the period (for inline verify UI)
    const entries = db.prepare(`
      SELECT le.*, u.username AS verified_by_name
      FROM ledger_entries le
      LEFT JOIN users u ON le.verified_by = u.id
      WHERE le.account_id = ?
        ${date_from ? "AND le.entry_date >= '" + date_from + "'" : ''}
        ${date_to   ? "AND le.entry_date <= '" + date_to   + "'" : ''}
      ORDER BY le.entry_date ASC, le.id ASC
    `).all(acc.id);

    const totalEntries    = entries.length;
    const verifiedEntries = entries.filter(e => e.is_verified).length;
    const isVerified      = totalEntries > 0 && verifiedEntries === totalEntries;

    return {
      account_id:      acc.id,
      account_name:    acc.account_name,
      opening_credit:  parseFloat(openingCredit.toFixed(2)),
      opening_debit:   parseFloat(openingDebit.toFixed(2)),
      closing_credit:  parseFloat(closingCredit.toFixed(2)),
      closing_debit:   parseFloat(closingDebit.toFixed(2)),
      is_verified:     isVerified,
      total_entries:   totalEntries,
      verified_entries: verifiedEntries,
      entries          // full list for inline UI
    };
  });
}

// GET /api/trial-balance
router.get('/', requireLogin, (req, res) => {
  const { date_from, date_to } = req.query;
  const rows = computeTrialBalance(date_from, date_to);

  const totalAccounts       = rows.length;
  const verifiedAccounts    = rows.filter(r => r.is_verified).length;
  const pendingVerification = totalAccounts - verifiedAccounts;
  const verificationPct     = totalAccounts > 0
    ? parseFloat(((verifiedAccounts / totalAccounts) * 100).toFixed(1))
    : 0;

  res.json({
    data: rows,
    summary: { totalAccounts, verifiedAccounts, pendingVerification, verificationPct }
  });
});

// PATCH /api/trial-balance/entries/:id/verify — operator+
router.patch('/entries/:id/verify', requireOperator, (req, res) => {
  const entry = db.prepare('SELECT * FROM ledger_entries WHERE id = ?').get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Ledger entry not found' });
  if (entry.is_locked) return res.status(403).json({ error: 'Entry is locked; only Administrator can unlock' });

  db.prepare(`
    UPDATE ledger_entries
    SET is_verified=1, verified_by=?, verified_at=now_ist(), is_locked=1
    WHERE id=?
  `).run(req.session.user.id, req.params.id);

  audit(req, 'verify', 'ledger_entries', entry.id,
    { is_verified: 0, is_locked: 0 },
    { is_verified: 1, is_locked: 1, amount: entry.amount, entry_type: entry.entry_type }
  );

  res.json(db.prepare('SELECT * FROM ledger_entries WHERE id = ?').get(req.params.id));
});

// PATCH /api/trial-balance/entries/:id/unlock — admin only
router.patch('/entries/:id/unlock', requireAdmin, (req, res) => {
  const entry = db.prepare('SELECT * FROM ledger_entries WHERE id = ?').get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Ledger entry not found' });

  const { field, new_value } = req.body;

  audit(req, 'unlock', 'ledger_entries', entry.id,
    { is_locked: 1, is_verified: 1, [field || 'is_locked']: field ? entry[field] : 1 },
    { is_locked: 0, is_verified: 0, [field || 'is_locked']: field ? new_value : 0 }
  );

  if (field && new_value !== undefined) {
    const allowed = ['particulars', 'message', 'brokerage', 'amount', 'entry_date'];
    if (!allowed.includes(field)) {
      return res.status(400).json({ error: 'Field not editable: ' + field });
    }
    db.prepare(`UPDATE ledger_entries SET is_locked=0, is_verified=0, ${field}=? WHERE id=?`)
      .run(new_value, entry.id);
  } else {
    db.prepare('UPDATE ledger_entries SET is_locked=0, is_verified=0 WHERE id=?').run(entry.id);
  }

  res.json(db.prepare('SELECT * FROM ledger_entries WHERE id = ?').get(req.params.id));
});

module.exports = router;
