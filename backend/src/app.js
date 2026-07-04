const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const requestId = require('./middleware/requestId');
const requestLogger = require('./middleware/requestLogger');
const errorHandler = require('./middleware/errorHandler');
const { authRequired } = require('./middleware/auth');
const { internalAuth } = require('./middleware/internalAuth');
const pool = require('./db');

const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const masterRoutes = require('./routes/master');
const attendanceRoutes = require('./routes/attendance');
const scheduleRoutes = require('./routes/schedule');
const payrollRoutes = require('./routes/payroll');
const schedulerRoutes = require('./routes/scheduler');
const usersRoutes = require('./routes/users');
const mobileRoutes = require('./routes/mobile');
const externalRoutes = require('./routes/external');
const payrollService = require('./services/payrollService');

// Gateway apps (SKS & PDMada) hanya tersedia di local dev (semua repo di folder yang sama).
// Di hosting terpisah, path relatif ini tidak ada — load secara opsional agar app tetap jalan.
let createSksApp = null;
let createPdmadaApiApp = null;
try { createSksApp = require('../../../sks/src/app').createApp; } catch (_) {}
try { createPdmadaApiApp = require('../../../pdmada/backend/src/server').createApp; } catch (_) {}

const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');

function normalizeOrigin(origin) {
  return String(origin || '').trim().replace(/\/+$/, '');
}

function parseAllowedOrigins(rawValue) {
  const defaults = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:4000',
    'http://127.0.0.1:4000',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3002',
    'http://127.0.0.1:3002'
  ];
  const configured = String(rawValue || '')
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean);
  return Array.from(new Set([...configured, ...defaults]));
}

function isTrustedTunnelOrigin(origin) {
  const value = normalizeOrigin(origin);
  if (!value) return false;
  return /^https:\/\/[a-z0-9-]+\.(ngrok-free\.app|ngrok\.io|ngrok\.app)$/i.test(value);
}

const allowedOrigins = parseAllowedOrigins(process.env.FRONTEND_ORIGIN);
const enableGateway = String(process.env.ENABLE_SYSTEM_GATEWAY || 'true').toLowerCase() === 'true';
const sksTarget = 'embedded:/sks';
const pdmadaFrontendTarget = 'embedded:/pdmada';
const pdmadaApiTarget = 'embedded:/pdmada-api';
const pdmadaDistDir = process.env.PDMADA_FRONTEND_DIST_DIR
  ? path.resolve(process.env.PDMADA_FRONTEND_DIST_DIR)
  : path.resolve(__dirname, '..', '..', '..', 'pdmada', 'frontend', 'dist');

function stripHopHeaders(headers = {}) {
  const disallowed = new Set([
    'host',
    'connection',
    'content-length',
    'transfer-encoding',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'upgrade'
  ]);
  const out = {};
  for (const [k, v] of Object.entries(headers)) {
    if (!disallowed.has(String(k).toLowerCase())) out[k] = v;
  }
  return out;
}

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function createGateway(prefix, target, rewrite, predicate) {
  const normalizedPrefix = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
  return async (req, res, next) => {
    try {
      if (!req.originalUrl.startsWith(normalizedPrefix)) return next();
      if (typeof predicate === 'function' && !predicate(req)) return next();
      const rewrittenPath = rewrite(req.originalUrl);
      const upstreamUrl = new URL(rewrittenPath, target).toString();
      const method = req.method || 'GET';
      const headers = stripHopHeaders(req.headers);

      let body;
      if (!['GET', 'HEAD'].includes(method.toUpperCase())) {
        const ct = String(req.headers['content-type'] || '').toLowerCase();
        if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
          if (ct.includes('application/json')) {
            body = JSON.stringify(req.body);
          } else if (ct.includes('application/x-www-form-urlencoded')) {
            body = new URLSearchParams(req.body).toString();
          }
        } else if (!req.readableEnded) {
          body = await readRawBody(req);
        }
      }

      const upstream = await fetch(upstreamUrl, {
        method,
        headers,
        body,
        redirect: 'manual'
      });

      res.status(upstream.status);
      upstream.headers.forEach((value, key) => {
        if (key.toLowerCase() !== 'set-cookie') res.setHeader(key, value);
      });
      if (typeof upstream.headers.getSetCookie === 'function') {
        const setCookies = upstream.headers.getSetCookie();
        if (setCookies.length) res.setHeader('set-cookie', setCookies);
      }

      const buf = Buffer.from(await upstream.arrayBuffer());
      res.send(buf);
    } catch (err) {
      if (!res.headersSent) {
        res.status(502).json({
          success: false,
          message: 'Layanan terhubung tidak tersedia.',
          code: 'UPSTREAM_UNAVAILABLE'
        });
      }
    }
  };
}

