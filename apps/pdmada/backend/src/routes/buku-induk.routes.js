const express = require('express');
const controller = require('../controllers/buku-induk.controller');

const router = express.Router();

router.get('/', controller.list);
router.get('/export/csv', controller.exportCsv);
router.get('/:studentId', controller.detail);

module.exports = router;
