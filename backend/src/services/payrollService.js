const pool = require('../db');
const masterPool = pool.master;
const { monthKey } = require('../utils/date');
const { TTLCache } = require('../utils/cache');
const extracurricularJournals = require('./extracurricularJournalService');

const configCache = new TTLCache(30000);
let expenseIdModeCache = null; // 'auto' | 'string'
let manualActivityTableReady = false;
let payrollSnapshotTablesReady = false;

function normalizePayrollPeriod(value) {
  const period = String(value || '').trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
    const error = new Error('Periode wajib berformat YYYY-MM.');
    error.status = 400;
    throw error;
  }
  return period;
}

function payrollPeriodRange(periodValue) {
  const period = normalizePayrollPeriod(periodValue);
  const [year, month] = period.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return {
    period,
    startDate: `${period}-01`,
    endDate: `${period}-${String(lastDay).padStart(2, '0')}`
  };
}

async function ensurePayrollSnapshotTables() {
  if (payrollSnapshotTablesReady) return;
  await pool.query(
    `CREATE TABLE IF NOT EXISTS payroll_periods (
      period CHAR(7) PRIMARY KEY,
      status VARCHAR(20) NOT NULL DEFAULT 'generated',
      generated_at DATETIME NULL,
      generated_by VARCHAR(100) NULL,
      locked_at DATETIME NULL,
      locked_by VARCHAR(100) NULL,
      unlocked_at DATETIME NULL,
      unlocked_by VARCHAR(100) NULL,
      unlock_reason VARCHAR(500) NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_payroll_period_status (status)
    )`
  );
  for (const definition of [
    'ADD COLUMN unlocked_at DATETIME NULL',
    'ADD COLUMN unlocked_by VARCHAR(100) NULL',
    'ADD COLUMN unlock_reason VARCHAR(500) NULL'
  ]) {
    try {
      await pool.query(`ALTER TABLE payroll_periods ${definition}`);
    } catch (error) {
      if (error.code !== 'ER_DUP_FIELDNAME') throw error;
    }
  }
  await pool.query(
    `CREATE TABLE IF NOT EXISTS payroll_snapshots (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      period CHAR(7) NOT NULL,
      guru_id VARCHAR(32) NOT NULL,
      teacher_name VARCHAR(255) NOT NULL,
      total DECIMAL(18,2) NOT NULL DEFAULT 0,
      payload_json LONGTEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_payroll_snapshot_teacher (period, guru_id),
      INDEX idx_payroll_snapshot_period (period),
      CONSTRAINT fk_payroll_snapshot_period
        FOREIGN KEY (period) REFERENCES payroll_periods(period)
        ON DELETE CASCADE ON UPDATE CASCADE
    )`
  );
  payrollSnapshotTablesReady = true;
}

function payrollActorName(actor) {
  return String(actor?.display_name || actor?.username || actor?.id || 'admin').trim().slice(0, 100);
}

async function ensureManualActivityTable() {
  if (manualActivityTableReady) return;
  await pool.query(
    `CREATE TABLE IF NOT EXISTS kegiatan_manual (
      id INT AUTO_INCREMENT PRIMARY KEY,
      guru_id VARCHAR(10) NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      jumlah INT NOT NULL DEFAULT 0,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_kegiatan_manual_period (guru_id, start_date, end_date),
      INDEX idx_kegiatan_manual_period (start_date, end_date)
    )`
  );
  manualActivityTableReady = true;
}

async function getExpenseIdMode() {
  if (expenseIdModeCache) return expenseIdModeCache;
  const [rows] = await pool.query(
    `SELECT DATA_TYPE AS dataType, EXTRA AS extraInfo
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'pengeluaran_lain'
       AND COLUMN_NAME = 'id'
     LIMIT 1`
  );
  const row = rows[0];
  if (!row) {
    expenseIdModeCache = 'string';
    return expenseIdModeCache;
  }
  const dataType = String(row.dataType || '').toLowerCase();
  const extraInfo = String(row.extraInfo || '').toLowerCase();
  expenseIdModeCache = (extraInfo.includes('auto_increment') || ['int', 'bigint', 'smallint', 'tinyint', 'mediumint'].includes(dataType))
    ? 'auto'
    : 'string';
  return expenseIdModeCache;
}

function nextExpenseCode(lastId) {
  const match = String(lastId || '').match(/(\d+)/);
  const seq = match ? parseInt(match[1], 10) + 1 : 1;
  return `P${String(seq).padStart(3, '0')}`;
}

async function clonePrevMonthExpensesTo(startDate, rows) {
  if (!rows.length) return;
  const idMode = await getExpenseIdMode();

  if (idMode === 'auto') {
    const values = rows.map((r) => [
      startDate,
      r.kategori,
      r.penerima || '',
      r.jumlah || 1,
      r.nominal || 0,
      r.keterangan || ''
    ]);
    await pool.query(
      `INSERT INTO pengeluaran_lain (tanggal, kategori, penerima, jumlah, nominal, keterangan)
       VALUES ?`,
      [values]
    );
    return;
  }

  const [lastRows] = await pool.query('SELECT id FROM pengeluaran_lain ORDER BY id DESC LIMIT 1');
  let currentId = lastRows[0]?.id || 'P000';
  const values = rows.map((r) => {
    currentId = nextExpenseCode(currentId);
    return [
      currentId,
      startDate,
      r.kategori,
      r.penerima || '',
      r.jumlah || 1,
      r.nominal || 0,
      r.keterangan || ''
    ];
  });
  await pool.query(
    `INSERT INTO pengeluaran_lain (id, tanggal, kategori, penerima, jumlah, nominal, keterangan)
     VALUES ?`,
    [values]
  );
}

function expenseKey(row) {
  return [
    String(row.kategori || '').trim().toLowerCase(),
    String(row.penerima || '').trim().toLowerCase(),
    Number(row.jumlah || 1),
    Number(row.nominal || 0),
    String(row.keterangan || '').trim().toLowerCase()
  ].join('|');
}

async function ensureRecurringExpensesForMonth(monthStartDate) {
  const monthStart = String(monthStartDate).slice(0, 10);
  const [prevMonthStartRows] = await pool.query(
    `SELECT DATE_FORMAT(DATE_SUB(?, INTERVAL 1 MONTH), '%Y-%m-01') AS prev_month_start`,
    [monthStart]
  );
  const prevMonthStart = prevMonthStartRows[0]?.prev_month_start;
  if (!prevMonthStart) return;

  const [prevRows] = await pool.query(
    `SELECT kategori, penerima, jumlah, nominal, keterangan
     FROM pengeluaran_lain
     WHERE tanggal BETWEEN ? AND LAST_DAY(?)`,
    [prevMonthStart, prevMonthStart]
  );
  if (!prevRows.length) return;

  const [currentRows] = await pool.query(
    `SELECT kategori, penerima, jumlah, nominal, keterangan
     FROM pengeluaran_lain
     WHERE tanggal BETWEEN ? AND LAST_DAY(?)`,
    [monthStart, monthStart]
  );

  const currentKeys = new Set(currentRows.map(expenseKey));
  const missingRows = prevRows.filter((row) => !currentKeys.has(expenseKey(row)));
  if (!missingRows.length) return;

  await clonePrevMonthExpensesTo(monthStart, missingRows);
}

async function getOtherExpenses(startDate, endDate) {
  const [finalRows] = await pool.query(
    `SELECT id, tanggal, kategori, penerima, jumlah, nominal, keterangan
     FROM pengeluaran_lain
     WHERE tanggal BETWEEN ? AND ?
     ORDER BY tanggal`,
    [startDate, endDate]
  );
  return finalRows.map(r => ({
    rowId: r.id,
    id: r.id,
    tanggal: r.tanggal,
    kategori: r.kategori,
    penerima: r.penerima,
    jumlah: parseInt(r.jumlah) || 1,
    nominal: parseFloat(r.nominal) || 0,
    totalNominal: (parseInt(r.jumlah) || 1) * (parseFloat(r.nominal) || 0),
    keterangan: r.keterangan
  }));
}

async function getActivities(startDate, endDate) {
  const [rows] = await pool.query(
    `SELECT k.id, k.tanggal, k.nama, GROUP_CONCAT(kg.guru_id ORDER BY kg.guru_id) AS guru_ids
     FROM kegiatan k
     LEFT JOIN kegiatan_guru kg ON kg.kegiatan_id = k.id
     WHERE k.tanggal BETWEEN ? AND ?
     GROUP BY k.id, k.tanggal, k.nama
     ORDER BY k.tanggal DESC, k.id DESC`,
    [startDate, endDate]
  );
  return rows.map(r => ({
    id: r.id,
    tanggal: r.tanggal,
    nama: r.nama,
    guruIds: r.guru_ids ? r.guru_ids.split(',') : []
  }));
}

