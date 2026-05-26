const pool = require('../db/pool');
const { writeChange } = require('../services/change-log.service');

async function list(req, res) {
  const [rows] = await pool.query('SELECT * FROM extracurriculars ORDER BY name ASC');
  res.json(rows);
}

async function create(req, res) {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ message: 'Nama ekstrakurikuler wajib diisi.' });
  const description = req.body.description ? String(req.body.description) : null;
  const isActive = Number(req.body.is_active) === 0 ? 0 : 1;

  const [result] = await pool.query(
    'INSERT INTO extracurriculars (name, description, is_active) VALUES (?, ?, ?)',
    [name, description, isActive]
  );
  const [rows] = await pool.query('SELECT * FROM extracurriculars WHERE id = ?', [result.insertId]);
  await writeChange({ table: 'extracurriculars', recordId: result.insertId, operation: 'insert', data: rows[0] });
  res.status(201).json(rows[0]);
}

async function update(req, res) {
  const [existingRows] = await pool.query('SELECT * FROM extracurriculars WHERE id = ?', [req.params.id]);
  const existing = existingRows[0];
  if (!existing) return res.status(404).json({ message: 'Data ekstrakurikuler tidak ditemukan.' });

  const name = typeof req.body.name === 'undefined' ? existing.name : String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ message: 'Nama ekstrakurikuler wajib diisi.' });
  const description = typeof req.body.description === 'undefined' ? existing.description : (req.body.description ? String(req.body.description) : null);
  const isActive = typeof req.body.is_active === 'undefined' ? existing.is_active : (Number(req.body.is_active) === 0 ? 0 : 1);

  await pool.query(
    'UPDATE extracurriculars SET name = ?, description = ?, is_active = ?, updated_at = NOW() WHERE id = ?',
    [name, description, isActive, req.params.id]
  );
  const [rows] = await pool.query('SELECT * FROM extracurriculars WHERE id = ?', [req.params.id]);
  await writeChange({ table: 'extracurriculars', recordId: req.params.id, operation: 'update', data: rows[0] });
  res.json(rows[0]);
}

async function remove(req, res) {
  const [rows] = await pool.query('SELECT * FROM extracurriculars WHERE id = ?', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ message: 'Data ekstrakurikuler tidak ditemukan.' });
  await pool.query('DELETE FROM extracurriculars WHERE id = ?', [req.params.id]);
  await writeChange({ table: 'extracurriculars', recordId: req.params.id, operation: 'delete', data: rows[0] });
  res.json({ message: 'Deleted' });
}

module.exports = {
  list,
  create,
  update,
  remove
};
