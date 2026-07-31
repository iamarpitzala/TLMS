const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { requireAdmin } = require('../middleware/auth');
const audit = require('../middleware/audit');
const router = express.Router();

const VALID_ROLES = ['administrator', 'operator', 'viewer'];

// GET /api/users — list all users (admin only)
router.get('/', requireAdmin, (req, res) => {
  const rows = db.prepare(
    `SELECT id, username, role, is_active, created_at FROM users ORDER BY is_active DESC, role, username`
  ).all();
  res.json(rows);
});

// POST /api/users — create a new user (admin only)
router.post('/', requireAdmin, (req, res) => {
  const { username, password, role } = req.body;

  if (!username || !username.trim()) {
    return res.status(400).json({ error: 'Username is required' });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: `Role must be one of: ${VALID_ROLES.join(', ')}` });
  }

  const exists = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').get(username.trim());
  if (exists) {
    return res.status(409).json({ error: 'Username already exists' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare(
    `INSERT INTO users(username, password_hash, role) VALUES(?, ?, ?)`
  ).run(username.trim(), hash, role);

  audit(req, 'create', 'users', result.lastInsertRowid, null, { username: username.trim(), role });

  const created = db.prepare('SELECT id, username, role, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(created);
});

// PATCH /api/users/:id/password — change password (admin only)
router.patch('/:id/password', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { password } = req.body;

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }

  const hash = bcrypt.hashSync(password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id);

  audit(req, 'password_change', 'users', parseInt(id),
    { username: user.username },
    { username: user.username, password: '(changed)' }
  );

  res.json({ success: true });
});

// PATCH /api/users/:id/role — change role (admin only, cannot demote self)
router.patch('/:id/role', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { role } = req.body;

  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: `Role must be one of: ${VALID_ROLES.join(', ')}` });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Prevent admin from removing their own admin role
  if (parseInt(id) === req.session.user.id && role !== 'administrator') {
    return res.status(403).json({ error: 'You cannot change your own role' });
  }

  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);

  audit(req, 'role_change', 'users', parseInt(id),
    { username: user.username, role: user.role },
    { username: user.username, role }
  );

  res.json({ success: true, role });
});

// PATCH /api/users/:id/reactivate — reactivate a deactivated user
router.patch('/:id/reactivate', requireAdmin, (req, res) => {
  const { id } = req.params;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.is_active === 1) return res.status(400).json({ error: 'User is already active' });

  db.prepare('UPDATE users SET is_active = 1 WHERE id = ?').run(id);

  audit(req, 'reactivate', 'users', parseInt(id),
    { username: user.username, is_active: 0 },
    { username: user.username, is_active: 1 }
  );

  res.json({ success: true });
});

// DELETE /api/users/:id — deactivate user (admin only, cannot deactivate self)
// Hard delete is not possible due to FK references in audit_log/transactions.
// We soft-delete by setting is_active = 0, which blocks login.
router.delete('/:id', requireAdmin, (req, res) => {
  const { id } = req.params;

  if (parseInt(id) === req.session.user.id) {
    return res.status(403).json({ error: 'You cannot delete your own account' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.is_active === 0) return res.status(400).json({ error: 'User is already deactivated' });

  db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(id);

  audit(req, 'deactivate', 'users', parseInt(id),
    { username: user.username, role: user.role, is_active: 1 },
    { username: user.username, is_active: 0 }
  );

  res.json({ success: true });
});

module.exports = router;
