const pool = require('../../db');
const masterPool = pool.master;
const { TTLCache } = require('../../utils/cache');

const metaCacheTtl = Number(process.env.SCHEDULER_META_CACHE_TTL_MS || 30000);
const metaCache = new TTLCache(metaCacheTtl);

function cacheGet(key) { return metaCache.get(key); }
function cacheSet(key, value) { metaCache.set(key, value, metaCacheTtl); }
function invalidateMetaCache() { metaCache.clear(); }

async function getTeachers() {
  const cached = cacheGet('teachers');
  if (cached) return cached;
  const [rows] = await masterPool.query(
    'SELECT id, name, gender FROM teachers WHERE is_active=1 ORDER BY name'
  );
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
  const [rows] = await masterPool.query('SELECT id, name, kelas_type, is_active FROM classes WHERE is_active = 1 ORDER BY name');
  cacheSet('classes', rows);
  return rows;
}

// Returns [{ teacher_id, subject_id, tingkat, class_id, is_linear }]
// tingkat: '' = all grades, 'X'/'XI'/'XII' = grade-specific
// class_id: 0 = all classes, otherwise class-specific.
async function getTeacherSubjects() {
  const cached = cacheGet('teacherSubjects');
  if (cached) return cached;
  const [rows] = await pool.query(
    'SELECT teacher_id, subject_id, tingkat, class_id, is_linear FROM teacher_subjects ORDER BY teacher_id, is_linear DESC'
  );
  cacheSet('teacherSubjects', rows);
  return rows;
}

// subjects: [{ subjectId, tingkat, classId, isLinear }]
async function upsertTeacherSubjects(teacherId, subjects) {
  await pool.query('DELETE FROM teacher_subjects WHERE teacher_id=?', [teacherId]);
  if (Array.isArray(subjects) && subjects.length > 0) {
    const values = subjects.map(s => [
      teacherId,
      s.subjectId || s.subject_id || s,
      s.tingkat !== undefined ? s.tingkat : '',
      s.classId || s.class_id || 0,
      s.isLinear || s.is_linear ? 1 : 0
    ]);
    await pool.query(
      'INSERT INTO teacher_subjects (teacher_id, subject_id, tingkat, class_id, is_linear) VALUES ?',
      [values]
    );
  }
  invalidateMetaCache();
  return { success: true, message: 'Mapping guru-mapel diperbarui.' };
}

async function getClassSubjects() {
  const cached = cacheGet('classSubjects');
  if (cached) return cached;
  const [rows] = await pool.query('SELECT class_id, subject_id, hours_per_week FROM class_subjects ORDER BY class_id, subject_id');
  cacheSet('classSubjects', rows);
  return rows;
}

async function upsertClassSubjects(classId, subjects) {
  await pool.query('DELETE FROM class_subjects WHERE class_id=?', [classId]);
  if (Array.isArray(subjects) && subjects.length > 0) {
    const values = subjects.map(s => [classId, s.subjectId || s.subject_id || s, s.hoursPerWeek || s.hours_per_week || 2]);
    await pool.query('INSERT INTO class_subjects (class_id, subject_id, hours_per_week) VALUES ?', [values]);
  }
  invalidateMetaCache();
  return { success: true, message: 'Mapping kelas-mapel diperbarui.' };
}

async function upsertClassSubjectsMatrix(mappings) {
  await pool.query('DELETE FROM class_subjects');
  if (Array.isArray(mappings) && mappings.length > 0) {
    const values = mappings.map(m => [m.classId || m.class_id, m.subjectId || m.subject_id, m.hoursPerWeek || m.hours_per_week || 2]);
    await pool.query('INSERT INTO class_subjects (class_id, subject_id, hours_per_week) VALUES ?', [values]);
  }
  invalidateMetaCache();
  return { success: true, message: 'Matrix kelas-mapel diperbarui.' };
}

