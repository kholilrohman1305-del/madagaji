const pool = require('../db');
const { TTLCache } = require('../utils/cache');
const { formatDateToYMD, monthKey } = require('../utils/date');

const DAY_NAMES = ['Ahad', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const scheduleDayCacheTtl = Number(process.env.SCHEDULE_DAY_CACHE_TTL_MS || 5000);
const scheduleDayCache = new TTLCache(scheduleDayCacheTtl);
const guruCacheTtl = Number(process.env.GURU_CACHE_TTL_MS || 30000);
const guruCache = new TTLCache(guruCacheTtl);

async function getHoliday(dateString) {
  const [rows] = await pool.query('SELECT tanggal, keterangan FROM libur WHERE tanggal = ?', [dateString]);
  if (rows.length === 0) return null;
  return { tanggal: rows[0].tanggal, keterangan: rows[0].keterangan };
}

async function setHoliday(dateString, reason) {
  await pool.query(
    'INSERT INTO libur (tanggal, keterangan) VALUES (?, ?) ON DUPLICATE KEY UPDATE keterangan=VALUES(keterangan)',
    [dateString, reason]
  );
  return { success: true, message: 'Hari libur disimpan.' };
}

async function clearHoliday(dateString) {
  await pool.query('DELETE FROM libur WHERE tanggal = ?', [dateString]);
  return { success: true, message: 'Hari libur dihapus.' };
}

async function getScheduleAndAttendance(dateString) {
  const targetDate = new Date(dateString);
  const dayName = DAY_NAMES[targetDate.getDay()];
  const masterDb = process.env.DB_MASTER_NAME || process.env.DB_NAME;

  const holiday = await getHoliday(formatDateToYMD(targetDate));

  let scheduleRows = scheduleDayCache.get(dayName);
  if (!scheduleRows) {
    const [rows] = await pool.query(
      `SELECT j.id, j.hari, j.jam_ke, j.kelas, j.mapel_id, j.guru_id,
              g.name AS nama_guru, m.name AS nama_mapel, c.name AS nama_kelas
       FROM jadwal j
       LEFT JOIN ${masterDb}.teachers g ON g.id = j.guru_id
       LEFT JOIN ${masterDb}.subjects m ON m.id = j.mapel_id
       LEFT JOIN ${masterDb}.classes c ON c.id = j.kelas
       WHERE j.hari = ?`,
      [dayName]
    );
    scheduleRows = rows;
    scheduleDayCache.set(dayName, scheduleRows, scheduleDayCacheTtl);
  }

  const [attendanceRows] = await pool.query(
    `SELECT id, tanggal, jam_ke, kelas, guru_id, status
     FROM kehadiran
     WHERE tanggal_only = ?`,
    [formatDateToYMD(targetDate)]
  );

  const attendanceMap = new Map();
  attendanceRows.forEach(r => {
    const key = `${r.guru_id}-${r.kelas}-${r.jam_ke}`;
    attendanceMap.set(key, { status: r.status, rowId: r.id });
  });

  const items = scheduleRows.map(s => {
    const key = `${s.guru_id}-${s.kelas}-${s.jam_ke}`;
    const attendance = attendanceMap.get(key);
    return {
      jadwalId: s.id,
      hari: s.hari,
      jamKe: s.jam_ke,
      kelas: s.kelas,
      namaKelas: s.nama_kelas || String(s.kelas),
      mapelId: s.mapel_id,
      guruId: s.guru_id,
      namaMapel: s.nama_mapel || String(s.mapel_id),
      namaGuru: s.nama_guru || String(s.guru_id),
      status: attendance?.status || '',
      rowId: attendance?.rowId
    };
  });
  return {
    locked: !!holiday,
    holidayReason: holiday?.keterangan || '',
    items
  };
}

async function saveBulkAttendance(attendanceData) {
  if (!Array.isArray(attendanceData) || attendanceData.length === 0) {
    return { success: true, message: 'Tidak ada data kehadiran.' };
  }

  const tanggal = attendanceData[0]?.tanggal;
  if (tanggal) {
    const holiday = await getHoliday(formatDateToYMD(tanggal));
    if (holiday) {
      throw new Error(`Tanggal ${formatDateToYMD(tanggal)} adalah hari libur: ${holiday.keterangan}`);
    }
  }

  const rows = attendanceData.map(item => {
    const now = new Date();
    const entryTimestamp = new Date(item.tanggal);
    entryTimestamp.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), 0);

    const jumlahJam = String(item.jamKe).split(',').length;
    return [
      entryTimestamp,
      String(item.jamKe),
      item.kelas,
      item.guruId,
      item.status || '',
      jumlahJam,
      formatDateToYMD(item.tanggal)
    ];
  });

  await pool.query(
    `INSERT INTO kehadiran (tanggal, jam_ke, kelas, guru_id, status, jumlah_jam, tanggal_only)
     VALUES ?
     ON DUPLICATE KEY UPDATE
       tanggal=VALUES(tanggal),
       status=VALUES(status),
       jumlah_jam=VALUES(jumlah_jam)`,
    [rows]
  );

  return { success: true, message: 'Kehadiran berhasil disimpan.' };
}

