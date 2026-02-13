const express = require('express');
const { getDashboardData } = require('../services/dashboardService');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const data = await getDashboardData();
    res.json(data);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
