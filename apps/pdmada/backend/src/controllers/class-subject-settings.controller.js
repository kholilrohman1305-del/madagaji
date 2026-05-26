const pool = require('../db/pool');
const { writeChange } = require('../services/change-log.service');

function toInt(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

async function list(req, res) {
  const classId = toInt(req.query.class_id);
  const schoolYearId = toInt(req.query.school_year_id);
  const semesterId = toInt(req.query.semester_id);

  const where = [];
  const params = [];
  if (classId) {
    where.push('css.class_id = ?');
    params.push(classId);
  }
  if (schoolYearId) {
    where.push('css.school_year_id = ?');
    params.push(schoolYearId);
  }
  if (semesterId) {
    where.push('css.semester_id = ?');
    params.push(semesterId);
  }

  const [rows] = await pool.query(
    `SELECT css.*,
            c.name AS class_name,
            sy.name AS school_year_name,
            sem.name AS semester_name,
            s.name AS subject_name,
            s.group_name AS subject_group_name,
            s.kkm AS subject_kkm_default,
            s.display_order AS subject_display_order_default,
            COALESCE(css.kkm, s.kkm) AS subject_kkm,
            COALESCE(NULLIF(css.display_order, 0), s.display_order, 0) AS subject_display_order
     FROM class_subject_settings css
     JOIN classes c ON c.id = css.class_id
     JOIN subjects s ON s.id = css.subject_id
     JOIN school_years sy ON sy.id = css.school_year_id
     JOIN semesters sem ON sem.id = css.semester_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY css.class_id ASC, COALESCE(NULLIF(css.display_order, 0), s.display_order, 0) ASC, s.name ASC`,
    params
  );

  res.json(rows);
}

async function upsertPeriod(req, res) {
  const classId = toInt(req.body.class_id);
  const schoolYearId = toInt(req.body.school_year_id);
  const semesterId = toInt(req.body.semester_id);
  const subjects = Array.isArray(req.body.subjects) ? req.body.subjects : [];
  const normalizedFromSubjects = subjects
    .map((item, idx) => ({
      subject_id: toInt(item?.subject_id),
      kkm: item?.kkm === '' || item?.kkm === null || typeof item?.kkm === 'undefined' ? null : Number(item.kkm),
      display_order: toInt(item?.display_order) || (idx + 1)
    }))
    .filter((item) => item.subject_id);
  const normalized = normalizedFromSubjects.length
    ? normalizedFromSubjects
    : (Array.isArray(req.body.subject_ids) ? req.body.subject_ids.map((id, idx) => ({
      subject_id: toInt(id),
      kkm: null,
      display_order: idx + 1
    })) : []).filter((item) => item.subject_id);

  if (!classId || !schoolYearId || !semesterId) {
    return res.status(400).json({ message: 'class_id, school_year_id, dan semester_id wajib diisi.' });
  }
  if (!normalized.length) {
    return res.status(400).json({ message: 'subject_ids minimal berisi 1 mapel.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      'DELETE FROM class_subject_settings WHERE class_id = ? AND school_year_id = ? AND semester_id = ?',
      [classId, schoolYearId, semesterId]
    );

    for (const subject of normalized) {
      const [subjectRows] = await conn.query(
        'SELECT kkm, display_order FROM subjects WHERE id = ? LIMIT 1',
        [subject.subject_id]
      );
      const subjectDefault = subjectRows[0] || {};
      const [result] = await conn.query(
        `INSERT INTO class_subject_settings (class_id, subject_id, school_year_id, semester_id, kkm, display_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          classId,
          subject.subject_id,
          schoolYearId,
          semesterId,
          subject.kkm === null ? (subjectDefault.kkm ?? null) : subject.kkm,
          subject.display_order || subjectDefault.display_order || 0
        ]
      );
      await writeChange({
        table: 'class_subject_settings',
        recordId: result.insertId,
        operation: 'insert',
        data: {
          class_id: classId,
          subject_id: subject.subject_id,
          school_year_id: schoolYearId,
          semester_id: semesterId,
          kkm: subject.kkm,
          display_order: subject.display_order
        }
      });
    }

    await conn.commit();
    return res.json({ message: `Setting mapel tersimpan (${normalized.length} mapel).` });
  } catch (err) {
    await conn.rollback();
    return res.status(400).json({ message: err.message || 'Gagal menyimpan setting mapel kelas.' });
  } finally {
    conn.release();
  }
}

async function copyPeriod(req, res) {
  const sourceClassId = toInt(req.body.source_class_id);
  const schoolYearId = toInt(req.body.school_year_id);
  const semesterId = toInt(req.body.semester_id);
  const targetClassIds = Array.isArray(req.body.target_class_ids)
    ? [...new Set(req.body.target_class_ids.map(toInt).filter(Boolean))]
    : [];

  if (!sourceClassId || !schoolYearId || !semesterId || !targetClassIds.length) {
    return res.status(400).json({ message: 'source_class_id, target_class_ids, school_year_id, dan semester_id wajib diisi.' });
  }

  const [sourceRows] = await pool.query(
    `SELECT subject_id, kkm, display_order
     FROM class_subject_settings
     WHERE class_id = ? AND school_year_id = ? AND semester_id = ?`,
    [sourceClassId, schoolYearId, semesterId]
  );
  if (!sourceRows.length) {
    return res.status(400).json({ message: 'Kelas sumber belum memiliki setting mapel pada periode ini.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    for (const targetClassId of targetClassIds) {
      await conn.query(
        'DELETE FROM class_subject_settings WHERE class_id = ? AND school_year_id = ? AND semester_id = ?',
        [targetClassId, schoolYearId, semesterId]
      );
      for (const source of sourceRows) {
        const [result] = await conn.query(
          `INSERT INTO class_subject_settings (class_id, subject_id, school_year_id, semester_id, kkm, display_order)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [targetClassId, source.subject_id, schoolYearId, semesterId, source.kkm, source.display_order]
        );
        await writeChange({
          table: 'class_subject_settings',
          recordId: result.insertId,
          operation: 'insert',
          data: {
            class_id: targetClassId,
            subject_id: source.subject_id,
            school_year_id: schoolYearId,
            semester_id: semesterId,
            kkm: source.kkm,
            display_order: source.display_order,
            copied_from_class_id: sourceClassId
          }
        });
      }
    }

    await conn.commit();
    return res.json({ message: `Setting mapel berhasil dicopy ke ${targetClassIds.length} kelas.` });
  } catch (err) {
    await conn.rollback();
    return res.status(400).json({ message: err.message || 'Gagal copy setting mapel kelas.' });
  } finally {
    conn.release();
  }
}

async function copyFromPreviousPeriod(req, res) {
  const classId = toInt(req.body.class_id);
  const schoolYearId = toInt(req.body.school_year_id);
  const semesterId = toInt(req.body.semester_id);
  if (!classId || !schoolYearId || !semesterId) {
    return res.status(400).json({ message: 'class_id, school_year_id, dan semester_id wajib diisi.' });
  }

  const [[currentSemester], [currentSchoolYear], [allSemesters], [allSchoolYears]] = await Promise.all([
    pool.query('SELECT id, name FROM semesters WHERE id = ? LIMIT 1', [semesterId]),
    pool.query('SELECT id, name FROM school_years WHERE id = ? LIMIT 1', [schoolYearId]),
    pool.query('SELECT id, name FROM semesters ORDER BY id ASC'),
    pool.query('SELECT id, name FROM school_years ORDER BY id ASC')
  ]);

  if (!currentSemester || !currentSchoolYear) {
    return res.status(404).json({ message: 'Semester atau tahun ajaran tidak ditemukan.' });
  }

  const semesterName = String(currentSemester.name || '').toLowerCase();
  const ganjil = allSemesters.find((item) => String(item.name || '').toLowerCase().includes('ganjil'));
  const genap = allSemesters.find((item) => String(item.name || '').toLowerCase().includes('genap'));
  const prevSchoolYear = [...allSchoolYears].reverse().find((item) => Number(item.id) < Number(schoolYearId));

  let sourceSchoolYearId = null;
  let sourceSemesterId = null;

  if (semesterName.includes('genap') && ganjil) {
    sourceSchoolYearId = schoolYearId;
    sourceSemesterId = ganjil.id;
  } else if (semesterName.includes('ganjil') && genap && prevSchoolYear) {
    sourceSchoolYearId = prevSchoolYear.id;
    sourceSemesterId = genap.id;
  } else {
    const currentSemesterIndex = allSemesters.findIndex((item) => Number(item.id) === Number(semesterId));
    if (currentSemesterIndex > 0) {
      sourceSchoolYearId = schoolYearId;
      sourceSemesterId = allSemesters[currentSemesterIndex - 1].id;
    } else if (prevSchoolYear && allSemesters.length) {
      sourceSchoolYearId = prevSchoolYear.id;
      sourceSemesterId = allSemesters[allSemesters.length - 1].id;
    }
  }

  if (!sourceSchoolYearId || !sourceSemesterId) {
    return res.status(400).json({ message: 'Periode sebelumnya tidak ditemukan untuk dicopy.' });
  }

  const [sourceRows] = await pool.query(
    `SELECT subject_id, kkm, display_order
     FROM class_subject_settings
     WHERE class_id = ? AND school_year_id = ? AND semester_id = ?`,
    [classId, sourceSchoolYearId, sourceSemesterId]
  );
  if (!sourceRows.length) {
    return res.status(400).json({ message: 'Tidak ada setting mapel pada periode sebelumnya untuk kelas ini.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      'DELETE FROM class_subject_settings WHERE class_id = ? AND school_year_id = ? AND semester_id = ?',
      [classId, schoolYearId, semesterId]
    );
    for (const source of sourceRows) {
      const [result] = await conn.query(
        `INSERT INTO class_subject_settings (class_id, subject_id, school_year_id, semester_id, kkm, display_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [classId, source.subject_id, schoolYearId, semesterId, source.kkm, source.display_order]
      );
      await writeChange({
        table: 'class_subject_settings',
        recordId: result.insertId,
        operation: 'insert',
        data: {
          class_id: classId,
          subject_id: source.subject_id,
          school_year_id: schoolYearId,
          semester_id: semesterId,
          kkm: source.kkm,
          display_order: source.display_order,
          copied_from_school_year_id: sourceSchoolYearId,
          copied_from_semester_id: sourceSemesterId
        }
      });
    }
    await conn.commit();
    return res.json({
      message: `Setting mapel berhasil dicopy dari periode sebelumnya (${sourceRows.length} mapel).`,
      source_period: { school_year_id: sourceSchoolYearId, semester_id: sourceSemesterId }
    });
  } catch (err) {
    await conn.rollback();
    return res.status(400).json({ message: err.message || 'Gagal copy dari periode sebelumnya.' });
  } finally {
    conn.release();
  }
}

module.exports = {
  list,
  upsertPeriod,
  copyPeriod,
  copyFromPreviousPeriod
};
