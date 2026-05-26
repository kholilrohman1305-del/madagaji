const express = require('express');
const controller = require('../controllers/school-years.controller');

const router = express.Router();

router.get('/', controller.list);
router.get('/:id', controller.getById);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.delete('/:id', controller.remove);
router.post('/:id/activate', controller.activate);

module.exports = router;
