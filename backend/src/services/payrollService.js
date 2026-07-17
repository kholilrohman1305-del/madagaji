const pool = require('../db');
const masterPool = pool.master;
const { monthKey } = require('../utils/date');
const { TTLCache } = require('../utils/cache');

const configCache = new TTLCache(30000);
let expenseIdModeCache = null; // 'auto' | 'string'
let manualActivityTableReady = false;

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
  extracurricularTableEnsured = true;
}

async function getActiveTeachers() {
  const [rows] = await masterPool.query(
    'SELECT id, name FROM teachers WHERE is_active=1 ORDER BY name'
  );
  return rows.map((r) => ({ id: String(r.id), name: r.name }));
}

async function resolveExtracurricularTeacher(input) {
  const rawTeacherId = input?.teacherId;
  const manualName = String(input?.teacherNameManual || '').trim();
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
    `SELECT id, teacher_id, teacher_name, nama_ekstra
     FROM pengeluaran_ekstrakurikuler
     WHERE tanggal BETWEEN ? AND LAST_DAY(?)`,
    [monthStart, monthStart]
  );
  const currentKeys = new Set(
    currentRows.map((r) =>
      `${r.teacher_id}|${String(r.teacher_name || '').trim().toLowerCase()}|${String(r.nama_ekstra || '').trim().toLowerCase()}`
    )
  );

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
     WHERE tanggal BETWEEN ? AND LAST_DAY(?)`,
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

async function getExtracurricularExpenses(startDate, endDate) {
  await ensureExtracurricularTable();
  const [rows] = await pool.query(
    `SELECT id, tanggal, teacher_id, teacher_name, nama_ekstra, jumlah_hadir, nominal, keterangan, expense_id
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
    expenseId: r.expense_id || null
  }));
}

