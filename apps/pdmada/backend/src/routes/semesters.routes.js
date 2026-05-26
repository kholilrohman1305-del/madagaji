const express = require('express');
const controller = require('../controllers/semesters.controller');

const router = express.Router();

router.get('/', controller.list);
router.post('/', controller.create);
router.post('/:id/activate', controller.activate);

module.exports = router;
