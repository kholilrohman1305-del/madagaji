const express = require('express');
const { requireRole } = require('../../../shared-lib/src');
const { listInventory, createInventory, updateInventory, deleteInventory } = require('../services/inventoryService');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const data = await listInventory({ keyword: req.query.keyword || '' });
    res.json(data);
  } catch (e) {
    next(e);
  }
});

router.post('/', requireRole('admin'), async (req, res, next) => {
  try {
    await createInventory(req.body || {});
    res.json({ success: true, message: 'Inventaris berhasil ditambahkan.' });
  } catch (e) {
    next(e);
  }
});

router.put('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    await updateInventory(req.params.id, req.body || {});
    res.json({ success: true, message: 'Inventaris berhasil diperbarui.' });
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    await deleteInventory(req.params.id);
    res.json({ success: true, message: 'Inventaris berhasil dihapus.' });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
