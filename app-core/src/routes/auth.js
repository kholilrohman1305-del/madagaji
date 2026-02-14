const express = require('express');
const { authRequired } = require('../middleware/auth');
const { TOKEN_COOKIE, buildCookieOptions, login, getUserById } = require('../services/authService');

const router = express.Router();

router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username dan password wajib.' });
    }
    const result = await login(username, password);
    if (!result) return res.status(401).json({ success: false, message: 'Username atau password salah.' });
    res.cookie(TOKEN_COOKIE, result.token, buildCookieOptions());
    return res.json({ success: true, message: 'Login berhasil.', user: result.user });
  } catch (e) {
    return next(e);
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie(TOKEN_COOKIE, buildCookieOptions());
  return res.json({ success: true, message: 'Logout berhasil.' });
});

router.get('/me', authRequired, async (req, res, next) => {
  try {
    const user = await getUserById(req.user.id);
    return res.json({ success: true, user });
  } catch (e) {
    return next(e);
  }
});

module.exports = router;
