const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const { validateJWT, requireRole } = require('../../shared-lib/src');

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

app.get('/api/health', (req, res) => res.json({ ok: true, app: 'finance' }));

app.use('/api', validateJWT);
app.get('/api/me', (req, res) => res.json({ success: true, user: req.auth }));
app.get('/api/finance-admin', requireRole('admin'), (req, res) => {
  res.json({ success: true, message: 'Finance admin route active.' });
});

app.use((err, req, res, next) => {
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error.',
    code: err.code || 'INTERNAL_ERROR'
  });
});

module.exports = app;
