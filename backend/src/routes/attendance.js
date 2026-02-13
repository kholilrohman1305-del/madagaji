const express = require('express');
const attendance = require('../services/attendanceService');

const router = express.Router();

router.get('/schedule', async (req, res, next) => {
  try {
    const date = req.query.date;
    if (!date) return res.status(400).json({ success: false, message: 'Parameter date wajib.' });
    res.json(await attendance.getScheduleAndAttendance(date));
  } catch (e) { next(e); }
});

router.get('/holiday', async (req, res, next) => {
  try {
    const date = req.query.date;
    if (!date) return res.status(400).json({ success: false, message: 'Parameter date wajib.' });
    res.json(await attendance.getHoliday(date));
  } catch (e) { next(e); }
});

router.post('/holiday', async (req, res, next) => {
  try {
    const { date, reason } = req.body || {};
    if (!date || !reason) return res.status(400).json({ success: false, message: 'date dan reason wajib.' });
    res.json(await attendance.setHoliday(date, reason));
  } catch (e) { next(e); }
});

router.delete('/holiday', async (req, res, next) => {
  try {
    const date = req.query.date;
    if (!date) return res.status(400).json({ success: false, message: 'Parameter date wajib.' });
    res.json(await attendance.clearHoliday(date));
  } catch (e) { next(e); }
});

router.post('/bulk', async (req, res, next) => {
  try {
    if (!Array.isArray(req.body)) return res.status(400).json({ success: false, message: 'Payload harus array.' });
    res.json(await attendance.saveBulkAttendance(req.body));
  } catch (e) { next(e); }
});

router.get('/monitor', async (req, res, next) => {
  try {
    const date = req.query.date;
    if (!date) return res.status(400).json({ success: false, message: 'Parameter date wajib.' });
    res.json(await attendance.getMonitorData(date));
  } catch (e) { next(e); }
});

router.get('/statistics', async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) return res.status(400).json({ success: false, message: 'startDate dan endDate wajib.' });
    res.json(await attendance.getTeacherStatistics(startDate, endDate));
  } catch (e) { next(e); }
});

module.exports = router;
