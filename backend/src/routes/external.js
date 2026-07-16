const express = require('express');
const schedule = require('../services/scheduleService');
const payroll = require('../services/payrollService');
const attendance = require('../services/attendanceService');
const journalReconcile = require('../services/journalReconcileService');
const pool = require('../db');
const { formatDateToYMD } = require('../utils/date');

const router = express.Router();

// Resolve a "YYYY-MM" period into first/last calendar day strings (YYYY-MM-DD).
// Defaults to the current month when no period is supplied.
function resolvePeriodRange(period) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(period || '').trim());
  const now = new Date();
  const year = match ? Number(match[1]) : now.getFullYear();
  const month = match ? Number(match[2]) : now.getMonth() + 1;
  const pad = (n) => String(n).padStart(2, '0');
  const lastDay = new Date(year, month, 0).getDate();
  return {
    startDate: `${year}-${pad(month)}-01`,
    endDate: `${year}-${pad(month)}-${pad(lastDay)}`
  };
}

// GET /api/external/public-stats — counts for pdmada dashboard (no auth)
router.get('/public-stats', async (req, res) => {
  try {
    const [[gRow]] = await pool.master.query('SELECT COUNT(*) AS c FROM teachers WHERE is_active = 1').catch(() => [[{c:null}]]);
    const [[kRow]] = await pool.query('SELECT COUNT(DISTINCT kelas) AS c FROM jadwal').catch(() => [[{c:null}]]);
    const [[jRow]] = await pool.query('SELECT COUNT(*) AS c FROM jadwal').catch(() => [[{c:null}]]);
    res.json({ ok: true, guru: gRow?.c ?? null, kelas: kRow?.c ?? null, jadwal: jRow?.c ?? null });
  } catch (e) {
    res.status(500).json({ ok: false, guru: null, kelas: null, jadwal: null });
  }
});

// GET /api/external/schedule/:guruId - one teacher's weekly teaching schedule
router.get('/schedule/:guruId', async (req, res, next) => {
  try {
    const guruId = String(req.params.guruId || '').trim();
    if (!guruId) return res.status(400).json({ success: false, message: 'guruId wajib diisi.' });
    const rows = await schedule.getSchedule({ guruId });
    res.json({ success: true, data: rows });
  } catch (e) { next(e); }
});

// GET /api/external/payslip/:guruId?period=YYYY-MM - one teacher's bisyaroh breakdown
router.get('/payslip/:guruId', async (req, res, next) => {
  try {
    const guruId = String(req.params.guruId || '').trim();
    if (!guruId) return res.status(400).json({ success: false, message: 'guruId wajib diisi.' });
    const { startDate, endDate } = resolvePeriodRange(req.query.period);
    const data = await payroll.getPayslipData(startDate, endDate, guruId);
    res.json({ success: true, data: { ...data, startDate, endDate } });
  } catch (e) {
    if (String(e.message || '').includes('tidak ditemukan')) {
      return res.json({ success: true, data: null });
    }
    next(e);
  }
});

// POST /api/external/journal-sync
// Called by emada when a teacher saves a journal entry.
// Strict matching: kehadiran hanya dicatat jika di jadwal ada slot dengan
// hari (dari tanggal) + guru + kelas + mapel yang sama. Tanpa kecocokan
// jadwal, tidak ada baris kehadiran yang disimpan (menu kehadiran tidak hijau).
// Logika pencocokan dipakai bersama dengan job rekonsiliasi (tarik ulang
// jurnal emada berkala) — lihat services/journalReconcileService.js.
router.post('/journal-sync', async (req, res, next) => {
  try {
    const { tanggal, guruNama, kelasNama, mapelNama, jamKe } = req.body;
    if (!tanggal || !guruNama || !kelasNama || !jamKe) {
      return res.status(400).json({ success: false, message: 'tanggal, guruNama, kelasNama, jamKe wajib diisi.' });
    }

    const result = await journalReconcile.matchJournalToSchedule({ tanggal, guruNama, kelasNama, mapelNama, jamKe });
    if (!result.matched) {
      // 200 karena ini bukan error — memang by design jurnal tanpa jadwal
      // yang cocok tidak dihitung hadir.
      console.log(`[journal-sync] SKIP (${result.reason}) — guru="${guruNama}" kelas="${kelasNama}" mapel="${mapelNama || '-'}" tanggal=${tanggal}`);
      return res.json({ success: true, matched: false, synced: 0, message: `Tidak dicatat: ${result.reason}` });
    }

    const saveResult = await attendance.saveBulkAttendance(result.slots);
    const slots = result.slots.map(s => s.jamKe);
    console.log(`[journal-sync] MATCH — guru=${result.guruId} kelas=${result.kelasId} mapel=${result.mapelId} jam=${slots.join(',')}`);
    res.json({
      success: true,
      matched: true,
      message: saveResult.message,
      synced: slots.length,
      guruId: result.guruId,
      kelasId: result.kelasId,
      mapelId: result.mapelId,
      jamKe: slots
    });
  } catch (e) {
    if (String(e.message || '').includes('hari libur')) {
      return res.json({ success: false, message: e.message, skipped: true });
    }
    next(e);
  }
});

