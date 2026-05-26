const pool = require('../db/pool');
const { writeChange } = require('../services/change-log.service');

function toInt(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

const PROMOTION_META_PREFIX = '__PROMOTION_META__';

function appendPromotionMeta(notes, meta) {
  const noteText = String(notes || '').trim();
  const metaText = `${PROMOTION_META_PREFIX}${JSON.stringify(meta)}`;
  return noteText ? `${noteText}\n${metaText}` : metaText;
}

function parsePromotionMeta(notes) {
  const text = String(notes || '');
  const idx = text.indexOf(PROMOTION_META_PREFIX);
  if (idx < 0) return null;
  try {
    const json = text.slice(idx + PROMOTION_META_PREFIX.length).trim();
    return JSON.parse(json);
  } catch (err) {
    return null;
  }
}

async function ensureActivePeriodOrThrow(schoolYearId, semesterId, conn) {
  if (!schoolYearId || !semesterId) {
    throw new Error('Tahun ajaran dan semester aktif wajib dipilih.');
  }
  const [[yearRows], [semesterRows]] = await Promise.all([
    conn.query('SELECT id, is_active FROM school_years WHERE id = ? LIMIT 1', [schoolYearId]),
    conn.query('SELECT id, is_active FROM semesters WHERE id = ? LIMIT 1', [semesterId])
  ]);
  const schoolYear = yearRows[0];
  const semester = semesterRows[0];
  if (!schoolYear) throw new Error('Tahun ajaran tidak ditemukan.');
  if (!semester) throw new Error('Semester tidak ditemukan.');
  if (Number(semester.is_active) !== 1) {
    throw new Error('Mutasi/kenaikan kelas hanya boleh dilakukan pada semester aktif.');
  }
}

async function listPromotionCandidates(req, res) {
  const classId = toInt(req.query.class_id);
  if (!classId) return res.status(400).json({ message: 'class_id wajib diisi.' });
  const [rows] = await pool.query(
    `SELECT s.id, s.name, s.nis_local, s.nisn,
            COALESCE(s.class_id, h.class_id) AS class_id,
            s.student_status, c.name AS class_name
     FROM students s
     LEFT JOIN (
       SELECT h1.student_id, h1.class_id
       FROM student_class_histories h1
       JOIN (
         SELECT student_id, MAX(id) AS max_id
         FROM student_class_histories
         GROUP BY student_id
       ) last_h ON last_h.max_id = h1.id
     ) h ON h.student_id = s.id
     LEFT JOIN classes c ON c.id = COALESCE(s.class_id, h.class_id)
     WHERE COALESCE(s.class_id, h.class_id) = ?
       AND LOWER(COALESCE(NULLIF(s.student_status, ''), 'aktif')) NOT IN ('lulus', 'keluar', 'pindah')
       AND COALESCE(s.is_active, 1) = 1
     ORDER BY s.name ASC`,
    [classId]
  );
  res.json(rows);
}

async function runPromotion(req, res) {
  const studentIds = Array.isArray(req.body.studentIds) ? req.body.studentIds.map((id) => toInt(id)).filter(Boolean) : [];
  const targetClassId = toInt(req.body.targetClassId);
  const targetStatusRaw = String(req.body.targetStatus || '').toLowerCase();
  const targetStatus = targetStatusRaw || 'aktif';
  const tahunLulus = toInt(req.body.tahunLulus);
  const schoolYearId = toInt(req.body.schoolYearId);
  const semesterId = toInt(req.body.semesterId);
  const notes = req.body.notes || null;

  if (!studentIds.length) return res.status(400).json({ message: 'Pilih minimal satu siswa.' });
  if (!targetClassId && targetStatus !== 'lulus') return res.status(400).json({ message: 'Kelas tujuan wajib dipilih.' });
  if (targetStatus === 'lulus' && !tahunLulus) return res.status(400).json({ message: 'Tahun lulus wajib diisi jika status lulus.' });
  if (targetStatus !== 'lulus' && targetClassId && studentIds.length && req.body.sourceClassId && Number(req.body.sourceClassId) === Number(targetClassId)) {
    return res.status(400).json({ message: 'Kelas asal dan kelas tujuan tidak boleh sama.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await ensureActivePeriodOrThrow(schoolYearId, semesterId, conn);

    const [students] = await conn.query(
      `SELECT id, class_id, student_status, school_year_id FROM students WHERE id IN (${studentIds.map(() => '?').join(',')}) FOR UPDATE`,
      studentIds
    );
    if (students.length !== studentIds.length) {
      throw new Error('Sebagian siswa tidak ditemukan.');
    }

    const [existingPeriodMutations] = await conn.query(
      `SELECT h.student_id, s.name AS student_name
       FROM student_class_histories h
       JOIN students s ON s.id = h.student_id
       WHERE h.student_id IN (${studentIds.map(() => '?').join(',')})
         AND h.school_year_id = ?
         AND h.semester_id = ?
         AND h.status IN ('naik','lulus')
       LIMIT 10`,
      [...studentIds, schoolYearId, semesterId]
    );
    if (existingPeriodMutations.length) {
      const names = existingPeriodMutations.map((row) => row.student_name).join(', ');
      throw new Error(`Sebagian siswa sudah diproses kenaikan/lulus pada periode ini: ${names}`);
    }

    const endDate = new Date().toISOString().slice(0, 10);
    const historyStatus = targetStatus === 'lulus' ? 'lulus' : 'naik';

    for (const student of students) {
      await conn.query(
        `UPDATE students
         SET class_id = ?, student_status = ?, school_year_id = ?, updated_at = NOW()
         WHERE id = ?`,
        [targetStatus === 'lulus' ? null : targetClassId, targetStatus, schoolYearId, student.id]
      );

      await conn.query(
        `INSERT INTO student_mutations
         (student_id, mutation_type, mutation_date, from_class_id, to_class_id, reason, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          student.id,
          targetStatus === 'lulus' ? 'keluar' : 'pindah',
          endDate,
          student.class_id || null,
          targetStatus === 'lulus' ? null : targetClassId,
          targetStatus === 'lulus' ? `Lulus ${tahunLulus}` : 'Kenaikan kelas',
          appendPromotionMeta(notes, {
            prev_class_id: student.class_id || null,
            prev_status: student.student_status || 'aktif',
            prev_school_year_id: student.school_year_id || null,
            next_class_id: targetStatus === 'lulus' ? null : targetClassId,
            next_status: targetStatus,
            period_school_year_id: schoolYearId,
            period_semester_id: semesterId
          })
        ]
      );

      await conn.query(
        `INSERT INTO student_class_histories
         (student_id, class_id, school_year_id, semester_id, start_date, end_date, status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          student.id,
          targetStatus === 'lulus' ? (student.class_id || null) : targetClassId,
          schoolYearId,
          semesterId,
          endDate,
          endDate,
          historyStatus,
          notes
        ]
      );
    }

    await conn.commit();
    res.json({ message: `${studentIds.length} siswa berhasil diproses.` });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ message: err.message || 'Gagal memproses kenaikan kelas.' });
  } finally {
    conn.release();
  }
}

async function rollbackLastPromotion(req, res) {
  const studentIds = Array.isArray(req.body.studentIds) ? req.body.studentIds.map((id) => toInt(id)).filter(Boolean) : [];
  if (!studentIds.length) return res.status(400).json({ message: 'Pilih minimal satu siswa.' });

  const conn = await pool.getConnection();
  const results = [];

  try {
    await conn.beginTransaction();

    for (const studentId of studentIds) {
      const [[studentRows]] = await Promise.all([
        conn.query('SELECT id, class_id, student_status, school_year_id FROM students WHERE id = ? LIMIT 1 FOR UPDATE', [studentId])
      ]);
      const student = studentRows[0];
      if (!student) {
        results.push({ student_id: studentId, status: 'skipped', reason: 'Siswa tidak ditemukan' });
        continue;
      }

      const [mutationRows] = await conn.query(
        'SELECT * FROM student_mutations WHERE student_id = ? ORDER BY id DESC LIMIT 1 FOR UPDATE',
        [studentId]
      );
      const mutation = mutationRows[0];
      if (!mutation) {
        results.push({ student_id: studentId, status: 'skipped', reason: 'Tidak ada mutasi untuk di-rollback' });
        continue;
      }

      const meta = parsePromotionMeta(mutation.notes);
      const isPromotionMutation = Boolean(meta) || mutation.reason === 'Kenaikan kelas' || String(mutation.reason || '').startsWith('Lulus ');
      if (!isPromotionMutation) {
        results.push({ student_id: studentId, status: 'skipped', reason: 'Mutasi terakhir bukan hasil proses kenaikan/lulus' });
        continue;
      }

      const restoredClassId = meta?.prev_class_id ?? mutation.from_class_id ?? null;
      const restoredStatus = String(meta?.prev_status || 'aktif');
      const restoredSchoolYearId = meta?.prev_school_year_id ?? student.school_year_id ?? null;

      await conn.query(
        `UPDATE students
         SET class_id = ?, student_status = ?, school_year_id = ?, updated_at = NOW()
         WHERE id = ?`,
        [restoredClassId, restoredStatus, restoredSchoolYearId, studentId]
      );

      const [historyRows] = await conn.query(
        `SELECT *
         FROM student_class_histories
         WHERE student_id = ?
         ORDER BY id DESC
         LIMIT 1`,
        [studentId]
      );
      const latestHistory = historyRows[0];
      if (latestHistory && ['naik', 'lulus'].includes(String(latestHistory.status || '').toLowerCase())) {
        await conn.query('DELETE FROM student_class_histories WHERE id = ?', [latestHistory.id]);
        await writeChange({ table: 'student_class_histories', recordId: latestHistory.id, operation: 'delete', data: latestHistory });
      }

      await conn.query('DELETE FROM student_mutations WHERE id = ?', [mutation.id]);
      await writeChange({ table: 'student_mutations', recordId: mutation.id, operation: 'delete', data: mutation });

      const [updatedRows] = await conn.query('SELECT * FROM students WHERE id = ?', [studentId]);
      await writeChange({ table: 'students', recordId: studentId, operation: 'update', data: updatedRows[0] });

      results.push({ student_id: studentId, status: 'rolled_back' });
    }

    await conn.commit();
    const rolledBackCount = results.filter((item) => item.status === 'rolled_back').length;
    return res.json({ message: `${rolledBackCount} siswa berhasil di-rollback.`, results });
  } catch (err) {
    await conn.rollback();
    return res.status(400).json({ message: err.message || 'Gagal rollback mutasi terakhir.' });
  } finally {
    conn.release();
  }
}

async function listMutations(req, res) {
  const studentId = toInt(req.query.student_id);
  const params = [];
  let where = '';
  if (studentId) {
    where = 'WHERE sm.student_id = ?';
    params.push(studentId);
  }
  const [rows] = await pool.query(
    `SELECT sm.*, s.name AS student_name,
            cfrom.name AS from_class_name, cto.name AS to_class_name
     FROM student_mutations sm
     JOIN students s ON s.id = sm.student_id
     LEFT JOIN classes cfrom ON cfrom.id = sm.from_class_id
     LEFT JOIN classes cto ON cto.id = sm.to_class_id
     ${where}
     ORDER BY sm.mutation_date DESC, sm.id DESC`,
    params
  );
  res.json(rows);
}

async function createMutation(req, res) {
  const {
    student_id,
    mutation_type,
    mutation_date,
    from_class_id,
    to_class_id,
    from_school,
    to_school,
    reason,
    notes
  } = req.body;
  if (!student_id || !mutation_type || !mutation_date) {
    return res.status(400).json({ message: 'student_id, mutation_type, mutation_date wajib diisi.' });
  }
  const [result] = await pool.query(
    `INSERT INTO student_mutations
     (student_id, mutation_type, mutation_date, from_class_id, to_class_id, from_school, to_school, reason, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      toInt(student_id),
      mutation_type,
      mutation_date,
      toInt(from_class_id),
      toInt(to_class_id),
      from_school || null,
      to_school || null,
      reason || null,
      notes || null
    ]
  );
  const [rows] = await pool.query('SELECT * FROM student_mutations WHERE id = ?', [result.insertId]);
  await writeChange({ table: 'student_mutations', recordId: result.insertId, operation: 'insert', data: rows[0] });
  res.status(201).json(rows[0]);
}

async function deleteMutation(req, res) {
  const [rows] = await pool.query('SELECT * FROM student_mutations WHERE id = ?', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ message: 'Mutation not found' });
  await pool.query('DELETE FROM student_mutations WHERE id = ?', [req.params.id]);
  await writeChange({ table: 'student_mutations', recordId: req.params.id, operation: 'delete', data: rows[0] });
  res.json({ message: 'Deleted' });
}

async function listClassHistories(req, res) {
  const studentId = toInt(req.query.student_id);
  const params = [];
  let where = '';
  if (studentId) {
    where = 'WHERE h.student_id = ?';
    params.push(studentId);
  }
  const [rows] = await pool.query(
    `SELECT h.*, s.name AS student_name, c.name AS class_name, sy.name AS school_year_name, sem.name AS semester_name,
            (
              SELECT cprev.name
              FROM student_class_histories hprev
              LEFT JOIN classes cprev ON cprev.id = hprev.class_id
              WHERE hprev.student_id = h.student_id
                AND (
                  hprev.start_date < h.start_date
                  OR (hprev.start_date = h.start_date AND hprev.id < h.id)
                )
              ORDER BY hprev.start_date DESC, hprev.id DESC
              LIMIT 1
            ) AS from_class_name
     FROM student_class_histories h
     JOIN students s ON s.id = h.student_id
     LEFT JOIN classes c ON c.id = h.class_id
     LEFT JOIN school_years sy ON sy.id = h.school_year_id
     LEFT JOIN semesters sem ON sem.id = h.semester_id
     ${where}
     ORDER BY h.start_date DESC, h.id DESC`,
    params
  );
  res.json(rows);
}

async function createClassHistory(req, res) {
  const {
    student_id,
    class_id,
    school_year_id,
    semester_id,
    start_date,
    end_date,
    status,
    notes
  } = req.body;
  if (!student_id || !class_id || !start_date) {
    return res.status(400).json({ message: 'student_id, class_id, start_date wajib diisi.' });
  }
  const [result] = await pool.query(
    `INSERT INTO student_class_histories
     (student_id, class_id, school_year_id, semester_id, start_date, end_date, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      toInt(student_id),
      toInt(class_id),
      toInt(school_year_id),
      toInt(semester_id),
      start_date,
      end_date || null,
      status || 'aktif',
      notes || null
    ]
  );
  const [rows] = await pool.query('SELECT * FROM student_class_histories WHERE id = ?', [result.insertId]);
  await writeChange({ table: 'student_class_histories', recordId: result.insertId, operation: 'insert', data: rows[0] });
  res.status(201).json(rows[0]);
}

async function deleteClassHistory(req, res) {
  const [rows] = await pool.query('SELECT * FROM student_class_histories WHERE id = ?', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ message: 'Class history not found' });
  await pool.query('DELETE FROM student_class_histories WHERE id = ?', [req.params.id]);
  await writeChange({ table: 'student_class_histories', recordId: req.params.id, operation: 'delete', data: rows[0] });
  res.json({ message: 'Deleted' });
}

