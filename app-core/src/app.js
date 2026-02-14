const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const { db1, db2 } = require('./db');
const { authRequired } = require('./middleware/auth');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const masterRoutes = require('./routes/master');

function normalizeOrigin(origin) {
  return String(origin || '').trim().replace(/\/+$/, '');
}

function parseAllowedOrigins(rawValue) {
  const fallback = 'http://localhost:5173';
  const list = String(rawValue || fallback)
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean);
  return list.length ? list : [fallback];
}

const app = express();
const allowedOrigins = parseAllowedOrigins(process.env.FRONTEND_ORIGIN);

app.disable('x-powered-by');
app.use(helmet());
app.use(compression());
app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    const incoming = normalizeOrigin(origin);
    if (allowedOrigins.includes(incoming)) return callback(null, true);
    return callback(new Error('CORS origin not allowed'));
  },
  credentials: true
}));
app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', async (req, res) => {
  let dbMain = false;
  let dbMaster = false;
  try {
    await db1.query('SELECT 1');
    dbMain = true;
    await db2.query('SELECT 1');
    dbMaster = true;
    res.json({ ok: true, dbMain, dbMaster });
  } catch (e) {
    res.status(503).json({
      ok: false,
      dbMain,
      dbMaster,
      message: 'Database tidak terkoneksi.',
      code: e.code || 'DB_UNAVAILABLE'
    });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api', authRequired);
app.use('/api/users', userRoutes);
app.use('/api/master', masterRoutes);

app.use((err, req, res, next) => {
  const status = err.status || 500;
  res.status(status).json({
    success: false,
    message: err.message || 'Internal server error.',
    code: err.code || 'INTERNAL_ERROR'
  });
});

module.exports = app;
