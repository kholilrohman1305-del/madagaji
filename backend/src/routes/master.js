const express = require('express');
const master = require('../services/masterService');

const router = express.Router();

router.get('/initial', async (req, res, next) => {
  try {
    res.json(await master.getAllMasterData());
  } catch (e) { next(e); }
});

router.get('/teachers', async (req, res, next) => {
  try { res.json(await master.getAllTeachers()); } catch (e) { next(e); }
});

router.post('/teachers', async (req, res, next) => {
  res.status(405).json({ success: false, message: 'Tambah guru dinonaktifkan.' });
});

router.put('/teachers/:guruId', async (req, res, next) => {
  try { res.json(await master.updateTeacher({ ...req.body, guruId: req.params.guruId })); } catch (e) { next(e); }
});

router.delete('/teachers/:guruId', async (req, res, next) => {
  res.status(405).json({ success: false, message: 'Nonaktif guru dinonaktifkan. Hanya edit yang diperbolehkan.' });
});

router.get('/tugas', async (req, res, next) => {
  try { res.json(await master.getAllTugas()); } catch (e) { next(e); }
});

router.post('/tugas', async (req, res, next) => {
  try { res.json(await master.addTugas(req.body)); } catch (e) { next(e); }
});

router.put('/tugas/:id', async (req, res, next) => {
  try { res.json(await master.updateTugas({ ...req.body, id: req.params.id })); } catch (e) { next(e); }
});

router.delete('/tugas/:id', async (req, res, next) => {
  try { res.json(await master.deleteTugas(req.params.id)); } catch (e) { next(e); }
});

router.get('/mapel', async (req, res, next) => {
  try { res.json(await master.getAllMapel()); } catch (e) { next(e); }
});

router.post('/mapel', async (req, res, next) => {
  try { res.json(await master.addMapel(req.body)); } catch (e) { next(e); }
});

router.put('/mapel/:id', async (req, res, next) => {
  try { res.json(await master.updateMapel({ ...req.body, id: req.params.id })); } catch (e) { next(e); }
});

router.delete('/mapel/:id', async (req, res, next) => {
  try { res.json(await master.deleteMapel(req.params.id)); } catch (e) { next(e); }
});

router.get('/other/:type', async (req, res, next) => {
  try { res.json(await master.getOtherData(req.params.type)); } catch (e) { next(e); }
});

router.post('/other/:type', async (req, res, next) => {
  try { res.json(await master.addOtherData(req.params.type, req.body.name)); } catch (e) { next(e); }
});

router.put('/other/:type/:id', async (req, res, next) => {
  try { res.json(await master.updateOtherData(req.params.type, req.params.id, req.body.name)); } catch (e) { next(e); }
});

router.delete('/other/:type/:id', async (req, res, next) => {
  res.status(405).json({ success: false, message: 'Hapus data dinonaktifkan. Hanya edit yang diperbolehkan.' });
});

router.get('/settings', async (req, res, next) => {
  try { res.json(await master.getBisyarohSettings()); } catch (e) { next(e); }
});

router.put('/settings', async (req, res, next) => {
  try { res.json(await master.updateBisyarohSettings(req.body)); } catch (e) { next(e); }
});

router.get('/teacher-tasks', async (req, res, next) => {
  try { res.json(await master.getTeacherTasksWithRates()); } catch (e) { next(e); }
});

router.put('/teacher-tasks/:taskId', async (req, res, next) => {
  try {
    const nominal = Number(req.body.nominal || 0);
    res.json(await master.upsertTeacherTaskRate(req.params.taskId, nominal));
  } catch (e) { next(e); }
});

module.exports = router;
