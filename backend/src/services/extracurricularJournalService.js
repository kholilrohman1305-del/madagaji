const pool = require('../db');
const masterPool = pool.master;

let ensured = false;

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
      start_time TIME NULL,
      end_time TIME NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_extra_source_journal (source_journal_id),
      INDEX idx_extra_event_period (event_date, extracurricular_id, extra_teacher_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
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
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  for (const definition of [
    'ADD COLUMN source_extra_id BIGINT NULL',
    'ADD COLUMN source_extra_teacher_id BIGINT NULL',
    'ADD COLUMN source_synced TINYINT(1) NOT NULL DEFAULT 0'
  ]) {
    try {
      await pool.query(`ALTER TABLE pengeluaran_ekstrakurikuler ${definition}`);
    } catch (error) {
      if (!String(error.message).includes('Duplicate column')) throw error;
    }
  }
  try {
    await pool.query(`
      ALTER TABLE pengeluaran_ekstrakurikuler
      ADD UNIQUE KEY uq_extra_synced_month
        (tanggal, source_extra_id, source_extra_teacher_id, source_synced)
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

function syntheticTeacherId(extraTeacherId, extracurricularId) {
  if (Number(extraTeacherId) > 0) return -Number(extraTeacherId);
  return -(1000000000 + Number(extracurricularId || 0));
}

async function recalculateMonth(conn, event) {
  if (!event?.event_date || !event?.extracurricular_id) return;
  const start = monthStart(event.event_date);
  const extraTeacherId = Number(event.extra_teacher_id) || 0;
  const [[countRow]] = await conn.query(`
    SELECT COUNT(*) AS total
    FROM extracurricular_journal_events
    WHERE event_date BETWEEN ? AND LAST_DAY(?)
      AND extracurricular_id = ?
      AND COALESCE(extra_teacher_id, 0) = ?
  `, [start, start, event.extracurricular_id, extraTeacherId]);

  const [existingRows] = await conn.query(`
    SELECT id FROM pengeluaran_ekstrakurikuler
    WHERE tanggal = ?
      AND source_extra_id = ?
      AND COALESCE(source_extra_teacher_id, 0) = ?
      AND source_synced = 1
    LIMIT 1
  `, [start, event.extracurricular_id, extraTeacherId]);
  if (existingRows[0]) {
    await conn.query(`
      UPDATE pengeluaran_ekstrakurikuler
      SET teacher_name = ?, nama_ekstra = ?, jumlah_hadir = ?
      WHERE id = ?
    `, [event.teacher_name, event.extracurricular_name, Number(countRow.total), existingRows[0].id]);
    return;
  }

  const [rateRows] = await conn.query(`
    SELECT nominal FROM pengeluaran_ekstrakurikuler
    WHERE source_extra_id = ?
      AND COALESCE(source_extra_teacher_id, 0) = ?
    ORDER BY tanggal DESC, id DESC LIMIT 1
  `, [event.extracurricular_id, extraTeacherId]);
  await conn.query(`
    INSERT INTO pengeluaran_ekstrakurikuler
      (tanggal, teacher_id, teacher_name, nama_ekstra, jumlah_hadir, nominal,
       keterangan, source_extra_id, source_extra_teacher_id, source_synced)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `, [
    start,
    syntheticTeacherId(extraTeacherId, event.extracurricular_id),
    event.teacher_name,
    event.extracurricular_name,
    Number(countRow.total),
    Number(rateRows[0]?.nominal || 0),
    'Jumlah pertemuan otomatis dari jurnal ekstrakurikuler eMada',
    event.extracurricular_id,
    extraTeacherId
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
      'SELECT * FROM extracurricular_journal_events WHERE source_journal_id = ? LIMIT 1 FOR UPDATE',
      [sourceJournalId]
    );
    const before = beforeRows[0];
    if (action === 'delete') {
      if (before) {
        await conn.query('DELETE FROM extracurricular_journal_events WHERE id = ?', [before.id]);
        await recalculateMonth(conn, before);
      }
      await conn.commit();
      return { success: true, action: 'delete', matched: Boolean(before), message: 'Jurnal ekstra dihapus dari perhitungan.' };
    }

    const event = {
      source_journal_id: sourceJournalId,
      event_date: String(payload.tanggal || '').slice(0, 10),
      extracurricular_id: Number(payload.extracurricular_id),
      extracurricular_name: String(payload.extracurricular_name || '').trim(),
      extra_teacher_id: Number(payload.extra_teacher_id) || null,
      teacher_name: String(payload.teacher_name || '').trim(),
      start_time: payload.start_time || null,
      end_time: payload.end_time || null
    };
    if (!event.event_date || !event.extracurricular_id || !event.extracurricular_name || !event.teacher_name) {
      throw new Error('Data jurnal ekstrakurikuler tidak lengkap.');
    }
    await conn.query(`
      INSERT INTO extracurricular_journal_events
        (source_journal_id, event_date, extracurricular_id, extracurricular_name,
         extra_teacher_id, teacher_name, start_time, end_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        event_date = VALUES(event_date),
        extracurricular_id = VALUES(extracurricular_id),
        extracurricular_name = VALUES(extracurricular_name),
        extra_teacher_id = VALUES(extra_teacher_id),
        teacher_name = VALUES(teacher_name),
        start_time = VALUES(start_time),
        end_time = VALUES(end_time),
        updated_at = NOW()
    `, Object.values(event));
    if (before && (
      monthStart(before.event_date) !== monthStart(event.event_date)
      || Number(before.extracurricular_id) !== event.extracurricular_id
      || Number(before.extra_teacher_id || 0) !== Number(event.extra_teacher_id || 0)
    )) {
      await recalculateMonth(conn, before);
    }
    await recalculateMonth(conn, event);
    await conn.commit();
    return { success: true, action: 'upsert', message: 'Jurnal ekstra tersinkron dan honor diperbarui.' };
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
           e.pembina_extra_teacher_id,
           COALESCE(et.name, t.name) AS teacher_name
    FROM extracurriculars e
    LEFT JOIN extra_teachers et ON et.id = e.pembina_extra_teacher_id
    LEFT JOIN teachers t ON t.id = e.pembina_teacher_id
    WHERE e.is_active = 1
    ORDER BY e.implementation_day, e.start_time, e.name
  `);
  const [realizations] = await pool.query(`
    SELECT extracurricular_id, COALESCE(extra_teacher_id, 0) AS extra_teacher_id,
           COUNT(*) AS meetings,
           GROUP_CONCAT(DATE_FORMAT(event_date, '%d') ORDER BY event_date SEPARATOR ', ') AS dates
    FROM extracurricular_journal_events
    WHERE event_date BETWEEN ? AND LAST_DAY(?)
    GROUP BY extracurricular_id, COALESCE(extra_teacher_id, 0)
  `, [`${normalizedPeriod}-01`, `${normalizedPeriod}-01`]);
  const realizationMap = new Map(realizations.map((row) => [
    `${row.extracurricular_id}|${row.extra_teacher_id}`,
    row
  ]));
  return {
    period: normalizedPeriod,
    data: masterRows.map((row) => {
      const realized = realizationMap.get(`${row.id}|${Number(row.pembina_extra_teacher_id || 0)}`) || {};
      return {
        extracurricularId: String(row.id),
        name: row.name,
        teacherId: row.pembina_extra_teacher_id ? String(row.pembina_extra_teacher_id) : '',
        teacherName: row.teacher_name || '-',
        day: row.implementation_day || '-',
        startTime: row.start_time ? String(row.start_time).slice(0, 5) : '',
        endTime: row.end_time ? String(row.end_time).slice(0, 5) : '',
        meetings: Number(realized.meetings || 0),
        dates: realized.dates || ''
      };
    })
  };
}

module.exports = { syncJournal, getMatrix };
