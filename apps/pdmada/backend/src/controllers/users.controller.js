const pool = require('../db/pool');
const { hashPassword } = require('../utils/password');

async function ensureUsersTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_users (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(100) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('admin','wali_kelas','guru','siswa') NOT NULL,
      ref_type ENUM('teacher','student','class','none') NOT NULL DEFAULT 'none',
      ref_id INT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_users_role (role, is_active),
      INDEX idx_users_ref (ref_type, ref_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `);

  const adminUsername = process.env.PDMADA_ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.PDMADA_ADMIN_PASSWORD || 'admin';
  const [rows] = await pool.query('SELECT id FROM app_users WHERE username = ? LIMIT 1', [adminUsername]);
  if (!rows[0]) {
    await pool.query(
      `INSERT INTO app_users (username, password_hash, role, ref_type, ref_id, is_active)
       VALUES (?, ?, 'admin', 'none', NULL, 1)`,
      [adminUsername, hashPassword(adminPassword)]
    );
  }
}

async function syncAutoAccounts() {
  await ensureUsersTable();
  const [students] = await pool.query('SELECT id, nis_local, nisn, is_active FROM students');
  const [teachers] = await pool.query('SELECT id, niy, is_active FROM teachers');
  for (const s of students) {
    // eslint-disable-next-line no-await-in-loop
    await upsertStudentAccount(s);
  }
  for (const t of teachers) {
    // eslint-disable-next-line no-await-in-loop
    await upsertTeacherAccount(t);
  }
}

async function list(req, res) {
  await ensureUsersTable();
  const role = (req.query.role || '').trim();
  const params = [];
  let where = '';
  if (role) {
    where = 'WHERE u.role = ?';
    params.push(role);
  }
  const [rows] = await pool.query(
    `SELECT u.id, u.username, u.role, u.ref_type, u.ref_id, u.is_active, u.created_at, u.updated_at,
            t.name AS teacher_name, s.name AS student_name
     FROM app_users u
     LEFT JOIN teachers t ON u.ref_type = 'teacher' AND u.ref_id = t.id
     LEFT JOIN students s ON u.ref_type = 'student' AND u.ref_id = s.id
     ${where}
     ORDER BY u.role ASC, u.username ASC`,
    params
  );
  res.json(rows);
}

async function create(req, res) {
  await ensureUsersTable();
  let { username, password, role, ref_type = 'none', ref_id = null, is_active = 1 } = req.body;
  if (!role) {
    return res.status(400).json({ message: 'role wajib diisi.' });
  }

  if (role === 'guru') {
    if (!ref_id) return res.status(400).json({ message: 'Pilih data guru untuk role guru.' });
    const [teacherRows] = await pool.query('SELECT id, niy FROM teachers WHERE id = ? LIMIT 1', [ref_id]);
    const teacher = teacherRows[0];
    if (!teacher) return res.status(400).json({ message: 'Data guru tidak ditemukan.' });
    username = teacher.niy;
    password = teacher.niy;
    ref_type = 'teacher';
  } else if (role === 'siswa') {
    if (!ref_id) return res.status(400).json({ message: 'Pilih data siswa untuk role siswa.' });
    const [studentRows] = await pool.query('SELECT id, nis_local, nisn FROM students WHERE id = ? LIMIT 1', [ref_id]);
    const student = studentRows[0];
    if (!student) return res.status(400).json({ message: 'Data siswa tidak ditemukan.' });
    username = String(student.nis_local || student.nisn || '').trim();
    password = username;
    ref_type = 'student';
  } else {
    if (!username || !password) return res.status(400).json({ message: 'username dan password wajib diisi.' });
    if (!ref_type) ref_type = 'none';
  }

  const [result] = await pool.query(
    `INSERT INTO app_users (username, password_hash, role, ref_type, ref_id, is_active)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [username.trim(), hashPassword(password), role, ref_type, ref_id, is_active ? 1 : 0]
  );
  const [rows] = await pool.query('SELECT id, username, role, ref_type, ref_id, is_active, created_at, updated_at FROM app_users WHERE id = ?', [result.insertId]);
  res.status(201).json(rows[0]);
}

