const express = require('express');
const {
  listSchedule,
  addSchedule,
  updateSchedule,
  deleteSchedule
} = require('../services/scheduleService');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const data = await listSchedule({
      hari: req.query.hari || '',
      kelas: req.query.kelas || '',
      guruId: req.query.guruId || ''
    });
    res.json(data);
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const out = await addSchedule(req.body || {});
    res.json(out);
  } catch (e) {
    next(e);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const out = await updateSchedule({ ...(req.body || {}), id: req.params.id });
    res.json(out);
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const out = await deleteSchedule(req.params.id);
    res.json(out);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
