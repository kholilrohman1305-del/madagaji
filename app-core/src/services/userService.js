const { db1 } = require('../db');
const { hashPassword } = require('../utils/password');

async function listUsers() {
  const [rows] = await db1.query(
    'SELECT id, username, role, display_name, last_login, created_at FROM users ORDER BY created_at DESC'
  );
  return rows;
}

async function createUser({ username, password, role = 'guru', displayName = '' }) {
  const [existing] = await db1.query('SELECT id FROM users WHERE username=? LIMIT 1', [username]);
  if (existing.length > 0) throw new Error('Username sudah digunakan.');
  const { hash, salt } = hashPassword(password);
  const [result] = await db1.query(
    'INSERT INTO users (username, password_hash, password_salt, role, display_name) VALUES (?,?,?,?,?)',
    [username, hash, salt, role, displayName]
  );
  return { id: result.insertId };
}

async function updateUser(id, { password, role, displayName }) {
  if (password) {
    const { hash, salt } = hashPassword(password);
    await db1.query(
      'UPDATE users SET password_hash=?, password_salt=?, role=?, display_name=? WHERE id=?',
      [hash, salt, role, displayName, id]
    );
    return;
  }
  await db1.query(
    'UPDATE users SET role=?, display_name=? WHERE id=?',
    [role, displayName, id]
  );
}

module.exports = { listUsers, createUser, updateUser };
