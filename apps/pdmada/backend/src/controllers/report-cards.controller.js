const pool = require('../db/pool');
const { writeChange } = require('../services/change-log.service');

function toInt(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isNaN(number) ? null : number;
}

async function list(req, res) {
  const studentId = toInt(req.query.student_id);
  const classId = toInt(req.query.class_id);
  const schoolYearId = toInt(req.query.school_year_id);
  const semesterId = toInt(req.query.semester_id);
  const q = String(req.query.q || '').trim().toLowerCase();

  const studentWhere = [];
  const studentParams = [];

  if (studentId) {
    studentWhere.push('s.id = ?');
    studentParams.push(studentId);
  }
  if (classId) {
    studentWhere.push('s.class_id = ?');
    studentParams.push(classId);
  }
  if (q) {
    const like = `%${q}%`;
    studentWhere.push('(LOWER(COALESCE(s.name, \'\')) LIKE ? OR LOWER(COALESCE(s.nis_local, \'\')) LIKE ?)');
    studentParams.push(like, like);
  }

  const [students] = await pool.query(
    `SELECT s.id, s.name, s.nis_local, s.class_id, c.name AS class_name
     FROM students s
     LEFT JOIN classes c ON c.id = s.class_id
     ${studentWhere.length ? `WHERE ${studentWhere.join(' AND ')}` : ''}
     ORDER BY s.name ASC`,
    studentParams
  );

  if (!students.length) return res.json([]);

  const scoreWhere = ['ss.student_id IN (?)'];
  const scoreParams = [students.map((item) => item.id)];
  if (classId) {
    scoreWhere.push('ss.class_id = ?');
    scoreParams.push(classId);
  }
  if (schoolYearId) {
    scoreWhere.push('ss.school_year_id = ?');
    scoreParams.push(schoolYearId);
  }
  if (semesterId) {
    scoreWhere.push('ss.semester_id = ?');
    scoreParams.push(semesterId);
  }
  if (schoolYearId && semesterId) {
    scoreWhere.push(`EXISTS (
      SELECT 1
      FROM class_subject_settings css
      WHERE css.class_id = ss.class_id
        AND css.subject_id = ss.subject_id
        AND css.school_year_id = ss.school_year_id
        AND css.semester_id = ss.semester_id
    )`);
  }

  const metaWhere = ['rm.student_id IN (?)'];
  const metaParams = [students.map((item) => item.id)];
  if (classId) {
    metaWhere.push('rm.class_id = ?');
    metaParams.push(classId);
  }
  if (schoolYearId) {
    metaWhere.push('rm.school_year_id = ?');
    metaParams.push(schoolYearId);
  }
  if (semesterId) {
    metaWhere.push('rm.semester_id = ?');
    metaParams.push(semesterId);
  }

  const [scores] = await pool.query(
    `SELECT ss.*,
            subj.name AS subject_name,
            subj.group_name AS subject_group_name,
            COALESCE(css.kkm, subj.kkm) AS subject_kkm,
            COALESCE(NULLIF(css.display_order, 0), subj.display_order, 0) AS subject_display_order,
            sy.name AS school_year_name,
            sem.name AS semester_name
     FROM student_scores ss
     LEFT JOIN subjects subj ON subj.id = ss.subject_id
     LEFT JOIN class_subject_settings css
       ON css.class_id = ss.class_id
      AND css.subject_id = ss.subject_id
      AND css.school_year_id = ss.school_year_id
      AND css.semester_id = ss.semester_id
     LEFT JOIN school_years sy ON sy.id = ss.school_year_id
     LEFT JOIN semesters sem ON sem.id = ss.semester_id
     WHERE ${scoreWhere.join(' AND ')}
     ORDER BY ss.student_id ASC, COALESCE(NULLIF(css.display_order, 0), subj.display_order, 0) ASC, subj.name ASC`,
    scoreParams
  );

  const [metaRows] = await pool.query(
    `SELECT rm.*, sy.name AS school_year_name, sem.name AS semester_name
     FROM student_report_meta rm
     LEFT JOIN school_years sy ON sy.id = rm.school_year_id
     LEFT JOIN semesters sem ON sem.id = rm.semester_id
     WHERE ${metaWhere.join(' AND ')}
     ORDER BY rm.student_id ASC, rm.updated_at DESC`,
    metaParams
  );

  const scoreMap = new Map();
  scores.forEach((row) => {
    const key = `${row.student_id}::${row.school_year_id || 0}::${row.semester_id || 0}`;
    if (!scoreMap.has(key)) scoreMap.set(key, []);
    scoreMap.get(key).push(row);
  });

  const metaMap = new Map();
  metaRows.forEach((row) => {
    const key = `${row.student_id}::${row.school_year_id || 0}::${row.semester_id || 0}`;
    if (!metaMap.has(key)) metaMap.set(key, row);
  });

  const results = [];
  if (schoolYearId && semesterId) {
    students.forEach((student) => {
      const key = `${student.id}::${schoolYearId}::${semesterId}`;
      const subjectScores = scoreMap.get(key) || [];
      const meta = metaMap.get(key) || null;
      const numericScores = subjectScores.map((item) => Number(item.score_value)).filter((value) => !Number.isNaN(value));
      results.push({
        student_id: student.id,
        student_name: student.name,
        nis_local: student.nis_local,
        class_id: student.class_id,
        class_name: student.class_name,
        school_year_id: schoolYearId,
        semester_id: semesterId,
        school_year_name: subjectScores[0]?.school_year_name || meta?.school_year_name || null,
        semester_name: subjectScores[0]?.semester_name || meta?.semester_name || null,
        average_score: numericScores.length ? numericScores.reduce((sum, value) => sum + value, 0) / numericScores.length : null,
        subject_count: subjectScores.length,
        scores: subjectScores,
        report_meta: meta
      });
    });
  } else {
    const periods = new Map();
    [...scoreMap.keys(), ...metaMap.keys()].forEach((key) => periods.set(key, true));
    if (periods.size) {
      periods.forEach((_, key) => {
        const [studentIdValue, yearValue, semesterValue] = key.split('::');
        const student = students.find((item) => String(item.id) === studentIdValue);
        if (!student) return;
        const subjectScores = scoreMap.get(key) || [];
        const meta = metaMap.get(key) || null;
        const numericScores = subjectScores.map((item) => Number(item.score_value)).filter((value) => !Number.isNaN(value));
        results.push({
          student_id: student.id,
          student_name: student.name,
          nis_local: student.nis_local,
          class_id: student.class_id,
          class_name: student.class_name,
          school_year_id: toInt(yearValue),
          semester_id: toInt(semesterValue),
          school_year_name: subjectScores[0]?.school_year_name || meta?.school_year_name || null,
          semester_name: subjectScores[0]?.semester_name || meta?.semester_name || null,
          average_score: numericScores.length ? numericScores.reduce((sum, value) => sum + value, 0) / numericScores.length : null,
          subject_count: subjectScores.length,
          scores: subjectScores,
          report_meta: meta
        });
      });
    } else {
      students.forEach((student) => {
        results.push({
          student_id: student.id,
          student_name: student.name,
          nis_local: student.nis_local,
          class_id: student.class_id,
          class_name: student.class_name,
          school_year_id: schoolYearId,
          semester_id: semesterId,
          school_year_name: null,
          semester_name: null,
          average_score: null,
          subject_count: 0,
          scores: [],
          report_meta: null
        });
      });
    }
  }

  results.sort((a, b) => {
    const byName = String(a.student_name || '').localeCompare(String(b.student_name || ''), 'id');
    if (byName !== 0) return byName;
    return (b.school_year_id || 0) - (a.school_year_id || 0) || (b.semester_id || 0) - (a.semester_id || 0);
  });

  res.json(results);
}