async function addActivity({ tanggal, nama, guruIds }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [res] = await conn.query('INSERT INTO kegiatan (tanggal, nama) VALUES (?, ?)', [tanggal, nama]);
    const kegiatanId = res.insertId;
    if (Array.isArray(guruIds) && guruIds.length > 0) {
      const values = guruIds.map(id => [kegiatanId, id]);
      await conn.query('INSERT INTO kegiatan_guru (kegiatan_id, guru_id) VALUES ?', [values]);
    }
    await conn.commit();
    return { success: true, message: 'Kegiatan berhasil ditambahkan.' };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function getConfigMap() {
  const cached = configCache.get('config');
  if (cached) return cached;
  const [rows] = await pool.query('SELECT config_key, config_value FROM konfigurasi');
  const map = new Map(rows.map(r => [r.config_key, r.config_value]));
  configCache.set('config', map, 30000);
  return map;
}

async function addOtherExpense(data) {
  const idMode = await getExpenseIdMode();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    if (idMode === 'auto') {
      await conn.query(
        'INSERT INTO pengeluaran_lain (tanggal, kategori, penerima, jumlah, nominal, keterangan) VALUES (?,?,?,?,?,?)',
        [data.tanggal, data.kategori, data.penerima, data.jumlah || 1, data.nominal, data.keterangan]
      );
    } else {
      const [rows] = await conn.query('SELECT id FROM pengeluaran_lain ORDER BY id DESC LIMIT 1 FOR UPDATE');
      const newId = nextExpenseCode(rows[0]?.id || 'P000');
      await conn.query(
        'INSERT INTO pengeluaran_lain (id, tanggal, kategori, penerima, jumlah, nominal, keterangan) VALUES (?,?,?,?,?,?,?)',
        [newId, data.tanggal, data.kategori, data.penerima, data.jumlah || 1, data.nominal, data.keterangan]
      );
    }
    await conn.commit();
    return { success: true, message: 'Pengeluaran berhasil ditambahkan.' };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function updateOtherExpense(data) {
  await pool.query(
    'UPDATE pengeluaran_lain SET tanggal=?, kategori=?, penerima=?, jumlah=?, nominal=?, keterangan=? WHERE id=?',
    [data.tanggal, data.kategori, data.penerima, data.jumlah || 1, data.nominal, data.keterangan, data.id]
  );
  return { success: true, message: 'Pengeluaran berhasil diperbarui.' };
}

async function deleteOtherExpense(id) {
  await pool.query('DELETE FROM pengeluaran_lain WHERE id=?', [id]);
  return { success: true, message: 'Pengeluaran berhasil dihapus.' };
}

let extracurricularTableEnsured = false;
async function ensureExtracurricularTable() {
  if (extracurricularTableEnsured) return;
  await extracurricularJournals.ensureTables();
  await pool.query(
    `CREATE TABLE IF NOT EXISTS pengeluaran_ekstrakurikuler (
      id BIGINT NOT NULL AUTO_INCREMENT,
      tanggal DATE NOT NULL,
      teacher_id BIGINT NOT NULL,
      teacher_name VARCHAR(120) NOT NULL,
      nama_ekstra VARCHAR(120) NOT NULL,
      jumlah_hadir INT NOT NULL DEFAULT 1,
      nominal DECIMAL(15,2) NOT NULL DEFAULT 0.00,
      keterangan TEXT NULL,
      expense_id VARCHAR(50) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_ekstra_tanggal (tanggal),
      INDEX idx_ekstra_teacher (teacher_id),
      INDEX idx_ekstra_expense (expense_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );
  for (const definition of [
    'ADD COLUMN source_extra_id BIGINT NULL',
    'ADD COLUMN source_extra_teacher_id BIGINT NULL',
    'ADD COLUMN teacher_type VARCHAR(30) NULL',
    'ADD COLUMN attendance_manual TINYINT(1) NOT NULL DEFAULT 0',
    'ADD COLUMN source_synced TINYINT(1) NOT NULL DEFAULT 0'
  ]) {
    try {
      await pool.query(`ALTER TABLE pengeluaran_ekstrakurikuler ${definition}`);
    } catch (error) {
      if (!String(error.message).includes('Duplicate column')) throw error;
    }
  }
  extracurricularTableEnsured = true;
}

async function getActiveTeachers() {
  const [rows] = await masterPool.query(
    'SELECT id, name FROM teachers WHERE is_active=1 ORDER BY name'
  );
  const [extraRows] = await masterPool.query(
    'SELECT id, name FROM extra_teachers WHERE is_active=1 ORDER BY name'
  ).catch(() => [[]]);
  return [
    ...rows.map((r) => ({ id: String(r.id), name: r.name, type: 'teacher' })),
    ...extraRows.map((r) => ({ id: `extra:${r.id}`, name: r.name, type: 'extra_teacher' }))
  ];
}

async function getExtracurricularMasterOptions() {
  try {
    const [extraColumns] = await masterPool.query(
      `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'extracurriculars'`
    );
    const [teacherColumns] = await masterPool.query(
      `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'teachers'`
    );
    const extraColumnSet = new Set((extraColumns || []).map((r) => String(r.COLUMN_NAME)));
    const teacherColumnSet = new Set((teacherColumns || []).map((r) => String(r.COLUMN_NAME)));

    const selectParts = ['e.id', 'e.name'];
    let joinClause = '';
    let whereClause = '';
    let orderByClause = 'ORDER BY e.name ASC';

    if (extraColumnSet.has('pembina_teacher_id')) {
      selectParts.push('e.pembina_teacher_id');
      joinClause = 'LEFT JOIN teachers t ON t.id = e.pembina_teacher_id';
      if (teacherColumnSet.has('name')) {
        selectParts.push('t.name AS pembina_name');
      } else if (teacherColumnSet.has('nama')) {
        selectParts.push('t.nama AS pembina_name');
      }
    } else if (extraColumnSet.has('pembina_name')) {
      selectParts.push('e.pembina_name');
    } else if (extraColumnSet.has('pembina_teacher')) {
      selectParts.push('e.pembina_teacher');
    }
    if (extraColumnSet.has('pembina_extra_teacher_id')) {
      selectParts.push('e.pembina_extra_teacher_id');
      joinClause += ' LEFT JOIN extra_teachers et ON et.id = e.pembina_extra_teacher_id';
      selectParts.push('et.name AS pembina_extra_name');
    }

    if (extraColumnSet.has('is_active')) {
      whereClause = 'WHERE e.is_active = 1';
    } else if (extraColumnSet.has('status')) {
      whereClause = "WHERE e.status = 'active' OR e.status = 'aktif'";
    }

    const [rows] = await masterPool.query(
      `SELECT ${selectParts.join(', ')}
       FROM extracurriculars e
       ${joinClause}
       ${whereClause}
       ${orderByClause}`
    );

    return rows.map((r) => {
      const extraTeacherId = r.pembina_extra_teacher_id;
      const pembinaTeacherId = extraTeacherId
        ? `extra:${extraTeacherId}`
        : (r.pembina_teacher_id ?? r.pembina_teacher ?? '');
      const pembinaName = r.pembina_extra_name || r.pembina_name || r.pembinaName || r.pembina || '';
      return {
        id: String(r.id),
        name: r.name,
        pembinaTeacherId: pembinaTeacherId ? String(pembinaTeacherId) : '',
        pembinaName: pembinaName || ''
      };
    });
  } catch (error) {
    const message = String(error.message || '');
    if (message.includes('doesn\'t exist') || message.includes('Unknown column') || message.includes('Unknown table')) {
      return [];
    }
    throw error;
  }
}

async function resolveExtracurricularTeacher(input) {
  const rawTeacherId = input?.teacherId;
  const manualName = String(input?.teacherNameManual || '').trim();
  const extraMatch = /^extra:(\d+)$/.exec(String(rawTeacherId || ''));
  if (extraMatch) {
    const [rows] = await masterPool.query(
      'SELECT id, name FROM extra_teachers WHERE id=? AND is_active=1 LIMIT 1',
      [extraMatch[1]]
    );
    if (!rows[0]) throw new Error('Guru Ekstra tidak ditemukan atau tidak aktif.');
    return { teacher_id: -Number(rows[0].id), teacher_name: rows[0].name };
  }
  if (rawTeacherId !== undefined && rawTeacherId !== null && rawTeacherId !== '' && String(rawTeacherId) !== '0') {
    const [teacherRows] = await masterPool.query(
      'SELECT id, name FROM teachers WHERE id=? AND is_active=1 LIMIT 1',
      [rawTeacherId]
    );
    const teacher = teacherRows[0];
    if (!teacher) throw new Error('Guru tidak ditemukan atau tidak aktif.');
    return { teacher_id: Number(teacher.id), teacher_name: teacher.name };
  }
  if (!manualName) throw new Error('Nama guru manual wajib diisi.');
  return { teacher_id: 0, teacher_name: manualName };
}

async function ensureExtracurricularMonthRows(periode) {
  await ensureExtracurricularTable();
  const monthStart = `${periode}-01`;
  const [currentRows] = await pool.query(
    `SELECT id, teacher_id, teacher_name, nama_ekstra, jumlah_hadir,
            attendance_manual, source_extra_id, source_extra_teacher_id,
            teacher_type, source_synced
     FROM pengeluaran_ekstrakurikuler
     WHERE tanggal BETWEEN ? AND LAST_DAY(?)`,
    [monthStart, monthStart]
  );
  const currentKeys = new Set(
    currentRows.map((r) =>
      `${r.teacher_id}|${String(r.teacher_name || '').trim().toLowerCase()}|${String(r.nama_ekstra || '').trim().toLowerCase()}`
    )
  );

  const sourceKeys = new Set(currentRows
    .filter((row) => Number(row.source_synced) === 1)
    .map((row) => `${row.source_extra_id}|${row.source_extra_teacher_id}|${row.teacher_type}`));
  const sourceRowsByKey = new Map(currentRows
    .filter((row) => Number(row.source_synced) === 1)
    .map((row) => [
      `${row.source_extra_id}|${row.source_extra_teacher_id}|${row.teacher_type}`,
      row
    ]));
  const visibleSourceKeys = new Set(currentRows
    .filter((row) => Number(row.source_synced) === 1)
    .map((row) => `${row.source_extra_id}|${row.teacher_type}|${String(row.teacher_name || '').trim().toLowerCase()}`));
  const [ignoredRows] = await pool.query(`
    SELECT source_extra_id, source_extra_teacher_id, teacher_type, ignore_reason
    FROM pengeluaran_ekstrakurikuler_ignored
    WHERE periode = ?
  `, [periode]);
  const ignoredSources = new Map(ignoredRows.map((row) => [
    `${row.source_extra_id}|${row.source_extra_teacher_id}|${row.teacher_type}`,
    row.ignore_reason || 'manual_delete'
  ]));
  let masterAssignments = [];
  let masterSyncAvailable = true;
  try {
    [masterAssignments] = await masterPool.query(`
      SELECT e.id AS extracurricular_id, e.name AS extracurricular_name,
             e.pembina_teacher_id, t.name AS pendamping_name,
             e.pembina_extra_teacher_id,
             COALESCE(e.pembina_extra_source_type, 'extra_teacher') AS pembina_extra_source_type,
             COALESCE(gt.name, et.name) AS extra_teacher_name
      FROM extracurriculars e
      LEFT JOIN teachers t ON t.id = e.pembina_teacher_id AND t.is_active = 1
      LEFT JOIN teachers gt
        ON COALESCE(e.pembina_extra_source_type, 'extra_teacher') = 'teacher'
       AND gt.id = e.pembina_extra_teacher_id AND gt.is_active = 1
      LEFT JOIN extra_teachers et
        ON COALESCE(e.pembina_extra_source_type, 'extra_teacher') = 'extra_teacher'
       AND et.id = e.pembina_extra_teacher_id AND et.is_active = 1
      WHERE e.is_active = 1
      ORDER BY e.name
    `);
  } catch (_) {
    masterSyncAvailable = false;
  }
  const rates = await extracurricularJournals.getRates();
  const assignments = masterAssignments.flatMap((row) => [
    row.pembina_teacher_id && row.pendamping_name ? {
      extraId: Number(row.extracurricular_id),
      extraName: row.extracurricular_name,
      sourceTeacherId: Number(row.pembina_teacher_id),
      teacherId: Number(row.pembina_teacher_id),
      teacherName: row.pendamping_name,
      teacherType: extracurricularJournals.TYPE_PENDAMPING
    } : null,
    row.pembina_extra_teacher_id && row.extra_teacher_name ? {
      extraId: Number(row.extracurricular_id),
      extraName: row.extracurricular_name,
      sourceTeacherId: row.pembina_extra_source_type === 'teacher'
        ? -Number(row.pembina_extra_teacher_id)
        : Number(row.pembina_extra_teacher_id),
      teacherId: row.pembina_extra_source_type === 'teacher'
        ? -(2000000000 + Number(row.pembina_extra_teacher_id))
        : -(1000000000 + Number(row.pembina_extra_teacher_id)),
      teacherName: row.extra_teacher_name,
      teacherType: extracurricularJournals.TYPE_GURU_EKSTRA
    } : null
  ].filter(Boolean));
  const activeAssignmentSourceKeys = new Set(assignments.map(
    (assignment) => `${assignment.extraId}|${assignment.sourceTeacherId}|${assignment.teacherType}`
  ));
  for (const assignment of assignments) {
    const sourceKey = `${assignment.extraId}|${assignment.sourceTeacherId}|${assignment.teacherType}`;
    const ignoreReason = ignoredSources.get(sourceKey);
    if (ignoreReason === 'role_transition' || ignoreReason === 'source_removed') {
      await pool.query(`
        DELETE FROM pengeluaran_ekstrakurikuler_ignored
        WHERE periode = ? AND source_extra_id = ?
          AND source_extra_teacher_id = ? AND teacher_type = ?
      `, [periode, assignment.extraId, assignment.sourceTeacherId, assignment.teacherType]);
      ignoredSources.delete(sourceKey);
    } else if (ignoreReason) {
      continue;
    }
    const visibleKey = `${assignment.extraId}|${assignment.teacherType}|${String(assignment.teacherName || '').trim().toLowerCase()}`;
    const existingSourceRow = sourceRowsByKey.get(sourceKey);
    if (existingSourceRow) {
      if (
        String(existingSourceRow.teacher_name || '').trim() !== String(assignment.teacherName || '').trim()
        || String(existingSourceRow.nama_ekstra || '').trim() !== String(assignment.extraName || '').trim()
        || Number(existingSourceRow.teacher_id) !== Number(assignment.teacherId)
      ) {
        await pool.query(
          `UPDATE pengeluaran_ekstrakurikuler
           SET teacher_id = ?, teacher_name = ?, nama_ekstra = ?
           WHERE id = ?`,
          [assignment.teacherId, assignment.teacherName, assignment.extraName, existingSourceRow.id]
        );
      }
      const staleRoleRows = currentRows.filter((row) => {
        if (Number(row.id) === Number(existingSourceRow.id) || Number(row.source_synced) !== 1) return false;
        if (Number(row.source_extra_id) !== assignment.extraId) return false;
        if (normalizedIdentity(row.teacher_name) !== normalizedIdentity(assignment.teacherName)) return false;
        const previousKey = `${row.source_extra_id}|${row.source_extra_teacher_id}|${row.teacher_type}`;
        return !activeAssignmentSourceKeys.has(previousKey);
      });
      if (staleRoleRows.length) {
        for (const staleRow of staleRoleRows) {
          await pool.query(`
            INSERT INTO pengeluaran_ekstrakurikuler_ignored
              (periode, source_extra_id, source_extra_teacher_id, teacher_type,
               teacher_name, nama_ekstra, ignore_reason)
            VALUES (?, ?, ?, ?, ?, ?, 'role_transition')
            ON DUPLICATE KEY UPDATE
              teacher_name = VALUES(teacher_name), nama_ekstra = VALUES(nama_ekstra),
              ignore_reason = 'role_transition'
          `, [
            periode, staleRow.source_extra_id, staleRow.source_extra_teacher_id,
            staleRow.teacher_type, staleRow.teacher_name, staleRow.nama_ekstra
          ]);
        }
        const mergedAttendance = Math.max(
          Number(existingSourceRow.jumlah_hadir) || 0,
          ...staleRoleRows.map((row) => Number(row.jumlah_hadir) || 0)
        );
        const attendanceManual = [
          existingSourceRow,
          ...staleRoleRows
        ].some((row) => Number(row.attendance_manual) === 1) ? 1 : 0;
        await pool.query(`
          UPDATE pengeluaran_ekstrakurikuler
          SET jumlah_hadir = ?, attendance_manual = ?, nominal = ?,
              teacher_id = ?, teacher_name = ?, nama_ekstra = ?
          WHERE id = ?
        `, [
          mergedAttendance, attendanceManual, Number(rates[assignment.teacherType] || 0),
          assignment.teacherId, assignment.teacherName, assignment.extraName,
          existingSourceRow.id
        ]);
        await pool.query(
          'DELETE FROM pengeluaran_ekstrakurikuler WHERE id IN (?)',
          [staleRoleRows.map((row) => row.id)]
        );
      }
      continue;
    }
    const transitionRow = currentRows.find((row) => {
      if (Number(row.source_synced) !== 1) return false;
      if (Number(row.source_extra_id) !== assignment.extraId) return false;
      if (normalizedIdentity(row.teacher_name) !== normalizedIdentity(assignment.teacherName)) return false;
      const previousKey = `${row.source_extra_id}|${row.source_extra_teacher_id}|${row.teacher_type}`;
      return previousKey !== sourceKey && !activeAssignmentSourceKeys.has(previousKey);
    });
    if (transitionRow) {
      const previousKey = `${transitionRow.source_extra_id}|${transitionRow.source_extra_teacher_id}|${transitionRow.teacher_type}`;
      await pool.query(`
        INSERT INTO pengeluaran_ekstrakurikuler_ignored
          (periode, source_extra_id, source_extra_teacher_id, teacher_type,
           teacher_name, nama_ekstra, ignore_reason)
        VALUES (?, ?, ?, ?, ?, ?, 'role_transition')
        ON DUPLICATE KEY UPDATE
          teacher_name = VALUES(teacher_name), nama_ekstra = VALUES(nama_ekstra),
          ignore_reason = 'role_transition'
      `, [
        periode, transitionRow.source_extra_id, transitionRow.source_extra_teacher_id,
        transitionRow.teacher_type, transitionRow.teacher_name, transitionRow.nama_ekstra
      ]);
      await pool.query(`
        UPDATE pengeluaran_ekstrakurikuler
        SET teacher_id = ?, teacher_name = ?, nama_ekstra = ?, nominal = ?,
            source_extra_id = ?, source_extra_teacher_id = ?, teacher_type = ?,
            keterangan = ?
        WHERE id = ?
      `, [
        assignment.teacherId, assignment.teacherName, assignment.extraName,
        Number(rates[assignment.teacherType] || 0), assignment.extraId,
        assignment.sourceTeacherId, assignment.teacherType,
        'Peran pengajar diperbarui otomatis dari MyMada; kehadiran dihitung dari jurnal eMada',
        transitionRow.id
      ]);
      sourceRowsByKey.delete(previousKey);
      sourceRowsByKey.set(sourceKey, transitionRow);
      transitionRow.teacher_id = assignment.teacherId;
      transitionRow.teacher_name = assignment.teacherName;
      transitionRow.nama_ekstra = assignment.extraName;
      transitionRow.source_extra_id = assignment.extraId;
      transitionRow.source_extra_teacher_id = assignment.sourceTeacherId;
      transitionRow.teacher_type = assignment.teacherType;
      continue;
    }
    if (visibleSourceKeys.has(visibleKey)) continue;
    await pool.query(`
      INSERT INTO pengeluaran_ekstrakurikuler
        (tanggal, teacher_id, teacher_name, nama_ekstra, jumlah_hadir, nominal,
         keterangan, source_extra_id, source_extra_teacher_id, teacher_type, source_synced)
      VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 1)
    `, [
      monthStart, assignment.teacherId, assignment.teacherName, assignment.extraName,
      Number(rates[assignment.teacherType] || 0),
      'Penugasan otomatis dari MyMada; kehadiran dihitung dari jurnal eMada',
      assignment.extraId, assignment.sourceTeacherId, assignment.teacherType
    ]);
    sourceKeys.add(sourceKey);
    sourceRowsByKey.set(sourceKey, {
      source_extra_id: assignment.extraId,
      source_extra_teacher_id: assignment.sourceTeacherId,
      teacher_type: assignment.teacherType,
      teacher_id: assignment.teacherId,
      teacher_name: assignment.teacherName,
      nama_ekstra: assignment.extraName
    });
    visibleSourceKeys.add(visibleKey);
  }
  const [[periodState]] = await pool.query(
    "SELECT DATE_FORMAT(CURDATE(), '%Y-%m') AS current_period"
  );
  if (masterSyncAvailable && String(periode) >= String(periodState?.current_period || '')) {
    const [latestSyncedRows] = await pool.query(`
      SELECT id, source_extra_id, source_extra_teacher_id, teacher_type,
             teacher_name, nama_ekstra
      FROM pengeluaran_ekstrakurikuler
      WHERE tanggal BETWEEN ? AND LAST_DAY(?) AND source_synced = 1
    `, [monthStart, monthStart]);
    const removedSourceRows = latestSyncedRows.filter((row) => {
      const key = `${row.source_extra_id}|${row.source_extra_teacher_id}|${row.teacher_type}`;
      return !activeAssignmentSourceKeys.has(key);
    });
    if (removedSourceRows.length) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        for (const row of removedSourceRows) {
          await conn.query(`
            INSERT INTO pengeluaran_ekstrakurikuler_ignored
              (periode, source_extra_id, source_extra_teacher_id, teacher_type,
               teacher_name, nama_ekstra, ignore_reason)
            VALUES (?, ?, ?, ?, ?, ?, 'source_removed')
            ON DUPLICATE KEY UPDATE
              teacher_name = VALUES(teacher_name), nama_ekstra = VALUES(nama_ekstra),
              ignore_reason = IF(ignore_reason = 'manual_delete', ignore_reason, 'source_removed')
          `, [
            periode, row.source_extra_id, row.source_extra_teacher_id,
            row.teacher_type, row.teacher_name, row.nama_ekstra
          ]);
        }
        await conn.query(
          'DELETE FROM pengeluaran_ekstrakurikuler WHERE id IN (?)',
          [removedSourceRows.map((row) => row.id)]
        );
        await conn.commit();
      } catch (error) {
        await conn.rollback();
        throw error;
      } finally {
        conn.release();
      }
    }
  }
  await consolidateExtracurricularRows(monthStart, monthStart);

  const [latestMonthRows] = await pool.query(
    `SELECT DATE_FORMAT(MAX(tanggal), '%Y-%m') AS ym
     FROM pengeluaran_ekstrakurikuler
     WHERE tanggal < ?`,
    [monthStart]
  );
  const latestYm = latestMonthRows[0]?.ym;
  if (!latestYm) return;

  const sourceStart = `${latestYm}-01`;
  const [sourceRows] = await pool.query(
    `SELECT teacher_id, teacher_name, nama_ekstra, nominal, keterangan
     FROM pengeluaran_ekstrakurikuler
     WHERE tanggal BETWEEN ? AND LAST_DAY(?) AND source_synced = 0`,
    [sourceStart, sourceStart]
  );
  if (!sourceRows.length) return;

  const missing = sourceRows.filter((r) => {
    const key = `${r.teacher_id}|${String(r.teacher_name || '').trim().toLowerCase()}|${String(r.nama_ekstra || '').trim().toLowerCase()}`;
    return !currentKeys.has(key);
  });
  if (!missing.length) return;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const row of missing) {
      const payload = {
        tanggal: monthStart,
        teacher_id: row.teacher_id,
        teacher_name: row.teacher_name,
        nama_ekstra: row.nama_ekstra,
        jumlah_hadir: 0,
        nominal: Number(row.nominal) || 0,
        keterangan: row.keterangan || ''
      };
      await conn.query(
        `INSERT INTO pengeluaran_ekstrakurikuler
         (tanggal, teacher_id, teacher_name, nama_ekstra, jumlah_hadir, nominal, keterangan, expense_id)
         VALUES (?,?,?,?,?,?,?,?)`,
        [
          payload.tanggal,
          payload.teacher_id,
          payload.teacher_name,
          payload.nama_ekstra,
          payload.jumlah_hadir,
          payload.nominal,
          payload.keterangan || null,
          null
        ]
      );
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

function normalizedIdentity(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

async function consolidateExtracurricularRows(startDate, endDate) {
  const [rows] = await pool.query(`
    SELECT *
    FROM pengeluaran_ekstrakurikuler
    WHERE tanggal BETWEEN ? AND LAST_DAY(?)
    ORDER BY source_synced DESC, attendance_manual DESC, updated_at DESC, id ASC
  `, [startDate, endDate]);
  if (rows.length < 2) return 0;

  const explicitTypes = new Map();
  for (const row of rows) {
    if (!row.teacher_type) continue;
    const base = `${monthKey(row.tanggal)}|${normalizedIdentity(row.nama_ekstra)}|${normalizedIdentity(row.teacher_name)}`;
    if (!explicitTypes.has(base)) explicitTypes.set(base, new Set());
    explicitTypes.get(base).add(row.teacher_type);
  }
  const groups = new Map();
  for (const row of rows) {
    const base = `${monthKey(row.tanggal)}|${normalizedIdentity(row.nama_ekstra)}|${normalizedIdentity(row.teacher_name)}`;
    const knownTypes = explicitTypes.get(base);
    const resolvedType = row.teacher_type || (knownTypes?.size === 1 ? [...knownTypes][0] : 'manual');
    const key = `${base}|${resolvedType}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ ...row, resolvedType });
  }

  let removed = 0;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      const canonical = group[0];
      const manual = group.find((row) => Number(row.attendance_manual) === 1);
      const synced = group.find((row) => Number(row.source_synced) === 1);
      const count = manual
        ? Number(manual.jumlah_hadir || 0)
        : Math.max(...group.map((row) => Number(row.jumlah_hadir || 0)));
      const nominalRow = manual || group.find((row) => Number(row.nominal || 0) > 0) || canonical;
      const source = synced || canonical;
      const duplicateIds = group.slice(1).map((row) => row.id);
      await conn.query(`
        UPDATE pengeluaran_ekstrakurikuler
        SET jumlah_hadir = ?, nominal = ?, teacher_type = ?,
            attendance_manual = ?, source_extra_id = ?,
            source_extra_teacher_id = ?, source_synced = ?,
            expense_id = COALESCE(expense_id, ?)
        WHERE id = ?
      `, [
        count, Number(nominalRow.nominal || 0),
        canonical.resolvedType === 'manual' ? null : canonical.resolvedType,
        manual ? 1 : 0,
        source.source_extra_id || null,
        source.source_extra_teacher_id || null,
        Number(source.source_synced) === 1 ? 1 : 0,
        group.find((row) => row.expense_id)?.expense_id || null,
        canonical.id
      ]);
      await conn.query('DELETE FROM pengeluaran_ekstrakurikuler WHERE id IN (?)', [duplicateIds]);
      removed += duplicateIds.length;
    }
    await conn.commit();
    return removed;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

