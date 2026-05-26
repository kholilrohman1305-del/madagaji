const express = require('express');
const controller = require('../controllers/sync.controller');

const router = express.Router();

router.get('/changes', controller.listChanges);
router.post('/apply', controller.applyChanges);

module.exports = router;