// Returns [{ teacher_id, max_hours_per_week, max_hours_per_day, min_hours_linier, available_days, class_gender_pref }]
async function getTeacherLimits() {
  const cached = cacheGet('teacherLimits');
  if (cached) return cached;
  const [rows] = await pool.query(
    'SELECT teacher_id, max_hours_per_week, max_hours_per_day, min_hours_linier, available_days, class_gender_pref, max_slot, available_slots FROM teacher_limits'
  );
  const parsed = rows.map(r => ({
    ...r,
    available_days: r.available_days
      ? (typeof r.available_days === 'string' ? JSON.parse(r.available_days) : r.available_days)
      : null,
    available_slots: r.available_slots
      ? (typeof r.available_slots === 'string' ? JSON.parse(r.available_slots) : r.available_slots)
      : null,
    class_gender_pref: r.class_gender_pref || 'both'
  }));
  cacheSet('teacherLimits', parsed);
  return parsed;
}

async function upsertTeacherLimit(teacherId, maxWeek, maxDay, minLinier, availableDays, classGenderPref, availableSlots) {
  await pool.query(
    `INSERT INTO teacher_limits (teacher_id, max_hours_per_week, max_hours_per_day, min_hours_linier, available_days, class_gender_pref, available_slots)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       max_hours_per_week=VALUES(max_hours_per_week),
       max_hours_per_day=VALUES(max_hours_per_day),
       min_hours_linier=VALUES(min_hours_linier),
       available_days=VALUES(available_days),
       class_gender_pref=VALUES(class_gender_pref),
       available_slots=VALUES(available_slots)`,
    [teacherId, maxWeek ?? null, maxDay ?? null, minLinier ?? null,
     availableDays != null ? JSON.stringify(availableDays) : null,
     classGenderPref || 'both',
     availableSlots != null ? JSON.stringify(availableSlots) : null]
  );
  invalidateMetaCache();
  return { success: true, message: 'Batas jam guru diperbarui.' };
}

async function updateTeacherClassGenderPref(teacherId, classGenderPref) {
  await pool.query(
    `INSERT INTO teacher_limits (teacher_id, class_gender_pref) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE class_gender_pref = VALUES(class_gender_pref)`,
    [teacherId, classGenderPref || 'both']
  );
  invalidateMetaCache();
  return { success: true };
}

async function upsertTeacherLimitsBulk(limits) {
  if (!Array.isArray(limits) || limits.length === 0) {
    return { success: true, message: 'Tidak ada data untuk diupdate.' };
  }
  const queries = limits.map(l =>
    pool.query(
      `INSERT INTO teacher_limits (teacher_id, max_hours_per_week, max_hours_per_day, min_hours_linier, available_days, available_slots, max_slot)
       VALUES (?, ?, ?, ?, ?, ?, NULL)
       ON DUPLICATE KEY UPDATE
         max_hours_per_week=VALUES(max_hours_per_week),
         max_hours_per_day=VALUES(max_hours_per_day),
         min_hours_linier=VALUES(min_hours_linier),
         available_days=VALUES(available_days),
         available_slots=VALUES(available_slots),
         max_slot=NULL`,
      [l.teacherId || l.teacher_id,
       l.maxWeek ?? null, l.maxDay ?? null, l.minLinier ?? null,
       l.availableDays != null ? JSON.stringify(l.availableDays) : null,
       l.availableSlots != null ? JSON.stringify(l.availableSlots) : null]
    )
  );
  await Promise.all(queries);
  invalidateMetaCache();
  return { success: true, message: `${limits.length} batas jam guru diperbarui.` };
}

// Jam & hari tersedia per mapel: [{ subject_id, available_slots, available_days }]
// null = tanpa pembatasan
async function getSubjectLimits() {
  const cached = cacheGet('subjectLimits');
  if (cached) return cached;
  try {
    const [rows] = await pool.query('SELECT subject_id, available_slots, available_days FROM subject_limits');
    const parseJson = (v) => v ? (typeof v === 'string' ? JSON.parse(v) : v) : null;
    const parsed = rows.map(r => ({
      subject_id: r.subject_id,
      available_slots: parseJson(r.available_slots),
      available_days: parseJson(r.available_days)
    }));
    cacheSet('subjectLimits', parsed);
    return parsed;
  } catch {
    return [];
  }
}

