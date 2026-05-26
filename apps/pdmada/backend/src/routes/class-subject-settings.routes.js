const express = require('express');
const controller = require('../controllers/class-subject-settings.controller');

const router = express.Router();

router.get('/', controller.list);
router.post('/upsert-period', controller.upsertPeriod);
router.post('/copy-period', controller.copyPeriod);
router.post('/copy-from-previous', controller.copyFromPreviousPeriod);

module.exports = router;
