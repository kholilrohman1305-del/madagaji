const pool = require('../db');
const masterPool = pool.master;
const { TTLCache } = require('../utils/cache');

const masterCacheTtl = Number(process.env.MASTER_CACHE_TTL_MS || 5000);
const masterCache = new TTLCache(masterCacheTtl);
const settingsCache = new TTLCache(30000);
const CACHE_KEYS = {
  MASTER: 'masterData',
  SETTINGS: 'settings'
};

function invalidateMasterCache() {
  masterCache.delete(CACHE_KEYS.MASTER);
}

function invalidateSettingsCache() {
  settingsCache.delete(CACHE_KEYS.SETTINGS);
}

async function getAllMasterData() {
  const cached = masterCache.get(CACHE_KEYS.MASTER);
  if (cached) return cached;

  const [
    [guruRows],
    [tugasRows],
    [mapelRows],
    [kelasRows],
    [piketRows],
    [kategoriRows]
  ] = await Promise.all([
    masterPool.query('SELECT id AS id, name AS nama FROM teachers WHERE is_active=1 ORDER BY name'),
    pool.query('SELECT tugas_id AS id, nama FROM honor_tugas ORDER BY nama'),
    masterPool.query('SELECT id AS id, name AS nama FROM subjects WHERE is_active=1 ORDER BY name'),
    masterPool.query('SELECT id, name AS nama FROM classes ORDER BY name'),
    pool.query('SELECT nama FROM piket ORDER BY nama'),
    pool.query('SELECT nama FROM kategori_pengeluaran ORDER BY nama')
  ]);

  const result = {
    guru: guruRows.map(r => ({ id: r.id, name: r.nama })),
    kelas: kelasRows.map(r => r.nama),
    piket: piketRows.map(r => r.nama),
    tugas: tugasRows.map(r => ({ id: r.id, name: r.nama })),
    mapel: mapelRows.map(r => ({ id: r.id, name: r.nama })),
    kategoriPengeluaran: kategoriRows.map(r => r.nama)
  };
  masterCache.set(CACHE_KEYS.MASTER, result, masterCacheTtl);
  return result;
}

async function getAllTeachers() {
  const [rows] = await masterPool.query(
    `SELECT t.id, t.name, t.classification, t.tmt,
            GROUP_CONCAT(tt.title ORDER BY tt.sort_order, tt.id SEPARATOR ', ') AS tugas_tambahan
     FROM teachers t
     LEFT JOIN (
       SELECT tt.id, tt.teacher_id, tt.title, 10 AS sort_order
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
              CONCAT('Wali Kelas ', c.name) AS title, 1 AS sort_order
       FROM classes c
       WHERE c.is_active = 1 AND c.homeroom_teacher_id IS NOT NULL
     ) tt ON tt.teacher_id = t.id
     WHERE t.is_active=1
     GROUP BY t.id, t.name, t.classification, t.tmt
     ORDER BY t.name`
  );
  return rows.map((r, idx) => ({
    rowId: idx + 1,
    guruId: r.id,
    kode: '',
    nama: r.name,
    klasifikasi: r.classification || '',
    tugasTambahan: r.tugas_tambahan || '',
    tmt: r.tmt ? new Date(r.tmt).getFullYear() || '' : '',
    tugasIds: ''
  }));
}

async function getAllStudents() {
  const [rows] = await masterPool.query('SELECT * FROM students ORDER BY id DESC LIMIT 1000');
  return rows.map((r) => ({
    id: r.id,
    nisn: r.nisn || '',
    nis: r.nis || '',
    full_name: r.full_name || r.name || r.nama || '',
    class_id: r.class_id || r.class || '',
    status: r.status || 'active'
  }));
}

async function getStudentByNisn(nisn) {
  const [rows] = await masterPool.query('SELECT * FROM students WHERE nisn = ? LIMIT 1', [nisn]);
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    id: r.id,
    nisn: r.nisn || '',
    nis: r.nis_local || r.nis || '',
    name: r.name || r.nama || '',
    class_id: r.class_id,
    student_status: r.student_status || r.status || 'aktif',
    gender: r.gender || r.jenis_kelamin || null,
    birth_date: r.birth_date || r.tanggal_lahir || null
  };
}

