const express = require('express');
const { db } = require('../db');
const { requireLogin, requireOperator } = require('../middleware/auth');
const router = express.Router();

// GET /api/accounts — list/search
router.get('/', requireLogin, (req, res) => {
  const { search, active } = req.query;
  let sql = `SELECT a.*, p.account_name AS parent_name
             FROM accounts a
             LEFT JOIN accounts p ON a.parent_account = CAST(p.id AS TEXT)
             WHERE 1=1`;
  const params = [];

  if (search) {
    sql += ` AND (a.account_name LIKE ? OR a.mobile_number LIKE ? OR a.group_name LIKE ?)`;
    const like = `%${search}%`;
    params.push(like, like, like);
  }
  if (active !== undefined) {
    sql += ` AND a.is_active = ?`;
    params.push(active === 'true' || active === '1' ? 1 : 0);
  }
  sql += ` ORDER BY a.account_name`;
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

// GET /api/accounts/:id
router.get('/:id', requireLogin, (req, res) => {
  const row = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Account not found' });
  res.json(row);
});

// POST /api/accounts — create
router.post('/', requireOperator, (req, res) => {
  const { account_name, mobile_number, opening_amount, balance_date, group_name, parent_account } = req.body;

  if (!account_name || !account_name.trim()) {
    return res.status(400).json({ error: 'Account Name is mandatory' });
  }
  const exists = db.prepare('SELECT id FROM accounts WHERE LOWER(account_name) = LOWER(?)').get(account_name.trim());
  if (exists) {
    return res.status(409).json({ error: 'Account Name already exists' });
  }
  const stmt = db.prepare(`
    INSERT INTO accounts(account_name, mobile_number, opening_amount, balance_date, group_name, parent_account)
    VALUES(?,?,?,?,?,?)
  `);
  const result = stmt.run(
    account_name.trim(),
    mobile_number || null,
    parseFloat(opening_amount) || 0,
    balance_date || null,
    group_name || null,
    parent_account || null
  );
  const created = db.prepare('SELECT * FROM accounts WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(created);
});

// PUT /api/accounts/:id — edit
router.put('/:id', requireOperator, (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Account not found' });

  const { account_name, mobile_number, opening_amount, balance_date, group_name, parent_account } = req.body;

  if (!account_name || !account_name.trim()) {
    return res.status(400).json({ error: 'Account Name is mandatory' });
  }
  // Duplicate check (excluding self)
  const dup = db.prepare('SELECT id FROM accounts WHERE LOWER(account_name) = LOWER(?) AND id != ?').get(account_name.trim(), id);
  if (dup) {
    return res.status(409).json({ error: 'Account Name already exists' });
  }
  db.prepare(`
    UPDATE accounts SET account_name=?, mobile_number=?, opening_amount=?, balance_date=?,
    group_name=?, parent_account=?, updated_at=datetime('now') WHERE id=?
  `).run(
    account_name.trim(),
    mobile_number || null,
    parseFloat(opening_amount) || 0,
    balance_date || null,
    group_name || null,
    parent_account || null,
    id
  );
  const updated = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
  res.json(updated);
});

// PATCH /api/accounts/:id/disable — toggle active status
router.patch('/:id/disable', requireOperator, (req, res) => {
  const { id } = req.params;
  const row = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Account not found' });
  const newStatus = row.is_active === 1 ? 0 : 1;
  db.prepare("UPDATE accounts SET is_active=?, updated_at=datetime('now') WHERE id=?").run(newStatus, id);
  res.json({ success: true, is_active: newStatus });
});

module.exports = router;
