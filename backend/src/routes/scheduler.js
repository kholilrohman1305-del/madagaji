const express = require('express');
const config = require('../services/scheduler/configService');
const scheduler = require('../services/schedulerService');
const pool = require('../db');
const multer = require('multer');
const { generateTemplate, parseImportExcel } = require('../services/scheduler/excelImportService');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const masterPool = pool.master;

const router = express.Router();

// One-time migration: fix locked_slots UNIQUE KEY to include class_id
// so the same teacher can have the same jam for multiple classes (multi-class plot)
;(async () => {
  try {
    const [idxRows] = await pool.query(`
      SELECT INDEX_NAME FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'locked_slots'
        AND NON_UNIQUE = 0 AND INDEX_NAME != 'PRIMARY'
    `);
    // Drop any unique index that does NOT include class_id in its columns
    for (const row of idxRows) {
      const [cols] = await pool.query(`
        SELECT COLUMN_NAME FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'locked_slots'
          AND INDEX_NAME = ? ORDER BY SEQ_IN_INDEX
      `, [row.INDEX_NAME]);
      const colNames = cols.map(c => c.COLUMN_NAME);
      if (!colNames.includes('class_id')) {
        await pool.query(`ALTER TABLE locked_slots DROP INDEX \`${row.INDEX_NAME}\``).catch(() => {});
      }
    }
    // Add correct unique key (ignore if already exists)
    await pool.query(
      `ALTER TABLE locked_slots ADD UNIQUE INDEX uq_teacher_class_hari_jam (teacher_id, class_id, hari, jam_ke)`
    ).catch(() => {});
  } catch (e) {
    console.warn('[locked_slots migration]', e.message);
  }

  // One-time migration: schedule_config never had UNIQUE(name), so every save
  // INSERTed a new row and reads returned the oldest config (stale active days).
  // Keep only the latest row per name, then enforce uniqueness.
  try {
    const [dups] = await pool.query(
      `SELECT name, MAX(id) AS keep_id, COUNT(*) AS n FROM schedule_config GROUP BY name HAVING n > 1`
    );
    for (const d of dups) {
      await pool.query(`DELETE FROM schedule_config WHERE name=? AND id<>?`, [d.name, d.keep_id]);
    }
    await pool.query(
      `ALTER TABLE schedule_config ADD UNIQUE INDEX uq_schedule_config_name (name)`
    ).catch(() => {});
  } catch (e) {
    console.warn('[schedule_config migration]', e.message);
  }

  // One-time migration: standardize day name 'Ahad' → 'Minggu'.
  // AutoSchedule always wrote 'Minggu', but old data/UI used 'Ahad', so
  // Sunday rows never matched the Sunday column in jadwal pages.
  try {
    await pool.query(`UPDATE jadwal SET hari='Minggu' WHERE hari='Ahad'`);
    await pool.query(`UPDATE locked_slots SET hari='Minggu' WHERE hari='Ahad'`);
    await pool.query(
      `UPDATE schedule_config SET config_json = REPLACE(config_json, '"Ahad"', '"Minggu"')
       WHERE config_json LIKE '%"Ahad"%'`
    );
  } catch (e) {
    console.warn('[ahad→minggu migration]', e.message);
  }
})();

// Get all metadata (teachers now include gender; teacherSubjects include tingkat+is_linear; teacherLimits include available_days)
router.get('/meta', async (req, res, next) => {
  try {
    const [teachers, subjects, classes, teacherSubjects, classSubjects, teacherLimits] = await Promise.all([
      config.getTeachers(),
      config.getSubjects(),
      config.getClasses(),
      config.getTeacherSubjects(),
      config.getClassSubjects(),
      config.getTeacherLimits()
    ]);
    res.json({ teachers, subjects, classes, teacherSubjects, classSubjects, teacherLimits });
  } catch (e) { next(e); }
});

router.get('/config', async (req, res, next) => {
  try { res.json(await config.getScheduleConfig('default')); } catch (e) { next(e); }
});

router.put('/config', async (req, res, next) => {
  try { res.json(await config.upsertScheduleConfig('default', req.body)); } catch (e) { next(e); }
});

// Teacher-Subject mapping — now accepts { subjects: [{ subjectId, tingkat, isLinear }] }
router.put('/teacher-subjects/:teacherId', async (req, res, next) => {
  try {
    let subjects = req.body.subjects;
    if (!subjects && req.body.subjectIds) {
      subjects = req.body.subjectIds.map(id => ({ subjectId: id, tingkat: '', isLinear: false }));
    }
    res.json(await config.upsertTeacherSubjects(req.params.teacherId, subjects || []));
  } catch (e) { next(e); }
});