async function addTeacher(data) {
  throw new Error('Tambah guru dinonaktifkan. Hanya edit yang diperbolehkan.');
}

async function updateTeacher(data) {
  await masterPool.query(
    'UPDATE teachers SET name=?, classification=?, tmt=? WHERE id=?',
    [data.nama, data.klasifikasi || null, data.tmt || null, data.guruId]
  );
  invalidateMasterCache();
  return { success: true, message: `Data guru '${data.nama}' berhasil diperbarui di master.` };
}

async function deleteTeacher(guruId) {
  throw new Error('Nonaktif guru dinonaktifkan. Hanya edit yang diperbolehkan.');
}

async function getAllTugas() {
  const [rows] = await pool.query('SELECT tugas_id, nama, nominal FROM honor_tugas ORDER BY nama');
  return rows.map((r, idx) => ({ rowId: idx + 1, id: r.tugas_id, nama: r.nama, nominal: r.nominal }));
}

async function addTugas(data) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT tugas_id AS id FROM honor_tugas ORDER BY tugas_id DESC LIMIT 1 FOR UPDATE');
    const lastId = rows[0]?.id || 'T00';
    const num = parseInt(String(lastId).substring(1)) + 1;
    const newId = `T${String(num).padStart(2, '0')}`;
    await conn.query('INSERT INTO honor_tugas (tugas_id, nama, nominal) VALUES (?,?,?)', [newId, data.nama, data.nominal]);
    await conn.commit();
    invalidateMasterCache();
    return { success: true, message: 'Tugas baru berhasil ditambahkan.' };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function updateTugas(data) {
  await pool.query('UPDATE honor_tugas SET nama=?, nominal=? WHERE tugas_id=?', [data.nama, data.nominal, data.id]);
  invalidateMasterCache();
  return { success: true, message: 'Data tugas berhasil diperbarui.' };
}

async function deleteTugas(id) {
  await pool.query('DELETE FROM honor_tugas WHERE tugas_id=?', [id]);
  invalidateMasterCache();
  return { success: true, message: 'Data tugas berhasil dihapus.' };
}

async function getAllMapel() {
  const [rows] = await masterPool.query(
    'SELECT id, code, name FROM subjects WHERE is_active=1 ORDER BY name'
  );
  return rows.map((r, idx) => ({ rowId: idx + 1, id: r.id, kode: r.code, nama: r.name }));
}

async function addMapel(data) {
  await masterPool.query(
    'INSERT INTO subjects (code, name, is_active) VALUES (?,?,1)',
    [data.kode, data.nama]
  );
  invalidateMasterCache();
  return { success: true, message: 'Mapel baru berhasil ditambahkan.' };
}

async function updateMapel(data) {
  await masterPool.query('UPDATE subjects SET code=?, name=? WHERE id=?', [data.kode, data.nama, data.id]);
  invalidateMasterCache();
  return { success: true, message: 'Data mapel berhasil diperbarui.' };
}

async function deleteMapel(id) {
  await masterPool.query('UPDATE subjects SET is_active=0 WHERE id=?', [id]);
  invalidateMasterCache();
  return { success: true, message: 'Mapel dinonaktifkan di master.' };
}

async function getOtherData(type) {
  if (type === 'Kelas') {
    const [rows] = await masterPool.query('SELECT id, name AS nama FROM classes ORDER BY name');
    return rows.map(r => ({ rowId: r.id, nama: r.nama }));
  }
  if (type === 'Piket') {
    const [rows] = await pool.query('SELECT id, nama FROM piket ORDER BY nama');
    return rows.map(r => ({ rowId: r.id, nama: r.nama }));
  }
  if (type === 'Kategori_Pengeluaran') {
    const [rows] = await pool.query('SELECT id, nama FROM kategori_pengeluaran ORDER BY nama');
    return rows.map(r => ({ rowId: r.id, nama: r.nama }));
  }
  return [];
}

