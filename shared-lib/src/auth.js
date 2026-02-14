const jwt = require('jsonwebtoken');

function extractToken(req, cookieName = 'auth_token') {
  const cookieToken = req.cookies?.[cookieName];
  if (cookieToken) return cookieToken;
  const header = req.headers.authorization || '';
  if (/^Bearer\s+/i.test(header)) return header.replace(/^Bearer\s+/i, '');
  return '';
}

function validateJWT(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) return res.status(401).json({ success: false, message: 'Unauthorized.' });
    const payload = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: process.env.JWT_ISSUER || 'mada-core',
      audience: process.env.JWT_AUDIENCE || 'mada-apps'
    });
    req.auth = payload;
    return next();
  } catch {
    return res.status(401).json({ success: false, message: 'Unauthorized.' });
  }
}

function requireRole(roles = []) {
  const allow = Array.isArray(roles) ? roles : [roles];
  return (req, res, next) => {
    const role = req.auth?.role;
    if (!role) return res.status(401).json({ success: false, message: 'Unauthorized.' });
    if (allow.length > 0 && !allow.includes(role)) {
      return res.status(403).json({ success: false, message: 'Forbidden.' });
    }
    return next();
  };
}

module.exports = { extractToken, validateJWT, requireRole };
