const express = require('express');
const { getTeachers, getClasses, getSubjects, getStudents, getEmployees, getAcademicYears } = require('../services/masterService');

const router = express.Router();

router.get('/teachers', async (req, res, next) => {
  try {
    res.json(await getTeachers());
  } catch (e) {
    next(e);
  }
});

router.get('/classes', async (req, res, next) => {
  try {
    res.json(await getClasses());
  } catch (e) {
    next(e);
  }
});

router.get('/subjects', async (req, res, next) => {
  try {
    res.json(await getSubjects());
  } catch (e) {
    next(e);
  }
});

router.get('/students', async (req, res, next) => {
  try {
    res.json(await getStudents());
  } catch (e) {
    next(e);
  }
});

router.get('/employees', async (req, res, next) => {
  try {
    res.json(await getEmployees());
  } catch (e) {
    next(e);
  }
});

router.get('/academic-years', async (req, res, next) => {
  try {
    res.json(await getAcademicYears());
  } catch (e) {
    next(e);
  }
});

module.exports = router;
