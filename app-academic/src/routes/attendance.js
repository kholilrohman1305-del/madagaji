const express = require('express');
const {
  getDaySchedule,
  saveBulkAttendance,
  getHoliday,
  upsertHoliday,
  deleteHoliday
} = require('../services/attendanceService');
const { getTeacherStatistics } = require('../services/attendanceService');

const router = express.Router();

router.get('/day', async (req, res, next) => {
  try {
    const date = req.query.date;
    if (!date) return res.status(400).json({ success: false, message: 'date wajib.' });
    const data = await getDaySchedule(date);
    res.json(data);
  } catch (e) {
    next(e);
  }
});

// compatibility with existing frontend endpoint
router.get('/schedule', async (req, res, next) => {
  try {
    const date = req.query.date;
    if (!date) return res.status(400).json({ success: false, message: 'date wajib.' });
    const data = await getDaySchedule(date);
    res.json(data);
  } catch (e) {
    next(e);
  }
});

router.post('/bulk', async (req, res, next) => {
  try {
    const payload = Array.isArray(req.body) ? req.body : (req.body?.items || []);
    await saveBulkAttendance(payload);
    res.json({ success: true, message: 'Kehadiran berhasil disimpan.' });
  } catch (e) {
    next(e);
  }
});

router.get('/statistics', async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query || {};
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'startDate dan endDate wajib.' });
    }
    const data = await getTeacherStatistics(startDate, endDate);
    res.json(data);
  } catch (e) {
    next(e);
  }
});

router.get('/holiday', async (req, res, next) => {
  try {
    const date = req.query.date;
    if (!date) return res.status(400).json({ success: false, message: 'date wajib.' });
    const data = await getHoliday(date);
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

router.post('/holiday', async (req, res, next) => {
  try {
    const { date, reason } = req.body || {};
    if (!date || !reason) return res.status(400).json({ success: false, message: 'date dan reason wajib.' });
    await upsertHoliday(date, reason);
    res.json({ success: true, message: 'Hari libur disimpan.' });
  } catch (e) {
    next(e);
  }
});

router.delete('/holiday', async (req, res, next) => {
  try {
    const date = req.query.date;
    if (!date) return res.status(400).json({ success: false, message: 'date wajib.' });
    await deleteHoliday(date);
    res.json({ success: true, message: 'Hari libur dihapus.' });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
