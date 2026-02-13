const pool = require('../db');
const { TTLCache } = require('../utils/cache');

const scheduleCacheTtl = Number(process.env.SCHEDULE_CACHE_TTL_MS || 5000);
const scheduleCache = new TTLCache(scheduleCacheTtl);

function cacheKey(filters) {
  const hari = filters?.hari || '';
  const kelas = filters?.kelas || '';
  const guruId = filters?.guruId || '';
  return `schedule:${hari}:${kelas}:${guruId}`;
}

function invalidateScheduleCache() {
  scheduleCache.clear();
}

async function getSchedule(filters = {}) {
  const masterDb = process.env.DB_MASTER_NAME || process.env.DB_NAME;
  const key = cacheKey(filters);
  const cached = scheduleCache.get(key);
  if (cached) return cached;

  const where = [];
  const params = [];
  if (filters.hari) {
    where.push('j.hari = ?');
    params.push(filters.hari);
  }
  if (filters.kelas) {
    where.push('j.kelas = ?');
    params.push(filters.kelas);
  }
  if (filters.guruId) {
    where.push('j.guru_id = ?');
    params.push(filters.guruId);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [rows] = await pool.query(
    `SELECT j.id, j.hari, j.jam_ke, j.kelas, j.mapel_id, j.guru_id,
            m.name AS nama_mapel, g.name AS nama_guru, c.name AS nama_kelas
     FROM jadwal j
     LEFT JOIN ${masterDb}.subjects m ON m.id = j.mapel_id
     LEFT JOIN ${masterDb}.teachers g ON g.id = j.guru_id
     LEFT JOIN ${masterDb}.classes c ON c.id = j.kelas
     ${whereSql}
     ORDER BY j.hari, j.jam_ke, j.kelas`,
    params
  );
  const result = rows.map((r, idx) => ({
    rowId: idx + 1,
    id: r.id,
    hari: r.hari,
    jamKe: r.jam_ke,
    kelas: r.kelas,
    namaKelas: r.nama_kelas || String(r.kelas),
    mapelId: r.mapel_id,
    guruId: r.guru_id,
    namaMapel: r.nama_mapel || String(r.mapel_id),
    namaGuru: r.nama_guru || String(r.guru_id)
  }));
  scheduleCache.set(key, result, scheduleCacheTtl);
  return result;
}

async function addSchedule(data) {
  if (!Array.isArray(data.jamKe) || data.jamKe.length === 0) {
    throw new Error('Tidak ada jam pelajaran yang dipilih.');
  }

  const jamList = data.jamKe.map(j => String(j));

  const [classConflicts] = await pool.query(
    'SELECT jam_ke FROM jadwal WHERE hari=? AND kelas=? AND jam_ke IN (?)',
    [data.hari, data.kelas, jamList]
  );
  if (classConflicts.length > 0) {
    const jam = classConflicts[0].jam_ke;
    throw new Error(`Jadwal bentrok untuk kelas ${data.kelas} pada hari ${data.hari}, jam ke-${jam}.`);
  }

  const rowsToAdd = [];
  let lastIdNumber = 0;
  const [last] = await pool.query('SELECT id FROM jadwal ORDER BY id DESC LIMIT 1');
  const lastId = last[0]?.id || 'J000';
  lastIdNumber = parseInt(String(lastId).substring(1)) || 0;

  for (const jam of jamList) {
    lastIdNumber++;
    const newId = `J${String(lastIdNumber).padStart(3, '0')}`;
    rowsToAdd.push([newId, data.hari, jam, data.kelas, data.mapelId, data.guruId]);
  }

  if (rowsToAdd.length > 0) {
    try {
      await pool.query('INSERT INTO jadwal (id, hari, jam_ke, kelas, mapel_id, guru_id) VALUES ?', [rowsToAdd]);
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') {
        throw new Error('Jadwal bentrok. Periksa kelas pada hari dan jam yang sama.');
      }
      throw e;
    }
  }

  invalidateScheduleCache();
  return { success: true, message: `${rowsToAdd.length} jadwal berhasil ditambahkan.` };
}

async function updateSchedule(data) {
  const [classConflicts] = await pool.query(
    'SELECT id FROM jadwal WHERE id<>? AND hari=? AND jam_ke=? AND kelas=? LIMIT 1',
    [data.id, data.hari, data.jamKe, data.kelas]
  );
  if (classConflicts.length > 0) {
    throw new Error(`Jadwal bentrok. Kelas ${data.kelas} sudah memiliki jadwal lain pada hari ${data.hari}, jam ke-${data.jamKe}.`);
  }

  try {
    await pool.query(
      'UPDATE jadwal SET hari=?, jam_ke=?, kelas=?, mapel_id=?, guru_id=? WHERE id=?',
      [data.hari, data.jamKe, data.kelas, data.mapelId, data.guruId, data.id]
    );
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      throw new Error('Jadwal bentrok. Periksa kelas pada hari dan jam yang sama.');
    }
    throw e;
  }
  invalidateScheduleCache();
  return { success: true, message: 'Jadwal berhasil diperbarui.' };
}

async function deleteSchedule(id) {
  await pool.query('DELETE FROM jadwal WHERE id=?', [id]);
  invalidateScheduleCache();
  return { success: true, message: 'Jadwal berhasil dihapus.' };
}

module.exports = { getSchedule, addSchedule, updateSchedule, deleteSchedule };
