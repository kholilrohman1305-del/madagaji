const express = require('express');
const multer = require('multer');
const controller = require('../controllers/import.controller');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/:entity', upload.single('file'), controller.importXlsx);

module.exports = router;
