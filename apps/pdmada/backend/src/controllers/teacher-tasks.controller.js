const pool = require('../db/pool');
const { writeChange } = require('../services/change-log.service');

function validateTask(body) {
  const errors = [];
  if (!body.teacher_id) errors.push('teacher_id');
  if (!body.title || body.title.trim() === '') errors.push('title');
  return errors;
}

async function list(req, res) {
  const [rows] = await pool.query(
    'SELECT tt.*, t.name AS teacher_name FROM teacher_tasks tt JOIN teachers t ON t.id = tt.teacher_id ORDER BY tt.id DESC'
  );
  res.json(rows);
}

async function getById(req, res) {
  const [rows] = await pool.query(
    'SELECT tt.*, t.name AS teacher_name FROM teacher_tasks tt JOIN teachers t ON t.id = tt.teacher_id WHERE tt.id = ?',
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ message: 'Task not found' });
  res.json(rows[0]);
}

async function create(req, res) {
  const errors = validateTask(req.body);
  if (errors.length) return res.status(400).json({ message: 'Invalid payload', fields: errors });

  const { teacher_id, title, description, start_date, end_date, status = 'aktif' } = req.body;
  const [result] = await pool.query(
    'INSERT INTO teacher_tasks (teacher_id, title, description, start_date, end_date, status) VALUES (?, ?, ?, ?, ?, ?)',
    [teacher_id, title, description || null, start_date || null, end_date || null, status || 'aktif']
  );
  const [rows] = await pool.query(
    'SELECT tt.*, t.name AS teacher_name FROM teacher_tasks tt JOIN teachers t ON t.id = tt.teacher_id WHERE tt.id = ?',
    [result.insertId]
  );
  await writeChange({ table: 'teacher_tasks', recordId: result.insertId, operation: 'insert', data: rows[0] });
  res.status(201).json(rows[0]);
}

async function update(req, res) {
  const [existing] = await pool.query('SELECT * FROM teacher_tasks WHERE id = ?', [req.params.id]);
  if (!existing[0]) return res.status(404).json({ message: 'Task not found' });

  const { teacher_id, title, description, start_date, end_date, status } = req.body;
  const updated = {
    teacher_id: teacher_id ?? existing[0].teacher_id,
    title: title ?? existing[0].title,
    description: description ?? existing[0].description,
    start_date: start_date ?? existing[0].start_date,
    end_date: end_date ?? existing[0].end_date,
    status: status ?? existing[0].status
  };

  await pool.query(
    'UPDATE teacher_tasks SET teacher_id = ?, title = ?, description = ?, start_date = ?, end_date = ?, status = ? WHERE id = ?',
    [updated.teacher_id, updated.title, updated.description, updated.start_date, updated.end_date, updated.status, req.params.id]
  );
  const [rows] = await pool.query(
    'SELECT tt.*, t.name AS teacher_name FROM teacher_tasks tt JOIN teachers t ON t.id = tt.teacher_id WHERE tt.id = ?',
    [req.params.id]
  );
  await writeChange({ table: 'teacher_tasks', recordId: req.params.id, operation: 'update', data: rows[0] });
  res.json(rows[0]);
}

async function remove(req, res) {
  const [existing] = await pool.query(
    'SELECT tt.*, t.name AS teacher_name FROM teacher_tasks tt JOIN teachers t ON t.id = tt.teacher_id WHERE tt.id = ?',
    [req.params.id]
  );
  if (!existing[0]) return res.status(404).json({ message: 'Task not found' });
  await pool.query('DELETE FROM teacher_tasks WHERE id = ?', [req.params.id]);
  await writeChange({ table: 'teacher_tasks', recordId: req.params.id, operation: 'delete', data: existing[0] });
  res.json({ message: 'Deleted' });
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove
};
