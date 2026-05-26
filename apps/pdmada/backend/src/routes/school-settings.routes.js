const express = require('express');
const controller = require('../controllers/school-settings.controller');

const router = express.Router();

router.get('/', controller.get);
router.put('/', controller.save);

module.exports = router;
