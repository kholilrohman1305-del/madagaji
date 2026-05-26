const express = require('express');
const controller = require('../controllers/bulk.controller');

const router = express.Router();

router.post('/:entity', controller.bulkAction);

module.exports = router;
