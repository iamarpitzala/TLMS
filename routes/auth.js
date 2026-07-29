const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const audit = require('../middleware/audit');
const router = express.Router();

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    // Log failed login attempt
    audit(req, 'login_failed', 'users', null, null, { username: username.trim() });
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  req.session.user = { id: user.id, username: user.username, role: user.role };
  // Log successful login
  audit(req, 'login', 'users', user.id);
  res.json({ success: true, user: { id: user.id, username: user.username, role: user.role } });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  if (req.session && req.session.user) {
    audit(req, 'logout', 'users', req.session.user.id);
  }
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  res.json({ user: req.session.user });
});

module.exports = router;
