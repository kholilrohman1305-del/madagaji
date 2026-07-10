const pool = require('../db');
const masterPool = pool.master;
const { TTLCache } = require('../utils/cache');
const { formatDateToYMD, monthKey } = require('../utils/date');
const { getScheduleConfig } = require('./scheduler/configService');

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const scheduleDayCacheTtl = Number(process.env.SCHEDULE_DAY_CACHE_TTL_MS || 5000);
const scheduleDayCache = new TTLCache(scheduleDayCacheTtl);
const guruCacheTtl = Number(process.env.GURU_CACHE_TTL_MS || 30000);
const guruCache = new TTLCache(guruCacheTtl);

function extractTingkat(className) {
  const n = String(className || '').toUpperCase().trim();
  if (n.startsWith('XII') || n.startsWith('12')) return 'XII';
  if (n.startsWith('XI') || n.startsWith('11')) return 'XI';
  if (n.startsWith('X') || n.startsWith('10')) return 'X';
  return '';
}

function timeToMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
  if (!match) return null;
  return Math.min(23, Math.max(0, Number(match[1]) || 0)) * 60 + Math.min(59, Math.max(0, Number(match[2]) || 0));
}

function minutesToTime(totalMinutes) {
  const mins = ((Number(totalMinutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

function getSlotTime(config, tingkat, hari, jamKe) {
  const saved = config?.slotTimesByTingkat?.[tingkat]?.[hari]?.[jamKe] || config?.slotTimesByTingkat?.[tingkat]?.[hari]?.[String(jamKe)];
  if (saved?.start && saved?.end) {
    const startMin = timeToMinutes(saved.start);
    const endMin = timeToMinutes(saved.end);
    return { startTime: saved.start, endTime: saved.end, durationMinutes: startMin != null && endMin != null ? Math.max(0, endMin - startMin) : null };
  }
  const duration = Number(config?.slotDuration || 45);
  const startBase = timeToMinutes(config?.startTimeByDay?.[hari]) ?? 7 * 60;
  const start = startBase + (Number(jamKe) - 1) * duration;
  return { startTime: minutesToTime(start), endTime: minutesToTime(start + duration), durationMinutes: duration };
}

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

  const holiday = await getHoliday(formatDateToYMD(targetDate));

  let scheduleRows = scheduleDayCache.get(dayName);
  if (!scheduleRows) {
    const [rows, teachers, subjects, classes] = await Promise.all([
      pool.query(
        `SELECT id, hari, jam_ke, kelas, mapel_id, guru_id
         FROM jadwal
         WHERE hari = ?`,
        [dayName]
      ),
      masterPool.query('SELECT id, name FROM teachers WHERE is_active=1'),
      masterPool.query('SELECT id, name FROM subjects WHERE is_active=1'),
      masterPool.query('SELECT id, name FROM classes')
    ]);

    const teacherMap = new Map(teachers[0].map(r => [String(r.id), r.name]));
    const subjectMap = new Map(subjects[0].map(r => [String(r.id), r.name]));
    const classMap = new Map(classes[0].map(r => [String(r.id), r.name]));

    scheduleRows = rows[0].map(r => ({
      ...r,
      nama_guru: teacherMap.get(String(r.guru_id)) || String(r.guru_id),
      nama_mapel: subjectMap.get(String(r.mapel_id)) || String(r.mapel_id),
      nama_kelas: classMap.get(String(r.kelas)) || String(r.kelas)
    }));
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

  const config = await getScheduleConfig().catch(() => null);
  const items = scheduleRows.map(s => {
    const key = `${s.guru_id}-${s.kelas}-${s.jam_ke}`;
    const attendance = attendanceMap.get(key);
    const namaKelas = s.nama_kelas || String(s.kelas);
    const tingkat = extractTingkat(namaKelas);
    return {
      jadwalId: s.id,
      hari: s.hari,
      jamKe: s.jam_ke,
      kelas: s.kelas,
      namaKelas,
      mapelId: s.mapel_id,
      guruId: s.guru_id,
      namaMapel: s.nama_mapel || String(s.mapel_id),
      namaGuru: s.nama_guru || String(s.guru_id),
      tingkat,
      ...getSlotTime(config, tingkat, s.hari, s.jam_ke),
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
  const [guruRows] = await masterPool.query('SELECT id, name FROM teachers WHERE is_active=1 ORDER BY name');
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
