const express = require('express');
const { requireRole } = require('../../../shared-lib/src');
const { listExpenses, createExpense, updateExpense, deleteExpense } = require('../services/expenseService');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query || {};
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'startDate dan endDate wajib.' });
    }
    const data = await listExpenses(startDate, endDate);
    res.json(data);
  } catch (e) {
    next(e);
  }
});

router.post('/', requireRole('admin'), async (req, res, next) => {
  try {
    const id = await createExpense(req.body || {});
    res.json({ success: true, id, message: 'Pengeluaran berhasil ditambahkan.' });
  } catch (e) {
    next(e);
  }
});

router.put('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    await updateExpense(req.params.id, req.body || {});
    res.json({ success: true, message: 'Pengeluaran berhasil diperbarui.' });
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    await deleteExpense(req.params.id);
    res.json({ success: true, message: 'Pengeluaran berhasil dihapus.' });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
