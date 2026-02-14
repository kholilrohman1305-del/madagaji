const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const { validateJWT, requireRole } = require('../../shared-lib/src');
const { db1, db2 } = require('./db');
const expenseRoutes = require('./routes/expenses');
const payrollRoutes = require('./routes/payroll');
const financeCrudRoutes = require('./routes/financeCrud');

const app = express();

function normalizeOrigin(origin) {
  return String(origin || '').trim().replace(/\/+$/, '');
}

const allowedOrigins = String(process.env.FRONTEND_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map(normalizeOrigin)
  .filter(Boolean);

app.use(helmet());
app.use(compression());
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(normalizeOrigin(origin))) return cb(null, true);
    return cb(new Error('CORS origin not allowed'));
  },
  credentials: true
}));
app.use(cookieParser());
app.use(express.json());

app.get('/api/health', async (req, res) => {
  let dbMain = false;
  let dbMaster = false;
  try {
    await db1.query('SELECT 1');
    dbMain = true;
    await db2.query('SELECT 1');
    dbMaster = true;
    res.json({ ok: true, app: 'finance', dbMain, dbMaster });
  } catch (e) {
    res.status(503).json({
      ok: false,
      app: 'finance',
      dbMain,
      dbMaster,
      message: 'Database tidak terkoneksi.',
      code: e.code || 'DB_UNAVAILABLE'
    });
  }
});

app.use('/api', validateJWT);
app.get('/api/me', (req, res) => res.json({ success: true, user: req.auth }));
app.get('/api/finance-admin', requireRole('admin'), (req, res) => {
  res.json({ success: true, message: 'Finance admin route active.' });
});
app.use('/api/expenses', expenseRoutes);
app.use('/api/payroll/expenses', expenseRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api', financeCrudRoutes);

app.use((err, req, res, next) => {
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error.',
    code: err.code || 'INTERNAL_ERROR'
  });
});

module.exports = app;
