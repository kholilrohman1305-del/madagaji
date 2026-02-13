const { getScheduleAndAttendance } = require('./attendanceService');
const { getFinancialSummary } = require('./payrollService');
const { TTLCache } = require('../utils/cache');
const pool = require('../db');

const dashCache = new TTLCache(5000);
const CACHE_KEY = 'dashboard';

async function getDashboardData() {
  const cached = dashCache.get(CACHE_KEY);
  if (cached) return cached;
  const today = new Date();
  const todayString = today.toISOString().slice(0, 10);

  const scheduleTodayPayload = await getScheduleAndAttendance(todayString);
  const scheduleToday = scheduleTodayPayload.items || [];

  const uniqueTeachersTotal = new Set();
  const uniqueTeachersKampusA = new Set();
  const uniqueTeachersKampusB = new Set();

  scheduleToday.forEach(item => {
    const guruId = item.guruId;
    uniqueTeachersTotal.add(guruId);

    const classStr = String(item.kelas || '').trim();
    const parts = classStr.split('.');
    if (parts.length > 1) {
      const suffix = parseInt(parts[1]);
      if (!isNaN(suffix)) {
        if (suffix >= 1 && suffix <= 4) uniqueTeachersKampusB.add(guruId);
        else if (suffix >= 5) uniqueTeachersKampusA.add(guruId);
      }
    }
  });

  const presentTeachersList = scheduleToday.filter(item => item.status === 'Hadir');
  const absentTeachersList = scheduleToday.filter(item => item.status === 'Izin' || item.status === 'Tidak Hadir');
  const absentCount = new Set(absentTeachersList.map(item => item.guruId)).size;
  const presentCount = new Set(presentTeachersList.map(item => item.guruId)).size;

  const masterDb = process.env.DB_MASTER_NAME || process.env.DB_NAME;
  const [[{ totalGuru }]] = await pool.query(`SELECT COUNT(*) AS totalGuru FROM ${masterDb}.teachers WHERE is_active=1`);
  const [[{ totalKelas }]] = await pool.query(`SELECT COUNT(*) AS totalKelas FROM ${masterDb}.classes`);

  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const startOfMonthString = startOfMonth.toISOString().slice(0, 10);
  const endOfMonthString = endOfMonth.toISOString().slice(0, 10);
  const financialSummary = await getFinancialSummary(startOfMonthString, endOfMonthString);

  const result = {
    totalGuru: totalGuru || uniqueTeachersTotal.size,
    totalKelas: totalKelas || 0,
    countKampusA: uniqueTeachersKampusA.size,
    countKampusB: uniqueTeachersKampusB.size,
    absentCount,
    presentCount,
    totalBisyarohMonth: financialSummary.totalHonorarium,
    absentTeachersList: absentTeachersList.sort((a, b) => a.jamKe - b.jamKe),
    presentTeachersList: presentTeachersList.sort((a, b) => a.jamKe - b.jamKe)
  };
  dashCache.set(CACHE_KEY, result, 5000);
  return result;
}

module.exports = { getDashboardData };
