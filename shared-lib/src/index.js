const { extractToken, validateJWT, requireRole } = require('./auth');
const db = require('./db');

module.exports = {
  extractToken,
  validateJWT,
  requireRole,
  db
};
