const express = require('express');
const { db } = require('../db');
const { requireLogin, requireOperator, requireAdmin } = require('../middleware/auth');
const router = express.Router();

// GET /api/ledger — debit or credit ledger for an account
router.get('/', requireLogin, (req, res) => {
  const { account_id, type, date_from, date_to } = req.query;

  if (!account_id) return res.status(400).json({ error: 'account_id is required' });

  let typeFilter = [];
  if (type === 'debit') typeFilter = ['debit', 'commission_debit'];
  else if (type === 'credit') typeFilter = ['credit', 'commission_credit'];
  else typeFilter = ['debit', 'credit', 'commission_debit', 'commission_credit'];

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
  if (date_to) { sql += ` AND le.entry_date <= ?`; params.push(date_to); }

  sql += ` ORDER BY le.entry_date ASC, le.id ASC`;

  const rows = db.prepare(sql).all(...params);

  // Totals
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

// PATCH /api/ledger/:id/verify — mark entry as verified (operator+)
router.patch('/:id/verify', requireOperator, (req, res) => {
  const entry = db.prepare('SELECT * FROM ledger_entries WHERE id = ?').get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Ledger entry not found' });
  if (entry.is_locked) return res.status(403).json({ error: 'Entry is locked; only Administrator can modify' });

  db.prepare(`
    UPDATE ledger_entries
    SET is_verified=1, verified_by=?, verified_at=datetime('now'), is_locked=1
    WHERE id=?
  `).run(req.session.user.id, req.params.id);

  const updated = db.prepare('SELECT * FROM ledger_entries WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// PATCH /api/ledger/:id/unlock — admin unlocks a verified/locked entry
router.patch('/:id/unlock', requireAdmin, (req, res) => {
  const entry = db.prepare('SELECT * FROM ledger_entries WHERE id = ?').get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Ledger entry not found' });

  const { field, new_value } = req.body;

  // Log every unlock action
  db.prepare(`
    INSERT INTO audit_log(actor_id, actor_name, action, table_name, record_id, field_name, old_value, new_value)
    VALUES(?,?,'unlock','ledger_entries',?,?,?,?)
  `).run(req.session.user.id, req.session.user.username, entry.id,
    field || 'is_locked',
    field ? String(entry[field]) : '1',
    field ? String(new_value) : '0');

  if (field && new_value !== undefined) {
    // Admin is editing a specific field after unlock
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

// GET /api/ledger/audit — admin views audit log
router.get('/audit', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT 500').all();
  res.json(rows);
});

module.exports = router;
