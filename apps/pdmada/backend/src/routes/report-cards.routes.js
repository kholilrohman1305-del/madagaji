const express = require('express');
const controller = require('../controllers/report-cards.controller');

const router = express.Router();

router.get('/', controller.list);
router.post('/meta/upsert', controller.upsertMeta);
router.post('/meta/bulk-upsert', controller.bulkUpsertMeta);

module.exports = router;
