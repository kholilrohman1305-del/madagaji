const express = require('express');
const controller = require('../controllers/recommendations.controller');

const router = express.Router();

router.get('/students', controller.recommendStudents);
router.get('/model', controller.getModelConfig);
router.post('/feedback', controller.recordFeedback);

module.exports = router;