app.use(helmet({
  // Needed because SKS login page uses external CDN assets/scripts.
  contentSecurityPolicy: false
}));
app.use(compression({ level: Number(process.env.HTTP_COMPRESSION_LEVEL || 6) }));
app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    const incoming = normalizeOrigin(origin);
    if (allowedOrigins.includes(incoming)) return callback(null, true);
    if (isTrustedTunnelOrigin(incoming)) return callback(null, true);
    if (
      process.env.NODE_ENV !== 'production' &&
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(incoming)
    ) {
      return callback(null, true);
    }
    console.warn(`[CORS] blocked origin: ${incoming} | allowed: ${allowedOrigins.join(',')}`);
    return callback(new Error('CORS origin not allowed'));
  },
  credentials: true
}));
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
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
      app: 'backend',
      mode: 'monolith',
      gateway: {
        enabled: enableGateway,
        sksTarget,
        pdmadaFrontendTarget,
        pdmadaApiTarget
      },
      db: true,
      dbMain: mainDb,
      dbMaster: masterDb
    });
  } catch (e) {
    res.status(503).json({
      ok: false,
      app: 'backend',
      mode: 'monolith',
      gateway: {
        enabled: enableGateway,
        sksTarget,
        pdmadaFrontendTarget,
        pdmadaApiTarget
      },
      db: false,
      dbMain: mainDb,
      dbMaster: masterDb,
      message: 'Database tidak terkoneksi.',
      code: e.code || 'DB_UNAVAILABLE'
    });
  }
});

if (enableGateway && createSksApp && createPdmadaApiApp) {
  const fromSksPage = (req) => String(req.headers.referer || '').includes('/sks');
  const sksApp = createSksApp({ basePath: '/sks' });
  const pdmadaApiApp = createPdmadaApiApp();

  // Backward compatibility for legacy SKS absolute API links (/api/*).
  app.use((req, res, next) => {
    if (!fromSksPage(req)) return next();
    if (!req.path.startsWith('/api/')) return next();
    return res.redirect(307, `/sks${req.originalUrl}`);
  });

  app.use('/sks', sksApp);
  app.use('/pdmada-api', pdmadaApiApp);

  if (fs.existsSync(pdmadaDistDir)) {
    app.use('/pdmada', express.static(pdmadaDistDir));
    app.get('/pdmada/*', (req, res) => {
      res.sendFile(path.join(pdmadaDistDir, 'index.html'));
    });
  } else {
    app.get('/pdmada', (req, res) => {
      res.status(503).json({
        success: false,
        message: 'Frontend PDMADA belum dibuild.',
        hint: 'Jalankan: cd d:\\node.js\\pdmada\\frontend && npm run build'
      });
    });
  }
}

app.use('/api/auth', authRoutes);
app.use('/api/auth/biometric', require('./routes/biometric'));
app.use('/api/dashboard', authRequired, dashboardRoutes);
app.use('/api/master', authRequired, masterRoutes);
app.use('/api/attendance', authRequired, attendanceRoutes);
app.use('/api/schedule', authRequired, scheduleRoutes);
app.use('/api/payroll', authRequired, payrollRoutes);
// Backward-compatible aliases for legacy frontend paths.
app.get('/api/expenses', authRequired, async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) return res.status(400).json({ success: false, message: 'startDate dan endDate wajib.' });
    res.json(await payrollService.getOtherExpenses(startDate, endDate));
  } catch (e) { next(e); }
});
app.post('/api/expenses', authRequired, async (req, res, next) => {
  try { res.json(await payrollService.addOtherExpense(req.body || {})); } catch (e) { next(e); }
});
app.put('/api/expenses/:id', authRequired, async (req, res, next) => {
  try { res.json(await payrollService.updateOtherExpense({ ...(req.body || {}), id: req.params.id })); } catch (e) { next(e); }
});
app.delete('/api/expenses/:id', authRequired, async (req, res, next) => {
  try { res.json(await payrollService.deleteOtherExpense(req.params.id)); } catch (e) { next(e); }
});
app.use('/api/scheduler', authRequired, schedulerRoutes);
app.use('/api/users', authRequired, usersRoutes);
app.use('/api/mobile', mobileRoutes);
app.use('/api/external', internalAuth, externalRoutes);

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.use(errorHandler);

module.exports = app;
