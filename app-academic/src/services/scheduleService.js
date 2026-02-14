const { db1 } = require('../db');
const { getTeacherMap, getSubjectMap, getClassMap } = require('./masterService');

async function listSchedule({ hari = '', kelas = '', guruId = '' } = {}) {
  const where = [];
  const params = [];
  if (hari) {
    where.push('hari=?');
    params.push(hari);
  }
  if (kelas) {
    where.push('kelas=?');
    params.push(kelas);
  }
  if (guruId) {
    where.push('guru_id=?');
    params.push(guruId);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [rows, teacherMap, subjectMap, classMap] = await Promise.all([
    db1.query(
      `SELECT id, hari, jam_ke, kelas, mapel_id, guru_id
       FROM jadwal
       ${whereSql}
       ORDER BY hari, jam_ke, kelas`,
      params
    ),
    getTeacherMap(),
    getSubjectMap(),
    getClassMap()
  ]);

  return rows[0].map((r, idx) => ({
    rowId: idx + 1,
    id: r.id,
    hari: r.hari,
    jamKe: r.jam_ke,
    kelas: r.kelas,
    namaKelas: classMap.get(String(r.kelas)) || String(r.kelas),
    mapelId: r.mapel_id,
    namaMapel: subjectMap.get(String(r.mapel_id)) || String(r.mapel_id),
    guruId: r.guru_id,
    namaGuru: teacherMap.get(String(r.guru_id)) || String(r.guru_id)
  }));
}

async function addSchedule(data) {
  if (!Array.isArray(data.jamKe) || data.jamKe.length === 0) {
    throw new Error('Tidak ada jam pelajaran yang dipilih.');
  }
  const jamList = data.jamKe.map(j => String(j));

  const [classConflicts] = await db1.query(
    'SELECT jam_ke FROM jadwal WHERE hari=? AND kelas=? AND jam_ke IN (?)',
    [data.hari, data.kelas, jamList]
  );
  if (classConflicts.length > 0) {
    throw new Error(`Jadwal bentrok untuk kelas ${data.kelas} pada hari ${data.hari}, jam ke-${classConflicts[0].jam_ke}.`);
  }

  const [last] = await db1.query('SELECT id FROM jadwal ORDER BY id DESC LIMIT 1');
  let idNum = parseInt(String(last[0]?.id || 'J000').substring(1), 10) || 0;
  const values = jamList.map(jam => {
    idNum += 1;
    return [`J${String(idNum).padStart(3, '0')}`, data.hari, jam, data.kelas, data.mapelId, data.guruId];
  });

  try {
    await db1.query('INSERT INTO jadwal (id, hari, jam_ke, kelas, mapel_id, guru_id) VALUES ?', [values]);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') throw new Error('Jadwal bentrok. Periksa kelas pada hari dan jam yang sama.');
    throw e;
  }

  return { success: true, message: `${values.length} jadwal berhasil ditambahkan.` };
}

async function updateSchedule(data) {
  const [classConflicts] = await db1.query(
    'SELECT id FROM jadwal WHERE id<>? AND hari=? AND jam_ke=? AND kelas=? LIMIT 1',
    [data.id, data.hari, data.jamKe, data.kelas]
  );
  if (classConflicts.length > 0) {
    throw new Error(`Jadwal bentrok. Kelas ${data.kelas} sudah memiliki jadwal lain pada hari ${data.hari}, jam ke-${data.jamKe}.`);
  }

  try {
    await db1.query(
      'UPDATE jadwal SET hari=?, jam_ke=?, kelas=?, mapel_id=?, guru_id=? WHERE id=?',
      [data.hari, data.jamKe, data.kelas, data.mapelId, data.guruId, data.id]
    );
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') throw new Error('Jadwal bentrok. Periksa kelas pada hari dan jam yang sama.');
    throw e;
  }
  return { success: true, message: 'Jadwal berhasil diperbarui.' };
}

async function deleteSchedule(id) {
  await db1.query('DELETE FROM jadwal WHERE id=?', [id]);
  return { success: true, message: 'Jadwal berhasil dihapus.' };
}

module.exports = { listSchedule, addSchedule, updateSchedule, deleteSchedule };