async function listAchievements(req, res) {
  try {
    const studentId = toInt(req.query.student_id);
    const category = String(req.query.category || '').trim().toLowerCase();
    const params = [];
    const whereParts = [];
    if (studentId) {
      whereParts.push('a.student_id = ?');
      params.push(studentId);
    }
    if (category === 'akademik' || category === 'non_akademik') {
      whereParts.push('a.achievement_category = ?');
      params.push(category);
    }
    const where = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
    const [rows] = await pool.query(
      `SELECT a.*, s.name AS student_name
       FROM student_achievements a
       JOIN students s ON s.id = a.student_id
       ${where ? `${where} AND` : 'WHERE'}
       LOWER(COALESCE(NULLIF(s.student_status, ''), 'aktif')) = 'aktif'
       AND COALESCE(s.is_active, 1) = 1
       ORDER BY a.achievement_date DESC, a.id DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    if (err && err.code === 'ER_NO_SUCH_TABLE') {
      return res.status(500).json({
        message: 'Tabel student_achievements belum ada. Jalankan migration: migration_student_achievements.sql lalu migration_student_achievements_category.sql.'
      });
    }
    return res.status(500).json({ message: err.message || 'Gagal memuat data prestasi.' });
  }
}

async function createAchievement(req, res) {
  try {
    const {
      student_id,
      title,
      achievement_category,
      achievement_type,
      level_name,
      organizer,
      achievement_date,
      rank_value,
      notes,
      is_active
    } = req.body;
    if (!student_id || !title) {
      return res.status(400).json({ message: 'student_id dan title wajib diisi.' });
    }
    const [result] = await pool.query(
      `INSERT INTO student_achievements
       (student_id, title, achievement_category, achievement_type, level_name, organizer, achievement_date, rank_value, notes, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        toInt(student_id),
        title,
        (achievement_category === 'non_akademik' ? 'non_akademik' : 'akademik'),
        achievement_type || null,
        level_name || null,
        organizer || null,
        achievement_date || null,
        rank_value || null,
        notes || null,
        Number(is_active) === 0 ? 0 : 1
      ]
    );
    const [rows] = await pool.query('SELECT * FROM student_achievements WHERE id = ?', [result.insertId]);
    await writeChange({ table: 'student_achievements', recordId: result.insertId, operation: 'insert', data: rows[0] });
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err && err.code === 'ER_NO_SUCH_TABLE') {
      return res.status(500).json({
        message: 'Tabel student_achievements belum ada. Jalankan migration: migration_student_achievements.sql lalu migration_student_achievements_category.sql.'
      });
    }
    return res.status(500).json({ message: err.message || 'Gagal menyimpan prestasi.' });
  }
}

