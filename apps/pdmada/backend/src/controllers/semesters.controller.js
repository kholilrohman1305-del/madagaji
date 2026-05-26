const pool = require('../db/pool');
const { writeChange } = require('../services/change-log.service');

async function list(req, res) {
  const [rows] = await pool.query('SELECT * FROM semesters ORDER BY id ASC');
  res.json(rows);
}

async function create(req, res) {
  const { name, is_active = 0 } = req.body;
  if (!name || name.trim() === '') return res.status(400).json({ message: 'Invalid payload', fields: ['name'] });

  const [result] = await pool.query(
    'INSERT INTO semesters (name, is_active) VALUES (?, ?)',
    [name, is_active ? 1 : 0]
  );
  const [rows] = await pool.query('SELECT * FROM semesters WHERE id = ?', [result.insertId]);
  await writeChange({ table: 'semesters', recordId: result.insertId, operation: 'insert', data: rows[0] });
  res.status(201).json(rows[0]);
}

async function activate(req, res) {
  const [existing] = await pool.query('SELECT * FROM semesters WHERE id = ?', [req.params.id]);
  if (!existing[0]) return res.status(404).json({ message: 'Semester not found' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('UPDATE semesters SET is_active = 0');
    await conn.query('UPDATE semesters SET is_active = 1 WHERE id = ?', [req.params.id]);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    return res.status(400).json({ message: err.message });
  } finally {
    conn.release();
  }

  const [rows] = await pool.query('SELECT * FROM semesters WHERE id = ?', [req.params.id]);
  res.json(rows[0]);
}

module.exports = {
  list,
  create,
  activate
};
