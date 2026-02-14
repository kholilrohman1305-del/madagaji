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

module.exports = { listSchedule };