async function update(req, res) {
  await ensureUsersTable();
  const [existingRows] = await pool.query('SELECT * FROM app_users WHERE id = ?', [req.params.id]);
  const existing = existingRows[0];
  if (!existing) return res.status(404).json({ message: 'User tidak ditemukan.' });

  let username = req.body.username ?? existing.username;
  const role = req.body.role ?? existing.role;
  let ref_type = req.body.ref_type ?? existing.ref_type;
  let ref_id = typeof req.body.ref_id === 'undefined' ? existing.ref_id : req.body.ref_id;
  const is_active = typeof req.body.is_active === 'undefined' ? existing.is_active : (req.body.is_active ? 1 : 0);
  let password_hash = req.body.password ? hashPassword(req.body.password) : existing.password_hash;

  if (role === 'guru' && ref_id) {
    const [teacherRows] = await pool.query('SELECT id, niy FROM teachers WHERE id = ? LIMIT 1', [ref_id]);
    const teacher = teacherRows[0];
    if (!teacher) return res.status(400).json({ message: 'Data guru tidak ditemukan.' });
    username = teacher.niy;
    if (!req.body.password) password_hash = hashPassword(teacher.niy);
    ref_type = 'teacher';
  }
  if (role === 'siswa' && ref_id) {
    const [studentRows] = await pool.query('SELECT id, nis_local, nisn FROM students WHERE id = ? LIMIT 1', [ref_id]);
    const student = studentRows[0];
    if (!student) return res.status(400).json({ message: 'Data siswa tidak ditemukan.' });
    const nis = String(student.nis_local || student.nisn || '').trim();
    username = nis;
    if (!req.body.password) password_hash = hashPassword(nis);
    ref_type = 'student';
  }

  await pool.query(
    `UPDATE app_users
     SET username = ?, password_hash = ?, role = ?, ref_type = ?, ref_id = ?, is_active = ?
     WHERE id = ?`,
    [username, password_hash, role, ref_type, ref_id, is_active, req.params.id]
  );
  const [rows] = await pool.query('SELECT id, username, role, ref_type, ref_id, is_active, created_at, updated_at FROM app_users WHERE id = ?', [req.params.id]);
  res.json(rows[0]);
}

async function remove(req, res) {
  await ensureUsersTable();
  const [rows] = await pool.query('SELECT id FROM app_users WHERE id = ?', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ message: 'User tidak ditemukan.' });
  await pool.query('DELETE FROM app_users WHERE id = ?', [req.params.id]);
  res.json({ message: 'Deleted' });
}

async function syncDefaults(req, res) {
  await syncAutoAccounts();
  const [students] = await pool.query('SELECT COUNT(*) AS c FROM students');
  const [teachers] = await pool.query('SELECT COUNT(*) AS c FROM teachers');

  await ensureUsersTable();
  res.json({ message: 'Default akun berhasil disinkronkan.', students: students[0].c, teachers: teachers[0].c });
}

async function upsertStudentAccount(student) {
  await ensureUsersTable();
  const username = String(student.nis_local || student.nisn || '').trim();
  if (!username) return;
  const [rows] = await pool.query('SELECT id, password_hash FROM app_users WHERE ref_type = ? AND ref_id = ? LIMIT 1', ['student', student.id]);
  if (rows[0]) {
    await pool.query(
      'UPDATE app_users SET username = ?, role = ?, is_active = ? WHERE id = ?',
      [username, 'siswa', student.is_active ? 1 : 0, rows[0].id]
    );
    return;
  }
  await pool.query(
    `INSERT INTO app_users (username, password_hash, role, ref_type, ref_id, is_active)
     VALUES (?, ?, 'siswa', 'student', ?, ?)`,
    [username, hashPassword(username), student.id, student.is_active ? 1 : 0]
  );
}

async function upsertTeacherAccount(teacher) {
  await ensureUsersTable();
  const username = String(teacher.niy || '').trim();
  if (!username) return;
  const [rows] = await pool.query('SELECT id FROM app_users WHERE ref_type = ? AND ref_id = ? LIMIT 1', ['teacher', teacher.id]);
  if (rows[0]) {
    await pool.query(
      'UPDATE app_users SET username = ?, role = ?, is_active = ? WHERE id = ?',
      [username, 'guru', teacher.is_active ? 1 : 0, rows[0].id]
    );
    return;
  }
  await pool.query(
    `INSERT INTO app_users (username, password_hash, role, ref_type, ref_id, is_active)
     VALUES (?, ?, 'guru', 'teacher', ?, ?)`,
    [username, hashPassword(username), teacher.id, teacher.is_active ? 1 : 0]
  );
}

module.exports = {
  ensureUsersTable,
  syncAutoAccounts,
  list,
  create,
  update,
  remove,
  syncDefaults,
  upsertStudentAccount,
  upsertTeacherAccount
};
