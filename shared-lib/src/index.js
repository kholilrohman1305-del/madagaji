const { extractToken, validateJWT, requireRole } = require('./auth');

module.exports = {
  extractToken,
  validateJWT,
  requireRole
};
