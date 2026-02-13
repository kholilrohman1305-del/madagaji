const pool = require('../../db');
const masterPool = pool.master;
const { TTLCache } = require('../../utils/cache');

const metaCacheTtl = Number(process.env.SCHEDULER_META_CACHE_TTL_MS || 30000);
const metaCache = new TTLCache(metaCacheTtl);

function cacheGet(key) {
  return metaCache.get(key);
}

function cacheSet(key, value) {
  metaCache.set(key, value, metaCacheTtl);
}

function invalidateMetaCache() {
  metaCache.clear();
}

async function getTeachers() {
  const cached = cacheGet('teachers');
  if (cached) return cached;
  const [rows] = await masterPool.query('SELECT id, name FROM teachers WHERE is_active=1 ORDER BY name');
  cacheSet('teachers', rows);
  return rows;
}

async function getSubjects() {
  const cached = cacheGet('subjects');
  if (cached) return cached;
  const [rows] = await masterPool.query('SELECT id, code, name FROM subjects WHERE is_active=1 ORDER BY name');
  cacheSet('subjects', rows);
  return rows;
}

async function getClasses() {
  const cached = cacheGet('classes');
  if (cached) return cached;
  const [rows] = await masterPool.query('SELECT id, name FROM classes ORDER BY name');
  cacheSet('classes', rows);
  return rows;
}

// Teacher-Subject mapping with priority (1 = main/linier, 2+ = secondary)
async function getTeacherSubjects() {
  const cached = cacheGet('teacherSubjects');
  if (cached) return cached;
  const [rows] = await pool.query('SELECT teacher_id, subject_id, priority FROM teacher_subjects ORDER BY teacher_id, priority');
  cacheSet('teacherSubjects', rows);
  return rows;
}

// Update teacher subjects with priority
// subjects: array of { subjectId, priority }
async function upsertTeacherSubjects(teacherId, subjects) {
  await pool.query('DELETE FROM teacher_subjects WHERE teacher_id=?', [teacherId]);
  if (Array.isArray(subjects) && subjects.length > 0) {
    const values = subjects.map(s => [teacherId, s.subjectId || s.subject_id || s, s.priority || 1]);
    await pool.query('INSERT INTO teacher_subjects (teacher_id, subject_id, priority) VALUES ?', [values]);
  }
  invalidateMetaCache();
  return { success: true, message: 'Mapping guru-mapel diperbarui.' };
}

// Class-Subject mapping (which subjects are taught in which class)
async function getClassSubjects() {
  const cached = cacheGet('classSubjects');
  if (cached) return cached;
  const [rows] = await pool.query('SELECT class_id, subject_id, hours_per_week FROM class_subjects ORDER BY class_id, subject_id');
  cacheSet('classSubjects', rows);
  return rows;
}

// Upsert class subjects (set which subjects are in a class)
// subjects: array of { subjectId, hoursPerWeek }
async function upsertClassSubjects(classId, subjects) {
  await pool.query('DELETE FROM class_subjects WHERE class_id=?', [classId]);
  if (Array.isArray(subjects) && subjects.length > 0) {
    const values = subjects.map(s => [classId, s.subjectId || s.subject_id || s, s.hoursPerWeek || s.hours_per_week || 2]);
    await pool.query('INSERT INTO class_subjects (class_id, subject_id, hours_per_week) VALUES ?', [values]);
  }
  invalidateMetaCache();
  return { success: true, message: 'Mapping kelas-mapel diperbarui.' };
}

// Bulk upsert for matrix (all classes at once)
async function upsertClassSubjectsMatrix(mappings) {
  // mappings: array of { classId, subjectId, hoursPerWeek }
  await pool.query('DELETE FROM class_subjects');
  if (Array.isArray(mappings) && mappings.length > 0) {
    const values = mappings.map(m => [m.classId || m.class_id, m.subjectId || m.subject_id, m.hoursPerWeek || m.hours_per_week || 2]);
    await pool.query('INSERT INTO class_subjects (class_id, subject_id, hours_per_week) VALUES ?', [values]);
  }
  invalidateMetaCache();
  return { success: true, message: 'Matrix kelas-mapel diperbarui.' };
}

// Teacher limits with min linear hours
async function getTeacherLimits() {
  const cached = cacheGet('teacherLimits');
  if (cached) return cached;
  const [rows] = await pool.query('SELECT teacher_id, max_hours_per_week, max_hours_per_day, min_hours_linier FROM teacher_limits');
  cacheSet('teacherLimits', rows);
  return rows;
}

async function upsertTeacherLimit(teacherId, maxWeek, maxDay, minLinier) {
  await pool.query(
    `INSERT INTO teacher_limits (teacher_id, max_hours_per_week, max_hours_per_day, min_hours_linier)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       max_hours_per_week=VALUES(max_hours_per_week),
       max_hours_per_day=VALUES(max_hours_per_day),
       min_hours_linier=VALUES(min_hours_linier)`,
    [teacherId, maxWeek ?? null, maxDay ?? null, minLinier ?? null]
  );
  invalidateMetaCache();
  return { success: true, message: 'Batas jam guru diperbarui.' };
}

// Bulk update teacher limits
async function upsertTeacherLimitsBulk(limits) {
  // limits: array of { teacherId, maxWeek, maxDay, minLinier }
  if (!Array.isArray(limits) || limits.length === 0) {
    return { success: true, message: 'Tidak ada data untuk diupdate.' };
  }

  const queries = limits.map(l =>
    pool.query(
      `INSERT INTO teacher_limits (teacher_id, max_hours_per_week, max_hours_per_day, min_hours_linier)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         max_hours_per_week=VALUES(max_hours_per_week),
         max_hours_per_day=VALUES(max_hours_per_day),
         min_hours_linier=VALUES(min_hours_linier)`,
      [l.teacherId || l.teacher_id, l.maxWeek ?? null, l.maxDay ?? null, l.minLinier ?? null]
    )
  );

  await Promise.all(queries);
  invalidateMetaCache();
  return { success: true, message: `${limits.length} batas jam guru diperbarui.` };
}

async function getScheduleConfig(name = 'default') {
  const [rows] = await pool.query('SELECT config_json FROM schedule_config WHERE name=? LIMIT 1', [name]);
  return rows[0]?.config_json || null;
}

async function upsertScheduleConfig(name, config) {
  await pool.query(
    `INSERT INTO schedule_config (name, config_json) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE config_json=VALUES(config_json)`,
    [name, JSON.stringify(config)]
  );
  return { success: true, message: 'Konfigurasi jadwal disimpan.' };
}

// Legacy: keep for backward compatibility
async function getClassSubjectRules() {
  const cached = cacheGet('classRules');
  if (cached) return cached;
  try {
    const [rows] = await pool.query('SELECT class_id, subject_id, allowed FROM class_subject_rules');
    cacheSet('classRules', rows);
    return rows;
  } catch {
    return [];
  }
}

module.exports = {
  getTeachers,
  getSubjects,
  getClasses,
  getTeacherSubjects,
  upsertTeacherSubjects,
  getClassSubjects,
  upsertClassSubjects,
  upsertClassSubjectsMatrix,
  getTeacherLimits,
  upsertTeacherLimit,
  upsertTeacherLimitsBulk,
  getScheduleConfig,
  upsertScheduleConfig,
  // Legacy
  getClassSubjectRules
};
