const express = require('express');
const controller = require('../controllers/templates.controller');

const router = express.Router();

router.get('/:entity', controller.downloadTemplate);

module.exports = router;
