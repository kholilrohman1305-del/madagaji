const express = require('express');
const payroll = require('../../../backend/src/services/payrollService');

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