async function addOtherData(type, name) {
  if (type === 'Kelas') await masterPool.query('INSERT INTO classes (name) VALUES (?)', [name]);
  if (type === 'Piket') await pool.query('INSERT INTO piket (nama) VALUES (?)', [name]);
  if (type === 'Kategori_Pengeluaran') await pool.query('INSERT INTO kategori_pengeluaran (nama) VALUES (?)', [name]);
  invalidateMasterCache();
  return { success: true, message: `Data ${type} berhasil ditambahkan.` };
}

async function updateOtherData(type, id, name) {
  if (type === 'Kelas') await masterPool.query('UPDATE classes SET name=? WHERE id=?', [name, id]);
  if (type === 'Piket') await pool.query('UPDATE piket SET nama=? WHERE id=?', [name, id]);
  if (type === 'Kategori_Pengeluaran') await pool.query('UPDATE kategori_pengeluaran SET nama=? WHERE id=?', [name, id]);
  invalidateMasterCache();
  return { success: true, message: `Data ${type} berhasil diperbarui.` };
}

async function deleteOtherData(type, id) {
  throw new Error('Hapus data dinonaktifkan. Hanya edit yang diperbolehkan.');
}

async function getBisyarohSettings() {
  const cached = settingsCache.get(CACHE_KEYS.SETTINGS);
  if (cached) return cached;
  const [rows] = await pool.query('SELECT config_key, config_value FROM konfigurasi');
  const result = rows.reduce((acc, r) => {
    acc[r.config_key] = r.config_value;
    return acc;
  }, {});
  settingsCache.set(CACHE_KEYS.SETTINGS, result, 30000);
  return result;
}

async function updateBisyarohSettings(settings) {
  const keys = Object.keys(settings || {});
  for (const key of keys) {
    await pool.query(
      `INSERT INTO konfigurasi (config_key, config_value)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)`,
      [key, settings[key]]
    );
  }
  invalidateSettingsCache();
  return { success: true, message: 'Pengaturan berhasil disimpan.' };
}

const CORE_RATE_GROUPS = [
  { code: 'bisyaroh', name: 'Rate Bisyaroh', sortOrder: 10 },
  { code: 'transport', name: 'Rate Transport Harian', sortOrder: 20 },
  { code: 'wiyathabakti', name: 'Rate Wiyatabhakti', sortOrder: 30 }
];

const CORE_RATE_ITEMS = [
  ['bisyaroh', 'RATE_HADIR', 'Rate Hadir', 'per jam', 'DEFAULT', null, null, 10],
  ['bisyaroh', 'RATE_HADIR_KETERAMPILAN', 'Rate Hadir Keterampilan', 'per jam', 'KETERAMPILAN', null, null, 20],
  ['bisyaroh', 'RATE_IZIN', 'Rate Izin', 'per jam', 'IZIN', null, null, 30],
  ['bisyaroh', 'RATE_TIDAK_HADIR', 'Rate Tidak Hadir', 'per jam', 'TIDAK_HADIR', null, null, 40],
  ['transport', 'RATE_TRANSPORT', 'Default', 'per hari', 'DEFAULT', null, null, 10],
  ['transport', 'RATE_TRANSPORT_PNS', 'PNS', 'per hari', 'PNS', null, null, 20],
  ['transport', 'RATE_TRANSPORT_INPASSING', 'Inpassing', 'per hari', 'INPASSING', null, null, 30],
  ['transport', 'RATE_TRANSPORT_SERTIFIKASI', 'Sertifikasi', 'per hari', 'SERTIFIKASI', null, null, 40],
  ['transport', 'RATE_TRANSPORT_NON_SERTIFIKASI', 'Non Sertifikasi', 'per hari', 'NON SERTIFIKASI', null, null, 50],
  ['transport', 'RATE_TRANSPORT_KETERAMPILAN', 'Keterampilan', 'per hari', 'KETERAMPILAN', null, null, 60],
  ['wiyathabakti', 'WIYATHA_1_5', 'Pengabdian 0-5 Tahun', 'per bulan', null, 0, 5, 10],
  ['wiyathabakti', 'WIYATHA_6_10', 'Pengabdian 6-10 Tahun', 'per bulan', null, 6, 10, 20],
  ['wiyathabakti', 'WIYATHA_11_15', 'Pengabdian 11-15 Tahun', 'per bulan', null, 11, 15, 30],
  ['wiyathabakti', 'WIYATHA_16_20', 'Pengabdian 16-20 Tahun', 'per bulan', null, 16, 20, 40],
  ['wiyathabakti', 'WIYATHA_21_25', 'Pengabdian 21-25 Tahun', 'per bulan', null, 21, 25, 50],
  ['wiyathabakti', 'WIYATHA_26_PLUS', 'Pengabdian 26+ Tahun', 'per bulan', null, 26, null, 60]
];