async function upsertSubjectLimitsBulk(limits) {
  if (!Array.isArray(limits) || limits.length === 0) {
    return { success: true, message: 'Tidak ada data untuk diupdate.' };
  }
  const queries = limits.map(l =>
    pool.query(
      `INSERT INTO subject_limits (subject_id, available_slots, available_days) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         available_slots=VALUES(available_slots),
         available_days=VALUES(available_days)`,
      [l.subjectId || l.subject_id,
       l.availableSlots != null ? JSON.stringify(l.availableSlots) : null,
       l.availableDays != null ? JSON.stringify(l.availableDays) : null]
    )
  );
  await Promise.all(queries);
  invalidateMetaCache();
  return { success: true, message: `Batasan ${limits.length} mapel diperbarui.` };
}

async function getScheduleConfig(name = 'default') {
  // ORDER BY id DESC: legacy rows may be duplicated (pre-unique-key era) — always take the latest save
  const [rows] = await pool.query('SELECT config_json FROM schedule_config WHERE name=? ORDER BY id DESC LIMIT 1', [name]);
  const raw = rows[0]?.config_json;
  if (!raw) return null;
  // MariaDB (hosting) stores JSON as LONGTEXT → driver returns a string;
  // without parsing, the frontend gets a string and cfg.days is undefined.
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return null; }
  }
  return raw;
}

async function upsertScheduleConfig(name, config) {
  await pool.query(
    `INSERT INTO schedule_config (name, config_json) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE config_json=VALUES(config_json)`,
    [name, JSON.stringify(config)]
  );
  return { success: true, message: 'Konfigurasi jadwal disimpan.' };
}

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

async function getSebaranMapel() {
  const [classRows] = await masterPool.query(`
    SELECT c.id, c.name,
           COALESCE(ht.name, c.homeroom_teacher) AS homeroom_teacher,
           c.student_count
    FROM classes c
    LEFT JOIN teachers ht ON ht.id = c.homeroom_teacher_id
    WHERE c.is_active = 1
    ORDER BY c.name
  `);

  const [subjects] = await masterPool.query(`SELECT id, name FROM subjects`);
  const subjectNameMap = new Map(subjects.map(s => [s.id, s.name]));

  const [csRows] = await pool.query(`
    SELECT class_id, subject_id, hours_per_week FROM class_subjects ORDER BY class_id
  `);
  const csRowsMapped = csRows.map(cs => ({
    ...cs,
    subject_name: subjectNameMap.get(cs.subject_id) || String(cs.subject_id)
  }));

  const [jadwalRaw] = await pool.query(`
    SELECT kelas, mapel_id, guru_id FROM jadwal
  `);
  const [teachers] = await masterPool.query(`SELECT id, name FROM teachers`);
  const teacherNameMap = new Map(teachers.map(t => [String(t.id), t.name]));

  const jadwalMap = new Map();
  for (const j of jadwalRaw) {
    const key = `${j.kelas}-${j.mapel_id}`;
    if (!jadwalMap.has(key)) jadwalMap.set(key, new Set());
    if (j.guru_id) jadwalMap.get(key).add(teacherNameMap.get(String(j.guru_id)) || String(j.guru_id));
  }
  const jadwalRows = [...jadwalMap.entries()].map(([key, names]) => {
    const [kelas, mapel_id] = key.split('-');
    return { kelas: Number(kelas), mapel_id: Number(mapel_id), teachers: [...names].sort().join(', ') };
  });

  const jadwalFinalMap = new Map(jadwalRows.map(r => [`${r.kelas}-${r.mapel_id}`, r.teachers]));

  return classRows.map(c => {
    const subjects = csRowsMapped
      .filter(cs => cs.class_id === c.id)
      .map(cs => ({
        subjectId: cs.subject_id,
        subjectName: cs.subject_name,
        hoursPerWeek: cs.hours_per_week,
        teachers: jadwalFinalMap.get(`${c.id}-${cs.subject_id}`) || null
      }));
    return {
      classId: c.id,
      className: c.name,
      homeroomTeacher: c.homeroom_teacher || '-',
      studentCount: c.student_count || 0,
      subjectCount: subjects.length,
      subjects
    };
  });
}

