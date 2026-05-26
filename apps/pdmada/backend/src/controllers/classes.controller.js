const pool = require('../db/pool');
const { writeChange } = require('../services/change-log.service');

function validateClass(body) {
  const errors = [];
  if (!body.name || body.name.trim() === '') errors.push('name');
  return errors;
}

async function resolveHomeroomTeacherRef(teacherId, teacherName) {
  const numericId = teacherId === null || typeof teacherId === 'undefined' || teacherId === '' ? null : Number(teacherId);
  if (numericId) {
    const [rows] = await pool.query('SELECT id, name FROM teachers WHERE id = ? LIMIT 1', [numericId]);
    if (rows[0]) return { homeroom_teacher_id: rows[0].id, homeroom_teacher: rows[0].name };
  }

  const rawName = String(teacherName || '').trim();
  if (!rawName) return { homeroom_teacher_id: null, homeroom_teacher: null };

  const [rows] = await pool.query('SELECT id, name FROM teachers WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1', [rawName]);
  if (rows[0]) return { homeroom_teacher_id: rows[0].id, homeroom_teacher: rows[0].name };
  return { homeroom_teacher_id: null, homeroom_teacher: rawName };
}

async function selectClassById(id) {
  const [rows] = await pool.query(
    `SELECT c.id, c.name, c.grade_level, c.homeroom_teacher_id,
            COALESCE(t.name, c.homeroom_teacher) AS homeroom_teacher,
            c.room_name, c.curriculum, c.student_count, c.max_students, c.jtm_rombel,
            c.is_active, c.created_at, c.updated_at
     FROM classes c
     LEFT JOIN teachers t ON t.id = c.homeroom_teacher_id
     WHERE c.id = ?`,
    [id]
  );
  return rows[0] || null;
}

async function list(req, res) {
  const [rows] = await pool.query(
    `SELECT c.id, c.name, c.grade_level, c.homeroom_teacher_id,
            COALESCE(t.name, c.homeroom_teacher) AS homeroom_teacher,
            c.room_name, c.curriculum, c.student_count, c.max_students, c.jtm_rombel,
            c.is_active, c.created_at, c.updated_at
     FROM classes c
     LEFT JOIN teachers t ON t.id = c.homeroom_teacher_id
     ORDER BY c.name ASC`
  );
  res.json(rows);
}

async function getById(req, res) {
  const row = await selectClassById(req.params.id);
  if (!row) return res.status(404).json({ message: 'Class not found' });
  res.json(row);
}

async function create(req, res) {
  const errors = validateClass(req.body);
  if (errors.length) return res.status(400).json({ message: 'Invalid payload', fields: errors });

  const { name, grade_level, homeroom_teacher, homeroom_teacher_id, room_name, curriculum, student_count, max_students, jtm_rombel, is_active = 1 } = req.body;
  const resolvedHomeroom = await resolveHomeroomTeacherRef(homeroom_teacher_id, homeroom_teacher);
  const [result] = await pool.query(
    'INSERT INTO classes (name, grade_level, homeroom_teacher, homeroom_teacher_id, room_name, curriculum, student_count, max_students, jtm_rombel, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      name,
      grade_level || null,
      resolvedHomeroom.homeroom_teacher,
      resolvedHomeroom.homeroom_teacher_id,
      room_name || null,
      curriculum || null,
      student_count || null,
      max_students || null,
      jtm_rombel || null,
      is_active ? 1 : 0
    ]
  );

  const row = await selectClassById(result.insertId);
  await writeChange({ table: 'classes', recordId: result.insertId, operation: 'insert', data: row });

  res.status(201).json(row);
}

async function update(req, res) {
  const { name, grade_level, homeroom_teacher, homeroom_teacher_id, room_name, curriculum, student_count, max_students, jtm_rombel, is_active } = req.body;
  const [existing] = await pool.query('SELECT * FROM classes WHERE id = ?', [req.params.id]);
  if (!existing[0]) return res.status(404).json({ message: 'Class not found' });
  const resolvedHomeroom = typeof homeroom_teacher_id === 'undefined' && typeof homeroom_teacher === 'undefined'
    ? { homeroom_teacher_id: existing[0].homeroom_teacher_id, homeroom_teacher: existing[0].homeroom_teacher }
    : await resolveHomeroomTeacherRef(homeroom_teacher_id, homeroom_teacher);

  const updated = {
    name: name ?? existing[0].name,
    grade_level: grade_level ?? existing[0].grade_level,
    homeroom_teacher: resolvedHomeroom.homeroom_teacher,
    homeroom_teacher_id: resolvedHomeroom.homeroom_teacher_id,
    room_name: room_name ?? existing[0].room_name,
    curriculum: curriculum ?? existing[0].curriculum,
    student_count: typeof student_count === 'undefined' ? existing[0].student_count : student_count,
    max_students: typeof max_students === 'undefined' ? existing[0].max_students : max_students,
    jtm_rombel: typeof jtm_rombel === 'undefined' ? existing[0].jtm_rombel : jtm_rombel,
    is_active: typeof is_active === 'undefined' ? existing[0].is_active : (is_active ? 1 : 0)
  };

  await pool.query(
    'UPDATE classes SET name = ?, grade_level = ?, homeroom_teacher = ?, homeroom_teacher_id = ?, room_name = ?, curriculum = ?, student_count = ?, max_students = ?, jtm_rombel = ?, is_active = ? WHERE id = ?',
    [
      updated.name,
      updated.grade_level,
      updated.homeroom_teacher,
      updated.homeroom_teacher_id,
      updated.room_name,
      updated.curriculum,
      updated.student_count,
      updated.max_students,
      updated.jtm_rombel,
      updated.is_active,
      req.params.id
    ]
  );

  const row = await selectClassById(req.params.id);
  await writeChange({ table: 'classes', recordId: req.params.id, operation: 'update', data: row });

  res.json(row);
}

async function remove(req, res) {
  const [existing] = await pool.query('SELECT * FROM classes WHERE id = ?', [req.params.id]);
  if (!existing[0]) return res.status(404).json({ message: 'Class not found' });

  await pool.query('DELETE FROM classes WHERE id = ?', [req.params.id]);
  await writeChange({ table: 'classes', recordId: req.params.id, operation: 'delete', data: existing[0] });

  res.json({ message: 'Deleted' });
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove
};
