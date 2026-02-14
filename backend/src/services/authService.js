const jwt = require('jsonwebtoken');
const pool = require('../db');
const { hashPassword, verifyPassword } = require('../utils/password');

const TOKEN_COOKIE = 'auth_token';

function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    issuer: process.env.JWT_ISSUER || 'mada-core',
    audience: process.env.JWT_AUDIENCE || 'mada-apps'
  });
}

function buildCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: 7 * 24 * 60 * 60 * 1000
  };
}

async function ensureAdminUser() {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  const displayName = process.env.ADMIN_NAME || 'Administrator';
  if (!username || !password) return;

  const [rows] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
  if (rows.length > 0) return;

  const { hash, salt } = hashPassword(password);
  await pool.query(
    'INSERT INTO users (username, password_hash, password_salt, role, display_name) VALUES (?,?,?,?,?)',
    [username, hash, salt, 'admin', displayName]
  );
}

async function login(username, password) {
  const [rows] = await pool.query(
    'SELECT id, username, role, display_name, password_hash, password_salt FROM users WHERE username = ? LIMIT 1',
    [username]
  );
  const user = rows[0];
  if (!user) return null;
  if (!verifyPassword(password, user.password_hash, user.password_salt)) return null;

  await pool.query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);
  const token = signToken({ id: user.id, role: user.role });

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      display_name: user.display_name
    }
  };
}

async function getUserById(id) {
  const [rows] = await pool.query(
    'SELECT id, username, role, display_name FROM users WHERE id = ? LIMIT 1',
    [id]
  );
  return rows[0] || null;
}

module.exports = {
  TOKEN_COOKIE,
  buildCookieOptions,
  ensureAdminUser,
  login,
  getUserById
};
