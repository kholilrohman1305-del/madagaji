const express = require('express');
const { requireRole } = require('../../../shared-lib/src');
const { listLetters, createLetter, updateLetter, deleteLetter } = require('../services/lettersService');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const data = await listLetters({
      startDate: req.query.startDate || '',
      endDate: req.query.endDate || '',
      jenis: req.query.jenis || ''
    });
    res.json(data);
  } catch (e) {
    next(e);
  }
});

router.post('/', requireRole('admin'), async (req, res, next) => {
  try {
    await createLetter(req.body || {});
    res.json({ success: true, message: 'Surat berhasil ditambahkan.' });
  } catch (e) {
    next(e);
  }
});

router.put('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    await updateLetter(req.params.id, req.body || {});
    res.json({ success: true, message: 'Surat berhasil diperbarui.' });
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    await deleteLetter(req.params.id);
    res.json({ success: true, message: 'Surat berhasil dihapus.' });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