// Class-Subject mapping
router.put('/class-subjects/:classId', async (req, res, next) => {
  try {
    res.json(await config.upsertClassSubjects(req.params.classId, req.body.subjects || []));
  } catch (e) { next(e); }
});

// Bulk class-subject matrix update
router.put('/class-subjects-matrix', async (req, res, next) => {
  try {
    res.json(await config.upsertClassSubjectsMatrix(req.body.mappings || []));
  } catch (e) { next(e); }
});

// Teacher limits — accepts availableDays and/or classGenderPref (partial update supported)
router.put('/teacher-limit/:teacherId', async (req, res, next) => {
  try {
    const { maxWeek, maxDay, minLinier, availableDays, classGenderPref } = req.body;
    if (classGenderPref !== undefined && maxWeek === undefined && maxDay === undefined && minLinier === undefined && availableDays === undefined) {
      return res.json(await config.updateTeacherClassGenderPref(req.params.teacherId, classGenderPref));
    }
    res.json(await config.upsertTeacherLimit(req.params.teacherId, maxWeek, maxDay, minLinier, availableDays, classGenderPref));
  } catch (e) { next(e); }
});

// Bulk teacher limits update
router.put('/teacher-limits-bulk', async (req, res, next) => {
  try {
    res.json(await config.upsertTeacherLimitsBulk(req.body.limits || []));
  } catch (e) { next(e); }
});

// Generate schedule — returns generated rows + failed list + warnings
router.post('/generate', async (req, res, next) => {
  try {
    const { days, hoursByDay, slotsByTingkat, hoursByDayByTingkat } = req.body;
    const result = await scheduler.generateSchedule({ days, hoursByDay, slotsByTingkat, hoursByDayByTingkat });
    res.json({
      generated: result.schedule,
      failed: result.failed,
      failedByClass: result.failedByClass,
      linearWarnings: result.linearWarnings,
      capacityWarnings: result.capacityWarnings,
      totalUnassigned: result.totalUnassigned
    });
  } catch (e) { next(e); }
});

// Apply generated schedule (INSERT only, does not delete existing)
router.post('/apply', async (req, res, next) => {
  try {
    res.json(await scheduler.applyGeneratedSchedule(req.body.rows));
  } catch (e) { next(e); }
});

// Finalize: DELETE all existing jadwal + INSERT generated rows
router.post('/finalize', async (req, res, next) => {
  try {
    res.json(await scheduler.finalizeSchedule(req.body.rows));
  } catch (e) { next(e); }
});

// Check conflict for a single cell edit (client sends full schedule + the proposed change)
router.post('/check-conflict', async (req, res, next) => {
  try {
    const { schedule, hari, jamKe, kelas, newGuruId, excludeIdx } = req.body;
    const conflict = scheduler.checkConflict(
      schedule || [], hari, String(jamKe), String(kelas), String(newGuruId), excludeIdx ?? -1
    );
    if (conflict) {
      res.json({ hasConflict: true, message: conflict.message, conflictRow: conflict.conflictRow });
    } else {
      res.json({ hasConflict: false });
    }
  } catch (e) { next(e); }
});

// Sebaran mapel: per-class subject distribution with assigned teachers
router.get('/sebaran-mapel', async (req, res, next) => {
  try { res.json(await config.getSebaranMapel()); } catch (e) { next(e); }
});

// Detail jadwal guru: per-teacher breakdown of subjects and classes
router.get('/detail-guru', async (req, res, next) => {
  try { res.json(await config.getDetailGuru()); } catch (e) { next(e); }
});

// Reset all teacher-subject mappings
router.delete('/teacher-subjects-all', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM teacher_subjects');
    res.json({ success: true });
  } catch (e) { next(e); }
});

// Reset all class-subject mappings
router.delete('/class-subjects-all', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM class_subjects');
    res.json({ success: true });
  } catch (e) { next(e); }
});

// Reset all schedules
router.post('/reset', async (req, res, next) => {
  try { res.json(await scheduler.resetSchedule()); } catch (e) { next(e); }
});

// ── Locked Slots CRUD ─────────────────────────────────────────────────────

