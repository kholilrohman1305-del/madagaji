const jwt = require('jsonwebtoken');
const { getUserById } = require('../services/authService');
const { TOKEN_COOKIE } = require('../services/authService');

function isAuthBypassEnabled() {
  const bypass = String(process.env.AUTH_BYPASS || '').toLowerCase() === 'true';
  const isProduction = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
  return bypass && !isProduction;
}

function trustTokenUserEnabled() {
  return String(process.env.AUTH_TRUST_TOKEN_USER || '').toLowerCase() === 'true';
}

async function authRequired(req, res, next) {
  try {
    if (isAuthBypassEnabled()) {
      req.user = {
        id: 0,
        username: process.env.ADMIN_USERNAME || 'admin',
        role: 'admin',
        display_name: process.env.ADMIN_NAME || 'Administrator'
      };
      return next();
    }

    const token = req.cookies?.[TOKEN_COOKIE];
    if (!token) return res.status(401).json({ success: false, message: 'Unauthorized.' });
    const payload = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: process.env.JWT_ISSUER || 'mada-core',
      audience: process.env.JWT_AUDIENCE || 'mada-apps'
    });

    if (trustTokenUserEnabled()) {
      req.user = {
        id: Number(payload.sub || payload.id || 0),
        username: payload.username || '',
        role: payload.role || 'guru',
        display_name: payload.display_name || ''
      };
      return next();
    }

    const userId = payload.id || payload.sub;
    const user = await getUserById(userId);
    if (!user) return res.status(401).json({ success: false, message: 'Unauthorized.' });
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ success: false, message: 'Unauthorized.' });
  }
}

function requireRole(roles = []) {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, message: 'Unauthorized.' });
    if (allowed.length > 0 && !allowed.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden.' });
    }
    next();
  };
}

module.exports = { authRequired, requireRole };
