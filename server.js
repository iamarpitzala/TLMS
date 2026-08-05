require('dotenv').config();

const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const path = require('path');
const { pool, init } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

if (isProd) app.set('trust proxy', 1);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const SECRET_PLACEHOLDER = 'change-this-to-a-long-random-secret-before-deploying';
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === SECRET_PLACEHOLDER) {
  if (isProd) {
    console.error('FATAL: SESSION_SECRET is not set or is using the default placeholder.');
    process.exit(1);
  } else {
    console.warn('WARNING: SESSION_SECRET is using a placeholder. Set a real value in .env for production.');
  }
}

app.use(session({
  store: new pgSession({
    pool,
    tableName: 'user_sessions',
    createTableIfMissing: true
  }),
  secret: process.env.SESSION_SECRET || SECRET_PLACEHOLDER,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProd,
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 8 * 60 * 60 * 1000
  }
}));

app.use('/api/auth',          require('./routes/auth'));
app.use('/api/users',         require('./routes/users'));
app.use('/api/accounts',      require('./routes/accounts'));
app.use('/api/transactions',  require('./routes/transactions'));
app.use('/api/ledger',        require('./routes/ledger'));
app.use('/api/trial-balance', require('./routes/trial-balance'));
app.use('/api/export',        require('./routes/export'));

app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api/')) {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  next();
});

init().then(() => {
  app.listen(PORT, () => {
    console.log(`TLMS running at http://localhost:${PORT} [${isProd ? 'production' : 'development'}]`);
  });
}).catch(err => {
  console.error('Failed to initialise database:', err.message);
  process.exit(1);
});