async function getDetailGuru() {
  const [jadwalRaw] = await pool.query(
    `SELECT guru_id, mapel_id, kelas, hari, jam_ke FROM jadwal WHERE guru_id IS NOT NULL ORDER BY guru_id, mapel_id, hari, jam_ke`
  );
  const [teachers] = await masterPool.query(`SELECT id, name FROM teachers WHERE is_active = 1`);
  const [subjects] = await masterPool.query(`SELECT id, name FROM subjects`);
  const [classes]  = await masterPool.query(`SELECT id, name FROM classes`);
  const teacherMap = new Map(teachers.map(t => [String(t.id), t.name]));
  const subjectMap = new Map(subjects.map(s => [String(s.id), s.name]));
  const classMap   = new Map(classes.map(c => [String(c.id), c.name]));

  if (jadwalRaw.length > 0) {
    const guruMap = new Map();
    for (const j of jadwalRaw) {
      const gKey = String(j.guru_id);
      const teacherName = teacherMap.get(gKey);
      if (!teacherName) continue;
      if (!guruMap.has(gKey)) {
        guruMap.set(gKey, { teacherId: j.guru_id, teacherName, subjects: new Map() });
      }
      const teacher = guruMap.get(gKey);
      const mKey = String(j.mapel_id);
      if (!teacher.subjects.has(mKey)) {
        teacher.subjects.set(mKey, {
          subjectId: j.mapel_id,
          subjectName: subjectMap.get(mKey) || String(j.mapel_id),
          slots: [],
          classes: []
        });
      }
      const subject = teacher.subjects.get(mKey);
      const className = classMap.get(String(j.kelas)) || String(j.kelas);
      subject.slots.push({ kelas: className, hari: j.hari, jamKe: Number(j.jam_ke) });
      if (!subject.classes.includes(className)) subject.classes.push(className);
    }
    return {
      fromJadwal: true,
      data: Array.from(guruMap.values())
        .sort((a, b) => a.teacherName.localeCompare(b.teacherName))
        .map(t => ({
          teacherId: t.teacherId,
          teacherName: t.teacherName,
          subjects: Array.from(t.subjects.values())
            .sort((a, b) => a.subjectName.localeCompare(b.subjectName))
        }))
    };
  }

  // Fallback: teacher_subjects mapping (no actual schedule yet)
  const [tsRows] = await pool.query(
    `SELECT teacher_id, subject_id, tingkat, class_id FROM teacher_subjects`
  );
  const [fbTeachers] = await masterPool.query(`SELECT id, name FROM teachers WHERE is_active = 1`);
  const [fbSubjects] = await masterPool.query(`SELECT id, name FROM subjects`);
  const [fbClasses]  = await masterPool.query(`SELECT id, name FROM classes`);
  const fbTeacherMap = new Map(fbTeachers.map(t => [t.id, t.name]));
  const fbSubjectMap = new Map(fbSubjects.map(s => [s.id, s.name]));
  const fbClassMap   = new Map(fbClasses.map(c => [c.id, c.name]));

  const fallbackTeacherMap = new Map();
  for (const r of tsRows) {
    if (!fbTeacherMap.has(r.teacher_id)) continue;
    if (!fallbackTeacherMap.has(r.teacher_id)) {
      fallbackTeacherMap.set(r.teacher_id, { teacherId: r.teacher_id, teacherName: fbTeacherMap.get(r.teacher_id), subjects: [] });
    }
    fallbackTeacherMap.get(r.teacher_id).subjects.push({
      subjectId: r.subject_id, subjectName: fbSubjectMap.get(r.subject_id) || String(r.subject_id),
      classes: r.class_id ? [fbClassMap.get(r.class_id) || String(r.class_id)] : [],
      tingkat: r.tingkat || ''
    });
  }
  return { fromJadwal: false, data: Array.from(fallbackTeacherMap.values()) };
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
  updateTeacherClassGenderPref,
  upsertTeacherLimitsBulk,
  getSubjectLimits,
  upsertSubjectLimitsBulk,
  getScheduleConfig,
  upsertScheduleConfig,
  getClassSubjectRules,
  invalidateMetaCache,
  getSebaranMapel,
  getDetailGuru
};