async function updateAchievement(req, res) {
  try {
    const [existingRows] = await pool.query('SELECT * FROM student_achievements WHERE id = ?', [req.params.id]);
    const existing = existingRows[0];
    if (!existing) return res.status(404).json({ message: 'Achievement not found' });
    const updated = {
      title: req.body.title ?? existing.title,
      achievement_category: req.body.achievement_category ?? existing.achievement_category,
      achievement_type: req.body.achievement_type ?? existing.achievement_type,
      level_name: req.body.level_name ?? existing.level_name,
      organizer: req.body.organizer ?? existing.organizer,
      achievement_date: req.body.achievement_date ?? existing.achievement_date,
      rank_value: req.body.rank_value ?? existing.rank_value,
      notes: req.body.notes ?? existing.notes,
      is_active: typeof req.body.is_active !== 'undefined' ? (Number(req.body.is_active) === 0 ? 0 : 1) : existing.is_active
    };

    if (!String(updated.title || '').trim()) {
      return res.status(400).json({ message: 'title wajib diisi.' });
    }

    await pool.query(
      `UPDATE student_achievements
       SET title = ?, achievement_category = ?, achievement_type = ?, level_name = ?, organizer = ?, achievement_date = ?, rank_value = ?, notes = ?, is_active = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        updated.title,
        (updated.achievement_category === 'non_akademik' ? 'non_akademik' : 'akademik'),
        updated.achievement_type,
        updated.level_name,
        updated.organizer,
        updated.achievement_date,
        updated.rank_value,
        updated.notes,
        updated.is_active,
        req.params.id
      ]
    );
    const [rows] = await pool.query('SELECT * FROM student_achievements WHERE id = ?', [req.params.id]);
    await writeChange({ table: 'student_achievements', recordId: req.params.id, operation: 'update', data: rows[0] });
    res.json(rows[0]);
  } catch (err) {
    if (err && err.code === 'ER_NO_SUCH_TABLE') {
      return res.status(500).json({
        message: 'Tabel student_achievements belum ada. Jalankan migration: migration_student_achievements.sql lalu migration_student_achievements_category.sql.'
      });
    }
    return res.status(500).json({ message: err.message || 'Gagal memperbarui prestasi.' });
  }
}

async function deleteAchievement(req, res) {
  try {
    const [rows] = await pool.query('SELECT * FROM student_achievements WHERE id = ?', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ message: 'Achievement not found' });
    await pool.query('DELETE FROM student_achievements WHERE id = ?', [req.params.id]);
    await writeChange({ table: 'student_achievements', recordId: req.params.id, operation: 'delete', data: rows[0] });
    res.json({ message: 'Deleted' });
  } catch (err) {
    if (err && err.code === 'ER_NO_SUCH_TABLE') {
      return res.status(500).json({
        message: 'Tabel student_achievements belum ada. Jalankan migration: migration_student_achievements.sql lalu migration_student_achievements_category.sql.'
      });
    }
    return res.status(500).json({ message: err.message || 'Gagal menghapus prestasi.' });
  }
}

async function listDocuments(req, res) {
  const ownerType = String(req.query.owner_type || 'all').toLowerCase();
  const ownerId = toInt(req.query.owner_id || req.query.student_id);
  const filters = [];
  if (ownerType === 'student' || ownerType === 'guru' || ownerType === 'teacher') {
    filters.push(`owner_type = '${ownerType === 'student' ? 'student' : 'teacher'}'`);
  }
  if (ownerId) {
    filters.push(`owner_id = ${Number(ownerId)}`);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  try {
    const [rows] = await pool.query(
      `SELECT * FROM (
        SELECT
          d.id,
          'student' AS owner_type,
          d.student_id AS owner_id,
          s.name AS owner_name,
          d.student_id,
          NULL AS teacher_id,
          d.document_type,
          d.file_number,
          d.file_url,
          d.issuer,
          d.issued_date,
          d.status,
          d.notes,
          d.created_at,
          d.updated_at
        FROM student_documents d
        JOIN students s ON s.id = d.student_id
        UNION ALL
        SELECT
          d.id,
          'teacher' AS owner_type,
          d.teacher_id AS owner_id,
          t.name AS owner_name,
          NULL AS student_id,
          d.teacher_id,
          d.document_type,
          d.file_number,
          d.file_url,
          d.issuer,
          d.issued_date,
          d.status,
          d.notes,
          d.created_at,
          d.updated_at
        FROM teacher_documents d
        JOIN teachers t ON t.id = d.teacher_id
      ) docs
      ${where}
      ORDER BY created_at DESC, id DESC`
    );
    return res.json(rows);
  } catch (err) {
    if (err && err.code === 'ER_NO_SUCH_TABLE') {
      const [fallbackRows] = await pool.query(
        `SELECT
          d.id,
          'student' AS owner_type,
          d.student_id AS owner_id,
          s.name AS owner_name,
          d.student_id,
          NULL AS teacher_id,
          d.document_type,
          d.file_number,
          d.file_url,
          d.issuer,
          d.issued_date,
          d.status,
          d.notes,
          d.created_at,
          d.updated_at
         FROM student_documents d
         JOIN students s ON s.id = d.student_id
         ORDER BY d.created_at DESC, d.id DESC`
      );
      return res.json(fallbackRows);
    }
    return res.status(500).json({ message: err.message || 'Gagal memuat dokumen.' });
  }
}

async function createDocument(req, res) {
  const {
    owner_type,
    owner_id,
    student_id,
    teacher_id,
    document_type,
    file_number,
    file_url,
    issuer,
    issued_date,
    status,
    notes
  } = req.body;
  const normalizedOwnerType = String(owner_type || '').toLowerCase();
  const isTeacher = normalizedOwnerType === 'teacher' || normalizedOwnerType === 'guru';
  const targetOwnerId = toInt(owner_id || (isTeacher ? teacher_id : student_id));
  if (!targetOwnerId || !document_type) {
    return res.status(400).json({ message: 'owner_id dan document_type wajib diisi.' });
  }

  try {
    if (isTeacher) {
      const [result] = await pool.query(
        `INSERT INTO teacher_documents
         (teacher_id, document_type, file_number, file_url, issuer, issued_date, status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          targetOwnerId,
          document_type,
          file_number || null,
          file_url || null,
          issuer || null,
          issued_date || null,
          status || 'valid',
          notes || null
        ]
      );
      const [rows] = await pool.query('SELECT * FROM teacher_documents WHERE id = ?', [result.insertId]);
      await writeChange({ table: 'teacher_documents', recordId: result.insertId, operation: 'insert', data: rows[0] });
      return res.status(201).json(rows[0]);
    }

    const [result] = await pool.query(
      `INSERT INTO student_documents
       (student_id, document_type, file_number, file_url, issuer, issued_date, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        targetOwnerId,
        document_type,
        file_number || null,
        file_url || null,
        issuer || null,
        issued_date || null,
        status || 'valid',
        notes || null
      ]
    );
    const [rows] = await pool.query('SELECT * FROM student_documents WHERE id = ?', [result.insertId]);
    await writeChange({ table: 'student_documents', recordId: result.insertId, operation: 'insert', data: rows[0] });
    return res.status(201).json(rows[0]);
  } catch (err) {
    if (err && err.code === 'ER_NO_SUCH_TABLE') {
      return res.status(500).json({ message: 'Tabel dokumen belum lengkap. Jalankan migration_teacher_documents.sql.' });
    }
    return res.status(500).json({ message: err.message || 'Gagal menambah dokumen.' });
  }
}

async function updateDocument(req, res) {
  const ownerType = String(req.body.owner_type || req.query.owner_type || 'student').toLowerCase();
  const isTeacher = ownerType === 'teacher' || ownerType === 'guru';
  const tableName = isTeacher ? 'teacher_documents' : 'student_documents';
  const ownerColumn = isTeacher ? 'teacher_id' : 'student_id';

  try {
    const [existingRows] = await pool.query(`SELECT * FROM ${tableName} WHERE id = ?`, [req.params.id]);
    const existing = existingRows[0];
    if (!existing) return res.status(404).json({ message: 'Document not found' });

    const updated = {
      owner_id: toInt(req.body.owner_id || existing[ownerColumn]),
      document_type: req.body.document_type ?? existing.document_type,
      file_number: req.body.file_number ?? existing.file_number,
      file_url: req.body.file_url ?? existing.file_url,
      issuer: req.body.issuer ?? existing.issuer,
      issued_date: req.body.issued_date ?? existing.issued_date,
      status: req.body.status ?? existing.status,
      notes: req.body.notes ?? existing.notes
    };

    await pool.query(
      `UPDATE ${tableName}
       SET ${ownerColumn} = ?, document_type = ?, file_number = ?, file_url = ?, issuer = ?, issued_date = ?, status = ?, notes = ?
       WHERE id = ?`,
      [
        updated.owner_id,
        updated.document_type,
        updated.file_number,
        updated.file_url,
        updated.issuer,
        updated.issued_date,
        updated.status,
        updated.notes,
        req.params.id
      ]
    );
    const [rows] = await pool.query(`SELECT * FROM ${tableName} WHERE id = ?`, [req.params.id]);
    await writeChange({ table: tableName, recordId: req.params.id, operation: 'update', data: rows[0] });
    return res.json(rows[0]);
  } catch (err) {
    if (err && err.code === 'ER_NO_SUCH_TABLE') {
      return res.status(500).json({ message: 'Tabel dokumen belum lengkap. Jalankan migration_teacher_documents.sql.' });
    }
    return res.status(500).json({ message: err.message || 'Gagal memperbarui dokumen.' });
  }
}

async function deleteDocument(req, res) {
  const ownerType = String(req.query.owner_type || 'student').toLowerCase();
  const isTeacher = ownerType === 'teacher' || ownerType === 'guru';
  const tableName = isTeacher ? 'teacher_documents' : 'student_documents';
  try {
    const [rows] = await pool.query(`SELECT * FROM ${tableName} WHERE id = ?`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ message: 'Document not found' });
    await pool.query(`DELETE FROM ${tableName} WHERE id = ?`, [req.params.id]);
    await writeChange({ table: tableName, recordId: req.params.id, operation: 'delete', data: rows[0] });
    return res.json({ message: 'Deleted' });
  } catch (err) {
    if (err && err.code === 'ER_NO_SUCH_TABLE') {
      return res.status(500).json({ message: 'Tabel dokumen belum lengkap. Jalankan migration_teacher_documents.sql.' });
    }
    return res.status(500).json({ message: err.message || 'Gagal menghapus dokumen.' });
  }
}

module.exports = {
  listPromotionCandidates,
  runPromotion,
  rollbackLastPromotion,
  listMutations,
  createMutation,
  deleteMutation,
  listClassHistories,
  createClassHistory,
  deleteClassHistory,
  listAchievements,
  createAchievement,
  updateAchievement,
  deleteAchievement,
  listDocuments,
  createDocument,
  updateDocument,
  deleteDocument
};
