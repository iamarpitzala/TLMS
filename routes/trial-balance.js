const express = require('express');
const { db } = require('../db');
const { requireLogin } = require('../middleware/auth');
const router = express.Router();

// Compute trial balance for all accounts in a date range
function computeTrialBalance(date_from, date_to) {
  const accounts = db.prepare(`SELECT * FROM accounts WHERE is_active = 1 ORDER BY account_name`).all();

  const results = accounts.map(acc => {
    const opening = acc.opening_amount || 0;
    const balDate = acc.balance_date;

    // Sum of debit transactions in period
    const debitSum = db.prepare(`
      SELECT COALESCE(SUM(le.amount),0) AS total
      FROM ledger_entries le
      WHERE le.account_id = ?
        AND le.entry_type IN ('debit','commission_debit')
        ${date_from ? "AND le.entry_date >= '" + date_from + "'" : ''}
        ${date_to ? "AND le.entry_date <= '" + date_to + "'" : ''}
    `).get(acc.id);

    const creditSum = db.prepare(`
      SELECT COALESCE(SUM(le.amount),0) AS total
      FROM ledger_entries le
      WHERE le.account_id = ?
        AND le.entry_type IN ('credit','commission_credit')
        ${date_from ? "AND le.entry_date >= '" + date_from + "'" : ''}
        ${date_to ? "AND le.entry_date <= '" + date_to + "'" : ''}
    `).get(acc.id);

    const netDebit = debitSum.total;
    const netCredit = creditSum.total;

    // Opening split: if opening_amount > 0 it's a credit opening, < 0 debit
    const openingCredit = opening >= 0 ? opening : 0;
    const openingDebit = opening < 0 ? Math.abs(opening) : 0;

    const closingNet = opening + netCredit - netDebit;
    const closingCredit = closingNet >= 0 ? closingNet : 0;
    const closingDebit = closingNet < 0 ? Math.abs(closingNet) : 0;

    // Verification status for this account's entries in range
    const verifiedCount = db.prepare(`
      SELECT COUNT(*) as c FROM ledger_entries
      WHERE account_id = ? AND is_verified = 1
        ${date_from ? "AND entry_date >= '" + date_from + "'" : ''}
        ${date_to ? "AND entry_date <= '" + date_to + "'" : ''}
    `).get(acc.id);

    const totalEntries = db.prepare(`
      SELECT COUNT(*) as c FROM ledger_entries
      WHERE account_id = ?
        ${date_from ? "AND entry_date >= '" + date_from + "'" : ''}
        ${date_to ? "AND entry_date <= '" + date_to + "'" : ''}
    `).get(acc.id);

    const isVerified = totalEntries.c > 0 && verifiedCount.c === totalEntries.c;

    return {
      account_id: acc.id,
      account_name: acc.account_name,
      opening_credit: parseFloat(openingCredit.toFixed(2)),
      opening_debit: parseFloat(openingDebit.toFixed(2)),
      closing_credit: parseFloat(closingCredit.toFixed(2)),
      closing_debit: parseFloat(closingDebit.toFixed(2)),
      is_verified: isVerified
    };
  });

  return results;
}

// GET /api/trial-balance
router.get('/', requireLogin, (req, res) => {
  const { date_from, date_to } = req.query;
  const rows = computeTrialBalance(date_from, date_to);

  // Dashboard summary
  const totalAccounts = rows.length;
  const verifiedAccounts = rows.filter(r => r.is_verified).length;
  const pendingVerification = totalAccounts - verifiedAccounts;
  const verificationPct = totalAccounts > 0
    ? parseFloat(((verifiedAccounts / totalAccounts) * 100).toFixed(1))
    : 0;

  res.json({
    data: rows,
    summary: { totalAccounts, verifiedAccounts, pendingVerification, verificationPct }
  });
});

module.exports = router;
