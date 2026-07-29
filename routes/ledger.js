const express = require('express');
const { db } = require('../db');
const { requireLogin, requireAdmin } = require('../middleware/auth');
const router = express.Router();

// GET /api/ledger/audit — must be declared BEFORE /:id routes
router.get('/audit', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT 1000').all();
  res.json(rows);
});

// GET /api/ledger — read-only view of entries for an account
router.get('/', requireLogin, (req, res) => {
  const { account_id, type, date_from, date_to } = req.query;

  if (!account_id) return res.status(400).json({ error: 'account_id is required' });

  let typeFilter = [];
  if (type === 'debit')       typeFilter = ['debit', 'commission_debit'];
  else if (type === 'credit') typeFilter = ['credit', 'commission_credit'];
  else                        typeFilter = ['debit', 'credit', 'commission_debit', 'commission_credit'];

  const placeholders = typeFilter.map(() => '?').join(',');
  let sql = `
    SELECT le.*, u.username AS verified_by_name
    FROM ledger_entries le
    LEFT JOIN users u ON le.verified_by = u.id
    WHERE le.account_id = ?
      AND le.entry_type IN (${placeholders})
  `;
  const params = [account_id, ...typeFilter];

  if (date_from) { sql += ` AND le.entry_date >= ?`; params.push(date_from); }
  if (date_to)   { sql += ` AND le.entry_date <= ?`; params.push(date_to); }

  sql += ` ORDER BY le.entry_date ASC, le.id ASC`;

  const rows = db.prepare(sql).all(...params);

  let totalBrokerage = 0, totalAmount = 0;
  rows.forEach(r => { totalBrokerage += r.brokerage || 0; totalAmount += r.amount || 0; });

  res.json({
    data: rows,
    totals: {
      brokerage: parseFloat(totalBrokerage.toFixed(2)),
      amount: parseFloat(totalAmount.toFixed(2))
    }
  });
});

module.exports = router;
