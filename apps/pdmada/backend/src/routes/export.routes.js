const express = require('express');
const controller = require('../controllers/export.controller');

const router = express.Router();

router.get('/', controller.listEntities);
router.get('/:entity', controller.exportEntity);

module.exports = router;
