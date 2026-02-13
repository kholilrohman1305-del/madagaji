const pool = require('../db');
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

  const masterDb = process.env.DB_MASTER_NAME || process.env.DB_NAME;
  const [
    [guruRows],
    [tugasRows],
    [mapelRows],
    [kelasRows],
    [piketRows],
    [kategoriRows]
  ] = await Promise.all([
    pool.query(`SELECT id AS id, name AS nama FROM ${masterDb}.teachers WHERE is_active=1 ORDER BY name`),
    pool.query('SELECT tugas_id AS id, nama FROM honor_tugas ORDER BY nama'),
    pool.query(`SELECT id AS id, name AS nama FROM ${masterDb}.subjects WHERE is_active=1 ORDER BY name`),
    pool.query(`SELECT id, name AS nama FROM ${masterDb}.classes ORDER BY name`),
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
  const masterDb = process.env.DB_MASTER_NAME || process.env.DB_NAME;
  const [rows] = await pool.query(
    `SELECT t.id, t.name, t.classification, t.tmt,
            GROUP_CONCAT(tt.title ORDER BY tt.id SEPARATOR ', ') AS tugas_tambahan
     FROM ${masterDb}.teachers t
     LEFT JOIN ${masterDb}.teacher_tasks tt
       ON tt.teacher_id = t.id AND tt.status = 'aktif'
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

async function addTeacher(data) {
  throw new Error('Tambah guru dinonaktifkan. Hanya edit yang diperbolehkan.');
}

async function updateTeacher(data) {
  const masterDb = process.env.DB_MASTER_NAME || process.env.DB_NAME;
  await pool.query(
    `UPDATE ${masterDb}.teachers SET name=?, classification=?, tmt=? WHERE id=?`,
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
  const masterDb = process.env.DB_MASTER_NAME || process.env.DB_NAME;
  const [rows] = await pool.query(
    `SELECT id, code, name FROM ${masterDb}.subjects WHERE is_active=1 ORDER BY name`
  );
  return rows.map((r, idx) => ({ rowId: idx + 1, id: r.id, kode: r.code, nama: r.name }));
}

async function addMapel(data) {
  const masterDb = process.env.DB_MASTER_NAME || process.env.DB_NAME;
  await pool.query(
    `INSERT INTO ${masterDb}.subjects (code, name, is_active) VALUES (?,?,1)`,
    [data.kode, data.nama]
  );
  invalidateMasterCache();
  return { success: true, message: 'Mapel baru berhasil ditambahkan.' };
}

async function updateMapel(data) {
  const masterDb = process.env.DB_MASTER_NAME || process.env.DB_NAME;
  await pool.query(`UPDATE ${masterDb}.subjects SET code=?, name=? WHERE id=?`, [data.kode, data.nama, data.id]);
  invalidateMasterCache();
  return { success: true, message: 'Data mapel berhasil diperbarui.' };
}

async function deleteMapel(id) {
  const masterDb = process.env.DB_MASTER_NAME || process.env.DB_NAME;
  await pool.query(`UPDATE ${masterDb}.subjects SET is_active=0 WHERE id=?`, [id]);
  invalidateMasterCache();
  return { success: true, message: 'Mapel dinonaktifkan di master.' };
}

async function getOtherData(type) {
  const masterDb = process.env.DB_MASTER_NAME || process.env.DB_NAME;
  if (type === 'Kelas') {
    const [rows] = await pool.query(`SELECT id, name AS nama FROM ${masterDb}.classes ORDER BY name`);
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
  const masterDb = process.env.DB_MASTER_NAME || process.env.DB_NAME;
  if (type === 'Kelas') await pool.query(`INSERT INTO ${masterDb}.classes (name) VALUES (?)`, [name]);
  if (type === 'Piket') await pool.query('INSERT INTO piket (nama) VALUES (?)', [name]);
  if (type === 'Kategori_Pengeluaran') await pool.query('INSERT INTO kategori_pengeluaran (nama) VALUES (?)', [name]);
  invalidateMasterCache();
  return { success: true, message: `Data ${type} berhasil ditambahkan.` };
}

async function updateOtherData(type, id, name) {
  const masterDb = process.env.DB_MASTER_NAME || process.env.DB_NAME;
  if (type === 'Kelas') await pool.query(`UPDATE ${masterDb}.classes SET name=? WHERE id=?`, [name, id]);
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
    await pool.query('UPDATE konfigurasi SET config_value=? WHERE config_key=?', [settings[key], key]);
  }
  invalidateSettingsCache();
  return { success: true, message: 'Pengaturan berhasil disimpan.' };
}

async function getTeacherTasksWithRates() {
  const masterDb = process.env.DB_MASTER_NAME || process.env.DB_NAME;
  const localDb = process.env.DB_NAME;
  const [rows] = await pool.query(
    `SELECT tt.id, tt.teacher_id, tt.title, tt.description, tt.start_date, tt.end_date, tt.status,
            t.name AS teacher_name,
            r.nominal
     FROM ${masterDb}.teacher_tasks tt
     LEFT JOIN ${masterDb}.teachers t ON t.id = tt.teacher_id
     LEFT JOIN ${localDb}.teacher_task_rates r ON r.task_id = tt.id
     WHERE tt.status = 'aktif'
     ORDER BY tt.id DESC`
  );
  return rows.map(r => ({
    id: r.id,
    teacherId: r.teacher_id,
    teacherName: r.teacher_name || '',
    title: r.title,
    description: r.description,
    startDate: r.start_date,
    endDate: r.end_date,
    status: r.status,
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
  getTeacherTasksWithRates,
  upsertTeacherTaskRate
};
