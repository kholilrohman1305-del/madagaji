const express = require('express');
const { requireRole } = require('../middleware/auth');
const userService = require('../services/userService');

const router = express.Router();

router.get('/', requireRole('admin'), async (req, res, next) => {
  try {
    res.json(await userService.listUsers());
  } catch (e) {
    next(e);
  }
});

router.post('/', requireRole('admin'), async (req, res, next) => {
  try {
    const { username, password, role, displayName } = req.body || {};
    const result = await userService.createUser({ username, password, role, displayName });
    if (!result.success) return res.status(400).json(result);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

router.put('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const { password, role, displayName } = req.body || {};
    if (String(req.user.id) === String(req.params.id) && role && role !== req.user.role) {
      return res.status(400).json({ success: false, message: 'Tidak bisa mengubah role akun sendiri.' });
    }
    res.json(await userService.updateUser(req.params.id, { password, role, displayName }));
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    if (String(req.user.id) === String(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Tidak bisa menghapus akun sendiri.' });
    }
    res.json(await userService.deleteUser(req.params.id));
  } catch (e) {
    next(e);
  }
});

module.exports = router;
