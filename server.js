const express = require('express');
const session = require('express-session');
const path = require('path');
const { init } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'tlms-secret-2024-change-in-prod',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,        // set true behind HTTPS in production
    httpOnly: true,
    maxAge: 8 * 60 * 60 * 1000 // 8 hours
  }
}));

// ─── Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/accounts', require('./routes/accounts'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/ledger', require('./routes/ledger'));
app.use('/api/trial-balance', require('./routes/trial-balance'));
app.use('/api/export', require('./routes/export'));

// ─── SPA Fallback ────────────────────────────────────────────────────────
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api/')) {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  next();
});

// ─── Start ───────────────────────────────────────────────────────────────
init();
app.listen(PORT, () => {
  console.log(`TLMS running at http://localhost:${PORT}`);
});
