const express = require('express');
const bcrypt = require('bcryptjs');
const { pool, istTimestamp } = require('../db');
const { requireAdmin } = require('../middleware/auth');
const audit = require('../middleware/audit');
const router = express.Router();

const VALID_ROLES = ['administrator', 'operator', 'viewer'];

router.get('/', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, username, role, is_active, created_at FROM users ORDER BY is_active DESC, role, username`
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', requireAdmin, async (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username?.trim()) return res.status(400).json({ error: 'Username is required' });
    if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    if (!VALID_ROLES.includes(role)) return res.status(400).json({ error: `Role must be one of: ${VALID_ROLES.join(', ')}` });

    const dup = (await pool.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [username.trim()])).rows[0];
    if (dup) return res.status(409).json({ error: 'Username already exists' });

    const hash = bcrypt.hashSync(password, 10);
    const now  = istTimestamp();
    const { rows } = await pool.query(
      `INSERT INTO users(username, password_hash, role, created_at) VALUES($1,$2,$3,$4) RETURNING id, username, role, is_active, created_at`,
      [username.trim(), hash, role, now]
    );

    audit(req, 'create', 'users', rows[0].id, null, { username: rows[0].username, role });
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id/password', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;
    const user = (await pool.query('SELECT * FROM users WHERE id=$1', [id])).rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const hash = bcrypt.hashSync(password, 10);
    await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, id]);
    audit(req, 'password_change', 'users', parseInt(id), { username: user.username }, { password: '(changed)' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id/role', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    if (!VALID_ROLES.includes(role)) return res.status(400).json({ error: `Role must be one of: ${VALID_ROLES.join(', ')}` });

    const user = (await pool.query('SELECT * FROM users WHERE id=$1', [id])).rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (parseInt(id) === req.session.user.id && role !== 'administrator') {
      return res.status(403).json({ error: 'You cannot change your own role' });
    }

    await pool.query('UPDATE users SET role=$1 WHERE id=$2', [role, id]);
    audit(req, 'role_change', 'users', parseInt(id), { role: user.role }, { role });
    res.json({ success: true, role });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id/reactivate', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const user = (await pool.query('SELECT * FROM users WHERE id=$1', [id])).rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.is_active === 1) return res.status(400).json({ error: 'User is already active' });

    await pool.query('UPDATE users SET is_active=1 WHERE id=$1', [id]);
    audit(req, 'reactivate', 'users', parseInt(id), { is_active: 0 }, { is_active: 1 });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (parseInt(id) === req.session.user.id) return res.status(403).json({ error: 'You cannot delete your own account' });

    const user = (await pool.query('SELECT * FROM users WHERE id=$1', [id])).rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.is_active === 0) return res.status(400).json({ error: 'User is already deactivated' });

    await pool.query('UPDATE users SET is_active=0 WHERE id=$1', [id]);
    audit(req, 'deactivate', 'users', parseInt(id), { is_active: 1 }, { is_active: 0 });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
