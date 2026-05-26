const pool = require('../db/pool');
const { ensureUsersTable } = require('./users.controller');
const { verifyPassword } = require('../utils/password');

async function login(req, res) {
  await ensureUsersTable();
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ message: 'username dan password wajib diisi.' });

  const [rows] = await pool.query(
    `SELECT id, username, password_hash, role, ref_type, ref_id, is_active
     FROM app_users WHERE username = ? LIMIT 1`,
    [String(username).trim()]
  );
  const user = rows[0];
  if (!user || !user.is_active) return res.status(401).json({ message: 'Akun tidak ditemukan / nonaktif.' });
  if (!verifyPassword(password, user.password_hash)) return res.status(401).json({ message: 'Username/password salah.' });
  res.json({
    id: user.id,
    username: user.username,
    role: user.role,
    ref_type: user.ref_type,
    ref_id: user.ref_id
  });
}

module.exports = { login };

