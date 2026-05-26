const express = require('express');
const controller = require('../controllers/teachers.controller');

const router = express.Router();

router.get('/', controller.list);
router.get('/:id', controller.getById);
router.post('/', controller.create);
router.post('/bulk-update', controller.bulkUpdate);
router.put('/:id', controller.update);
router.delete('/:id', controller.remove);

module.exports = router;