async function getMonitorData(dateString) {
  const scheduleAndAttendance = await getScheduleAndAttendance(dateString);
  let guruMap = guruCache.get('guruMap');
  if (!guruMap) {
    const [guruRows] = await pool.query('SELECT guru_id, nama FROM guru');
    guruMap = new Map(guruRows.map(r => [r.guru_id, r.nama]));
    guruCache.set('guruMap', guruMap, guruCacheTtl);
  }

  const emptyClasses = scheduleAndAttendance
    .filter(item => item.status === 'Tidak Hadir' || item.status === 'Izin')
    .sort((a, b) => a.jamKe - b.jamKe);

  const absentTeacherIds = new Set(emptyClasses.map(item => item.guruId));
  const absentTeachers = Array.from(absentTeacherIds).map(id => ({
    id,
    name: guruMap.get(id) || `(${id})`
  }));

  return { emptyClasses, absentTeachers };
}

async function getTeacherStatistics(startDateString, endDateString) {
  const masterDb = process.env.DB_MASTER_NAME || process.env.DB_NAME;
  const [guruRows] = await pool.query(`SELECT id, name FROM ${masterDb}.teachers WHERE is_active=1 ORDER BY name`);
  const allTeachers = guruRows.map(r => ({ guruId: String(r.id), nama: r.name }));

  const [jadwalRows] = await pool.query('SELECT hari, guru_id FROM jadwal');
  const jadwalMap = new Map();
  jadwalRows.forEach(r => {
    if (!jadwalMap.has(r.guru_id)) jadwalMap.set(r.guru_id, { jam: 0, hari: new Set() });
    const stats = jadwalMap.get(r.guru_id);
    stats.jam += 1;
    stats.hari.add(r.hari);
  });

  const [kehadiranRows] = await pool.query(
    `SELECT tanggal_only, guru_id, status, jumlah_jam FROM kehadiran
     WHERE tanggal_only BETWEEN ? AND ?`,
    [startDateString, endDateString]
  );

  const kehadiranMap = new Map();
  kehadiranRows.forEach(r => {
    if (!kehadiranMap.has(r.guru_id)) kehadiranMap.set(r.guru_id, { hadirJam: 0, hadirHari: new Set() });
    if (r.status === 'Hadir') {
      const stats = kehadiranMap.get(r.guru_id);
      stats.hadirJam += parseInt(r.jumlah_jam) || 0;
      stats.hadirHari.add(r.tanggal_only);
    }
  });

  const periode = monthKey(startDateString);
  const [manualRows] = await pool.query('SELECT guru_id, periode, transport_hari, transport_acara FROM transport_manual WHERE periode = ?', [periode]);
  const manualMap = new Map(manualRows.map(r => [r.guru_id, { transportHari: r.transport_hari, transportAcara: r.transport_acara || 0 }]));

  const result = allTeachers.map(t => {
    const jadwalStats = jadwalMap.get(t.guruId) || { jam: 0, hari: new Set() };
    const kehadiranStats = kehadiranMap.get(t.guruId) || { hadirJam: 0, hadirHari: new Set() };
    const manualData = manualMap.get(t.guruId);

    const transportHariDariManual = (manualData && manualData.transportHari !== null && manualData.transportHari !== '') ? parseInt(manualData.transportHari) : null;
    const transportAcara = manualData ? (parseInt(manualData.transportAcara) || 0) : 0;
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
  getScheduleAndAttendance,
  saveBulkAttendance,
  getMonitorData,
  getTeacherStatistics,
  getHoliday,
  setHoliday,
  clearHoliday
};
