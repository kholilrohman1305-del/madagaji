const pool = require('../db/pool');
const { writeChange } = require('../services/change-log.service');

function validateSchoolYear(body) {
  const errors = [];
  if (!body.name || body.name.trim() === '') errors.push('name');
  return errors;
}

async function list(req, res) {
  const [rows] = await pool.query('SELECT * FROM school_years ORDER BY id DESC');
  res.json(rows);
}

async function getById(req, res) {
  const [rows] = await pool.query('SELECT * FROM school_years WHERE id = ?', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ message: 'School year not found' });
  res.json(rows[0]);
}

async function create(req, res) {
  const errors = validateSchoolYear(req.body);
  if (errors.length) return res.status(400).json({ message: 'Invalid payload', fields: errors });

  const { name, is_active = 1 } = req.body;
  const [result] = await pool.query(
    'INSERT INTO school_years (name, is_active) VALUES (?, ?)',
    [name, is_active ? 1 : 0]
  );

  const [rows] = await pool.query('SELECT * FROM school_years WHERE id = ?', [result.insertId]);
  await writeChange({ table: 'school_years', recordId: result.insertId, operation: 'insert', data: rows[0] });

  res.status(201).json(rows[0]);
}

async function update(req, res) {
  const { name, is_active } = req.body;
  const [existing] = await pool.query('SELECT * FROM school_years WHERE id = ?', [req.params.id]);
  if (!existing[0]) return res.status(404).json({ message: 'School year not found' });

  const updated = {
    name: name ?? existing[0].name,
    is_active: typeof is_active === 'undefined' ? existing[0].is_active : (is_active ? 1 : 0)
  };

  await pool.query(
    'UPDATE school_years SET name = ?, is_active = ? WHERE id = ?',
    [updated.name, updated.is_active, req.params.id]
  );

  const [rows] = await pool.query('SELECT * FROM school_years WHERE id = ?', [req.params.id]);
  await writeChange({ table: 'school_years', recordId: req.params.id, operation: 'update', data: rows[0] });

  res.json(rows[0]);
}

async function remove(req, res) {
  const [existing] = await pool.query('SELECT * FROM school_years WHERE id = ?', [req.params.id]);
  if (!existing[0]) return res.status(404).json({ message: 'School year not found' });

  await pool.query('DELETE FROM school_years WHERE id = ?', [req.params.id]);
  await writeChange({ table: 'school_years', recordId: req.params.id, operation: 'delete', data: existing[0] });

  res.json({ message: 'Deleted' });
}

async function activate(req, res) {
  const [existing] = await pool.query('SELECT * FROM school_years WHERE id = ?', [req.params.id]);
  if (!existing[0]) return res.status(404).json({ message: 'School year not found' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('UPDATE school_years SET is_active = 0');
    await conn.query('UPDATE school_years SET is_active = 1 WHERE id = ?', [req.params.id]);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    return res.status(400).json({ message: err.message });
  } finally {
    conn.release();
  }

  const [rows] = await pool.query('SELECT * FROM school_years WHERE id = ?', [req.params.id]);
  res.json(rows[0]);
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
  activate
};
