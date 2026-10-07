const express = require('express');
const { pool } = require('../db');
const { requireLogin, requireAdmin } = require('../middleware/auth');
const router = express.Router();

// GET /api/ledger/audit
router.get('/audit', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT 1000');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ledger — read-only
router.get('/', requireLogin, async (req, res) => {
  try {
    const { account_id, type, date_from, date_to } = req.query;
    if (!account_id) return res.status(400).json({ error: 'account_id is required' });

    let typeFilter;
    if (type === 'debit')       typeFilter = ['debit'];
    else if (type === 'credit') typeFilter = ['credit'];
    else                        typeFilter = ['debit', 'credit'];

    const params = [account_id, typeFilter];
    let sql = `
      SELECT le.*, u.username AS verified_by_name,
        t.amount AS tx_base_amount
      FROM ledger_entries le
      LEFT JOIN users u ON le.verified_by = u.id
      LEFT JOIN transactions t ON le.transaction_id = t.id
      WHERE le.account_id = $1 AND le.entry_type = ANY($2)
    `;
    if (date_from) { params.push(date_from); sql += ` AND le.entry_date >= $${params.length}`; }
    if (date_to)   { params.push(date_to);   sql += ` AND le.entry_date <= $${params.length}`; }
    sql += ` ORDER BY le.entry_date ASC, le.id ASC`;

    const { rows } = await pool.query(sql, params);
    let totalBrokerage = 0, totalAmount = 0;
    rows.forEach(r => { totalBrokerage += r.brokerage || 0; totalAmount += r.amount || 0; });

    // Compute real current balance for this account across ALL dates (ignoring filters)
    // Opening balance comes from the accounts table; ledger credits add, debits subtract
    const accRes = await pool.query('SELECT opening_amount FROM accounts WHERE id=$1', [account_id]);
    const openingAmount = parseFloat(accRes.rows[0]?.opening_amount || 0);

    // If a date_from filter is active, compute the "opening balance for the period"
    // as: account opening_amount + all credits before date_from - all debits before date_from
    // This becomes the opening balance row displayed at the top of the filtered ledger.
    let periodOpeningBalance = openingAmount;
    if (date_from) {
      const preRes = await pool.query(`
        SELECT
          COALESCE(SUM(CASE WHEN entry_type='credit' THEN amount ELSE 0 END), 0) AS pre_credit,
          COALESCE(SUM(CASE WHEN entry_type='debit'  THEN amount ELSE 0 END), 0) AS pre_debit
        FROM ledger_entries
        WHERE account_id = $1 AND entry_date < $2
      `, [account_id, date_from]);
      const preCredit = parseFloat(preRes.rows[0].pre_credit);
      const preDebit  = parseFloat(preRes.rows[0].pre_debit);
      periodOpeningBalance = parseFloat((openingAmount + preCredit - preDebit).toFixed(4));
    }

    const balRes = await pool.query(`
      SELECT
        COALESCE(SUM(CASE WHEN entry_type='credit' THEN amount ELSE 0 END), 0) AS total_credit,
        COALESCE(SUM(CASE WHEN entry_type='debit'  THEN amount ELSE 0 END), 0) AS total_debit
      FROM ledger_entries
      WHERE account_id = $1
    `, [account_id]);
    const totalCredit = parseFloat(balRes.rows[0].total_credit);
    const totalDebit  = parseFloat(balRes.rows[0].total_debit);
    const currentBalance = parseFloat((openingAmount + totalCredit - totalDebit).toFixed(4));

    res.json({
      data: rows,
      totals: {
        brokerage: parseFloat(totalBrokerage.toFixed(2)),
        amount:    parseFloat(totalAmount.toFixed(2))
      },
      currentBalance,
      periodOpeningBalance
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
