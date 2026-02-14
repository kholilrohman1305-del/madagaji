const jwt = require('jsonwebtoken');
const { db1 } = require('../db');
const { verifyPassword } = require('../utils/password');

const TOKEN_COOKIE = 'auth_token';

function signToken(user) {
  return jwt.sign(
    {
      sub: String(user.id),
      role: user.role,
      display_name: user.display_name || ''
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
      issuer: process.env.JWT_ISSUER || 'mada-core',
      audience: process.env.JWT_AUDIENCE || 'mada-apps'
    }
  );
}

function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET, {
    issuer: process.env.JWT_ISSUER || 'mada-core',
    audience: process.env.JWT_AUDIENCE || 'mada-apps'
  });
}

function buildCookieOptions() {
  const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: 7 * 24 * 60 * 60 * 1000
  };
}

async function login(username, password) {
  const [rows] = await db1.query(
    'SELECT id, username, role, display_name, password_hash, password_salt FROM users WHERE username=? LIMIT 1',
    [username]
  );
  const user = rows[0];
  if (!user) return null;
  if (!verifyPassword(password, user.password_hash, user.password_salt)) return null;

  await db1.query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);
  const token = signToken(user);
  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      display_name: user.display_name || ''
    }
  };
}

async function getUserById(id) {
  const [rows] = await db1.query(
    'SELECT id, username, role, display_name FROM users WHERE id=? LIMIT 1',
    [id]
  );
  return rows[0] || null;
}

module.exports = {
  TOKEN_COOKIE,
  buildCookieOptions,
  verifyToken,
  login,
  getUserById
};