async function upsertMeta(req, res) {
  const studentId = toInt(req.body.student_id);
  const classId = toInt(req.body.class_id);
  const schoolYearId = toInt(req.body.school_year_id);
  const semesterId = toInt(req.body.semester_id);
  const attendanceSick = toInt(req.body.attendance_sick);
  const attendancePermit = toInt(req.body.attendance_permit);
  const attendanceAbsent = toInt(req.body.attendance_absent);
  const extracurricularActivity = req.body.extracurricular_activity || null;
  const extracurricularPredicate = req.body.extracurricular_predicate || null;
  const homeroomNote = req.body.homeroom_note || null;

  if (!studentId || !schoolYearId || !semesterId) {
    return res.status(400).json({ message: 'student_id, school_year_id, dan semester_id wajib diisi.' });
  }

  const [existing] = await pool.query(
    `SELECT * FROM student_report_meta
     WHERE student_id = ? AND school_year_id = ? AND semester_id = ?
     LIMIT 1`,
    [studentId, schoolYearId, semesterId]
  );

  let row;
  let operation = 'insert';

  if (existing[0]) {
    await pool.query(
      `UPDATE student_report_meta
       SET class_id = ?, extracurricular_activity = ?, extracurricular_predicate = ?,
           attendance_sick = ?, attendance_permit = ?, attendance_absent = ?, homeroom_note = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        classId,
        extracurricularActivity,
        extracurricularPredicate,
        attendanceSick,
        attendancePermit,
        attendanceAbsent,
        homeroomNote,
        existing[0].id
      ]
    );
    const [rows] = await pool.query('SELECT * FROM student_report_meta WHERE id = ?', [existing[0].id]);
    row = rows[0];
    operation = 'update';
  } else {
    const [result] = await pool.query(
      `INSERT INTO student_report_meta
       (student_id, class_id, school_year_id, semester_id, extracurricular_activity, extracurricular_predicate, attendance_sick, attendance_permit, attendance_absent, homeroom_note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        studentId,
        classId,
        schoolYearId,
        semesterId,
        extracurricularActivity,
        extracurricularPredicate,
        attendanceSick,
        attendancePermit,
        attendanceAbsent,
        homeroomNote
      ]
    );
    const [rows] = await pool.query('SELECT * FROM student_report_meta WHERE id = ?', [result.insertId]);
    row = rows[0];
  }

  await writeChange({ table: 'student_report_meta', recordId: row.id, operation, data: row });
  res.status(operation === 'insert' ? 201 : 200).json(row);
}

