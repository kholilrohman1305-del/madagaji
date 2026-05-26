const express = require('express');
const controller = require('../controllers/student-affairs.controller');

const router = express.Router();

router.get('/promotion/candidates', controller.listPromotionCandidates);
router.post('/promotion/run', controller.runPromotion);
router.post('/promotion/rollback-last', controller.rollbackLastPromotion);

router.get('/mutations', controller.listMutations);
router.post('/mutations', controller.createMutation);
router.delete('/mutations/:id', controller.deleteMutation);

router.get('/class-histories', controller.listClassHistories);
router.post('/class-histories', controller.createClassHistory);
router.delete('/class-histories/:id', controller.deleteClassHistory);

router.get('/achievements', controller.listAchievements);
router.post('/achievements', controller.createAchievement);
router.put('/achievements/:id', controller.updateAchievement);
router.delete('/achievements/:id', controller.deleteAchievement);

router.get('/documents', controller.listDocuments);
router.post('/documents', controller.createDocument);
router.put('/documents/:id', controller.updateDocument);
router.delete('/documents/:id', controller.deleteDocument);

module.exports = router;
