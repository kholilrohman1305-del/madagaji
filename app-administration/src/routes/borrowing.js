const express = require('express');
const { requireRole } = require('../../../shared-lib/src');
const { listBorrowings, createBorrowing, markReturned } = require('../services/borrowingService');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const data = await listBorrowings({ status: req.query.status || '' });
    res.json(data);
  } catch (e) {
    next(e);
  }
});

router.post('/', requireRole('admin'), async (req, res, next) => {
  try {
    await createBorrowing(req.body || {});
    res.json({ success: true, message: 'Peminjaman berhasil dicatat.' });
  } catch (e) {
    next(e);
  }
});

router.post('/:id/return', requireRole('admin'), async (req, res, next) => {
  try {
    const tanggalKembali = req.body?.tanggal_kembali_real;
    if (!tanggalKembali) {
      return res.status(400).json({ success: false, message: 'tanggal_kembali_real wajib.' });
    }
    await markReturned(req.params.id, tanggalKembali, req.body?.keterangan || '');
    res.json({ success: true, message: 'Pengembalian berhasil dicatat.' });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
