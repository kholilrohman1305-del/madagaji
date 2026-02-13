const express = require('express');
const { TOKEN_COOKIE, buildCookieOptions, login, getUserById } = require('../services/authService');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username dan password wajib.' });
    }
    const result = await login(username, password);
    if (!result) {
      return res.status(401).json({ success: false, message: 'Username atau password salah.' });
    }
    res.cookie(TOKEN_COOKIE, result.token, buildCookieOptions());
    res.json({ success: true, message: 'Login berhasil.', user: result.user });
  } catch (e) {
    next(e);
  }
});

router.get('/me', authRequired, async (req, res, next) => {
  try {
    const user = await getUserById(req.user.id);
    res.json({ success: true, user });
  } catch (e) {
    next(e);
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie(TOKEN_COOKIE, buildCookieOptions());
  res.json({ success: true, message: 'Logout berhasil.' });
});

module.exports = router;
