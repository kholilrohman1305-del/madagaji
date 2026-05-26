const express = require('express');
const controller = require('../controllers/pondok-pesantren.controller');

const router = express.Router();

router.get('/', controller.list);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.delete('/:id', controller.remove);

module.exports = router;
