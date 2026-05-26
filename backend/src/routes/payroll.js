const express = require('express');
const payroll = require('../services/payrollService');

const router = express.Router();

router.get('/summary', async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) return res.status(400).json({ success: false, message: 'startDate dan endDate wajib.' });
    res.json(await payroll.getTeacherAttendanceSummary(startDate, endDate));
  } catch (e) { next(e); }
});

router.get('/financial', async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) return res.status(400).json({ success: false, message: 'startDate dan endDate wajib.' });
    res.json(await payroll.getFinancialSummary(startDate, endDate));
  } catch (e) { next(e); }
});

router.get('/total-bisyaroh', async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) return res.status(400).json({ success: false, message: 'startDate dan endDate wajib.' });
    res.json(await payroll.getTotalBisyarohBreakdown(startDate, endDate));
  } catch (e) { next(e); }
});

router.get('/manual-transport', async (req, res, next) => {
  try {
    if (!req.query.periode) return res.status(400).json({ success: false, message: 'periode wajib.' });
    res.json(await payroll.getManualTransportData(req.query.periode));
  } catch (e) { next(e); }
});

router.post('/manual-transport', async (req, res, next) => {
  try {
    if (!Array.isArray(req.body)) return res.status(400).json({ success: false, message: 'Payload harus array.' });
    res.json(await payroll.saveBulkManualTransport(req.body));
  } catch (e) { next(e); }
});

router.get('/payslip', async (req, res, next) => {
  try {
    const { startDate, endDate, guruId } = req.query;
    if (!startDate || !endDate || !guruId) return res.status(400).json({ success: false, message: 'startDate, endDate, guruId wajib.' });
    res.json(await payroll.getPayslipData(startDate, endDate, guruId));
  } catch (e) { next(e); }
});

router.get('/payslips', async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) return res.status(400).json({ success: false, message: 'startDate dan endDate wajib.' });
    res.json(await payroll.getAllPayslipsData(startDate, endDate));
  } catch (e) { next(e); }
});

router.get('/expenses', async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) return res.status(400).json({ success: false, message: 'startDate dan endDate wajib.' });
    res.json(await payroll.getOtherExpenses(startDate, endDate));
  } catch (e) { next(e); }
});

router.get('/extracurricular/teachers', async (req, res, next) => {
  try {
    res.json(await payroll.getActiveTeachers());
  } catch (e) { next(e); }
});

router.get('/extracurricular', async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) return res.status(400).json({ success: false, message: 'startDate dan endDate wajib.' });
    res.json(await payroll.getExtracurricularExpenses(startDate, endDate));
  } catch (e) { next(e); }
});

router.get('/extracurricular/sheet', async (req, res, next) => {
  try {
    const { periode } = req.query;
    if (!periode) return res.status(400).json({ success: false, message: 'periode wajib (YYYY-MM).' });
    res.json(await payroll.getExtracurricularMonthSheet(periode));
  } catch (e) { next(e); }
});

router.post('/extracurricular', async (req, res, next) => {
  try { res.json(await payroll.addExtracurricularExpense(req.body)); } catch (e) { next(e); }
});

router.put('/extracurricular/sheet', async (req, res, next) => {
  try {
    const { periode, items } = req.body || {};
    if (!periode) return res.status(400).json({ success: false, message: 'periode wajib (YYYY-MM).' });
    res.json(await payroll.saveExtracurricularBulk(periode, items));
  } catch (e) { next(e); }
});

router.put('/extracurricular/:id', async (req, res, next) => {
  try { res.json(await payroll.updateExtracurricularExpense({ ...req.body, id: req.params.id })); } catch (e) { next(e); }
});

router.delete('/extracurricular/:id', async (req, res, next) => {
  try { res.json(await payroll.deleteExtracurricularExpense(req.params.id)); } catch (e) { next(e); }
});

router.get('/discipline/sheet', async (req, res, next) => {
  try {
    const { periode } = req.query;
    if (!periode) return res.status(400).json({ success: false, message: 'periode wajib (YYYY-MM).' });
    res.json(await payroll.getDisciplineMonthSheet(periode));
  } catch (e) { next(e); }
});

router.put('/discipline/sheet', async (req, res, next) => {
  try {
    const { periode, items } = req.body || {};
    if (!periode) return res.status(400).json({ success: false, message: 'periode wajib (YYYY-MM).' });
    res.json(await payroll.saveDisciplineBulk(periode, items));
  } catch (e) { next(e); }
});

router.post('/discipline', async (req, res, next) => {
  try { res.json(await payroll.addDisciplineExpense(req.body)); } catch (e) { next(e); }
});

router.delete('/discipline/:id', async (req, res, next) => {
  try { res.json(await payroll.deleteDisciplineExpense(req.params.id)); } catch (e) { next(e); }
});

router.get('/activities', async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) return res.status(400).json({ success: false, message: 'startDate dan endDate wajib.' });
    res.json(await payroll.getActivities(startDate, endDate));
  } catch (e) { next(e); }
});

router.post('/activities', async (req, res, next) => {
  try {
    const { tanggal, nama, guruIds } = req.body || {};
    if (!tanggal || !nama) return res.status(400).json({ success: false, message: 'tanggal dan nama wajib.' });
    res.json(await payroll.addActivity({ tanggal, nama, guruIds }));
  } catch (e) { next(e); }
});

router.post('/expenses', async (req, res, next) => {
  try { res.json(await payroll.addOtherExpense(req.body)); } catch (e) { next(e); }
});

router.put('/expenses/:id', async (req, res, next) => {
  try { res.json(await payroll.updateOtherExpense({ ...req.body, id: req.params.id })); } catch (e) { next(e); }
});

router.delete('/expenses/:id', async (req, res, next) => {
  try { res.json(await payroll.deleteOtherExpense(req.params.id)); } catch (e) { next(e); }
});

module.exports = router;
