const express = require('express');
const { requireRole } = require('../middleware/auth');
const { listUsers, createUser, updateUser } = require('../services/userService');

const router = express.Router();

router.get('/', requireRole('admin'), async (req, res, next) => {
  try {
    const data = await listUsers();
    res.json(data);
  } catch (e) {
    next(e);
  }
});

router.post('/', requireRole('admin'), async (req, res, next) => {
  try {
    const { username, password, role, display_name } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username dan password wajib.' });
    }
    await createUser({
      username,
      password,
      role: role || 'guru',
      displayName: display_name || ''
    });
    res.json({ success: true, message: 'User berhasil dibuat.' });
  } catch (e) {
    next(e);
  }
});

router.put('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const { password, role, display_name } = req.body || {};
    await updateUser(req.params.id, {
      password: password || '',
      role: role || 'guru',
      displayName: display_name || ''
    });
    res.json({ success: true, message: 'User berhasil diperbarui.' });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
