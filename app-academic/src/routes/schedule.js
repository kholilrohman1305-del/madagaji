const express = require('express');
const { listSchedule } = require('../services/scheduleService');

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

module.exports = router;