async function bulkUpsertMeta(req, res) {
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  if (!items.length) return res.status(400).json({ message: 'items wajib diisi.' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const results = [];

    for (const item of items) {
      const studentId = toInt(item.student_id);
      const classId = toInt(item.class_id);
      const schoolYearId = toInt(item.school_year_id);
      const semesterId = toInt(item.semester_id);
      if (!studentId || !schoolYearId || !semesterId) {
        throw new Error('student_id, school_year_id, dan semester_id wajib diisi.');
      }

      const [existing] = await conn.query(
        `SELECT * FROM student_report_meta
         WHERE student_id = ? AND school_year_id = ? AND semester_id = ?
         LIMIT 1`,
        [studentId, schoolYearId, semesterId]
      );

      let row;
      let operation = 'insert';
      const payload = [
        classId,
        item.extracurricular_activity || null,
        item.extracurricular_predicate || null,
        toInt(item.attendance_sick),
        toInt(item.attendance_permit),
        toInt(item.attendance_absent),
        item.homeroom_note || null
      ];

      if (existing[0]) {
        await conn.query(
          `UPDATE student_report_meta
           SET class_id = ?, extracurricular_activity = ?, extracurricular_predicate = ?,
               attendance_sick = ?, attendance_permit = ?, attendance_absent = ?, homeroom_note = ?, updated_at = NOW()
           WHERE id = ?`,
          [...payload, existing[0].id]
        );
        const [rows] = await conn.query('SELECT * FROM student_report_meta WHERE id = ?', [existing[0].id]);
        row = rows[0];
        operation = 'update';
      } else {
        const [result] = await conn.query(
          `INSERT INTO student_report_meta
           (student_id, class_id, school_year_id, semester_id, extracurricular_activity, extracurricular_predicate, attendance_sick, attendance_permit, attendance_absent, homeroom_note)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [studentId, classId, schoolYearId, semesterId, ...payload]
        );
        const [rows] = await conn.query('SELECT * FROM student_report_meta WHERE id = ?', [result.insertId]);
        row = rows[0];
      }

      await writeChange({ table: 'student_report_meta', recordId: row.id, operation, data: row });
      results.push({ id: row.id, operation });
    }

    await conn.commit();
    res.json({ message: `${results.length} data rapor berhasil diproses.`, results });
  } catch (err) {
    await conn.rollback();
    res.status(400).json({ message: err.message || 'Gagal bulk simpan data rapor.' });
  } finally {
    conn.release();
  }
}

module.exports = {
  list,
  upsertMeta,
  bulkUpsertMeta
};
