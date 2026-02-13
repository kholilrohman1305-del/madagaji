const pool = require('../db');
const { hashPassword } = require('../utils/password');

async function listUsers() {
  const [rows] = await pool.query(
    'SELECT id, username, role, display_name, created_at, last_login FROM users ORDER BY created_at DESC'
  );
  return rows;
}

async function createUser({ username, password, role, displayName }) {
  if (!username || !password) {
    return { success: false, message: 'Username dan password wajib.' };
  }
  const roleValue = role === 'guru' ? 'guru' : 'admin';
  const [exists] = await pool.query('SELECT id FROM users WHERE username = ? LIMIT 1', [username]);
  if (exists.length > 0) {
    return { success: false, message: 'Username sudah digunakan.' };
  }
  const { hash, salt } = hashPassword(password);
  await pool.query(
    'INSERT INTO users (username, password_hash, password_salt, role, display_name) VALUES (?,?,?,?,?)',
    [username, hash, salt, roleValue, displayName || null]
  );
  return { success: true, message: 'User berhasil ditambahkan.' };
}

async function updateUser(id, { password, role, displayName }) {
  const updates = [];
  const params = [];
  if (role) {
    updates.push('role=?');
    params.push(role === 'guru' ? 'guru' : 'admin');
  }
  if (displayName !== undefined) {
    updates.push('display_name=?');
    params.push(displayName || null);
  }
  if (password) {
    const { hash, salt } = hashPassword(password);
    updates.push('password_hash=?', 'password_salt=?');
    params.push(hash, salt);
  }
  if (updates.length === 0) {
    return { success: true, message: 'Tidak ada perubahan.' };
  }
  params.push(id);
  await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id=?`, params);
  return { success: true, message: 'User berhasil diperbarui.' };
}

async function deleteUser(id) {
  await pool.query('DELETE FROM users WHERE id=?', [id]);
  return { success: true, message: 'User berhasil dihapus.' };
}

module.exports = {
  listUsers,
  createUser,
  updateUser,
  deleteUser
};
