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
    if (type === 'debit')       typeFilter = ['debit', 'commission_debit'];
    else if (type === 'credit') typeFilter = ['credit', 'commission_credit'];
    else                        typeFilter = ['debit', 'credit', 'commission_debit', 'commission_credit'];

    const params = [account_id, typeFilter];
    let sql = `
      SELECT le.*, u.username AS verified_by_name
      FROM ledger_entries le
      LEFT JOIN users u ON le.verified_by = u.id
      WHERE le.account_id = $1 AND le.entry_type = ANY($2)
    `;
    if (date_from) { params.push(date_from); sql += ` AND le.entry_date >= $${params.length}`; }
    if (date_to)   { params.push(date_to);   sql += ` AND le.entry_date <= $${params.length}`; }
    sql += ` ORDER BY le.entry_date ASC, le.id ASC`;

    const { rows } = await pool.query(sql, params);
    let totalBrokerage = 0, totalAmount = 0;
    rows.forEach(r => { totalBrokerage += r.brokerage || 0; totalAmount += r.amount || 0; });

    res.json({
      data: rows,
      totals: {
        brokerage: parseFloat(totalBrokerage.toFixed(2)),
        amount:    parseFloat(totalAmount.toFixed(2))
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
