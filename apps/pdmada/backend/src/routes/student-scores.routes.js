const express = require('express');
const multer = require('multer');
const controller = require('../controllers/student-scores.controller');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', controller.list);
router.get('/template', controller.downloadTemplate);
router.post('/upsert', controller.upsert);
router.post('/bulk-upsert', controller.bulkUpsert);
router.post('/import-xlsx', upload.single('file'), controller.importXlsx);
router.delete('/:id', controller.remove);

module.exports = router;