let bisyarohCatalogReady = false;

async function ensureBisyarohRateCatalog() {
  if (bisyarohCatalogReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bisyaroh_rate_groups (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(80) NOT NULL UNIQUE,
      name VARCHAR(160) NOT NULL,
      is_core TINYINT(1) NOT NULL DEFAULT 0,
      sort_order INT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bisyaroh_rates (
      id INT AUTO_INCREMENT PRIMARY KEY,
      group_id INT NOT NULL,
      config_key VARCHAR(120) NOT NULL UNIQUE,
      name VARCHAR(160) NOT NULL,
      unit VARCHAR(80) NULL,
      match_value VARCHAR(120) NULL,
      min_years INT NULL,
      max_years INT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_bisyaroh_rates_group (group_id),
      CONSTRAINT fk_bisyaroh_rates_group FOREIGN KEY (group_id)
        REFERENCES bisyaroh_rate_groups(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  for (const group of CORE_RATE_GROUPS) {
    await pool.query(
      `INSERT INTO bisyaroh_rate_groups (code, name, is_core, sort_order)
       VALUES (?, ?, 1, ?)
       ON DUPLICATE KEY UPDATE is_core=1, sort_order=VALUES(sort_order)`,
      [group.code, group.name, group.sortOrder]
    );
  }
  const [seedRows] = await pool.query("SELECT config_value FROM konfigurasi WHERE config_key='BISYAROH_RATE_CATALOG_SEEDED' LIMIT 1");
  if (!seedRows.length) {
    const [groups] = await pool.query('SELECT id, code FROM bisyaroh_rate_groups WHERE is_core=1');
    const groupIds = new Map(groups.map((group) => [group.code, group.id]));
    for (const [groupCode, configKey, name, unit, matchValue, minYears, maxYears, sortOrder] of CORE_RATE_ITEMS) {
      await pool.query(
        `INSERT IGNORE INTO bisyaroh_rates
           (group_id, config_key, name, unit, match_value, min_years, max_years, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [groupIds.get(groupCode), configKey, name, unit, matchValue, minYears, maxYears, sortOrder]
      );
    }
    await pool.query(
      `INSERT INTO konfigurasi (config_key, config_value) VALUES ('BISYAROH_RATE_CATALOG_SEEDED', '1')
       ON DUPLICATE KEY UPDATE config_value='1'`
    );
  }
  bisyarohCatalogReady = true;
}

function rateGroupCode(name) {
  const slug = String(name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 55);
  return `custom_${slug || 'kelompok'}_${Date.now().toString(36)}`;
}

function rateConfigKey(name) {
  const slug = String(name || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 28);
  return `CUSTOM_${slug || 'RATE'}_${Date.now().toString(36).toUpperCase()}`;
}

async function assertNoWiyathabaktiOverlap(groupId, minYears, maxYears, excludeId = null) {
  const [rates] = await pool.query(
    'SELECT id, name, min_years, max_years FROM bisyaroh_rates WHERE group_id=? AND min_years IS NOT NULL',
    [groupId]
  );
  const overlap = rates.find((rate) => {
    if (excludeId && Number(rate.id) === Number(excludeId)) return false;
    const existingMax = rate.max_years === null ? Infinity : Number(rate.max_years);
    const nextMax = maxYears === null ? Infinity : Number(maxYears);
    return Number(rate.min_years) <= nextMax && Number(minYears) <= existingMax;
  });
  if (overlap) throw new Error(`Rentang tahun bertabrakan dengan rate "${overlap.name}".`);
}

async function getBisyarohRateCatalog() {
  await ensureBisyarohRateCatalog();
  const [groups] = await pool.query(
    `SELECT g.id, g.code, g.name, g.is_core, g.sort_order,
            r.id AS rate_id, r.config_key, r.name AS rate_name, r.unit,
            r.match_value, r.min_years, r.max_years, r.sort_order AS rate_sort_order,
            COALESCE(k.config_value, 0) AS nominal
     FROM bisyaroh_rate_groups g
     LEFT JOIN bisyaroh_rates r ON r.group_id = g.id
     LEFT JOIN konfigurasi k ON BINARY k.config_key = BINARY r.config_key
     ORDER BY g.sort_order, g.name, r.sort_order, r.name`
  );
  const result = [];
  const groupMap = new Map();
  groups.forEach((row) => {
    if (!groupMap.has(row.id)) {
      const group = {
        id: row.id,
        code: row.code,
        name: row.name,
        isCore: Number(row.is_core) === 1,
        sortOrder: Number(row.sort_order || 0),
        rates: []
      };
      groupMap.set(row.id, group);
      result.push(group);
    }
    if (row.rate_id) {
      groupMap.get(row.id).rates.push({
        id: row.rate_id,
        configKey: row.config_key,
        name: row.rate_name,
        unit: row.unit || '',
        matchValue: row.match_value || '',
        minYears: row.min_years === null ? null : Number(row.min_years),
        maxYears: row.max_years === null ? null : Number(row.max_years),
        sortOrder: Number(row.rate_sort_order || 0),
        nominal: Number(row.nominal || 0)
      });
    }
  });
  return result;
}

async function addBisyarohRateGroup(data) {
  await ensureBisyarohRateCatalog();
  const name = String(data?.name || '').trim();
  if (!name) throw new Error('Nama kelompok wajib diisi.');
  const [result] = await pool.query(
    'INSERT INTO bisyaroh_rate_groups (code, name, is_core, sort_order) VALUES (?, ?, 0, 100)',
    [rateGroupCode(name), name]
  );
  return { success: true, id: result.insertId, message: 'Kelompok bisyaroh berhasil ditambahkan.' };
}

async function updateBisyarohRateGroup(id, data) {
  await ensureBisyarohRateCatalog();
  const name = String(data?.name || '').trim();
  if (!name) throw new Error('Nama kelompok wajib diisi.');
  const [groups] = await pool.query('SELECT is_core FROM bisyaroh_rate_groups WHERE id=? LIMIT 1', [id]);
  if (!groups.length || Number(groups[0].is_core) === 1) throw new Error('Kelompok inti tidak dapat diubah atau kelompok tidak ditemukan.');
  await pool.query('UPDATE bisyaroh_rate_groups SET name=? WHERE id=?', [name, id]);
  return { success: true, message: 'Kelompok bisyaroh berhasil diperbarui.' };
}

async function deleteBisyarohRateGroup(id) {
  await ensureBisyarohRateCatalog();
  const [groupRows] = await pool.query('SELECT is_core FROM bisyaroh_rate_groups WHERE id=? LIMIT 1', [id]);
  if (!groupRows.length) throw new Error('Kelompok tidak ditemukan.');
  if (Number(groupRows[0].is_core) === 1) throw new Error('Tiga kelompok utama tidak dapat dihapus.');
  const [rateRows] = await pool.query('SELECT config_key FROM bisyaroh_rates WHERE group_id=?', [id]);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    for (const rate of rateRows) await connection.query('DELETE FROM konfigurasi WHERE config_key=?', [rate.config_key]);
    await connection.query('DELETE FROM bisyaroh_rate_groups WHERE id=?', [id]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  invalidateSettingsCache();
  return { success: true, message: 'Kelompok beserta seluruh rate berhasil dihapus.' };
}

async function addBisyarohRate(groupId, data) {
  await ensureBisyarohRateCatalog();
  const name = String(data?.name || '').trim();
  if (!name) throw new Error('Nama rate wajib diisi.');
  const [groupRows] = await pool.query('SELECT code FROM bisyaroh_rate_groups WHERE id=? LIMIT 1', [groupId]);
  if (!groupRows.length) throw new Error('Kelompok tidak ditemukan.');
  const minYears = data?.minYears === '' || data?.minYears === null || typeof data?.minYears === 'undefined' ? null : Number(data.minYears);
  const maxYears = data?.maxYears === '' || data?.maxYears === null || typeof data?.maxYears === 'undefined' ? null : Number(data.maxYears);
  if (groupRows[0].code === 'wiyathabakti' && (!Number.isInteger(minYears) || minYears < 0)) {
    throw new Error('Batas minimal tahun wajib berupa angka 0 atau lebih.');
  }
  if (maxYears !== null && (!Number.isInteger(maxYears) || maxYears < minYears)) {
    throw new Error('Batas maksimal tahun tidak valid.');
  }
  if (groupRows[0].code === 'wiyathabakti') await assertNoWiyathabaktiOverlap(groupId, minYears, maxYears);
  const configKey = rateConfigKey(name);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.query(
      `INSERT INTO bisyaroh_rates
         (group_id, config_key, name, unit, match_value, min_years, max_years, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, 100)`,
      [groupId, configKey, name, String(data?.unit || '').trim() || null,
        String(data?.matchValue || '').trim().toUpperCase() || null, minYears, maxYears]
    );
    await connection.query('INSERT INTO konfigurasi (config_key, config_value) VALUES (?, ?)', [configKey, Number(data?.nominal || 0)]);
    await connection.commit();
    invalidateSettingsCache();
    return { success: true, id: result.insertId, message: 'Rate berhasil ditambahkan.' };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateBisyarohRate(id, data) {
  await ensureBisyarohRateCatalog();
  const name = String(data?.name || '').trim();
  if (!name) throw new Error('Nama rate wajib diisi.');
  const [rows] = await pool.query(
    `SELECT r.config_key, r.group_id, g.code FROM bisyaroh_rates r
     JOIN bisyaroh_rate_groups g ON g.id=r.group_id WHERE r.id=? LIMIT 1`, [id]
  );
  if (!rows.length) throw new Error('Rate tidak ditemukan.');
  const minYears = data?.minYears === '' || data?.minYears === null || typeof data?.minYears === 'undefined' ? null : Number(data.minYears);
  const maxYears = data?.maxYears === '' || data?.maxYears === null || typeof data?.maxYears === 'undefined' ? null : Number(data.maxYears);
  if (rows[0].code === 'wiyathabakti' && (!Number.isInteger(minYears) || minYears < 0)) throw new Error('Batas minimal tahun tidak valid.');
  if (maxYears !== null && (!Number.isInteger(maxYears) || maxYears < minYears)) throw new Error('Batas maksimal tahun tidak valid.');
  if (rows[0].code === 'wiyathabakti') await assertNoWiyathabaktiOverlap(rows[0].group_id, minYears, maxYears, id);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      `UPDATE bisyaroh_rates SET name=?, unit=?, match_value=?, min_years=?, max_years=? WHERE id=?`,
      [name, String(data?.unit || '').trim() || null, String(data?.matchValue || '').trim().toUpperCase() || null, minYears, maxYears, id]
    );
    await connection.query(
      `INSERT INTO konfigurasi (config_key, config_value) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE config_value=VALUES(config_value)`,
      [rows[0].config_key, Number(data?.nominal || 0)]
    );
    await connection.commit();
    invalidateSettingsCache();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  return { success: true, message: 'Rate berhasil diperbarui.' };
}

async function deleteBisyarohRate(id) {
  await ensureBisyarohRateCatalog();
  const [rows] = await pool.query('SELECT config_key FROM bisyaroh_rates WHERE id=? LIMIT 1', [id]);
  if (!rows.length) throw new Error('Rate tidak ditemukan.');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('DELETE FROM konfigurasi WHERE config_key=?', [rows[0].config_key]);
    await connection.query('DELETE FROM bisyaroh_rates WHERE id=?', [id]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  invalidateSettingsCache();
  return { success: true, message: 'Rate berhasil dihapus.' };
}

async function getTeacherTasksWithRates() {
  const [tasks] = await masterPool.query(
    `SELECT tt.id, tt.teacher_id, tt.title, tt.description, tt.start_date, tt.end_date, tt.status,
            t.name AS teacher_name, 0 AS is_auto_homeroom
     FROM teacher_tasks tt
     LEFT JOIN teachers t ON t.id = tt.teacher_id
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
            CONCAT('Wali Kelas ', c.name) AS title,
            CONCAT('Wali kelas ', c.name) AS description,
            NULL AS start_date, NULL AS end_date, 'aktif' AS status,
            COALESCE(t.name, c.homeroom_teacher) AS teacher_name, 1 AS is_auto_homeroom
     FROM classes c
     LEFT JOIN teachers t ON t.id = c.homeroom_teacher_id
     WHERE c.is_active = 1 AND c.homeroom_teacher_id IS NOT NULL
     ORDER BY is_auto_homeroom ASC, id DESC`
  );
  const [rates] = await pool.query('SELECT task_id, nominal FROM teacher_task_rates');
  const rateMap = new Map(rates.map(r => [String(r.task_id), Number(r.nominal || 0)]));
  const [manualWaliRates] = await masterPool.query(
    `SELECT tt.id, tt.teacher_id
     FROM teacher_tasks tt
     WHERE tt.status = 'aktif' AND LOWER(TRIM(tt.title)) = 'wali kelas'`
  );
  const manualWaliRateMap = new Map();
  manualWaliRates.forEach((row) => {
    const rate = rateMap.get(String(row.id));
    if (typeof rate !== 'undefined' && !manualWaliRateMap.has(String(row.teacher_id))) {
      manualWaliRateMap.set(String(row.teacher_id), rate);
    }
  });
  const rows = tasks.map(t => ({
    ...t,
    nominal: rateMap.get(String(t.id)) ?? (Number(t.is_auto_homeroom) === 1 ? manualWaliRateMap.get(String(t.teacher_id)) : undefined) ?? 0
  }));
  return rows.map(r => ({
    id: r.id,
    teacherId: r.teacher_id,
    teacherName: r.teacher_name || '',
    title: r.title,
    description: r.description,
    startDate: r.start_date,
    endDate: r.end_date,
    status: r.status,
    isAutoHomeroom: Number(r.is_auto_homeroom) === 1,
    nominal: r.nominal ?? 0
  }));
}

async function upsertTeacherTaskRate(taskId, nominal) {
  await pool.query(
    `INSERT INTO teacher_task_rates (task_id, nominal)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE nominal=VALUES(nominal)`,
    [taskId, nominal || 0]
  );
  return { success: true, message: 'Nominal tugas tambahan diperbarui.' };
}

module.exports = {
  getAllMasterData,
  getAllTeachers,
  getAllStudents,
  getStudentByNisn,
  addTeacher,
  updateTeacher,
  deleteTeacher,
  getAllTugas,
  addTugas,
  updateTugas,
  deleteTugas,
  getAllMapel,
  addMapel,
  updateMapel,
  deleteMapel,
  getOtherData,
  addOtherData,
  updateOtherData,
  deleteOtherData,
  getBisyarohSettings,
  updateBisyarohSettings,
  getBisyarohRateCatalog,
  addBisyarohRateGroup,
  updateBisyarohRateGroup,
  deleteBisyarohRateGroup,
  addBisyarohRate,
  updateBisyarohRate,
  deleteBisyarohRate,
  getTeacherTasksWithRates,
  upsertTeacherTaskRate
};
