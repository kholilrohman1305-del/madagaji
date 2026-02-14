const express = require('express');
const reports = require('../services/reportsService');

const router = express.Router();

router.get('/summary', async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    res.json(await reports.getSummary(startDate, endDate));
  } catch (e) { next(e); }
});

module.exports = router;
