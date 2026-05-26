const pool = require('../db/pool');
const { writeChange } = require('../services/change-log.service');

async function list(req, res) {
  const [rows] = await pool.query('SELECT * FROM additional_tasks ORDER BY id ASC');
  res.json(rows);
}

async function create(req, res) {
  const { name, is_active = 1 } = req.body;
  if (!name || name.trim() === '') return res.status(400).json({ message: 'Nama wajib diisi' });
  const [result] = await pool.query(
    'INSERT INTO additional_tasks (name, is_active) VALUES (?, ?)',
    [name.trim(), is_active ? 1 : 0]
  );
  const [rows] = await pool.query('SELECT * FROM additional_tasks WHERE id = ?', [result.insertId]);
  await writeChange({ table: 'additional_tasks', recordId: result.insertId, operation: 'insert', data: rows[0] });
  res.status(201).json(rows[0]);
}

async function update(req, res) {
  const [existing] = await pool.query('SELECT * FROM additional_tasks WHERE id = ?', [req.params.id]);
  if (!existing[0]) return res.status(404).json({ message: 'Task not found' });
  const { name, is_active } = req.body;
  const previousName = existing[0].name;
  const updated = {
    name: name ?? existing[0].name,
    is_active: typeof is_active === 'undefined' ? existing[0].is_active : (is_active ? 1 : 0)
  };
  await pool.query(
    'UPDATE additional_tasks SET name = ?, is_active = ? WHERE id = ?',
    [updated.name, updated.is_active, req.params.id]
  );
  if (String(previousName || '').trim() && String(previousName || '').trim() !== String(updated.name || '').trim()) {
    await pool.query(
      'UPDATE teachers SET additional_task = ? WHERE LOWER(TRIM(additional_task)) = LOWER(TRIM(?))',
      [updated.name, previousName]
    );
    await pool.query(
      'UPDATE teacher_tasks SET title = ? WHERE LOWER(TRIM(title)) = LOWER(TRIM(?))',
      [updated.name, previousName]
    );
  }
  const [rows] = await pool.query('SELECT * FROM additional_tasks WHERE id = ?', [req.params.id]);
  await writeChange({ table: 'additional_tasks', recordId: req.params.id, operation: 'update', data: rows[0] });
  res.json(rows[0]);
}

async function remove(req, res) {
  const [existing] = await pool.query('SELECT * FROM additional_tasks WHERE id = ?', [req.params.id]);
  if (!existing[0]) return res.status(404).json({ message: 'Task not found' });
  await pool.query(
    'UPDATE teachers SET additional_task = NULL WHERE LOWER(TRIM(additional_task)) = LOWER(TRIM(?))',
    [existing[0].name]
  );
  await pool.query('DELETE FROM additional_tasks WHERE id = ?', [req.params.id]);
  await writeChange({ table: 'additional_tasks', recordId: req.params.id, operation: 'delete', data: existing[0] });
  res.json({ message: 'Deleted' });
}

module.exports = {
  list,
  create,
  update,
  remove
};
