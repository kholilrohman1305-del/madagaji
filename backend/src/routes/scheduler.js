const express = require('express');
const config = require('../services/scheduler/configService');
const scheduler = require('../services/schedulerService');

const router = express.Router();

// Get all metadata
router.get('/meta', async (req, res, next) => {
  try {
    const [teachers, subjects, classes, teacherSubjects, classSubjects, teacherLimits] = await Promise.all([
      config.getTeachers(),
      config.getSubjects(),
      config.getClasses(),
      config.getTeacherSubjects(),
      config.getClassSubjects(),
      config.getTeacherLimits()
    ]);
    res.json({ teachers, subjects, classes, teacherSubjects, classSubjects, teacherLimits });
  } catch (e) { next(e); }
});

// Schedule config (days, hours, slot duration, etc.)
router.get('/config', async (req, res, next) => {
  try { res.json(await config.getScheduleConfig('default')); } catch (e) { next(e); }
});

router.put('/config', async (req, res, next) => {
  try { res.json(await config.upsertScheduleConfig('default', req.body)); } catch (e) { next(e); }
});

// Teacher-Subject mapping with priority
router.put('/teacher-subjects/:teacherId', async (req, res, next) => {
  try {
    // Accepts: { subjects: [{ subjectId, priority }, ...] } or legacy { subjectIds: [1, 2, 3] }
    let subjects = req.body.subjects;
    if (!subjects && req.body.subjectIds) {
      // Legacy format: convert to new format with default priority
      subjects = req.body.subjectIds.map((id, idx) => ({ subjectId: id, priority: idx + 1 }));
    }
    res.json(await config.upsertTeacherSubjects(req.params.teacherId, subjects || []));
  } catch (e) { next(e); }
});

// Class-Subject mapping
router.put('/class-subjects/:classId', async (req, res, next) => {
  try {
    // Accepts: { subjects: [{ subjectId, hoursPerWeek }, ...] }
    const subjects = req.body.subjects || [];
    res.json(await config.upsertClassSubjects(req.params.classId, subjects));
  } catch (e) { next(e); }
});

// Bulk class-subject matrix update
router.put('/class-subjects-matrix', async (req, res, next) => {
  try {
    // Accepts: { mappings: [{ classId, subjectId, hoursPerWeek }, ...] }
    const mappings = req.body.mappings || [];
    res.json(await config.upsertClassSubjectsMatrix(mappings));
  } catch (e) { next(e); }
});

// Teacher limits
router.put('/teacher-limit/:teacherId', async (req, res, next) => {
  try {
    const { maxWeek, maxDay, minLinier } = req.body;
    res.json(await config.upsertTeacherLimit(req.params.teacherId, maxWeek, maxDay, minLinier));
  } catch (e) { next(e); }
});

// Bulk teacher limits update
router.put('/teacher-limits-bulk', async (req, res, next) => {
  try {
    // Accepts: { limits: [{ teacherId, maxWeek, maxDay, minLinier }, ...] }
    const limits = req.body.limits || [];
    res.json(await config.upsertTeacherLimitsBulk(limits));
  } catch (e) { next(e); }
});

// Generate schedule
router.post('/generate', async (req, res, next) => {
  try {
    const { days, hoursByDay } = req.body;
    const result = await scheduler.generateSchedule({ days, hoursByDay });
    res.json({ generated: result.schedule, failed: result.failed, failedByClass: result.failedByClass });
  } catch (e) { next(e); }
});

// Apply generated schedule
router.post('/apply', async (req, res, next) => {
  try {
    res.json(await scheduler.applyGeneratedSchedule(req.body.rows));
  } catch (e) { next(e); }
});

// Reset all schedules
router.post('/reset', async (req, res, next) => {
  try {
    res.json(await scheduler.resetSchedule());
  } catch (e) { next(e); }
});

module.exports = router;
