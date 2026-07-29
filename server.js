require('dotenv').config();

const express = require('express');
const session = require('express-session');
const makeSQLiteStore = require('./session-store');
const path = require('path');
const { init } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

// ─── Trust proxy (required when behind nginx/caddy in production) ─────────
if (isProd) {
  app.set('trust proxy', 1);
}

// ─── Middleware ───────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Validate SESSION_SECRET is set and not the default placeholder
const SECRET_PLACEHOLDER = 'change-this-to-a-long-random-secret-before-deploying';
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === SECRET_PLACEHOLDER) {
  if (isProd) {
    console.error('FATAL: SESSION_SECRET is not set or is using the default placeholder.');
    console.error('Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
    process.exit(1);
  } else {
    console.warn('WARNING: SESSION_SECRET is using a placeholder. Set a real value in .env for production.');
  }
}

const SQLiteStore = makeSQLiteStore(session);

app.use(session({
  store: new SQLiteStore({
    dbPath: path.join(__dirname, 'sessions.db'),
    ttl: 8 * 60 * 60   // 8 hours in seconds
  }),
  secret: process.env.SESSION_SECRET || SECRET_PLACEHOLDER,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProd,      // true in production (requires HTTPS), false in dev
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 8 * 60 * 60 * 1000  // 8 hours in ms
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
  console.log(`TLMS running at http://localhost:${PORT} [${isProd ? 'production' : 'development'}]`);
});
