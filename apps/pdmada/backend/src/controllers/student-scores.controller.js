const pool = require('../db/pool');
const { writeChange } = require('../services/change-log.service');
const XLSX = require('xlsx');

function toInt(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function normalizePayload(body = {}) {
  const studentId = toInt(body.student_id);
  const subjectId = toInt(body.subject_id);
  const schoolYearId = toInt(body.school_year_id);
  const semesterId = toInt(body.semester_id);
  const classId = toInt(body.class_id);
  const scoreValue = body.score_value === '' || body.score_value === null || typeof body.score_value === 'undefined'
    ? null
    : Number(body.score_value);
  const achievementNote = body.achievement_note || null;

  return {
    studentId,
    subjectId,
    schoolYearId,
    semesterId,
    classId,
    scoreValue,
    achievementNote
  };
}

function normalizeHeaderKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

function normalizeRowKeys(row = {}) {
  const normalized = {};
  Object.keys(row || {}).forEach((key) => {
    normalized[normalizeHeaderKey(key)] = row[key];
  });
  return normalized;
}

function parseScoreValue(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isNaN(value) ? null : value;
  const normalized = String(value).trim().replace(',', '.');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isNaN(parsed) ? null : parsed;
}

function pickFirstNonEmpty(row, keys = []) {
  for (const key of keys) {
    if (row[key] !== null && row[key] !== undefined && String(row[key]).trim() !== '') return row[key];
  }
  return null;
}

async function getClassSubjects(classId, schoolYearId, semesterId, conn = null) {
  const db = conn || pool;
  const [rows] = await db.query(
    `SELECT
      css.subject_id,
      subj.name AS subject_name,
      COALESCE(css.kkm, subj.kkm) AS kkm,
      COALESCE(NULLIF(css.display_order, 0), subj.display_order, 0) AS display_order
     FROM class_subject_settings css
     JOIN subjects subj ON subj.id = css.subject_id
     WHERE css.class_id = ? AND css.school_year_id = ? AND css.semester_id = ?
     ORDER BY COALESCE(NULLIF(css.display_order, 0), subj.display_order, 0) ASC, subj.name ASC`,
    [classId, schoolYearId, semesterId]
  );
  return rows;
}

async function getClassStudents(classId, conn = null) {
  const db = conn || pool;
  const [rows] = await db.query(
    `SELECT id, nis_local, name
     FROM students
     WHERE class_id = ? AND LOWER(COALESCE(student_status, 'aktif')) = 'aktif'
     ORDER BY name ASC`,
    [classId]
  );
  return rows;
}

async function getClassPeriodMeta(classId, schoolYearId, semesterId, conn = null) {
  const db = conn || pool;
  const [[classRow], [schoolYearRow], [semesterRow]] = await Promise.all([
    db.query('SELECT id, name FROM classes WHERE id = ? LIMIT 1', [classId]),
    db.query('SELECT id, name FROM school_years WHERE id = ? LIMIT 1', [schoolYearId]),
    db.query('SELECT id, name FROM semesters WHERE id = ? LIMIT 1', [semesterId])
  ]);
  return {
    classItem: classRow[0] || null,
    schoolYear: schoolYearRow[0] || null,
    semester: semesterRow[0] || null
  };
}

function buildSubjectHeaderMap(subjects = []) {
  const usedScoreKeys = new Set();
  const list = [];

  subjects.forEach((subject, index) => {
    const rawName = String(subject.subject_name || '').trim() || `Mapel ${index + 1}`;
    let displayName = rawName;
    let normalizedBase = normalizeHeaderKey(rawName) || `mapel_${subject.subject_id}`;
    let attempt = 2;
    while (usedScoreKeys.has(normalizedBase)) {
      normalizedBase = `${normalizeHeaderKey(rawName) || `mapel_${subject.subject_id}`}_${attempt}`;
      displayName = `${rawName} (${attempt})`;
      attempt += 1;
    }
    usedScoreKeys.add(normalizedBase);

    list.push({
      subjectId: Number(subject.subject_id),
      subjectName: rawName,
      displayName,
      scoreHeader: displayName,
      cpHeader: `CP ${displayName}`,
      scoreKey: normalizedBase,
      cpKey: `cp_${normalizedBase}`
    });
  });

  return list;
}

async function upsertScore(payload, conn = null) {
  const db = conn || pool;
  let {
    studentId,
    subjectId,
    schoolYearId,
    semesterId,
    classId,
    scoreValue,
    achievementNote
  } = payload;

  if (!studentId || !subjectId || !schoolYearId || !semesterId) {
    throw new Error('student_id, subject_id, school_year_id, semester_id wajib diisi.');
  }
  if (scoreValue !== null && Number.isNaN(scoreValue)) {
    throw new Error('score_value tidak valid.');
  }

  // Ensure class is always resolved to validate subject setting by period.
  if (!classId) {
    const [studentRows] = await db.query('SELECT class_id FROM students WHERE id = ? LIMIT 1', [studentId]);
    classId = studentRows[0]?.class_id || null;
  }
  if (!classId) {
    throw new Error('class_id tidak ditemukan. Pastikan siswa terdaftar pada kelas.');
  }

  const [settingRows] = await db.query(
    `SELECT id
     FROM class_subject_settings
     WHERE class_id = ? AND subject_id = ? AND school_year_id = ? AND semester_id = ?
     LIMIT 1`,
    [classId, subjectId, schoolYearId, semesterId]
  );
  if (!settingRows[0]) {
    throw new Error('Mapel belum disetting untuk kelas dan periode ini. Silakan atur di menu Setting Mapel Kelas.');
  }

  const [existing] = await db.query(
    `SELECT * FROM student_scores
     WHERE student_id = ? AND subject_id = ? AND school_year_id = ? AND semester_id = ?
     LIMIT 1`,
    [studentId, subjectId, schoolYearId, semesterId]
  );

  if (existing[0]) {
    const updated = {
      ...existing[0],
      class_id: classId || existing[0].class_id || null,
      score_value: scoreValue,
      achievement_note: achievementNote
    };
    await db.query(
      `UPDATE student_scores
       SET class_id = ?, score_value = ?, achievement_note = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        updated.class_id,
        updated.score_value,
        updated.achievement_note,
        existing[0].id
      ]
    );
    const [rows] = await db.query('SELECT * FROM student_scores WHERE id = ?', [existing[0].id]);
    return { row: rows[0], operation: 'update' };
  }

  const [result] = await db.query(
    `INSERT INTO student_scores
     (student_id, class_id, subject_id, school_year_id, semester_id, score_value, achievement_note)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      studentId,
      classId,
      subjectId,
      schoolYearId,
      semesterId,
      scoreValue,
      achievementNote
    ]
  );
  const [rows] = await db.query('SELECT * FROM student_scores WHERE id = ?', [result.insertId]);
  return { row: rows[0], operation: 'insert' };
}

async function list(req, res) {
  const studentId = toInt(req.query.student_id);
  const classId = toInt(req.query.class_id);
  const schoolYearId = toInt(req.query.school_year_id);
  const semesterId = toInt(req.query.semester_id);
  const subjectId = toInt(req.query.subject_id);
  const q = String(req.query.q || '').trim().toLowerCase();

  const where = [];
  const params = [];

  if (studentId) {
    where.push('ss.student_id = ?');
    params.push(studentId);
  }
  if (classId) {
    where.push('ss.class_id = ?');
    params.push(classId);
  }
  if (schoolYearId) {
    where.push('ss.school_year_id = ?');
    params.push(schoolYearId);
  }
  if (semesterId) {
    where.push('ss.semester_id = ?');
    params.push(semesterId);
  }
  if (subjectId) {
    where.push('ss.subject_id = ?');
    params.push(subjectId);
  }
  if (schoolYearId && semesterId) {
    where.push(`EXISTS (
      SELECT 1
      FROM class_subject_settings css
      WHERE css.class_id = ss.class_id
        AND css.subject_id = ss.subject_id
        AND css.school_year_id = ss.school_year_id
        AND css.semester_id = ss.semester_id
    )`);
  }
  if (q) {
    where.push('(LOWER(COALESCE(s.name, \'\')) LIKE ? OR LOWER(COALESCE(s.nis_local, \'\')) LIKE ? OR LOWER(COALESCE(subj.name, \'\')) LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like);
  }

  const [rows] = await pool.query(
    `SELECT
      ss.*,
      s.name AS student_name,
      s.nis_local,
      c.name AS class_name,
      sy.name AS school_year_name,
      sem.name AS semester_name,
      subj.name AS subject_name,
      COALESCE(css.kkm, subj.kkm) AS subject_kkm,
      COALESCE(NULLIF(css.display_order, 0), subj.display_order, 0) AS subject_display_order
     FROM student_scores ss
     JOIN students s ON s.id = ss.student_id
     LEFT JOIN classes c ON c.id = ss.class_id
     LEFT JOIN school_years sy ON sy.id = ss.school_year_id
     LEFT JOIN semesters sem ON sem.id = ss.semester_id
     LEFT JOIN subjects subj ON subj.id = ss.subject_id
     LEFT JOIN class_subject_settings css
       ON css.class_id = ss.class_id
      AND css.subject_id = ss.subject_id
      AND css.school_year_id = ss.school_year_id
      AND css.semester_id = ss.semester_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY sy.id DESC, sem.id DESC, s.name ASC, COALESCE(NULLIF(css.display_order, 0), subj.display_order, 0) ASC, subj.name ASC, ss.id DESC`,
    params
  );

  res.json(rows);
}

async function upsert(req, res) {
  try {
    const payload = normalizePayload(req.body);
    const { row, operation } = await upsertScore(payload);
    await writeChange({ table: 'student_scores', recordId: row.id, operation, data: row });
    return res.status(operation === 'insert' ? 201 : 200).json(row);
  } catch (err) {
    return res.status(400).json({ message: err.message || 'Gagal menyimpan nilai.' });
  }
}

async function bulkUpsert(req, res) {
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  if (!items.length) return res.status(400).json({ message: 'items wajib diisi.' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const results = [];
    for (const item of items) {
      const payload = normalizePayload(item);
      const { row, operation } = await upsertScore(payload, conn);
      await writeChange({ table: 'student_scores', recordId: row.id, operation, data: row });
      results.push({ id: row.id, operation });
    }
    await conn.commit();
    return res.json({ message: `${results.length} data nilai berhasil diproses.`, results });
  } catch (err) {
    await conn.rollback();
    return res.status(400).json({ message: err.message || 'Gagal bulk input nilai.' });
  } finally {
    conn.release();
  }
}

async function remove(req, res) {
  const id = toInt(req.params.id);
  if (!id) return res.status(400).json({ message: 'id tidak valid.' });
  const [rows] = await pool.query('SELECT * FROM student_scores WHERE id = ?', [id]);
  if (!rows[0]) return res.status(404).json({ message: 'Data nilai tidak ditemukan.' });
  await pool.query('DELETE FROM student_scores WHERE id = ?', [id]);
  await writeChange({ table: 'student_scores', recordId: id, operation: 'delete', data: rows[0] });
  return res.json({ message: 'Deleted' });
}

async function downloadTemplate(req, res) {
  const classId = toInt(req.query.class_id);
  const schoolYearId = toInt(req.query.school_year_id);
  const semesterId = toInt(req.query.semester_id);

  if (!classId || !schoolYearId || !semesterId) {
    return res.status(400).json({ message: 'class_id, school_year_id, semester_id wajib diisi.' });
  }

  const { classItem, schoolYear, semester } = await getClassPeriodMeta(classId, schoolYearId, semesterId);
  if (!classItem || !schoolYear || !semester) {
    return res.status(404).json({ message: 'Data kelas/periode tidak ditemukan.' });
  }

  const [subjects, students] = await Promise.all([
    getClassSubjects(classId, schoolYearId, semesterId),
    getClassStudents(classId)
  ]);

  if (!subjects.length) {
    return res.status(400).json({ message: 'Mapel belum disetting untuk kelas & periode ini.' });
  }

  const subjectHeaders = buildSubjectHeaderMap(subjects);
  const headers = ['NIS', 'Nama Siswa'];
  const infoRows = [['subject_id', 'subject_name', 'kolom_nilai', 'kolom_capaian', 'kkm']];
  subjectHeaders.forEach((subject) => {
    headers.push(subject.scoreHeader);
  });
  subjectHeaders.forEach((subject) => {
    headers.push(subject.cpHeader);
  });

  subjectHeaders.forEach((subject) => {
    const found = subjects.find((item) => Number(item.subject_id) === Number(subject.subjectId));
    infoRows.push([
      subject.subjectId,
      subject.subjectName,
      subject.scoreHeader,
      subject.cpHeader,
      found?.kkm ?? ''
    ]);
  });

  const rows = [headers];
  if (students.length) {
    students.forEach((student) => {
      const row = [student.nis_local || '', student.name || ''];
      subjectHeaders.forEach(() => row.push(''));
      subjectHeaders.forEach(() => row.push(''));
      rows.push(row);
    });
  } else {
    const sample = ['NIS-001', 'Nama Siswa'];
    subjectHeaders.forEach(() => sample.push(''));
    subjectHeaders.forEach(() => sample.push(''));
    rows.push(sample);
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const infoWs = XLSX.utils.aoa_to_sheet(infoRows);
  XLSX.utils.book_append_sheet(wb, ws, 'Nilai');
  XLSX.utils.book_append_sheet(wb, infoWs, 'InfoMapel');

  const filename = `template_nilai_${String(classItem.name || 'kelas').replace(/\s+/g, '_')}_${String(schoolYear.name || '').replace(/\//g, '-')}_${String(semester.name || '').replace(/\s+/g, '_')}.xlsx`;
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  return res.send(buffer);
}

async function importXlsx(req, res) {
  const classId = toInt(req.body.class_id || req.query.class_id);
  const schoolYearId = toInt(req.body.school_year_id || req.query.school_year_id);
  const semesterId = toInt(req.body.semester_id || req.query.semester_id);

  if (!classId || !schoolYearId || !semesterId) {
    return res.status(400).json({ message: 'class_id, school_year_id, semester_id wajib diisi.' });
  }
  if (!req.file) {
    return res.status(400).json({ message: 'File Excel wajib diupload.' });
  }

  const { classItem, schoolYear, semester } = await getClassPeriodMeta(classId, schoolYearId, semesterId);
  if (!classItem || !schoolYear || !semester) {
    return res.status(404).json({ message: 'Data kelas/periode tidak ditemukan.' });
  }

  const [subjects, students] = await Promise.all([
    getClassSubjects(classId, schoolYearId, semesterId),
    getClassStudents(classId)
  ]);

  if (!subjects.length) {
    return res.status(400).json({ message: 'Mapel belum disetting untuk kelas & periode ini.' });
  }
  if (!students.length) {
    return res.status(400).json({ message: 'Tidak ada siswa aktif pada kelas ini.' });
  }

  const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
  const sheetName = wb.SheetNames[0];
  const rawRows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });
  const excelRows = rawRows.map(normalizeRowKeys);

  const byNis = new Map();
  const byName = new Map();
  students.forEach((student) => {
    const nisKey = String(student.nis_local || '').trim().toLowerCase();
    const nameKey = String(student.name || '').trim().toLowerCase();
    if (nisKey) byNis.set(nisKey, student);
    if (nameKey) byName.set(nameKey, student);
  });

  const subjectColumns = buildSubjectHeaderMap(subjects).map((subject) => ({
    subjectId: subject.subjectId,
    nilaiKey: subject.scoreKey,
    capaianKey: subject.cpKey
  }));

  const conn = await pool.getConnection();
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const warnings = [];
  const touchedStudentIds = new Set();

  try {
    await conn.beginTransaction();

    for (let rowIndex = 0; rowIndex < excelRows.length; rowIndex += 1) {
      const row = excelRows[rowIndex];
      const nisValue = pickFirstNonEmpty(row, ['nis', 'nis_local', 'nomor_induk']);
      const nameValue = pickFirstNonEmpty(row, ['nama_siswa', 'nama', 'student_name']);
      const nisKey = String(nisValue || '').trim().toLowerCase();
      const nameKey = String(nameValue || '').trim().toLowerCase();

      if (!nisKey && !nameKey) {
        skipped += 1;
        continue;
      }

      const student = (nisKey && byNis.get(nisKey)) || (nameKey && byName.get(nameKey));
      if (!student) {
        skipped += 1;
        warnings.push(`Baris ${rowIndex + 2}: siswa tidak ditemukan di kelas (${nisValue || nameValue || '-'})`);
        continue;
      }

      touchedStudentIds.add(student.id);
      for (const subjectColumn of subjectColumns) {
        const scoreRaw = row[subjectColumn.nilaiKey];
        const noteRaw = row[subjectColumn.capaianKey];
        const scoreValue = parseScoreValue(scoreRaw);
        const achievementNote = String(noteRaw || '').trim() || null;

        if (scoreValue === null && !achievementNote) continue;
        if (scoreValue !== null && (scoreValue < 0 || scoreValue > 100)) {
          warnings.push(`Baris ${rowIndex + 2}: nilai ${subjectColumn.nilaiKey} di luar rentang 0-100.`);
          continue;
        }

        const { operation } = await upsertScore({
          studentId: student.id,
          classId,
          subjectId: subjectColumn.subjectId,
          schoolYearId,
          semesterId,
          scoreValue,
          achievementNote
        }, conn);

        if (operation === 'insert') inserted += 1;
        if (operation === 'update') updated += 1;
      }
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    return res.status(400).json({ message: err.message || 'Gagal import nilai.' });
  } finally {
    conn.release();
  }

  return res.json({
    message: 'Import nilai berhasil diproses.',
    class_name: classItem.name,
    school_year_name: schoolYear.name,
    semester_name: semester.name,
    inserted,
    updated,
    skipped_rows: skipped,
    affected_students: touchedStudentIds.size,
    warnings: warnings.slice(0, 50)
  });
}

module.exports = {
  list,
  upsert,
  bulkUpsert,
  remove,
  downloadTemplate,
  importXlsx
};
