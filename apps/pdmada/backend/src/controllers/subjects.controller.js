const pool = require('../db/pool');
const { writeChange } = require('../services/change-log.service');

function validateSubject(body) {
  const errors = [];
  if (!body.name || body.name.trim() === '') errors.push('name');
  return errors;
}

function normalizeCode(name) {
  return String(name || '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 20);
}

async function generateUniqueCode(name) {
  const base = normalizeCode(name) || 'MAPEL';
  let code = base;
  let counter = 1;
  // Ensure uniqueness
  while (true) {
    const [rows] = await pool.query('SELECT id FROM subjects WHERE code = ? LIMIT 1', [code]);
    if (!rows[0]) return code;
    counter += 1;
    code = `${base}_${counter}`.slice(0, 20);
  }
}

async function list(req, res) {
  const [rows] = await pool.query('SELECT * FROM subjects ORDER BY COALESCE(display_order, 0) ASC, name ASC');
  res.json(rows);
}

async function getById(req, res) {
  const [rows] = await pool.query('SELECT * FROM subjects WHERE id = ?', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ message: 'Subject not found' });
  res.json(rows[0]);
}

async function create(req, res) {
  const errors = validateSubject(req.body);
  if (errors.length) return res.status(400).json({ message: 'Invalid payload', fields: errors });

  const { code, name, group_name, grade_level, kkm = null, display_order = 0, is_active = 1 } = req.body;
  const finalCode = code && code.trim() !== '' ? code : await generateUniqueCode(name);
  const [result] = await pool.query(
    'INSERT INTO subjects (code, name, group_name, grade_level, kkm, display_order, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [finalCode, name, group_name || null, grade_level || null, kkm || null, Number(display_order || 0), is_active ? 1 : 0]
  );

  const [rows] = await pool.query('SELECT * FROM subjects WHERE id = ?', [result.insertId]);
  await writeChange({ table: 'subjects', recordId: result.insertId, operation: 'insert', data: rows[0] });

  res.status(201).json(rows[0]);
}

async function update(req, res) {
  const { code, name, group_name, grade_level, kkm, display_order, is_active } = req.body;
  const [existing] = await pool.query('SELECT * FROM subjects WHERE id = ?', [req.params.id]);
  if (!existing[0]) return res.status(404).json({ message: 'Subject not found' });
  const previousName = existing[0].name;

  const updated = {
    code: code ?? existing[0].code,
    name: name ?? existing[0].name,
    group_name: group_name ?? existing[0].group_name,
    grade_level: grade_level ?? existing[0].grade_level,
    kkm: typeof kkm === 'undefined' || kkm === '' ? existing[0].kkm : Number(kkm),
    display_order: typeof display_order === 'undefined' || display_order === '' ? existing[0].display_order : Number(display_order),
    is_active: typeof is_active === 'undefined' ? existing[0].is_active : (is_active ? 1 : 0)
  };

  await pool.query(
    'UPDATE subjects SET code = ?, name = ?, group_name = ?, grade_level = ?, kkm = ?, display_order = ?, is_active = ? WHERE id = ?',
    [updated.code, updated.name, updated.group_name, updated.grade_level, updated.kkm, updated.display_order, updated.is_active, req.params.id]
  );

  if (String(previousName || '').trim() && String(previousName || '').trim() !== String(updated.name || '').trim()) {
    await pool.query(
      'UPDATE teachers SET subject_id = ?, subject = ? WHERE subject_id = ? OR LOWER(TRIM(subject)) = LOWER(TRIM(?))',
      [req.params.id, updated.name, req.params.id, previousName]
    );
  }

  const [rows] = await pool.query('SELECT * FROM subjects WHERE id = ?', [req.params.id]);
  await writeChange({ table: 'subjects', recordId: req.params.id, operation: 'update', data: rows[0] });

  res.json(rows[0]);
}

async function remove(req, res) {
  const [existing] = await pool.query('SELECT * FROM subjects WHERE id = ?', [req.params.id]);
  if (!existing[0]) return res.status(404).json({ message: 'Subject not found' });

  await pool.query(
    'UPDATE teachers SET subject_id = NULL, subject = NULL WHERE subject_id = ? OR LOWER(TRIM(subject)) = LOWER(TRIM(?))',
    [req.params.id, existing[0].name]
  );
  await pool.query('DELETE FROM subjects WHERE id = ?', [req.params.id]);
  await writeChange({ table: 'subjects', recordId: req.params.id, operation: 'delete', data: existing[0] });

  res.json({ message: 'Deleted' });
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove
};
