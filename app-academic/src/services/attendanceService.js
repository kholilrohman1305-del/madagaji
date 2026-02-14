const { db1, db2 } = require('../db');
const { getTeacherMap, getSubjectMap, getClassMap } = require('./masterService');

const DAY_NAMES = ['Ahad', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

function toYmd(dateValue) {
  const d = new Date(dateValue);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function getHoliday(dateString) {
  const [rows] = await db1.query('SELECT tanggal, keterangan FROM libur WHERE tanggal = ?', [dateString]);
  return rows[0] || null;
}

async function upsertHoliday(dateString, keterangan) {
  await db1.query(
    'INSERT INTO libur (tanggal, keterangan) VALUES (?, ?) ON DUPLICATE KEY UPDATE keterangan=VALUES(keterangan)',
    [dateString, keterangan]
  );
}

async function deleteHoliday(dateString) {
  await db1.query('DELETE FROM libur WHERE tanggal = ?', [dateString]);
}

async function getDaySchedule(dateString) {
  const target = new Date(dateString);
  const dayName = DAY_NAMES[target.getDay()];
  const ymd = toYmd(target);
  const holiday = await getHoliday(ymd);

  const [scheduleRows, attendanceRows, teacherMap, subjectMap, classMap] = await Promise.all([
    db1.query('SELECT id, hari, jam_ke, kelas, mapel_id, guru_id FROM jadwal WHERE hari=?', [dayName]),
    db1.query('SELECT id, jam_ke, kelas, guru_id, status FROM kehadiran WHERE tanggal_only=?', [ymd]),
    getTeacherMap(),
    getSubjectMap(),
    getClassMap()
  ]);

  const attendanceMap = new Map();
  attendanceRows[0].forEach(r => {
    attendanceMap.set(`${r.guru_id}|${r.kelas}|${r.jam_ke}`, r);
  });

  const items = scheduleRows[0].map(r => {
    const key = `${r.guru_id}|${r.kelas}|${r.jam_ke}`;
    const att = attendanceMap.get(key);
    return {
      jadwalId: r.id,
      hari: r.hari,
      jamKe: r.jam_ke,
      kelas: r.kelas,
      namaKelas: classMap.get(String(r.kelas)) || String(r.kelas),
      mapelId: r.mapel_id,
      namaMapel: subjectMap.get(String(r.mapel_id)) || String(r.mapel_id),
      guruId: r.guru_id,
      namaGuru: teacherMap.get(String(r.guru_id)) || String(r.guru_id),
      status: att?.status || '',
      rowId: att?.id
    };
  });

  return {
    locked: Boolean(holiday),
    holidayReason: holiday?.keterangan || '',
    items
  };
}

async function saveBulkAttendance(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) return;
  const ymd = toYmd(rows[0].tanggal);
  const holiday = await getHoliday(ymd);
  if (holiday) {
    throw new Error(`Tanggal ${ymd} adalah hari libur: ${holiday.keterangan}`);
  }
  const values = rows.map(r => {
    const ts = new Date(r.tanggal);
    const jumlahJam = String(r.jamKe).split(',').length;
    return [ts, String(r.jamKe), r.kelas, r.guruId, r.status || '', jumlahJam, ymd];
  });
  await db1.query(
    `INSERT INTO kehadiran (tanggal, jam_ke, kelas, guru_id, status, jumlah_jam, tanggal_only)
     VALUES ?
     ON DUPLICATE KEY UPDATE
       tanggal=VALUES(tanggal),
       status=VALUES(status),
       jumlah_jam=VALUES(jumlah_jam)`,
    [values]
  );
}

function monthKey(dateString) {
  const d = new Date(dateString);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

async function getTeacherStatistics(startDateString, endDateString) {
  const [guruRows] = await db2.query('SELECT id, name FROM teachers WHERE is_active=1 ORDER BY name');
  const allTeachers = guruRows.map(r => ({ guruId: String(r.id), nama: r.name }));

  const [jadwalRows] = await db1.query('SELECT hari, guru_id FROM jadwal');
  const jadwalMap = new Map();
  jadwalRows.forEach(r => {
    const key = String(r.guru_id);
    if (!jadwalMap.has(key)) jadwalMap.set(key, { jam: 0, hari: new Set() });
    const stats = jadwalMap.get(key);
    stats.jam += 1;
    stats.hari.add(r.hari);
  });

  const [kehadiranRows] = await db1.query(
    `SELECT tanggal_only, guru_id, status, jumlah_jam FROM kehadiran
     WHERE tanggal_only BETWEEN ? AND ?`,
    [startDateString, endDateString]
  );

  const kehadiranMap = new Map();
  kehadiranRows.forEach(r => {
    const key = String(r.guru_id);
    if (!kehadiranMap.has(key)) kehadiranMap.set(key, { hadirJam: 0, hadirHari: new Set() });
    if (r.status === 'Hadir') {
      const stats = kehadiranMap.get(key);
      stats.hadirJam += Number(r.jumlah_jam || 0);
      stats.hadirHari.add(r.tanggal_only);
    }
  });

  const periode = monthKey(startDateString);
  const [manualRows] = await db1.query(
    'SELECT guru_id, periode, transport_hari, transport_acara FROM transport_manual WHERE periode = ?',
    [periode]
  );
  const manualMap = new Map(manualRows.map(r => [
    String(r.guru_id),
    { transportHari: r.transport_hari, transportAcara: Number(r.transport_acara || 0) }
  ]));

  const result = allTeachers.map(t => {
    const jadwalStats = jadwalMap.get(t.guruId) || { jam: 0, hari: new Set() };
    const kehadiranStats = kehadiranMap.get(t.guruId) || { hadirJam: 0, hadirHari: new Set() };
    const manualData = manualMap.get(t.guruId);
    const transportHariDariManual = (
      manualData && manualData.transportHari !== null && manualData.transportHari !== ''
    ) ? Number(manualData.transportHari) : null;
    const transportAcara = manualData ? Number(manualData.transportAcara || 0) : 0;
    const finalTransport = (transportHariDariManual !== null ? transportHariDariManual : kehadiranStats.hadirHari.size) + transportAcara;

    return {
      nama: t.nama,
      jadwalJamMingguan: jadwalStats.jam,
      jadwalHariMingguan: jadwalStats.hari.size,
      hadirJamPeriode: kehadiranStats.hadirJam,
      transportHariPeriode: finalTransport
    };
  });

  result.sort((a, b) => a.nama.localeCompare(b.nama));
  return result;
}

module.exports = {
  getDaySchedule,
  saveBulkAttendance,
  getHoliday,
  upsertHoliday,
  deleteHoliday,
  getTeacherStatistics
};