async function getExtracurricularExpenses(startDate, endDate) {
  await ensureExtracurricularTable();
  await consolidateExtracurricularRows(startDate, endDate);
  const [rows] = await pool.query(
    `SELECT id, tanggal, teacher_id, teacher_name, nama_ekstra, jumlah_hadir, nominal, keterangan,
            expense_id, source_synced, teacher_type, attendance_manual
     FROM pengeluaran_ekstrakurikuler
     WHERE tanggal BETWEEN ? AND ?
     ORDER BY tanggal DESC, id DESC`,
    [startDate, endDate]
  );
  return rows.map((r) => ({
    id: r.id,
    tanggal: r.tanggal,
    teacherId: String(r.teacher_id),
    teacherName: r.teacher_name,
    namaEkstra: r.nama_ekstra,
    jumlahHadir: parseInt(r.jumlah_hadir, 10) || 0,
    nominal: Number(r.nominal) || 0,
    jumlahDiterima: (parseInt(r.jumlah_hadir, 10) || 0) * (Number(r.nominal) || 0),
    keterangan: r.keterangan || '',
    expenseId: r.expense_id || null,
    sourceSynced: Number(r.source_synced) === 1,
    teacherType: r.teacher_type || null,
    attendanceManual: Number(r.attendance_manual) === 1
  }));
}

