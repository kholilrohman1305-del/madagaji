const express = require('express');
const schedule = require('../services/scheduleService');
const payroll = require('../services/payrollService');
const attendance = require('../services/attendanceService');
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
// Automatically marks the teacher present (Hadir) in the kehadiran table.
// Matches against jadwal using day+jam+teacher name lookup from master teachers.
router.post('/journal-sync', async (req, res, next) => {
  try {
    const { tanggal, guruNama, kelasNama, jamKe } = req.body;
    if (!tanggal || !guruNama || !kelasNama || !jamKe) {
      return res.status(400).json({ success: false, message: 'tanggal, guruNama, kelasNama, jamKe wajib diisi.' });
    }

    const masterPool = pool.master;
    const jamList = (Array.isArray(jamKe) ? jamKe : String(jamKe).split(',')).map(j => String(j).trim()).filter(Boolean);
    if (jamList.length === 0) {
      return res.status(400).json({ success: false, message: 'jamKe tidak boleh kosong.' });
    }

    // Lookup teacher id dari master berdasarkan nama
    const [teacherRows] = await masterPool.query(
      'SELECT id FROM teachers WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND is_active=1 LIMIT 1',
      [guruNama]
    );
    let masterGuruId = teacherRows.length > 0 ? String(teacherRows[0].id) : null;
    if (!masterGuruId) {
      const [fuzzyRows] = await masterPool.query(
        'SELECT id FROM teachers WHERE LOWER(TRIM(name)) LIKE ? AND is_active=1 LIMIT 1',
        [`%${guruNama.toLowerCase().trim()}%`]
      );
      if (fuzzyRows.length > 0) masterGuruId = String(fuzzyRows[0].id);
    }
    if (!masterGuruId) {
      return res.status(404).json({ success: false, message: `Guru tidak ditemukan di master: "${guruNama}"` });
    }

    // Lookup kelas id dari master berdasarkan nama
    const [classRows] = await masterPool.query(
      'SELECT id FROM classes WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1',
      [kelasNama]
    );
    let masterKelasId = classRows.length > 0 ? String(classRows[0].id) : null;
    if (!masterKelasId) {
      const [fuzzyClassRows] = await masterPool.query(
        'SELECT id FROM classes WHERE LOWER(TRIM(name)) LIKE ? LIMIT 1',
        [`%${kelasNama.toLowerCase().trim()}%`]
      );
      if (fuzzyClassRows.length > 0) masterKelasId = String(fuzzyClassRows[0].id);
    }
    if (!masterKelasId) {
      return res.status(404).json({ success: false, message: `Kelas tidak ditemukan di master: "${kelasNama}"` });
    }

    // Verifikasi guru_id & kelas dari jadwal (guru_id di jadwal = master teachers.id)
    // Lookup jadwal untuk mendapat guru_id dan kelas yang valid di gaji DB
    const DAY_NAMES = ['Ahad', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const hari = DAY_NAMES[new Date(tanggal).getDay()];
    const [jadwalRows] = await pool.query(
      'SELECT guru_id, kelas FROM jadwal WHERE guru_id = ? AND kelas = ? AND hari = ? AND jam_ke IN (?) LIMIT 1',
      [masterGuruId, masterKelasId, hari, jamList]
    );

    // Tentukan guru_id dan kelas yang akan dipakai di kehadiran
    // Jika ada di jadwal → pakai dari jadwal; jika tidak → tetap pakai master IDs
    const finalGuruId = jadwalRows.length > 0 ? String(jadwalRows[0].guru_id) : masterGuruId;
    const finalKelasId = jadwalRows.length > 0 ? String(jadwalRows[0].kelas) : masterKelasId;

    const attendanceData = jamList.map(j => ({
      tanggal,
      jamKe: j,
      kelas: finalKelasId,
      guruId: finalGuruId,
      status: 'Hadir'
    }));

    const result = await attendance.saveBulkAttendance(attendanceData);
    res.json({
      success: true,
      message: result.message,
      synced: jamList.length,
      guruId: finalGuruId,
      kelasId: finalKelasId,
      matchedJadwal: jadwalRows.length > 0
    });
  } catch (e) {
    if (String(e.message || '').includes('hari libur')) {
      return res.json({ success: false, message: e.message, skipped: true });
    }
    next(e);
  }
});

module.exports = router;