async function getExtracurricularMonthSheet(periode) {
  if (!/^\d{4}-\d{2}$/.test(String(periode || ''))) throw new Error('Format periode tidak valid. Gunakan YYYY-MM.');
  await ensureExtracurricularMonthRows(periode);
  const startDate = `${periode}-01`;
  const [rows] = await pool.query(
    `SELECT id, tanggal, teacher_id, teacher_name, nama_ekstra, jumlah_hadir, nominal, keterangan, expense_id
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
    expenseId: r.expense_id || null
  }));
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
        `SELECT id, teacher_id, teacher_name, nama_ekstra, keterangan, expense_id, tanggal
         FROM pengeluaran_ekstrakurikuler
         WHERE id=? AND tanggal BETWEEN ? AND LAST_DAY(?)
         LIMIT 1`,
        [row.id, startDate, startDate]
      );
      const current = currentRows[0];
      if (!current) continue;

      const jumlahHadir = parseInt(row.jumlahHadir, 10) || 0;
      const nominal = Number(row.nominal) || 0;
      await conn.query(
        'UPDATE pengeluaran_ekstrakurikuler SET jumlah_hadir=?, nominal=? WHERE id=?',
        [jumlahHadir, nominal, row.id]
      );
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
    RATE_IZIN: parseFloat(configMap.get('RATE_IZIN')) || 0,
    RATE_TIDAK_HADIR: parseFloat(configMap.get('RATE_TIDAK_HADIR')) || 0,
    RATE_TRANSPORT: parseFloat(configMap.get('RATE_TRANSPORT')) || 0,
    RATE_TRANSPORT_PNS: parseFloat(configMap.get('RATE_TRANSPORT_PNS')) || 0,
    RATE_TRANSPORT_INPASSING: parseFloat(configMap.get('RATE_TRANSPORT_INPASSING')) || 0,
    RATE_TRANSPORT_SERTIFIKASI: parseFloat(configMap.get('RATE_TRANSPORT_SERTIFIKASI')) || 0,
    RATE_TRANSPORT_NON_SERTIFIKASI: parseFloat(configMap.get('RATE_TRANSPORT_NON_SERTIFIKASI')) || 0,
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
    'NON SERTIFIKASI': TARIFFS.RATE_TRANSPORT_NON_SERTIFIKASI || TARIFFS.RATE_TRANSPORT
  };

  const normalizeClassification = (value) => {
    const v = String(value || '').trim().toLowerCase();
    if (v === 'pns') return 'PNS';
    if (v === 'inpassing') return 'INPASSING';
    if (v === 'sertifikasi') return 'SERTIFIKASI';
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

    const rateHadir = TARIFFS.RATE_HADIR || TARIFFS.RATE_MENGAJAR;
    const rateTransport = transportRates[classification] || TARIFFS.RATE_TRANSPORT;
    const bisyarohJam = totalHadir * rateHadir;
    const bisyarohIzin = totalIzin * TARIFFS.RATE_IZIN;
    const bisyarohTidakHadir = totalTidakHadir * TARIFFS.RATE_TIDAK_HADIR;
    const bisyarohMengajar = bisyarohJam + bisyarohIzin + bisyarohTidakHadir;
    const bisyarohTransport = totalTransportHari * rateTransport;
    const jumlahKegiatan = manualActivityMap.has(String(guruId))
      ? manualActivityMap.get(String(guruId))
      : (activityMap.get(String(guruId)) || 0);
    const bisyarohTransportKegiatan = jumlahKegiatan * rateTransport;
    const tasks = teacherTasksMap.get(String(guruId)) || [];
    const honorTugas = tasks.reduce((sum, t) => sum + (t.nominal || 0), 0);
    const t1 = tasks[0] || null;
    const t2 = tasks[1] || null;
    const t3 = tasks[2] || null;
    const totalBisyaroh =
      bisyarohMengajar +
      bisyarohTransport +
      bisyarohTransportKegiatan +
      honorTugas +
      wiyathabakti;

    teacherResults.push({
      guruId,
      nama,
      tmt,
      classification,
      transportRate: rateTransport,
      bisyarohMengajar,
      totalHadir,
      totalIzin,
      totalTidakHadir,
      totalTransportHari,
      totalTransportAcara,
      jumlahKegiatan,
      wiyathabakti,
      bisyarohTransport,
      bisyarohTransportKegiatan,
      tugasTambahan1: t1 ? `${t1.title} (${t1.nominal})` : '',
      tugasTambahan2: t2 ? `${t2.title} (${t2.nominal})` : '',
      tugasTambahan3: t3 ? `${t3.title} (${t3.nominal})` : '',
      honorTugas,
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
  const pengeluaranLain = expenses
    .filter((i) => i.expenseType !== 'extracurricular' && i.expenseType !== 'discipline')
    .reduce((t, i) => t + Math.abs(Number(i.totalNominal || i.totalBisyaroh || 0)), 0);
  const pengeluaranEkstrakurikuler = expenses
    .filter((i) => i.expenseType === 'extracurricular')
    .reduce((t, i) => t + Math.abs(Number(i.totalNominal || i.totalBisyaroh || 0)), 0);
  const pengeluaranKedisiplinan = expenses
    .filter((i) => i.expenseType === 'discipline')
    .reduce((t, i) => t + Math.abs(Number(i.totalNominal || i.totalBisyaroh || 0)), 0);

  const totalHonorarium = wiyathabakti + bisyarohMengajar + bisyarohKehadiran + bisyarohTugasTambahan;
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
  const rateHadir = parseFloat(configMap.get('RATE_HADIR')) || rateMengajar;
  const rateIzin = parseFloat(configMap.get('RATE_IZIN')) || 0;
  const rateTidakHadir = parseFloat(configMap.get('RATE_TIDAK_HADIR')) || 0;
  const rateTransport = teacherData.transportRate || parseFloat(configMap.get('RATE_TRANSPORT')) || 0;
  const currentYear = new Date().getFullYear();
  const pengabdianYears = teacherData.tmt ? Math.max(0, currentYear - Number(teacherData.tmt)) : 0;

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
      { nama: 'Tugas Tambahan', qty: 1, rate: teacherData.honorTugas, total: teacherData.honorTugas }
    ],
    totalPendapatan: teacherData.totalBisyaroh,
    gajiBersih: teacherData.totalBisyaroh
  };
}

async function getAllPayslipsData(startDate, endDate) {
  const summaryData = await getTeacherAttendanceSummary(startDate, endDate);
  const allTeacherData = summaryData.filter(i => !i.isExpense && i.totalBisyaroh > 0);

  const configMap = await getConfigMap();
  const rateMengajar = parseFloat(configMap.get('RATE_MENGAJAR')) || 0;
  const rateHadir = parseFloat(configMap.get('RATE_HADIR')) || rateMengajar;
  const rateIzin = parseFloat(configMap.get('RATE_IZIN')) || 0;
  const rateTidakHadir = parseFloat(configMap.get('RATE_TIDAK_HADIR')) || 0;
  const currentYear = new Date().getFullYear();

  return allTeacherData.map(t => ({
    transportRate: t.transportRate || 0,
    nama: t.nama,
    periode: monthKey(startDate),
    pengabdianYears: t.tmt ? Math.max(0, currentYear - Number(t.tmt)) : 0,
    tugasTambahan1: t.tugasTambahan1 || '',
    tugasTambahan2: t.tugasTambahan2 || '',
    tugasTambahan3: t.tugasTambahan3 || '',
    pendapatan: [
      { nama: 'Honor Hadir', qty: t.totalHadir, rate: rateHadir, total: t.totalHadir * rateHadir },
      { nama: 'Honor Izin', qty: t.totalIzin || 0, rate: rateIzin, total: (t.totalIzin || 0) * rateIzin },
      { nama: 'Honor Tidak Hadir', qty: t.totalTidakHadir || 0, rate: rateTidakHadir, total: (t.totalTidakHadir || 0) * rateTidakHadir },
      { nama: 'Transport Harian', qty: t.totalTransportHari, rate: t.transportRate || 0, total: t.totalTransportHari * (t.transportRate || 0) },
      { nama: 'Transport Acara', qty: t.totalTransportAcara, rate: t.transportRate || 0, total: t.totalTransportAcara * (t.transportRate || 0) },
      { nama: 'Wiyathabakti', qty: 1, rate: t.wiyathabakti, total: t.wiyathabakti },
      { nama: 'Tugas Tambahan', qty: 1, rate: t.honorTugas, total: t.honorTugas }
    ],
    gajiBersih: t.totalBisyaroh
  }));
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
  getOtherExpenses,
  getActiveTeachers,
  getExtracurricularExpenses,
  getExtracurricularMonthSheet,
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