async function getExtracurricularMonthSheet(periode) {
  if (!/^\d{4}-\d{2}$/.test(String(periode || ''))) throw new Error('Format periode tidak valid. Gunakan YYYY-MM.');
  await ensureExtracurricularMonthRows(periode);
  const startDate = `${periode}-01`;
  const [rows] = await pool.query(
    `SELECT id, tanggal, teacher_id, teacher_name, nama_ekstra, jumlah_hadir, nominal, keterangan,
            expense_id, source_synced, teacher_type, attendance_manual
     FROM pengeluaran_ekstrakurikuler
     WHERE tanggal BETWEEN ? AND LAST_DAY(?)
     ORDER BY teacher_name ASC, nama_ekstra ASC, id ASC`,
    [startDate, startDate]
  );
  return rows.map((r) => ({
    id: r.id,
    tanggal: r.tanggal,
    teacherId: String(r.teacher_id),
    teacherName: r.teacher_name,
    namaEkstra: r.nama_ekstra,
    jumlahHadir: parseInt(r.jumlah_hadir, 10) || 0,
    nominal: Number(r.nominal) || 0,
    jumlahDiterima: (parseInt(r.jumlah_hadir, 10) || 0) * (Number(r.nominal) || 0),
    keterangan: r.keterangan || '',
    expenseId: r.expense_id || null,
    sourceSynced: Number(r.source_synced) === 1,
    teacherType: r.teacher_type || null,
    attendanceManual: Number(r.attendance_manual) === 1
  }));
}

async function getExtracurricularDuplicateAudit(periode) {
  if (!/^\d{4}-\d{2}$/.test(String(periode || ''))) {
    throw new Error('Format periode tidak valid. Gunakan YYYY-MM.');
  }
  await ensureExtracurricularMonthRows(periode);
  const startDate = `${periode}-01`;
  const [rows] = await pool.query(`
    SELECT id, DATE_FORMAT(tanggal, '%Y-%m-%d') AS tanggal, teacher_id, teacher_name,
           nama_ekstra, jumlah_hadir, nominal, source_extra_id,
           source_extra_teacher_id, teacher_type, attendance_manual, source_synced
    FROM pengeluaran_ekstrakurikuler
    WHERE tanggal BETWEEN ? AND LAST_DAY(?)
    ORDER BY nama_ekstra ASC, teacher_name ASC, teacher_type ASC, id ASC
  `, [startDate, startDate]);

  const grouped = new Map();
  for (const row of rows) {
    const key = `${normalizedIdentity(row.nama_ekstra)}|${normalizedIdentity(row.teacher_name)}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }

  const duplicates = [...grouped.values()]
    .filter((group) => group.length > 1)
    .map((group) => {
      const types = new Set(group.map((row) => row.teacher_type || 'manual'));
      const crossRole = types.size > 1;
      return {
        namaEkstra: group[0].nama_ekstra,
        teacherName: group[0].teacher_name,
        conflictType: crossRole ? 'cross_role' : 'same_role',
        explanation: crossRole
          ? 'Nama guru yang sama tercatat pada lebih dari satu peran honor di ekstrakurikuler yang sama.'
          : 'Nama guru dan jenis penugasan yang sama tercatat lebih dari satu kali pada periode ini.',
        rows: group.map((row) => ({
          id: row.id,
          tanggal: row.tanggal,
          teacherId: String(row.teacher_id),
          teacherName: row.teacher_name,
          namaEkstra: row.nama_ekstra,
          jumlahHadir: Number(row.jumlah_hadir) || 0,
          nominal: Number(row.nominal) || 0,
          jumlahDiterima: (Number(row.jumlah_hadir) || 0) * (Number(row.nominal) || 0),
          teacherType: row.teacher_type || null,
          sourceSynced: Number(row.source_synced) === 1,
          sourceExtraId: row.source_extra_id,
          sourceExtraTeacherId: row.source_extra_teacher_id,
          attendanceManual: Number(row.attendance_manual) === 1
        }))
      };
    });

  return {
    periode,
    duplicateCount: duplicates.reduce((total, group) => total + group.rows.length - 1, 0),
    groups: duplicates
  };
}

async function deleteExtracurricularDuplicate(periode, id) {
  if (!/^\d{4}-\d{2}$/.test(String(periode || ''))) {
    throw new Error('Format periode tidak valid. Gunakan YYYY-MM.');
  }
  const rowId = Number(id);
  if (!Number.isInteger(rowId) || rowId <= 0) throw new Error('ID data tidak valid.');
  await ensureExtracurricularTable();
  const startDate = `${periode}-01`;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [periodRows] = await conn.query(`
      SELECT *
      FROM pengeluaran_ekstrakurikuler
      WHERE tanggal BETWEEN ? AND LAST_DAY(?)
      FOR UPDATE
    `, [startDate, startDate]);
    const target = periodRows.find((row) => Number(row.id) === rowId);
    if (!target) throw new Error('Data yang akan dihapus tidak ditemukan pada periode ini.');

    const siblings = periodRows.filter((row) => (
      normalizedIdentity(row.nama_ekstra) === normalizedIdentity(target.nama_ekstra)
      && normalizedIdentity(row.teacher_name) === normalizedIdentity(target.teacher_name)
    ));
    if (siblings.length < 2) {
      throw new Error('Data ini bukan lagi data ganda. Silakan jalankan pengecekan ulang.');
    }

    const hasSameSourceSibling = siblings.some((row) => (
      Number(row.id) !== rowId
      && Number(row.source_synced) === 1
      && Number(row.source_extra_id) === Number(target.source_extra_id)
      && Number(row.source_extra_teacher_id) === Number(target.source_extra_teacher_id)
      && String(row.teacher_type || '') === String(target.teacher_type || '')
    ));
    if (
      Number(target.source_synced) === 1
      && target.source_extra_id !== null
      && target.source_extra_teacher_id !== null
      && target.teacher_type
      && !hasSameSourceSibling
    ) {
      await conn.query(`
        INSERT INTO pengeluaran_ekstrakurikuler_ignored
          (periode, source_extra_id, source_extra_teacher_id, teacher_type,
           teacher_name, nama_ekstra, ignore_reason)
        VALUES (?, ?, ?, ?, ?, ?, 'manual_delete')
        ON DUPLICATE KEY UPDATE
          teacher_name = VALUES(teacher_name), nama_ekstra = VALUES(nama_ekstra),
          ignore_reason = 'manual_delete'
      `, [
        periode, target.source_extra_id, target.source_extra_teacher_id,
        target.teacher_type, target.teacher_name, target.nama_ekstra
      ]);
    }

    await conn.query('DELETE FROM pengeluaran_ekstrakurikuler WHERE id = ?', [rowId]);
    await conn.commit();
    return {
      success: true,
      message: 'Data ganda berhasil dihapus dan tidak akan dibuat ulang oleh sinkronisasi pada periode ini.'
    };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

async function saveExtracurricularBulk(periode, items) {
  if (!Array.isArray(items)) throw new Error('Payload items harus berupa array.');
  if (!/^\d{4}-\d{2}$/.test(String(periode || ''))) throw new Error('Format periode tidak valid. Gunakan YYYY-MM.');
  const startDate = `${periode}-01`;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const row of items) {
      const [currentRows] = await conn.query(
        `SELECT id, teacher_id, teacher_name, nama_ekstra, keterangan, expense_id, tanggal, source_synced
         FROM pengeluaran_ekstrakurikuler
         WHERE id=? AND tanggal BETWEEN ? AND LAST_DAY(?)
         LIMIT 1`,
        [row.id, startDate, startDate]
      );
      const current = currentRows[0];
      if (!current) continue;

      const jumlahHadir = parseInt(row.jumlahHadir, 10) || 0;
      const nominal = Number(row.nominal) || 0;
      if (Number(current.source_synced) === 1) {
        await conn.query(
          'UPDATE pengeluaran_ekstrakurikuler SET jumlah_hadir=?, attendance_manual=1 WHERE id=?',
          [jumlahHadir, row.id]
        );
      } else {
        await conn.query(
          'UPDATE pengeluaran_ekstrakurikuler SET jumlah_hadir=?, nominal=? WHERE id=?',
          [jumlahHadir, nominal, row.id]
        );
      }
    }
    await conn.commit();
    return { success: true, message: 'Perubahan massal ekstrakurikuler berhasil disimpan.' };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function getExtracurricularRates() {
  await ensureExtracurricularTable();
  const rates = await extracurricularJournals.getRates();
  return {
    pendamping: Number(rates[extracurricularJournals.TYPE_PENDAMPING] || 0),
    guruEkstra: Number(rates[extracurricularJournals.TYPE_GURU_EKSTRA] || 0)
  };
}

async function saveExtracurricularRates(data) {
  await ensureExtracurricularTable();
  const pendamping = Math.max(0, Number(data?.pendamping) || 0);
  const guruEkstra = Math.max(0, Number(data?.guruEkstra) || 0);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const [key, value] of [
      ['RATE_EXTRA_PENDAMPING', pendamping],
      ['RATE_EXTRA_GURU', guruEkstra]
    ]) {
      await conn.query(`
        INSERT INTO konfigurasi (config_key, config_value) VALUES (?, ?)
        ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)
      `, [key, value]);
    }
    await conn.query(`
      UPDATE pengeluaran_ekstrakurikuler
      SET nominal = CASE
        WHEN teacher_type = ? THEN ?
        WHEN teacher_type = ? THEN ?
        ELSE nominal END
      WHERE source_synced = 1 AND (jumlah_hadir = 0 OR attendance_manual = 1)
    `, [
      extracurricularJournals.TYPE_PENDAMPING, pendamping,
      extracurricularJournals.TYPE_GURU_EKSTRA, guruEkstra
    ]);
    await conn.commit();
    return { success: true, message: 'Tarif global honor ekstrakurikuler berhasil disimpan.' };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

async function addExtracurricularExpense(data) {
  await ensureExtracurricularTable();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const resolvedTeacher = await resolveExtracurricularTeacher(data);

    const payload = {
      tanggal: data.tanggal,
      teacher_id: resolvedTeacher.teacher_id,
      teacher_name: resolvedTeacher.teacher_name,
      nama_ekstra: String(data.namaEkstra || '').trim(),
      jumlah_hadir: parseInt(data.jumlahHadir, 10) || 0,
      nominal: Number(data.nominal) || 0,
      keterangan: String(data.keterangan || '').trim()
    };
    if (!payload.nama_ekstra) throw new Error('Nama ekstrakurikuler wajib diisi.');
    if (!payload.tanggal) throw new Error('Tanggal wajib diisi.');

    await conn.query(
      `INSERT INTO pengeluaran_ekstrakurikuler
       (tanggal, teacher_id, teacher_name, nama_ekstra, jumlah_hadir, nominal, keterangan, expense_id)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        payload.tanggal,
        payload.teacher_id,
        payload.teacher_name,
        payload.nama_ekstra,
        payload.jumlah_hadir,
        payload.nominal,
        payload.keterangan || null,
        null
      ]
    );

    await conn.commit();
    return {
      success: true,
      message: 'Pengeluaran ekstrakurikuler berhasil ditambahkan.'
    };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function updateExtracurricularExpense(data) {
  await ensureExtracurricularTable();
  const [rows] = await pool.query(
    'SELECT * FROM pengeluaran_ekstrakurikuler WHERE id=? LIMIT 1',
    [data.id]
  );
  if (!rows[0]) throw new Error('Data ekstrakurikuler tidak ditemukan.');

  const resolvedTeacher = await resolveExtracurricularTeacher(data);

  const payload = {
    id: data.id,
    tanggal: data.tanggal,
    teacher_id: resolvedTeacher.teacher_id,
    teacher_name: resolvedTeacher.teacher_name,
    nama_ekstra: String(data.namaEkstra || '').trim(),
    jumlah_hadir: parseInt(data.jumlahHadir, 10) || 0,
    nominal: Number(data.nominal) || 0,
    keterangan: String(data.keterangan || '').trim()
  };
  if (!payload.nama_ekstra) throw new Error('Nama ekstrakurikuler wajib diisi.');
  if (!payload.tanggal) throw new Error('Tanggal wajib diisi.');

  await pool.query(
    `UPDATE pengeluaran_ekstrakurikuler
     SET tanggal=?, teacher_id=?, teacher_name=?, nama_ekstra=?, jumlah_hadir=?, nominal=?, keterangan=?
     WHERE id=?`,
    [
      payload.tanggal,
      payload.teacher_id,
      payload.teacher_name,
      payload.nama_ekstra,
      payload.jumlah_hadir,
      payload.nominal,
      payload.keterangan || null,
      payload.id
    ]
  );

  return { success: true, message: 'Pengeluaran ekstrakurikuler berhasil diperbarui.' };
}

