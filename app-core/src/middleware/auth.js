const { TOKEN_COOKIE, verifyToken, getUserById } = require('../services/authService');

async function authRequired(req, res, next) {
  try {
    const token = req.cookies?.[TOKEN_COOKIE] || req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ success: false, message: 'Unauthorized.' });

    const payload = verifyToken(token);
    const user = await getUserById(payload.sub);
    if (!user) return res.status(401).json({ success: false, message: 'Unauthorized.' });

    req.user = user;
    return next();
  } catch {
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
