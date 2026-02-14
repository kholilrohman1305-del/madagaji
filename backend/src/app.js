const express = require('express');
const path = require('path');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const requestId = require('./middleware/requestId');
const requestLogger = require('./middleware/requestLogger');
const errorHandler = require('./middleware/errorHandler');
const { authRequired } = require('./middleware/auth');
const pool = require('./db');

const dashboardRoutes = require('./routes/dashboard');
const masterRoutes = require('./routes/master');
const attendanceRoutes = require('./routes/attendance');
const scheduleRoutes = require('./routes/schedule');
const payrollRoutes = require('./routes/payroll');
const schedulerRoutes = require('./routes/scheduler');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');

const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');

function normalizeOrigin(origin) {
  return String(origin || '').trim().replace(/\/+$/, '');
}

function parseAllowedOrigins(rawValue) {
  const fallback = 'http://localhost:5173';
  const values = String(rawValue || fallback)
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean);
  return values.length > 0 ? values : [fallback];
}

const allowedOrigins = parseAllowedOrigins(process.env.FRONTEND_ORIGIN);

app.use(helmet());
app.use(compression({ level: Number(process.env.HTTP_COMPRESSION_LEVEL || 6) }));
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
app.use(express.json({ limit: process.env.HTTP_JSON_LIMIT || '2mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(requestId);
app.use(requestLogger);

app.get('/api/health', async (req, res) => {
  let mainDb = false;
  let masterDb = false;
  try {
    await pool.query('SELECT 1');
    mainDb = true;
    if (pool.master) {
      await pool.master.query('SELECT 1');
      masterDb = true;
    } else {
      masterDb = true;
    }
    res.json({
      ok: true,
      db: true,
      dbMain: mainDb,
      dbMaster: masterDb
    });
  } catch (e) {
    res.status(503).json({
      ok: false,
      db: false,
      dbMain: mainDb,
      dbMaster: masterDb,
      message: 'Database tidak terkoneksi.',
      code: e.code || 'DB_UNAVAILABLE'
    });
  }
});

app.use('/api/auth', authRoutes);

app.use('/api', authRequired);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/master', masterRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/scheduler', schedulerRoutes);
app.use('/api/users', userRoutes);

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.use(errorHandler);

module.exports = app;