// GET /api/external/schedule-guru?nama={nama}&hari={hari}
// Dipakai emada: jadwal mengajar guru (mis. hari ini) di dashboard.
// Lookup guru by nama karena emada tidak menyimpan id master.
router.get('/schedule-guru', async (req, res, next) => {
  try {
    const nama = String(req.query.nama || '').trim();
    const hari = String(req.query.hari || '').trim();
    if (!nama) return res.status(400).json({ success: false, message: 'nama wajib diisi.' });

    const masterPool = pool.master;
    const [teacherRows] = await masterPool.query(
      'SELECT id FROM teachers WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND is_active=1 LIMIT 1',
      [nama]
    );
    let guruId = teacherRows.length > 0 ? String(teacherRows[0].id) : null;
    if (!guruId) {
      const [fuzzyRows] = await masterPool.query(
        'SELECT id FROM teachers WHERE LOWER(TRIM(name)) LIKE ? AND is_active=1 LIMIT 1',
        [`%${nama.toLowerCase()}%`]
      );
      if (fuzzyRows.length > 0) guruId = String(fuzzyRows[0].id);
    }
    if (!guruId) return res.json({ success: true, guruId: null, data: [], message: `Guru tidak ditemukan di master: "${nama}"` });

    let rows = await schedule.getSchedule({ guruId });
    if (hari) rows = rows.filter(r => String(r.hari || '').toLowerCase() === hari.toLowerCase());
    rows.sort((a, b) => Number(a.jamKe) - Number(b.jamKe));
    res.json({ success: true, guruId, data: rows });
  } catch (e) { next(e); }
});

// GET /api/external/schedule-kelas?kelas={kelas}&hari={hari}
// Dipakai pdmada untuk menampilkan jadwal siswa berdasarkan nama kelas.
// jadwal.kelas berisi ID kelas master, jadi nama kelas ("XII.10") harus
// di-resolve dulu ke ID — sebelumnya difilter langsung sehingga selalu kosong.
router.get('/schedule-kelas', async (req, res, next) => {
  try {
    const kelas = String(req.query.kelas || '').trim();
    const hari  = String(req.query.hari  || '').trim();
    if (!kelas) return res.status(400).json({ success: false, message: 'kelas wajib diisi.' });

    let kelasId = kelas;
    if (!/^\d+$/.test(kelas)) {
      const masterPool = pool.master;
      const [rows] = await masterPool.query(
        'SELECT id FROM classes WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1',
        [kelas]
      );
      if (rows.length === 0) {
        const [fuzzy] = await masterPool.query(
          'SELECT id FROM classes WHERE LOWER(TRIM(name)) LIKE ? LIMIT 1',
          [`%${kelas.toLowerCase()}%`]
        );
        if (fuzzy.length === 0) return res.json({ success: true, data: [], message: `Kelas tidak ditemukan: "${kelas}"` });
        kelasId = String(fuzzy[0].id);
      } else {
        kelasId = String(rows[0].id);
      }
    }

    const rows = await schedule.getSchedule({ kelas: kelasId, hari: hari || undefined });
    res.json({ success: true, data: rows });
  } catch (e) { next(e); }
});

// GET /api/external/payroll-total?period=YYYY-MM
// Total bisyaroh breakdown seluruh guru sebulan — untuk dashboard kepala madrasah
router.get('/payroll-total', async (req, res, next) => {
  try {
    const { startDate, endDate } = resolvePeriodRange(req.query.period);
    const [breakdown, summary] = await Promise.all([
      payroll.getTotalBisyarohBreakdown(startDate, endDate),
      payroll.getFinancialSummary(startDate, endDate)
    ]);
    res.json({ success: true, data: { ...breakdown, ...summary, startDate, endDate } });
  } catch (e) { next(e); }
});

// GET /api/external/payroll-rekap?period=YYYY-MM
// Rekap bisyaroh per guru — untuk kepala madrasah (read-only)
router.get('/payroll-rekap', async (req, res, next) => {
  try {
    const { startDate, endDate } = resolvePeriodRange(req.query.period);
    const teachers = await payroll.getAllPayslipsData(startDate, endDate);
    res.json({ success: true, data: { teachers, startDate, endDate } });
  } catch (e) { next(e); }
});

// GET /api/external/schedule-today
// Jadwal hari ini: guru terjadwal + guru tidak hadir/izin
router.get('/schedule-today', async (req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const payload = await attendance.getScheduleAndAttendance(today);
    const items = payload.items || [];

    const scheduledMap = new Map();
    const absentMap = new Map();
    items.forEach((item) => {
      const sess = {
        jamKe: item.jamKe,
        namaKelas: item.namaKelas,
        namaMapel: item.namaMapel,
        startTime: item.startTime,
        endTime: item.endTime,
        durationMinutes: item.durationMinutes,
        status: item.status || ''
      };
      if (!scheduledMap.has(item.guruId)) {
        scheduledMap.set(item.guruId, { guruId: item.guruId, namaGuru: item.namaGuru, sessions: [] });
      }
      scheduledMap.get(item.guruId).sessions.push(sess);
      if (item.status === 'Izin' || item.status === 'Tidak Hadir') {
        if (!absentMap.has(item.guruId)) {
          absentMap.set(item.guruId, { guruId: item.guruId, namaGuru: item.namaGuru, status: item.status, sessions: [] });
        }
        absentMap.get(item.guruId).sessions.push(sess);
      }
    });

    const scheduledTeachers = [...scheduledMap.values()].sort((a, b) => a.namaGuru.localeCompare(b.namaGuru, 'id'));
    const absentTeachers = [...absentMap.values()].sort((a, b) => a.namaGuru.localeCompare(b.namaGuru, 'id'));

    res.json({
      success: true,
      data: {
        tanggal: today,
        locked: payload.locked,
        holidayReason: payload.holidayReason,
        totalTerjadwal: scheduledTeachers.length,
        totalTidakHadir: absentTeachers.length,
        scheduledTeachers,
        absentTeachers
      }
    });
  } catch (e) { next(e); }
});

module.exports = router;
