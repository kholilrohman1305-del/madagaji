const pool = require('../db');
const masterPool = pool.master;

const TYPE_PENDAMPING = 'pendamping_kbm';
const TYPE_GURU_EKSTRA = 'guru_ekstra';
const RATE_KEYS = {
  [TYPE_PENDAMPING]: 'RATE_EXTRA_PENDAMPING',
  [TYPE_GURU_EKSTRA]: 'RATE_EXTRA_GURU'
};

let ensured = false;

async function addColumn(table, definition) {
  try {
    await pool.query(`ALTER TABLE ${table} ${definition}`);
  } catch (error) {
    if (!String(error.message).includes('Duplicate column')) throw error;
  }
}

async function ensureTables() {
  if (ensured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS extracurricular_journal_events (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      source_journal_id VARCHAR(100) NOT NULL,
      event_date DATE NOT NULL,
      extracurricular_id BIGINT NOT NULL,
      extracurricular_name VARCHAR(160) NOT NULL,
      extra_teacher_id BIGINT NULL,
      teacher_name VARCHAR(160) NOT NULL,
      teacher_type VARCHAR(30) NOT NULL DEFAULT 'guru_ekstra',
      attendance_status VARCHAR(20) NOT NULL DEFAULT 'Hadir',
      rate_snapshot DECIMAL(15,2) NOT NULL DEFAULT 0.00,
      start_time TIME NULL,
      end_time TIME NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_extra_source_teacher (source_journal_id, teacher_type),
      INDEX idx_extra_event_period (event_date, extracurricular_id, extra_teacher_id, teacher_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await addColumn('extracurricular_journal_events', "ADD COLUMN teacher_type VARCHAR(30) NOT NULL DEFAULT 'guru_ekstra'");
  await addColumn('extracurricular_journal_events', "ADD COLUMN attendance_status VARCHAR(20) NOT NULL DEFAULT 'Hadir'");
  await addColumn('extracurricular_journal_events', 'ADD COLUMN rate_snapshot DECIMAL(15,2) NOT NULL DEFAULT 0.00');
  try { await pool.query('ALTER TABLE extracurricular_journal_events DROP INDEX uq_extra_source_journal'); } catch (_) {}
  try {
    await pool.query(`
      ALTER TABLE extracurricular_journal_events
      ADD UNIQUE KEY uq_extra_source_teacher (source_journal_id, teacher_type)
    `);
  } catch (_) {}

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pengeluaran_ekstrakurikuler (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      tanggal DATE NOT NULL,
      teacher_id BIGINT NOT NULL,
      teacher_name VARCHAR(120) NOT NULL,
      nama_ekstra VARCHAR(120) NOT NULL,
      jumlah_hadir INT NOT NULL DEFAULT 0,
      nominal DECIMAL(15,2) NOT NULL DEFAULT 0.00,
      keterangan TEXT NULL,
      expense_id VARCHAR(50) NULL,
      source_extra_id BIGINT NULL,
      source_extra_teacher_id BIGINT NULL,
      teacher_type VARCHAR(30) NULL,
      attendance_manual TINYINT(1) NOT NULL DEFAULT 0,
      source_synced TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await addColumn('pengeluaran_ekstrakurikuler', 'ADD COLUMN source_extra_id BIGINT NULL');
  await addColumn('pengeluaran_ekstrakurikuler', 'ADD COLUMN source_extra_teacher_id BIGINT NULL');
  await addColumn('pengeluaran_ekstrakurikuler', 'ADD COLUMN teacher_type VARCHAR(30) NULL');
  await addColumn('pengeluaran_ekstrakurikuler', 'ADD COLUMN attendance_manual TINYINT(1) NOT NULL DEFAULT 0');
  await addColumn('pengeluaran_ekstrakurikuler', 'ADD COLUMN source_synced TINYINT(1) NOT NULL DEFAULT 0');
  try { await pool.query('ALTER TABLE pengeluaran_ekstrakurikuler DROP INDEX uq_extra_synced_month'); } catch (_) {}
  try {
    await pool.query(`
      ALTER TABLE pengeluaran_ekstrakurikuler
      ADD UNIQUE KEY uq_extra_synced_month_type
        (tanggal, source_extra_id, source_extra_teacher_id, teacher_type, source_synced)
    `);
  } catch (_) {}
  ensured = true;
}

function monthStart(date) {
  if (date instanceof Date && !Number.isNaN(date.getTime())) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
  }
  return `${String(date).slice(0, 7)}-01`;
}

function normalizeType(value) {
  return value === TYPE_PENDAMPING ? TYPE_PENDAMPING : TYPE_GURU_EKSTRA;
}

function syntheticTeacherId(sourceTeacherId, extracurricularId, teacherType) {
  const source = Number(sourceTeacherId) || Number(extracurricularId) || 0;
  return teacherType === TYPE_PENDAMPING ? source : -(1000000000 + source);
}

async function getRates(conn = pool) {
  const [rows] = await conn.query(
    `SELECT config_key, config_value FROM konfigurasi WHERE config_key IN (?, ?)`,
    [RATE_KEYS[TYPE_PENDAMPING], RATE_KEYS[TYPE_GURU_EKSTRA]]
  );
  const map = new Map(rows.map((row) => [row.config_key, Number(row.config_value) || 0]));
  return {
    [TYPE_PENDAMPING]: map.get(RATE_KEYS[TYPE_PENDAMPING]) || 0,
    [TYPE_GURU_EKSTRA]: map.get(RATE_KEYS[TYPE_GURU_EKSTRA]) || 0
  };
}

async function resolveCanonicalTeacherName(teacherType, sourceTeacherId, incomingName) {
  const id = Number(sourceTeacherId);
  if (!id) return incomingName;
  const table = teacherType === TYPE_PENDAMPING ? 'teachers' : 'extra_teachers';
  try {
    const [rows] = await masterPool.query(
      `SELECT name FROM ${table} WHERE id = ? LIMIT 1`,
      [id]
    );
    return String(rows[0]?.name || '').trim() || incomingName;
  } catch {
    return incomingName;
  }
}

async function recalculateMonth(conn, event) {
  if (!event?.event_date || !event?.extracurricular_id || !event?.teacher_type) return;
  const start = monthStart(event.event_date);
  const sourceTeacherId = Number(event.extra_teacher_id) || 0;
  const teacherType = normalizeType(event.teacher_type);
  const [[totals]] = await conn.query(`
    SELECT COUNT(*) AS total, COALESCE(SUM(rate_snapshot), 0) AS total_honor
    FROM extracurricular_journal_events
    WHERE event_date BETWEEN ? AND LAST_DAY(?)
      AND extracurricular_id = ?
      AND COALESCE(extra_teacher_id, 0) = ?
      AND teacher_type = ?
      AND attendance_status = 'Hadir'
  `, [start, start, event.extracurricular_id, sourceTeacherId, teacherType]);
  const total = Number(totals.total || 0);
  const totalHonor = Number(totals.total_honor || 0);

  const [existingRows] = await conn.query(`
    SELECT id, attendance_manual FROM pengeluaran_ekstrakurikuler
    WHERE tanggal = ? AND source_extra_id = ?
      AND teacher_type = ? AND source_synced = 1
      AND (
        COALESCE(source_extra_teacher_id, 0) = ?
        OR LOWER(TRIM(teacher_name)) = LOWER(TRIM(?))
      )
    ORDER BY (COALESCE(source_extra_teacher_id, 0) = ?) DESC, id ASC
    LIMIT 1
  `, [
    start, event.extracurricular_id, teacherType,
    sourceTeacherId, event.teacher_name, sourceTeacherId
  ]);
  const nominal = total > 0 ? totalHonor / total : Number((await getRates(conn))[teacherType] || 0);
  if (existingRows[0]) {
    if (Number(existingRows[0].attendance_manual) === 1) {
      await conn.query(`
        UPDATE pengeluaran_ekstrakurikuler
        SET teacher_id = ?, teacher_name = ?, nama_ekstra = ?, source_extra_teacher_id = ?
        WHERE id = ?
      `, [
        syntheticTeacherId(sourceTeacherId, event.extracurricular_id, teacherType),
        event.teacher_name, event.extracurricular_name, sourceTeacherId, existingRows[0].id
      ]);
    } else {
      await conn.query(`
        UPDATE pengeluaran_ekstrakurikuler
        SET teacher_id = ?, teacher_name = ?, nama_ekstra = ?, jumlah_hadir = ?,
            nominal = ?, source_extra_teacher_id = ?
        WHERE id = ?
      `, [
        syntheticTeacherId(sourceTeacherId, event.extracurricular_id, teacherType),
        event.teacher_name, event.extracurricular_name, total, nominal,
        sourceTeacherId, existingRows[0].id
      ]);
    }
    return;
  }
  await conn.query(`
    INSERT INTO pengeluaran_ekstrakurikuler
      (tanggal, teacher_id, teacher_name, nama_ekstra, jumlah_hadir, nominal,
       keterangan, source_extra_id, source_extra_teacher_id, teacher_type, source_synced)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `, [
    start,
    syntheticTeacherId(sourceTeacherId, event.extracurricular_id, teacherType),
    event.teacher_name,
    event.extracurricular_name,
    total,
    nominal,
    'Jumlah hadir otomatis dari jurnal ekstrakurikuler eMada',
    event.extracurricular_id,
    sourceTeacherId,
    teacherType
  ]);
}

async function syncJournal(payload) {
  await ensureTables();
  const sourceJournalId = String(payload?.source_journal_id || '').trim();
  const action = String(payload?.action || 'upsert').toLowerCase();
  if (!sourceJournalId) throw new Error('source_journal_id wajib diisi.');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [beforeRows] = await conn.query(
      'SELECT * FROM extracurricular_journal_events WHERE source_journal_id = ? FOR UPDATE',
      [sourceJournalId]
    );
    if (action === 'delete') {
      await conn.query('DELETE FROM extracurricular_journal_events WHERE source_journal_id = ?', [sourceJournalId]);
      for (const before of beforeRows) await recalculateMonth(conn, before);
      await conn.commit();
      return { success: true, action: 'delete', matched: beforeRows.length > 0, message: 'Jurnal ekstra dihapus dari perhitungan.' };
    }

    const rawTeachers = Array.isArray(payload.teachers) && payload.teachers.length
      ? payload.teachers
      : [{
          teacher_type: TYPE_GURU_EKSTRA,
          source_teacher_id: payload.extra_teacher_id,
          teacher_name: payload.teacher_name,
          status: 'Hadir'
        }];
    const eventBase = {
      source_journal_id: sourceJournalId,
      event_date: String(payload.tanggal || '').slice(0, 10),
      extracurricular_id: Number(payload.extracurricular_id),
      extracurricular_name: String(payload.extracurricular_name || '').trim(),
      start_time: payload.start_time || null,
      end_time: payload.end_time || null
    };
    if (!eventBase.event_date || !eventBase.extracurricular_id || !eventBase.extracurricular_name) {
      throw new Error('Data jurnal ekstrakurikuler tidak lengkap.');
    }
    const rates = await getRates(conn);
    const incomingTypes = [];
    for (const rawTeacher of rawTeachers) {
      const teacherType = normalizeType(rawTeacher.teacher_type);
      const incomingTeacherName = String(rawTeacher.teacher_name || '').trim();
      const teacherName = await resolveCanonicalTeacherName(
        teacherType,
        rawTeacher.source_teacher_id,
        incomingTeacherName
      );
      if (!teacherName) throw new Error('Nama pengajar ekstrakurikuler tidak lengkap.');
      incomingTypes.push(teacherType);
      const before = beforeRows.find((row) => row.teacher_type === teacherType);
      const event = {
        ...eventBase,
        extra_teacher_id: Number(rawTeacher.source_teacher_id) || null,
        teacher_name: teacherName,
        teacher_type: teacherType,
        attendance_status: rawTeacher.status === 'Hadir' ? 'Hadir' : 'Tidak Hadir',
        rate_snapshot: before ? Number(before.rate_snapshot || 0) : Number(rates[teacherType] || 0)
      };
      await conn.query(`
        INSERT INTO extracurricular_journal_events
          (source_journal_id, event_date, extracurricular_id, extracurricular_name,
           extra_teacher_id, teacher_name, teacher_type, attendance_status, rate_snapshot,
           start_time, end_time)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          event_date = VALUES(event_date), extracurricular_id = VALUES(extracurricular_id),
          extracurricular_name = VALUES(extracurricular_name), extra_teacher_id = VALUES(extra_teacher_id),
          teacher_name = VALUES(teacher_name), attendance_status = VALUES(attendance_status),
          start_time = VALUES(start_time), end_time = VALUES(end_time), updated_at = NOW()
      `, [
        event.source_journal_id, event.event_date, event.extracurricular_id,
        event.extracurricular_name, event.extra_teacher_id, event.teacher_name,
        event.teacher_type, event.attendance_status, event.rate_snapshot,
        event.start_time, event.end_time
      ]);
      if (before && (
        monthStart(before.event_date) !== monthStart(event.event_date)
        || Number(before.extracurricular_id) !== event.extracurricular_id
        || Number(before.extra_teacher_id || 0) !== Number(event.extra_teacher_id || 0)
      )) {
        await recalculateMonth(conn, before);
      }
      await recalculateMonth(conn, event);
    }
    const removed = beforeRows.filter((row) => !incomingTypes.includes(row.teacher_type));
    for (const oldEvent of removed) {
      await conn.query('DELETE FROM extracurricular_journal_events WHERE id = ?', [oldEvent.id]);
      await recalculateMonth(conn, oldEvent);
    }
    await conn.commit();
    return { success: true, action: 'upsert', teachers: rawTeachers.length, message: 'Jurnal ekstra dan honor kedua pengajar tersinkron.' };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

async function getMatrix(period) {
  await ensureTables();
  const normalizedPeriod = /^\d{4}-\d{2}$/.test(String(period || ''))
    ? String(period)
    : new Date().toISOString().slice(0, 7);
  const [masterRows] = await masterPool.query(`
    SELECT e.id, e.name, e.implementation_day, e.start_time, e.end_time,
           e.pembina_teacher_id, t.name AS pendamping_name,
           e.pembina_extra_teacher_id, et.name AS extra_teacher_name
    FROM extracurriculars e
    LEFT JOIN teachers t ON t.id = e.pembina_teacher_id
    LEFT JOIN extra_teachers et ON et.id = e.pembina_extra_teacher_id
    WHERE e.is_active = 1
    ORDER BY e.implementation_day, e.start_time, e.name
  `);
  const [realizations] = await pool.query(`
    SELECT extracurricular_id, COUNT(DISTINCT source_journal_id) AS meetings,
           GROUP_CONCAT(DISTINCT DATE_FORMAT(event_date, '%d') ORDER BY event_date SEPARATOR ', ') AS dates
    FROM extracurricular_journal_events
    WHERE event_date BETWEEN ? AND LAST_DAY(?)
    GROUP BY extracurricular_id
  `, [`${normalizedPeriod}-01`, `${normalizedPeriod}-01`]);
  const realizationMap = new Map(realizations.map((row) => [String(row.extracurricular_id), row]));
  return {
    period: normalizedPeriod,
    data: masterRows.map((row) => {
      const realized = realizationMap.get(String(row.id)) || {};
      const teachers = [
        row.pembina_teacher_id ? { type: TYPE_PENDAMPING, label: 'Pendamping Ekstra', name: row.pendamping_name } : null,
        row.pembina_extra_teacher_id ? { type: TYPE_GURU_EKSTRA, label: 'Guru Ekstra', name: row.extra_teacher_name } : null
      ].filter(Boolean);
      return {
        extracurricularId: String(row.id),
        name: row.name,
        teachers,
        teacherName: teachers.map((teacher) => `${teacher.name} (${teacher.label})`).join(' & ') || '-',
        day: row.implementation_day || '-',
        startTime: row.start_time ? String(row.start_time).slice(0, 5) : '',
        endTime: row.end_time ? String(row.end_time).slice(0, 5) : '',
        meetings: Number(realized.meetings || 0),
        dates: realized.dates || ''
      };
    })
  };
}

module.exports = {
  TYPE_PENDAMPING,
  TYPE_GURU_EKSTRA,
  ensureTables,
  getRates,
  syncJournal,
  getMatrix
};
