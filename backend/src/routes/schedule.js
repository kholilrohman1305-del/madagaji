const express = require('express');
const schedule = require('../services/scheduleService');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const filters = {
      hari: req.query.hari || undefined,
      kelas: req.query.kelas || undefined,
      guruId: req.query.guruId || undefined
    };
    res.json(await schedule.getSchedule(filters));
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { hari, jamKe, kelas, mapelId, guruId } = req.body || {};
    if (!hari || !kelas || !mapelId || !guruId || !Array.isArray(jamKe) || jamKe.length === 0) {
      return res.status(400).json({ success: false, message: 'Data jadwal tidak lengkap.' });
    }
    res.json(await schedule.addSchedule(req.body));
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { hari, jamKe, kelas, mapelId, guruId } = req.body || {};
    if (!hari || !jamKe || !kelas || !mapelId || !guruId) {
      return res.status(400).json({ success: false, message: 'Data jadwal tidak lengkap.' });
    }
    res.json(await schedule.updateSchedule({ ...req.body, id: req.params.id }));
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { res.json(await schedule.deleteSchedule(req.params.id)); } catch (e) { next(e); }
});

module.exports = router;
