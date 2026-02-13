const jwt = require('jsonwebtoken');
const { getUserById } = require('../services/authService');
const { TOKEN_COOKIE } = require('../services/authService');

function isAuthBypassEnabled() {
  return String(process.env.AUTH_BYPASS || '').toLowerCase() === 'true';
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
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await getUserById(payload.id);
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