async function deleteExtracurricularExpense(id) {
  await ensureExtracurricularTable();
  const [rows] = await pool.query(
    'SELECT id, expense_id FROM pengeluaran_ekstrakurikuler WHERE id=? LIMIT 1',
    [id]
  );
  const row = rows[0];
  if (!row) throw new Error('Data ekstrakurikuler tidak ditemukan.');

  await pool.query('DELETE FROM pengeluaran_ekstrakurikuler WHERE id=?', [id]);
  return { success: true, message: 'Pengeluaran ekstrakurikuler berhasil dihapus.' };
}

let disciplineTableEnsured = false;
async function ensureDisciplineTable() {
  if (disciplineTableEnsured) return;
  await pool.query(
    `CREATE TABLE IF NOT EXISTS pengeluaran_kedisiplinan (
      id BIGINT NOT NULL AUTO_INCREMENT,
      tanggal DATE NOT NULL,
      teacher_id BIGINT NOT NULL,
      teacher_name VARCHAR(120) NOT NULL,
      jumlah_hadir INT NOT NULL DEFAULT 0,
      nominal DECIMAL(15,2) NOT NULL DEFAULT 0.00,
      keterangan TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_disiplin_tanggal (tanggal),
      INDEX idx_disiplin_teacher (teacher_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );
  disciplineTableEnsured = true;
}

async function ensureDisciplineMonthRows(periode) {
  await ensureDisciplineTable();
  const monthStart = `${periode}-01`;
  const [currentRows] = await pool.query(
    `SELECT id, teacher_id, teacher_name
     FROM pengeluaran_kedisiplinan
     WHERE tanggal BETWEEN ? AND LAST_DAY(?)`,
    [monthStart, monthStart]
  );
  const currentKeys = new Set(
    currentRows.map((r) => `${r.teacher_id}|${String(r.teacher_name || '').trim().toLowerCase()}`)
  );

  const [latestMonthRows] = await pool.query(
    `SELECT DATE_FORMAT(MAX(tanggal), '%Y-%m') AS ym
     FROM pengeluaran_kedisiplinan
     WHERE tanggal < ?`,
    [monthStart]
  );
  const latestYm = latestMonthRows[0]?.ym;
  if (!latestYm) return;

  const sourceStart = `${latestYm}-01`;
  const [sourceRows] = await pool.query(
    `SELECT teacher_id, teacher_name, nominal, keterangan
     FROM pengeluaran_kedisiplinan
     WHERE tanggal BETWEEN ? AND LAST_DAY(?)`,
    [sourceStart, sourceStart]
  );
  if (!sourceRows.length) return;

  const missing = sourceRows.filter((r) => {
    const key = `${r.teacher_id}|${String(r.teacher_name || '').trim().toLowerCase()}`;
    return !currentKeys.has(key);
  });
  if (!missing.length) return;

  const values = missing.map((r) => [
    monthStart,
    r.teacher_id,
    r.teacher_name,
    0,
    Number(r.nominal) || 0,
    r.keterangan || null
  ]);
  await pool.query(
    `INSERT INTO pengeluaran_kedisiplinan
     (tanggal, teacher_id, teacher_name, jumlah_hadir, nominal, keterangan)
     VALUES ?`,
    [values]
  );
}

async function getDisciplineMonthSheet(periode) {
  if (!/^\d{4}-\d{2}$/.test(String(periode || ''))) throw new Error('Format periode tidak valid. Gunakan YYYY-MM.');
  await ensureDisciplineMonthRows(periode);
  const startDate = `${periode}-01`;
  const [rows] = await pool.query(
    `SELECT id, tanggal, teacher_id, teacher_name, jumlah_hadir, nominal, keterangan
     FROM pengeluaran_kedisiplinan
     WHERE tanggal BETWEEN ? AND LAST_DAY(?)
     ORDER BY teacher_name ASC, id ASC`,
    [startDate, startDate]
  );
  return rows.map((r) => ({
    id: r.id,
    tanggal: r.tanggal,
    teacherId: String(r.teacher_id),
    teacherName: r.teacher_name,
    jumlahHadir: parseInt(r.jumlah_hadir, 10) || 0,
    nominal: Number(r.nominal) || 0,
    jumlahDiterima: (parseInt(r.jumlah_hadir, 10) || 0) * (Number(r.nominal) || 0),
    keterangan: r.keterangan || ''
  }));
}

async function saveDisciplineBulk(periode, items) {
  if (!Array.isArray(items)) throw new Error('Payload items harus berupa array.');
  if (!/^\d{4}-\d{2}$/.test(String(periode || ''))) throw new Error('Format periode tidak valid. Gunakan YYYY-MM.');
  const startDate = `${periode}-01`;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const row of items) {
      await conn.query(
        `UPDATE pengeluaran_kedisiplinan
         SET jumlah_hadir=?, nominal=?
         WHERE id=? AND tanggal BETWEEN ? AND LAST_DAY(?)`,
        [parseInt(row.jumlahHadir, 10) || 0, Number(row.nominal) || 0, row.id, startDate, startDate]
      );
    }
    await conn.commit();
    return { success: true, message: 'Perubahan massal kedisiplinan berhasil disimpan.' };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function addDisciplineExpense(data) {
  await ensureDisciplineTable();
  const resolvedTeacher = await resolveExtracurricularTeacher(data);
  const tanggal = data.tanggal;
  if (!tanggal) throw new Error('Tanggal wajib diisi.');
  await pool.query(
    `INSERT INTO pengeluaran_kedisiplinan
     (tanggal, teacher_id, teacher_name, jumlah_hadir, nominal, keterangan)
     VALUES (?,?,?,?,?,?)`,
    [
      tanggal,
      resolvedTeacher.teacher_id,
      resolvedTeacher.teacher_name,
      parseInt(data.jumlahHadir, 10) || 0,
      Number(data.nominal) || 0,
      String(data.keterangan || '').trim() || null
    ]
  );
  return { success: true, message: 'Pengeluaran kedisiplinan berhasil ditambahkan.' };
}

async function deleteDisciplineExpense(id) {
  await ensureDisciplineTable();
  await pool.query('DELETE FROM pengeluaran_kedisiplinan WHERE id=?', [id]);
  return { success: true, message: 'Pengeluaran kedisiplinan berhasil dihapus.' };
}

async function getDisciplineExpenses(startDate, endDate) {
  await ensureDisciplineTable();
  const [rows] = await pool.query(
    `SELECT id, tanggal, teacher_id, teacher_name, jumlah_hadir, nominal, keterangan
     FROM pengeluaran_kedisiplinan
     WHERE tanggal BETWEEN ? AND ?
     ORDER BY tanggal DESC, id DESC`,
    [startDate, endDate]
  );
  return rows.map((r) => ({
    id: r.id,
    tanggal: r.tanggal,
    teacherId: String(r.teacher_id),
    teacherName: r.teacher_name,
    jumlahHadir: parseInt(r.jumlah_hadir, 10) || 0,
    nominal: Number(r.nominal) || 0,
    jumlahDiterima: (parseInt(r.jumlah_hadir, 10) || 0) * (Number(r.nominal) || 0),
    keterangan: r.keterangan || ''
  }));
}

async function getTeacherAttendanceSummary(startDate, endDate) {
  const configMap = await getConfigMap();

  const TARIFFS = {
    RATE_MENGAJAR: parseFloat(configMap.get('RATE_MENGAJAR')) || 0,
    RATE_HADIR: parseFloat(configMap.get('RATE_HADIR')) || 0,
    RATE_HADIR_KETERAMPILAN: parseFloat(configMap.get('RATE_HADIR_KETERAMPILAN')) || 0,
    RATE_IZIN: parseFloat(configMap.get('RATE_IZIN')) || 0,
    RATE_TIDAK_HADIR: parseFloat(configMap.get('RATE_TIDAK_HADIR')) || 0,
    RATE_TRANSPORT: parseFloat(configMap.get('RATE_TRANSPORT')) || 0,
    RATE_TRANSPORT_PNS: parseFloat(configMap.get('RATE_TRANSPORT_PNS')) || 0,
    RATE_TRANSPORT_INPASSING: parseFloat(configMap.get('RATE_TRANSPORT_INPASSING')) || 0,
    RATE_TRANSPORT_SERTIFIKASI: parseFloat(configMap.get('RATE_TRANSPORT_SERTIFIKASI')) || 0,
    RATE_TRANSPORT_NON_SERTIFIKASI: parseFloat(configMap.get('RATE_TRANSPORT_NON_SERTIFIKASI')) || 0,
    RATE_TRANSPORT_KETERAMPILAN: parseFloat(configMap.get('RATE_TRANSPORT_KETERAMPILAN')) || 0,
    WIYATHA_1_5: parseFloat(configMap.get('WIYATHA_1_5')) || 0,
    WIYATHA_6_10: parseFloat(configMap.get('WIYATHA_6_10')) || 0,
    WIYATHA_11_15: parseFloat(configMap.get('WIYATHA_11_15')) || 0,
    WIYATHA_16_20: parseFloat(configMap.get('WIYATHA_16_20')) || 0,
    WIYATHA_21_25: parseFloat(configMap.get('WIYATHA_21_25')) || 0,
    WIYATHA_26_PLUS: parseFloat(configMap.get('WIYATHA_26_PLUS')) || 0
  };

  const transportRates = {
    PNS: TARIFFS.RATE_TRANSPORT_PNS || TARIFFS.RATE_TRANSPORT,
    INPASSING: TARIFFS.RATE_TRANSPORT_INPASSING || TARIFFS.RATE_TRANSPORT,
    SERTIFIKASI: TARIFFS.RATE_TRANSPORT_SERTIFIKASI || TARIFFS.RATE_TRANSPORT,
    'NON SERTIFIKASI': TARIFFS.RATE_TRANSPORT_NON_SERTIFIKASI || TARIFFS.RATE_TRANSPORT,
    KETERAMPILAN: TARIFFS.RATE_TRANSPORT_KETERAMPILAN || TARIFFS.RATE_TRANSPORT
  };

  const attendanceRates = {
    KETERAMPILAN: TARIFFS.RATE_HADIR_KETERAMPILAN || TARIFFS.RATE_HADIR || TARIFFS.RATE_MENGAJAR
  };

  const normalizeClassification = (value) => {
    const normalized = String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();

    if (normalized === 'pns' || normalized.includes('pns') || /^1(\b|[^0-9])/.test(normalized)) return 'PNS';
    if (normalized === 'inpassing' || normalized.includes('inpassing')) return 'INPASSING';
    if (normalized === 'keterampilan' || normalized.includes('keterampilan')) return 'KETERAMPILAN';
    if (normalized === 'non sertifikasi' || normalized.includes('non sertifikasi')) return 'NON SERTIFIKASI';
    if (normalized === 'sertifikasi' || normalized.includes('sertifikasi')) return 'SERTIFIKASI';
    return 'NON SERTIFIKASI';
  };

  const [teacherTasksRowsRaw] = await masterPool.query(
    `SELECT tt.id, tt.teacher_id, tt.title, 0 AS is_auto_homeroom
     FROM teacher_tasks tt
     WHERE tt.status = 'aktif'
       AND NOT (
         LOWER(TRIM(tt.title)) = 'wali kelas'
         AND EXISTS (
           SELECT 1 FROM classes c
           WHERE c.is_active = 1 AND c.homeroom_teacher_id = tt.teacher_id
         )
       )
     UNION ALL
     SELECT -c.id AS id, c.homeroom_teacher_id AS teacher_id,
            CONCAT('Wali Kelas ', c.name) AS title, 1 AS is_auto_homeroom
     FROM classes c
     WHERE c.is_active = 1 AND c.homeroom_teacher_id IS NOT NULL
     ORDER BY teacher_id, id`
  );
  const [taskRates] = await pool.query('SELECT task_id, nominal FROM teacher_task_rates');
  const taskRateMap = new Map(taskRates.map(r => [String(r.task_id), Number(r.nominal || 0)]));
  const [manualWaliRows] = await masterPool.query(
    `SELECT id, teacher_id
     FROM teacher_tasks
     WHERE status = 'aktif' AND LOWER(TRIM(title)) = 'wali kelas'`
  );
  const manualWaliRateMap = new Map();
  manualWaliRows.forEach((row) => {
    const rate = taskRateMap.get(String(row.id));
    if (typeof rate !== 'undefined' && !manualWaliRateMap.has(String(row.teacher_id))) {
      manualWaliRateMap.set(String(row.teacher_id), rate);
    }
  });
  const teacherTasksRows = teacherTasksRowsRaw.map(r => ({
    ...r,
    nominal: taskRateMap.get(String(r.id)) ?? (Number(r.is_auto_homeroom) === 1 ? manualWaliRateMap.get(String(r.teacher_id)) : undefined) ?? 0
  }));
  const teacherTasksMap = new Map();
  teacherTasksRows.forEach(r => {
    const key = String(r.teacher_id);
    if (!teacherTasksMap.has(key)) teacherTasksMap.set(key, []);
    teacherTasksMap.get(key).push({
      title: r.title,
      nominal: parseFloat(r.nominal) || 0
    });
  });

  const [manualRows] = await pool.query('SELECT guru_id, periode, transport_hari, transport_acara FROM transport_manual');
  const manualTransportMap = new Map();
  manualRows.forEach(r => {
    const key = `${r.guru_id}|${r.periode}`;
    manualTransportMap.set(key, { transportHari: r.transport_hari, transportAcara: parseInt(r.transport_acara) || 0 });
  });

  const [activityRows] = await pool.query(
    `SELECT kg.guru_id, COUNT(*) AS total
     FROM kegiatan_guru kg
     JOIN kegiatan k ON k.id = kg.kegiatan_id
     WHERE k.tanggal BETWEEN ? AND ?
     GROUP BY kg.guru_id`,
    [startDate, endDate]
  );
  const activityMap = new Map(activityRows.map(r => [String(r.guru_id), parseInt(r.total) || 0]));
  await ensureManualActivityTable();
  const [manualActivityRows] = await pool.query(
    `SELECT guru_id, jumlah
     FROM kegiatan_manual
     WHERE start_date = ? AND end_date = ?`,
    [startDate, endDate]
  );
  const manualActivityMap = new Map(manualActivityRows.map(r => [String(r.guru_id), parseInt(r.jumlah) || 0]));

  const [guruRows] = await masterPool.query('SELECT id, name, tmt, classification FROM teachers WHERE is_active=1');
  const guruMap = new Map();
  guruRows.forEach(r => {
    const tmtYear = (() => {
      if (!r.tmt) return 0;
      if (typeof r.tmt === 'number') return r.tmt;
      const dt = new Date(r.tmt);
      return Number.isNaN(dt.getTime()) ? 0 : dt.getFullYear();
    })();
    const classification = normalizeClassification(r.classification);
    guruMap.set(String(r.id), {
      guruId: String(r.id),
      nama: r.name,
      tmt: parseInt(tmtYear, 10) || 0,
      classification,
      totalHadir: 0,
      totalIzin: 0,
      totalTidakHadir: 0,
      transportDays: []
    });
  });

  const [attendanceRows] = await pool.query(
    'SELECT tanggal_only, guru_id, status, jumlah_jam FROM kehadiran WHERE tanggal_only BETWEEN ? AND ?',
    [startDate, endDate]
  );

  attendanceRows.forEach(r => {
    if (!guruMap.has(r.guru_id)) return;
    const guru = guruMap.get(r.guru_id);
    const jam = parseInt(r.jumlah_jam) || 0;
    if (r.status === 'Hadir') {
      guru.totalHadir += jam;
      guru.transportDays.push(r.tanggal_only);
    } else if (r.status === 'Izin') {
      guru.totalIzin += jam;
    } else if (r.status === 'Tidak Hadir') {
      guru.totalTidakHadir += jam;
    }
  });

  const currentYear = new Date().getFullYear();
  const teacherResults = [];

  const extraCompensationMap = new Map();
  const [extraRows] = await pool.query(
    `SELECT teacher_id, nama_ekstra, jumlah_hadir, nominal, tanggal
     FROM pengeluaran_ekstrakurikuler
     WHERE tanggal BETWEEN ? AND ?`,
    [startDate, endDate]
  );
  extraRows.forEach((row) => {
    const teacherKey = String(row.teacher_id || '').trim();
    if (!teacherKey) return;
    const list = extraCompensationMap.get(teacherKey) || [];
    list.push({
      type: 'extracurricular',
      label: `Ekstrakurikuler - ${row.nama_ekstra || 'Ekstra'}`,
      qty: parseInt(row.jumlah_hadir, 10) || 0,
      rate: Number(row.nominal) || 0,
      total: ((parseInt(row.jumlah_hadir, 10) || 0) * (Number(row.nominal) || 0)),
      tanggal: row.tanggal
    });
    extraCompensationMap.set(teacherKey, list);
  });

  const [disciplineRows] = await pool.query(
    `SELECT teacher_id, jumlah_hadir, nominal, tanggal
     FROM pengeluaran_kedisiplinan
     WHERE tanggal BETWEEN ? AND ?`,
    [startDate, endDate]
  );
  disciplineRows.forEach((row) => {
    const teacherKey = String(row.teacher_id || '').trim();
    if (!teacherKey) return;
    const list = extraCompensationMap.get(teacherKey) || [];
    list.push({
      type: 'discipline',
      label: 'Kedisiplinan',
      qty: parseInt(row.jumlah_hadir, 10) || 0,
      rate: Number(row.nominal) || 0,
      total: ((parseInt(row.jumlah_hadir, 10) || 0) * (Number(row.nominal) || 0)),
      tanggal: row.tanggal
    });
    extraCompensationMap.set(teacherKey, list);
  });

  const monthsInRange = new Set();
  let iter = new Date(startDate);
  const end = new Date(endDate);
  while (iter <= end) {
    monthsInRange.add(`${iter.getFullYear()}-${String(iter.getMonth() + 1).padStart(2, '0')}`);
    iter.setMonth(iter.getMonth() + 1);
    iter.setDate(1);
  }

  guruMap.forEach(data => {
    const { guruId, nama, tmt, totalHadir, totalIzin, totalTidakHadir, transportDays, classification } = data;

    let totalTransportHari = 0;
    let totalTransportAcara = 0;

    monthsInRange.forEach(periode => {
      const key = `${guruId}|${periode}`;
      const manual = manualTransportMap.get(key);

      if (manual && manual.transportHari !== null && manual.transportHari !== '') {
        totalTransportHari += parseInt(manual.transportHari) || 0;
      } else {
        const [year, month] = periode.split('-').map(Number);
        const daysInThisMonth = transportDays.filter(d => {
          const dt = new Date(d);
          return dt.getFullYear() === year && (dt.getMonth() + 1) === month;
        });
        const uniqueDays = new Set(daysInThisMonth.map(d => new Date(d).toDateString()));
        totalTransportHari += uniqueDays.size;
      }
      if (manual) totalTransportAcara += manual.transportAcara;
    });

    const pengabdian = tmt > 0 ? currentYear - tmt : 0;
    let wiyathabakti = 0;
    if (pengabdian >= 26) wiyathabakti = TARIFFS.WIYATHA_26_PLUS;
    else if (pengabdian >= 21) wiyathabakti = TARIFFS.WIYATHA_21_25;
    else if (pengabdian >= 16) wiyathabakti = TARIFFS.WIYATHA_16_20;
    else if (pengabdian >= 11) wiyathabakti = TARIFFS.WIYATHA_11_15;
    else if (pengabdian >= 6) wiyathabakti = TARIFFS.WIYATHA_6_10;
    else if (pengabdian >= 1) wiyathabakti = TARIFFS.WIYATHA_1_5;

    const isPns = classification === 'PNS';
    const payableTotalHadir = isPns ? 0 : totalHadir;
    const payableTotalIzin = isPns ? 0 : totalIzin;
    const payableTotalTidakHadir = isPns ? 0 : totalTidakHadir;
    const payableTransportHari = isPns ? 0 : totalTransportHari;
    const payableTransportAcara = isPns ? 0 : totalTransportAcara;
    if (isPns) wiyathabakti = 0;

    const rateHadir = isPns ? 0 : (attendanceRates[classification] || TARIFFS.RATE_HADIR || TARIFFS.RATE_MENGAJAR);
    const rateTransport = isPns ? 0 : (transportRates[classification] || TARIFFS.RATE_TRANSPORT);
    const bisyarohJam = payableTotalHadir * rateHadir;
    const bisyarohIzin = payableTotalIzin * TARIFFS.RATE_IZIN;
    const bisyarohTidakHadir = payableTotalTidakHadir * TARIFFS.RATE_TIDAK_HADIR;
    const bisyarohMengajar = bisyarohJam + bisyarohIzin + bisyarohTidakHadir;
    const bisyarohTransport = payableTransportHari * rateTransport;
    const rawJumlahKegiatan = manualActivityMap.has(String(guruId))
      ? manualActivityMap.get(String(guruId))
      : (activityMap.get(String(guruId)) || 0);
    const jumlahKegiatan = isPns ? 0 : rawJumlahKegiatan;
    const bisyarohTransportKegiatan = jumlahKegiatan * rateTransport;
    const tasks = teacherTasksMap.get(String(guruId)) || [];
    const payableTasks = isPns ? tasks.map(t => ({ ...t, nominal: 0 })) : tasks;
    const honorTugas = payableTasks.reduce((sum, t) => sum + (t.nominal || 0), 0);
    const t1 = payableTasks[0] || null;
    const t2 = payableTasks[1] || null;
    const t3 = payableTasks[2] || null;
    const extraCompensationItems = (extraCompensationMap.get(String(guruId)) || []).map((item) => ({ ...item }));
    const extraCompensationTotal = extraCompensationItems.reduce((sum, item) => sum + (Number(item.total) || 0), 0);
    const totalBisyaroh =
      bisyarohMengajar +
      bisyarohTransport +
      bisyarohTransportKegiatan +
      honorTugas +
      wiyathabakti +
      extraCompensationTotal;

    teacherResults.push({
      guruId,
      nama,
      tmt,
      classification,
      rateHadir,
      transportRate: rateTransport,
      bisyarohMengajar,
      totalHadir: payableTotalHadir,
      totalIzin: payableTotalIzin,
      totalTidakHadir: payableTotalTidakHadir,
      totalTransportHari: payableTransportHari,
      totalTransportAcara: payableTransportAcara,
      jumlahKegiatan,
      wiyathabakti,
      bisyarohTransport,
      bisyarohTransportKegiatan,
      tugasTambahan1: t1 ? `${t1.title} (${t1.nominal})` : '',
      tugasTambahan2: t2 ? `${t2.title} (${t2.nominal})` : '',
      tugasTambahan3: t3 ? `${t3.title} (${t3.nominal})` : '',
      honorTugas,
      extraCompensationItems,
      extraCompensationTotal,
      totalBisyaroh,
      isExpense: false
    });
  });

  const otherExpenses = await getOtherExpenses(startDate, endDate);
  const expenseItems = otherExpenses.map(exp => ({
    nama: exp.kategori,
    tmt: '-',
    bisyarohMengajar: '-',
    totalHadir: '-',
    totalTransportHari: '-',
    totalTransportAcara: '-',
    jumlahKegiatan: '-',
    wiyathabakti: '-',
    bisyarohTransport: '-',
    bisyarohTransportKegiatan: '-',
    tugasTambahan1: '-',
    tugasTambahan2: '-',
    tugasTambahan3: '-',
    honorTugas: '-',
    jumlah: exp.jumlah || 1,
    nominal: exp.nominal || 0,
    totalNominal: exp.totalNominal || ((exp.jumlah || 1) * (exp.nominal || 0)),
    totalBisyaroh: -Math.abs(exp.totalNominal || exp.nominal),
    isExpense: true,
    expenseType: 'other',
    tanggal: exp.tanggal
  }));

  const extracurricularExpenses = await getExtracurricularExpenses(startDate, endDate);
  const extracurricularItems = extracurricularExpenses.map(exp => ({
    nama: `Ekstrakurikuler - ${exp.namaEkstra} (${exp.teacherName})`,
    teacherName: exp.teacherName,
    namaEkstra: exp.namaEkstra,
    teacherType: exp.teacherType,
    tmt: '-',
    bisyarohMengajar: '-',
    totalHadir: '-',
    totalTransportHari: '-',
    totalTransportAcara: '-',
    jumlahKegiatan: '-',
    wiyathabakti: '-',
    bisyarohTransport: '-',
    bisyarohTransportKegiatan: '-',
    tugasTambahan1: '-',
    tugasTambahan2: '-',
    tugasTambahan3: '-',
    honorTugas: '-',
    jumlah: exp.jumlahHadir || 0,
    nominal: exp.nominal || 0,
    totalNominal: exp.jumlahDiterima || ((exp.jumlahHadir || 0) * (exp.nominal || 0)),
    totalBisyaroh: -Math.abs(Number(exp.jumlahDiterima || 0)),
    isExpense: true,
    expenseType: 'extracurricular',
    tanggal: exp.tanggal
  }));

  const disciplineExpenses = await getDisciplineExpenses(startDate, endDate);
  const disciplineItems = disciplineExpenses.map(exp => ({
    nama: `Kedisiplinan (${exp.teacherName})`,
    tmt: '-',
    bisyarohMengajar: '-',
    totalHadir: '-',
    totalTransportHari: '-',
    totalTransportAcara: '-',
    jumlahKegiatan: '-',
    wiyathabakti: '-',
    bisyarohTransport: '-',
    bisyarohTransportKegiatan: '-',
    tugasTambahan1: '-',
    tugasTambahan2: '-',
    tugasTambahan3: '-',
    honorTugas: '-',
    jumlah: exp.jumlahHadir || 0,
    nominal: exp.nominal || 0,
    totalNominal: exp.jumlahDiterima || ((exp.jumlahHadir || 0) * (exp.nominal || 0)),
    totalBisyaroh: -Math.abs(exp.jumlahDiterima || exp.nominal || 0),
    isExpense: true,
    expenseType: 'discipline',
    tanggal: exp.tanggal
  }));

  const combined = teacherResults.concat(expenseItems, extracurricularItems, disciplineItems);
  combined.sort((a, b) => {
    if (!a.isExpense && !b.isExpense) {
      const tmtA = Number(a.tmt) || 0;
      const tmtB = Number(b.tmt) || 0;
      if (tmtA !== tmtB) return tmtA - tmtB;
    }
    if (a.isExpense && !b.isExpense) return 1;
    if (!a.isExpense && b.isExpense) return -1;
    if (a.isExpense && b.isExpense) return new Date(a.tanggal) - new Date(b.tanggal);
    return b.totalBisyaroh - a.totalBisyaroh || a.nama.localeCompare(b.nama);
  });

  return combined;
}

async function getFinancialSummary(startDate, endDate) {
  const summaryData = await getTeacherAttendanceSummary(startDate, endDate);
  const totalHonorarium = summaryData.filter(i => !i.isExpense).reduce((t, i) => t + (i.totalBisyaroh || 0), 0);
  const totalPengeluaran = summaryData.filter(i => i.isExpense).reduce((t, i) => t + Math.abs(i.totalBisyaroh || 0), 0);
  return {
    totalHonorarium,
    totalPengeluaran,
    grandTotal: totalHonorarium - totalPengeluaran
  };
}

async function getTotalBisyarohBreakdown(startDate, endDate) {
  const summaryData = await getTeacherAttendanceSummary(startDate, endDate);
  const teachers = summaryData.filter(i => !i.isExpense);
  const expenses = summaryData.filter(i => i.isExpense);

  const wiyathabakti = teachers.reduce((t, i) => t + (Number(i.wiyathabakti) || 0), 0);
  const totalHadirMengajar = teachers.reduce((t, i) => t + (Number(i.totalHadir) || 0), 0);
  const bisyarohMengajar = teachers.reduce((t, i) => t + (Number(i.bisyarohMengajar) || 0), 0);
  const transportKehadiran = teachers.reduce((t, i) => t + (Number(i.bisyarohTransport) || 0), 0);
  const transportKegiatan = teachers.reduce((t, i) => t + (Number(i.bisyarohTransportKegiatan) || 0), 0);
  const bisyarohKehadiran = transportKehadiran + transportKegiatan;
  const bisyarohTugasTambahan = teachers.reduce((t, i) => t + (Number(i.honorTugas) || 0), 0);
  const extraCompensation = teachers.reduce((t, i) => t + (Number(i.extraCompensationTotal) || 0), 0);
  const pengeluaranLain = expenses
    .filter((i) => i.expenseType !== 'extracurricular' && i.expenseType !== 'discipline')
    .reduce((t, i) => t + Math.abs(Number(i.totalNominal || i.totalBisyaroh || 0)), 0);
  const pengeluaranEkstrakurikuler = expenses
    .filter((i) => i.expenseType === 'extracurricular')
    .reduce((t, i) => t + Math.abs(Number(i.totalNominal || i.totalBisyaroh || 0)), 0);
  const pengeluaranKedisiplinan = expenses
    .filter((i) => i.expenseType === 'discipline')
    .reduce((t, i) => t + Math.abs(Number(i.totalNominal || i.totalBisyaroh || 0)), 0);

  const totalHonorarium = wiyathabakti + bisyarohMengajar + bisyarohKehadiran + bisyarohTugasTambahan + extraCompensation;
  const totalPengeluaran = pengeluaranLain + pengeluaranEkstrakurikuler + pengeluaranKedisiplinan;
  const total = totalHonorarium + totalPengeluaran;

  return {
    wiyathabakti,
    totalHadirMengajar,
    bisyarohMengajar,
    bisyarohKehadiran,
    bisyarohTugasTambahan,
    transportKehadiran,
    transportKegiatan,
    pengeluaranLain,
    pengeluaranEkstrakurikuler,
    pengeluaranKedisiplinan,
    extraCompensation,
    totalHonorarium,
    totalPengeluaran,
    total
  };
}

async function getManualTransportData(periode) {
  const [teachers] = await pool.query('SELECT guru_id, nama FROM guru ORDER BY nama');

  const [attendanceRows] = await pool.query(
    'SELECT tanggal_only, guru_id, status FROM kehadiran WHERE DATE_FORMAT(tanggal_only, "%Y-%m") = ?',
    [periode]
  );
  const defaultTransportMap = new Map();
  attendanceRows.forEach(r => {
    if (r.status === 'Hadir') {
      if (!defaultTransportMap.has(r.guru_id)) defaultTransportMap.set(r.guru_id, new Set());
      defaultTransportMap.get(r.guru_id).add(r.tanggal_only);
    }
  });

  const [manualRows] = await pool.query('SELECT guru_id, periode, transport_hari, transport_acara FROM transport_manual WHERE periode = ?', [periode]);
  const manualMap = new Map();
  manualRows.forEach(r => manualMap.set(r.guru_id, { transportHari: r.transport_hari, transportAcara: r.transport_acara || 0 }));

  const result = teachers.map(t => {
    const defaultDays = (defaultTransportMap.get(t.guru_id) || new Set()).size;
    const override = manualMap.get(t.guru_id);
    const finalJumlahHari = (override && override.transportHari !== null && override.transportHari !== '') ? override.transportHari : defaultDays;

    return {
      guruId: t.guru_id,
      nama: t.nama,
      jumlahHari: finalJumlahHari,
      jumlahAcara: override ? override.transportAcara : 0
    };
  });

  return result;
}

async function saveBulkManualTransport(transportData) {
  if (!Array.isArray(transportData) || transportData.length === 0) {
    return { success: true, message: 'Tidak ada data transport manual.' };
  }

  // Keep FK integrity: transport_manual.guru_id -> guru.guru_id
  // Some flows now use teacher IDs from master table; create missing guru rows on-the-fly.
  const guruIds = Array.from(new Set(transportData.map((item) => String(item.guruId || '').trim()).filter(Boolean)));
  if (guruIds.length) {
    const placeholders = guruIds.map(() => '?').join(',');
    const [existingGuruRows] = await pool.query(
      `SELECT guru_id FROM guru WHERE guru_id IN (${placeholders})`,
      guruIds
    );
    const existing = new Set(existingGuruRows.map((r) => String(r.guru_id)));
    const missing = guruIds.filter((id) => !existing.has(id));

    if (missing.length) {
      let teacherMap = new Map();
      if (masterPool) {
        const missingPlaceholders = missing.map(() => '?').join(',');
        const [teacherRows] = await masterPool.query(
          `SELECT id, name, classification, tmt
           FROM teachers
           WHERE id IN (${missingPlaceholders})`,
          missing
        );
        teacherMap = new Map(teacherRows.map((r) => [String(r.id), r]));
      }

      const values = missing.map((id) => {
        const teacher = teacherMap.get(id);
        const tmtYear = (() => {
          if (!teacher?.tmt) return null;
          if (typeof teacher.tmt === 'number') return teacher.tmt;
          const dt = new Date(teacher.tmt);
          return Number.isNaN(dt.getTime()) ? null : dt.getFullYear();
        })();
        return [
          id,
          teacher?.name || `Guru ${id}`,
          teacher?.classification || null,
          tmtYear,
          ''
        ];
      });

      await pool.query(
        `INSERT INTO guru (guru_id, nama, klasifikasi, tmt, tugas_ids)
         VALUES ?
         ON DUPLICATE KEY UPDATE nama = VALUES(nama), klasifikasi = VALUES(klasifikasi), tmt = VALUES(tmt)`,
        [values]
      );
    }
  }

  const rows = transportData.map(item => [
    item.guruId,
    item.periode,
    item.jumlahHari || 0,
    item.jumlahAcara || 0
  ]);

  await pool.query(
    `INSERT INTO transport_manual (guru_id, periode, transport_hari, transport_acara)
     VALUES ?
     ON DUPLICATE KEY UPDATE
       transport_hari=VALUES(transport_hari),
       transport_acara=VALUES(transport_acara)`,
    [rows]
  );

  return { success: true, message: 'Transport manual berhasil disimpan.' };
}

async function getManualActivityData(startDate, endDate) {
  await ensureManualActivityTable();
  const [rows] = await pool.query(
    `SELECT guru_id, start_date, end_date, jumlah
     FROM kegiatan_manual
     WHERE start_date = ? AND end_date = ?`,
    [startDate, endDate]
  );
  return rows.map(r => ({
    guruId: String(r.guru_id),
    startDate: String(r.start_date).slice(0, 10),
    endDate: String(r.end_date).slice(0, 10),
    jumlah: parseInt(r.jumlah) || 0
  }));
}

async function saveManualActivity(data) {
  await ensureManualActivityTable();
  const guruId = String(data.guruId || '').trim();
  const startDate = String(data.startDate || '').slice(0, 10);
  const endDate = String(data.endDate || '').slice(0, 10);
  const jumlah = Math.max(0, parseInt(data.jumlah, 10) || 0);
  if (!guruId || !startDate || !endDate) {
    throw new Error('guruId, startDate, dan endDate wajib diisi.');
  }
  await pool.query(
    `INSERT INTO kegiatan_manual (guru_id, start_date, end_date, jumlah)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE jumlah=VALUES(jumlah)`,
    [guruId, startDate, endDate, jumlah]
  );
  return { success: true, message: 'Kegiatan manual berhasil disimpan.' };
}

async function getPayslipData(startDate, endDate, guruId) {
  const summaryData = await getTeacherAttendanceSummary(startDate, endDate);
  const teacherData = summaryData.find(i => i.guruId === guruId && !i.isExpense);
  if (!teacherData) throw new Error('Data guru tidak ditemukan untuk periode ini.');

  const configMap = await getConfigMap();

  const rateMengajar = parseFloat(configMap.get('RATE_MENGAJAR')) || 0;
  const rateHadir = teacherData.rateHadir || parseFloat(configMap.get('RATE_HADIR')) || rateMengajar;
  const rateIzin = parseFloat(configMap.get('RATE_IZIN')) || 0;
  const rateTidakHadir = parseFloat(configMap.get('RATE_TIDAK_HADIR')) || 0;
  const rateTransport = teacherData.transportRate || parseFloat(configMap.get('RATE_TRANSPORT')) || 0;
  const currentYear = new Date().getFullYear();
  const pengabdianYears = teacherData.tmt ? Math.max(0, currentYear - Number(teacherData.tmt)) : 0;
  const extraCompensationItems = (teacherData.extraCompensationItems || []).map((item) => ({
    nama: item.label,
    qty: item.qty,
    rate: item.rate,
    total: item.total
  }));

  return {
    nama: teacherData.nama,
    periode: monthKey(startDate),
    pengabdianYears,
    tugasTambahan1: teacherData.tugasTambahan1 || '',
    tugasTambahan2: teacherData.tugasTambahan2 || '',
    tugasTambahan3: teacherData.tugasTambahan3 || '',
    pendapatan: [
      { nama: 'Honor Hadir', qty: teacherData.totalHadir, rate: rateHadir, total: teacherData.totalHadir * rateHadir },
      { nama: 'Honor Izin', qty: teacherData.totalIzin || 0, rate: rateIzin, total: (teacherData.totalIzin || 0) * rateIzin },
      { nama: 'Honor Tidak Hadir', qty: teacherData.totalTidakHadir || 0, rate: rateTidakHadir, total: (teacherData.totalTidakHadir || 0) * rateTidakHadir },
      { nama: 'Transport Harian', qty: teacherData.totalTransportHari, rate: rateTransport, total: teacherData.totalTransportHari * rateTransport },
      { nama: 'Transport Acara', qty: teacherData.totalTransportAcara, rate: rateTransport, total: teacherData.totalTransportAcara * rateTransport },
      { nama: 'Wiyathabakti', qty: 1, rate: teacherData.wiyathabakti, total: teacherData.wiyathabakti },
      ...extraCompensationItems,
      { nama: 'Tugas Tambahan', qty: 1, rate: teacherData.honorTugas, total: teacherData.honorTugas }
    ],
    totalPendapatan: teacherData.totalBisyaroh,
    gajiBersih: teacherData.totalBisyaroh
  };
}

async function getAllPayslipsData(startDate, endDate, options = {}) {
  const summaryData = await getTeacherAttendanceSummary(startDate, endDate);
  const includeZero = options.includeZero === true;
  const allTeacherData = summaryData.filter(i => !i.isExpense && (includeZero || i.totalBisyaroh > 0));

  const configMap = await getConfigMap();
  const rateMengajar = parseFloat(configMap.get('RATE_MENGAJAR')) || 0;
  const rateHadir = parseFloat(configMap.get('RATE_HADIR')) || rateMengajar;
  const rateIzin = parseFloat(configMap.get('RATE_IZIN')) || 0;
  const rateTidakHadir = parseFloat(configMap.get('RATE_TIDAK_HADIR')) || 0;
  const currentYear = new Date().getFullYear();

  return allTeacherData.map(t => ({
    guruId: String(t.guruId),
    transportRate: t.transportRate || 0,
    nama: t.nama,
    periode: monthKey(startDate),
    pengabdianYears: t.tmt ? Math.max(0, currentYear - Number(t.tmt)) : 0,
    tugasTambahan1: t.tugasTambahan1 || '',
    tugasTambahan2: t.tugasTambahan2 || '',
    tugasTambahan3: t.tugasTambahan3 || '',
    pendapatan: [
      { nama: 'Honor Hadir', qty: t.totalHadir, rate: t.rateHadir || rateHadir, total: t.totalHadir * (t.rateHadir || rateHadir) },
      { nama: 'Honor Izin', qty: t.totalIzin || 0, rate: rateIzin, total: (t.totalIzin || 0) * rateIzin },
      { nama: 'Honor Tidak Hadir', qty: t.totalTidakHadir || 0, rate: rateTidakHadir, total: (t.totalTidakHadir || 0) * rateTidakHadir },
      { nama: 'Transport Harian', qty: t.totalTransportHari, rate: t.transportRate || 0, total: t.totalTransportHari * (t.transportRate || 0) },
      { nama: 'Transport Acara', qty: t.totalTransportAcara, rate: t.transportRate || 0, total: t.totalTransportAcara * (t.transportRate || 0) },
      { nama: 'Wiyathabakti', qty: 1, rate: t.wiyathabakti, total: t.wiyathabakti },
      ...(t.extraCompensationItems || []).map((item) => ({
        nama: item.label,
        qty: item.qty,
        rate: item.rate,
        total: item.total
      })),
      { nama: 'Tugas Tambahan', qty: 1, rate: t.honorTugas, total: t.honorTugas }
    ],
    totalPendapatan: t.totalBisyaroh,
    gajiBersih: t.totalBisyaroh
  }));
}

async function getPayrollPeriodStatus(periodValue) {
  const { period } = payrollPeriodRange(periodValue);
  await ensurePayrollSnapshotTables();
  const [rows] = await pool.query(
    `SELECT p.period, p.status, p.generated_at, p.generated_by, p.locked_at, p.locked_by,
            p.unlocked_at, p.unlocked_by, p.unlock_reason,
            COUNT(s.id) AS teacher_count, COALESCE(SUM(s.total), 0) AS grand_total
     FROM payroll_periods p
     LEFT JOIN payroll_snapshots s ON s.period = p.period
     WHERE p.period = ?
     GROUP BY p.period, p.status, p.generated_at, p.generated_by, p.locked_at, p.locked_by,
              p.unlocked_at, p.unlocked_by, p.unlock_reason
     LIMIT 1`,
    [period]
  );
  if (!rows.length) {
    return {
      period,
      status: 'not_generated',
      generatedAt: null,
      generatedBy: null,
      lockedAt: null,
      lockedBy: null,
      unlockedAt: null,
      unlockedBy: null,
      unlockReason: null,
      teacherCount: 0,
      grandTotal: 0
    };
  }
  const row = rows[0];
  return {
    period: row.period,
    status: row.status === 'locked' ? 'locked' : 'generated',
    generatedAt: row.generated_at || null,
    generatedBy: row.generated_by || null,
    lockedAt: row.locked_at || null,
    lockedBy: row.locked_by || null,
    unlockedAt: row.unlocked_at || null,
    unlockedBy: row.unlocked_by || null,
    unlockReason: row.unlock_reason || null,
    teacherCount: Number(row.teacher_count || 0),
    grandTotal: Number(row.grand_total || 0)
  };
}

async function generatePayrollPeriod(periodValue, actor) {
  const { period, startDate, endDate } = payrollPeriodRange(periodValue);
  await ensurePayrollSnapshotTables();
  const current = await getPayrollPeriodStatus(period);
  if (current.status === 'locked') {
    const error = new Error('Bisyaroh periode ini sudah dikunci. Buka kunci sebelum melakukan generate ulang.');
    error.status = 409;
    throw error;
  }

  const payslips = await getAllPayslipsData(startDate, endDate, { includeZero: true });
  const actorName = payrollActorName(actor);
  const generatedAt = new Date();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      `INSERT INTO payroll_periods
         (period, status, generated_at, generated_by, locked_at, locked_by,
          unlocked_at, unlocked_by, unlock_reason)
       VALUES (?, 'generated', ?, ?, NULL, NULL, NULL, NULL, NULL)
       ON DUPLICATE KEY UPDATE
         status='generated', generated_at=VALUES(generated_at), generated_by=VALUES(generated_by),
         locked_at=NULL, locked_by=NULL, unlocked_at=NULL, unlocked_by=NULL, unlock_reason=NULL`,
      [period, generatedAt, actorName]
    );
    await connection.query('DELETE FROM payroll_snapshots WHERE period = ?', [period]);
    if (payslips.length) {
      const values = payslips.map((payslip) => [
        period,
        String(payslip.guruId),
        String(payslip.nama || '-'),
        Number(payslip.gajiBersih || 0),
        JSON.stringify({
          ...payslip,
          periode: period,
          payrollStatus: 'generated',
          generatedAt: generatedAt.toISOString(),
          generatedBy: actorName,
          lockedAt: null,
          lockedBy: null
        })
      ]);
      await connection.query(
        `INSERT INTO payroll_snapshots
           (period, guru_id, teacher_name, total, payload_json)
         VALUES ?`,
        [values]
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  return {
    success: true,
    message: current.status === 'generated'
      ? `Bisyaroh ${period} berhasil digenerate ulang.`
      : `Bisyaroh ${period} berhasil digenerate.`,
    ...(await getPayrollPeriodStatus(period))
  };
}

async function lockPayrollPeriod(periodValue, actor) {
  const { period } = payrollPeriodRange(periodValue);
  await ensurePayrollSnapshotTables();
  const current = await getPayrollPeriodStatus(period);
  if (current.status === 'not_generated') {
    const error = new Error('Generate Bisyaroh terlebih dahulu sebelum mengunci periode.');
    error.status = 409;
    throw error;
  }
  const actorName = payrollActorName(actor);
  const lockedAt = new Date();
  await pool.query(
    `UPDATE payroll_periods
     SET status='locked', locked_at=?, locked_by=?
     WHERE period=?`,
    [lockedAt, actorName, period]
  );
  const [rows] = await pool.query(
    'SELECT id, payload_json FROM payroll_snapshots WHERE period = ?',
    [period]
  );
  for (const row of rows) {
    const payload = JSON.parse(row.payload_json);
    payload.payrollStatus = 'locked';
    payload.lockedAt = lockedAt.toISOString();
    payload.lockedBy = actorName;
    await pool.query(
      'UPDATE payroll_snapshots SET payload_json = ? WHERE id = ?',
      [JSON.stringify(payload), row.id]
    );
  }
  return {
    success: true,
    message: `Bisyaroh ${period} berhasil dikunci.`,
    ...(await getPayrollPeriodStatus(period))
  };
}

async function unlockPayrollPeriod(periodValue, actor, reasonValue) {
  const { period } = payrollPeriodRange(periodValue);
  await ensurePayrollSnapshotTables();
  const reason = String(reasonValue || '').trim();
  if (!reason) {
    const error = new Error('Alasan membuka kunci wajib diisi.');
    error.status = 400;
    throw error;
  }
  const current = await getPayrollPeriodStatus(period);
  if (current.status !== 'locked') {
    const error = new Error('Periode Bisyaroh ini tidak sedang terkunci.');
    error.status = 409;
    throw error;
  }
  const actorName = payrollActorName(actor);
  const unlockedAt = new Date();
  await pool.query(
    `UPDATE payroll_periods
     SET status='generated', locked_at=NULL, locked_by=NULL,
         unlocked_at=?, unlocked_by=?, unlock_reason=?
     WHERE period=?`,
    [unlockedAt, actorName, reason.slice(0, 500), period]
  );
  const [rows] = await pool.query(
    'SELECT id, payload_json FROM payroll_snapshots WHERE period = ?',
    [period]
  );
  for (const row of rows) {
    const payload = JSON.parse(row.payload_json);
    payload.payrollStatus = 'generated';
    payload.lockedAt = null;
    payload.lockedBy = null;
    payload.unlockedAt = unlockedAt.toISOString();
    payload.unlockedBy = actorName;
    payload.unlockReason = reason.slice(0, 500);
    await pool.query(
      'UPDATE payroll_snapshots SET payload_json = ? WHERE id = ?',
      [JSON.stringify(payload), row.id]
    );
  }
  return {
    success: true,
    message: `Kunci Bisyaroh ${period} berhasil dibuka. Generate ulang jika ada koreksi data.`,
    ...(await getPayrollPeriodStatus(period))
  };
}

async function getPayrollSnapshotPayslip(periodValue, guruIdValue) {
  const { period } = payrollPeriodRange(periodValue);
  const guruId = String(guruIdValue || '').trim();
  if (!guruId) {
    const error = new Error('guruId wajib diisi.');
    error.status = 400;
    throw error;
  }
  const state = await getPayrollPeriodStatus(period);
  if (state.status === 'not_generated') {
    return { ...state, payslip: null };
  }
  const [rows] = await pool.query(
    `SELECT payload_json
     FROM payroll_snapshots
     WHERE period = ? AND guru_id = ?
     LIMIT 1`,
    [period, guruId]
  );
  if (!rows.length) return { ...state, payslip: null };
  const payslip = JSON.parse(rows[0].payload_json);
  return {
    ...state,
    payslip: {
      ...payslip,
      payrollStatus: state.status,
      generatedAt: state.generatedAt,
      generatedBy: state.generatedBy,
      lockedAt: state.lockedAt,
      lockedBy: state.lockedBy
    }
  };
}

module.exports = {
  getTeacherAttendanceSummary,
  getFinancialSummary,
  getTotalBisyarohBreakdown,
  getManualTransportData,
  saveBulkManualTransport,
  getManualActivityData,
  saveManualActivity,
  getPayslipData,
  getAllPayslipsData,
  getPayrollPeriodStatus,
  generatePayrollPeriod,
  lockPayrollPeriod,
  unlockPayrollPeriod,
  getPayrollSnapshotPayslip,
  getOtherExpenses,
  getActiveTeachers,
  getExtracurricularMasterOptions,
  getExtracurricularExpenses,
  getExtracurricularMonthSheet,
  getExtracurricularDuplicateAudit,
  deleteExtracurricularDuplicate,
  getExtracurricularRates,
  saveExtracurricularRates,
  getDisciplineMonthSheet,
  getActivities,
  addActivity,
  addOtherExpense,
  updateOtherExpense,
  deleteOtherExpense,
  addExtracurricularExpense,
  saveExtracurricularBulk,
  updateExtracurricularExpense,
  deleteExtracurricularExpense,
  addDisciplineExpense,
  saveDisciplineBulk,
  deleteDisciplineExpense
};
