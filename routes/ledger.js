const express = require('express');
const { db } = require('../db');
const { requireLogin, requireOperator, requireAdmin } = require('../middleware/auth');
const audit = require('../middleware/audit');
const router = express.Router();

// GET /api/ledger/audit — must be declared BEFORE /:id routes
router.get('/audit', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT 1000').all();
  res.json(rows);
});

// GET /api/ledger — entries for an account
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

// PATCH /api/ledger/:id/verify
router.patch('/:id/verify', requireOperator, (req, res) => {
  const entry = db.prepare('SELECT * FROM ledger_entries WHERE id = ?').get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Ledger entry not found' });
  if (entry.is_locked) return res.status(403).json({ error: 'Entry is locked; only Administrator can modify' });

  db.prepare(`
    UPDATE ledger_entries
    SET is_verified=1, verified_by=?, verified_at=datetime('now'), is_locked=1
    WHERE id=?
  `).run(req.session.user.id, req.params.id);

  audit(req, 'verify', 'ledger_entries', entry.id,
    { is_verified: 0, is_locked: 0 },
    { is_verified: 1, is_locked: 1, amount: entry.amount, entry_type: entry.entry_type }
  );

  const updated = db.prepare('SELECT * FROM ledger_entries WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// PATCH /api/ledger/:id/unlock — admin only
router.patch('/:id/unlock', requireAdmin, (req, res) => {
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
    db.prepare(`UPDATE ledger_entries SET is_locked=0, is_verified=0 WHERE id=?`).run(entry.id);
  }

  const updated = db.prepare('SELECT * FROM ledger_entries WHERE id = ?').get(req.params.id);
  res.json(updated);
});

module.exports = router;