router.get('/locked-slots', async (req, res, next) => {
  try {
    const [lsRows]   = await pool.query(`SELECT * FROM locked_slots ORDER BY hari, jam_ke`);
    const [teachers] = await masterPool.query(`SELECT id, name FROM teachers`);
    const [subjects] = await masterPool.query(`SELECT id, name FROM subjects`);
    const [classes]  = await masterPool.query(`SELECT id, name FROM classes`);
    const tMap = new Map(teachers.map(t => [t.id, t.name]));
    const sMap = new Map(subjects.map(s => [s.id, s.name]));
    const cMap = new Map(classes.map(c => [c.id, c.name]));
    const rows = lsRows.map(ls => ({
      ...ls,
      teacher_name: tMap.get(ls.teacher_id) || String(ls.teacher_id),
      subject_name: sMap.get(ls.subject_id) || String(ls.subject_id),
      class_name:   cMap.get(ls.class_id)   || String(ls.class_id)
    }));
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/locked-slots', async (req, res, next) => {
  try {
    const { teacher_id, subject_id, hari } = req.body;
    // Support both single (class_id/jam_ke) and multi (class_ids/jam_kes)
    const class_ids = req.body.class_ids?.length ? req.body.class_ids.map(Number) : [Number(req.body.class_id)];
    const jam_kes   = req.body.jam_kes?.length   ? req.body.jam_kes.map(Number)   : [Number(req.body.jam_ke)];

    if (!teacher_id || !subject_id || !hari || !class_ids[0] || !jam_kes[0])
      return res.status(400).json({ message: 'teacher_id, subject_id, hari, class_ids, jam_kes wajib diisi.' });

    const insertedIds = [];
    for (const class_id of class_ids) {
      for (const jam_ke of jam_kes) {
        // allow_multi_class = 1 when same teacher teaches multiple classes at same hari+jam
        const allow_multi = class_ids.length > 1 ? 1 : 0;
        const [r] = await pool.query(
          `INSERT INTO locked_slots (teacher_id, subject_id, class_id, hari, jam_ke, allow_multi_class)
           VALUES (?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE subject_id=VALUES(subject_id), allow_multi_class=VALUES(allow_multi_class)`,
          [teacher_id, subject_id, class_id, hari, jam_ke, allow_multi]
        );
        insertedIds.push(r.insertId || null);
      }
    }
    res.json({ ids: insertedIds, success: true });
  } catch (e) { next(e); }
});

router.delete('/locked-slots/all', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM locked_slots');
    res.json({ success: true });
  } catch (e) { next(e); }
});

router.delete('/locked-slots/:id', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM locked_slots WHERE id=?', [req.params.id]);
    res.json({ success: true });
  } catch (e) { next(e); }
});

// ── Excel Template Download ───────────────────────────────────────────────

router.get('/excel-template', async (req, res, next) => {
  try {
    const [teachers, subjects, classes, teacherSubjectsRaw, classSubjectsRaw] = await Promise.all([
      config.getTeachers(), config.getSubjects(), config.getClasses(),
      pool.query('SELECT teacher_id, subject_id, class_id FROM teacher_subjects').then(([r]) => r),
      pool.query('SELECT class_id, subject_id, hours_per_week FROM class_subjects').then(([r]) => r),
    ]);
    const wb = await generateTemplate({ classes, subjects, teachers, teacherSubjectsRaw, classSubjectsRaw });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="template-mapping-jadwal.xlsx"');
    await wb.xlsx.write(res);
    res.end();
  } catch (e) { next(e); }
});

// ── Excel Import Parse (preview) ──────────────────────────────────────────

router.post('/import-excel', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'File Excel tidak ditemukan.' });
    const [teachers, subjects, classes] = await Promise.all([
      config.getTeachers(), config.getSubjects(), config.getClasses()
    ]);
    const result = await parseImportExcel(req.file.buffer, { classes, subjects, teachers });
    res.json(result);
  } catch (e) { next(e); }
});

// ── Excel Import Apply ────────────────────────────────────────────────────

router.post('/import-excel/apply', async (req, res, next) => {
  try {
    const { classMappings, teacherMappings } = req.body;

    if (classMappings?.length) {
      // Group by classId → array of { subjectId, hoursPerWeek }
      const byClass = new Map();
      classMappings.forEach(m => {
        if (!byClass.has(m.classId)) byClass.set(m.classId, []);
        byClass.get(m.classId).push({ subjectId: m.subjectId, hoursPerWeek: m.hoursPerWeek });
      });
      for (const [classId, subjects] of byClass) {
        await config.upsertClassSubjects(classId, subjects);
      }
    }

    if (teacherMappings?.length) {
      // Group by teacherId → flatten to subjects array
      const byTeacher = new Map();
      teacherMappings.forEach(m => {
        if (!byTeacher.has(m.teacherId)) byTeacher.set(m.teacherId, []);
        if (m.classes?.length) {
          m.classes.forEach(cls => byTeacher.get(m.teacherId).push({ subjectId: m.subjectId, tingkat: '', classId: cls.id, isLinear: false }));
        } else {
          byTeacher.get(m.teacherId).push({ subjectId: m.subjectId, tingkat: '', isLinear: false });
        }
      });
      for (const [teacherId, subjects] of byTeacher) {
        await config.upsertTeacherSubjects(teacherId, subjects);
      }
    }

    res.json({ success: true });
  } catch (e) { next(e); }
});

module.exports = router;
