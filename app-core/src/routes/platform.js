const express = require('express');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

async function checkAppHealth(name, baseUrl) {
  if (!baseUrl) {
    return { app: name, ok: false, message: 'base URL not configured' };
  }
  try {
    const response = await fetch(`${String(baseUrl).replace(/\/+$/, '')}/api/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' }
    });
    const data = await response.json().catch(() => ({}));
    return {
      app: name,
      ok: Boolean(response.ok && data?.ok),
      status: response.status,
      data
    };
  } catch (e) {
    return {
      app: name,
      ok: false,
      message: e.message || 'request failed'
    };
  }
}

router.get('/health', requireRole('admin'), async (req, res) => {
  const [academic, finance, administration] = await Promise.all([
    checkAppHealth('academic', process.env.ACADEMIC_BASE_URL),
    checkAppHealth('finance', process.env.FINANCE_BASE_URL),
    checkAppHealth('administration', process.env.ADMIN_BASE_URL)
  ]);

  const apps = [academic, finance, administration];
  const ok = apps.every(item => item.ok);
  res.status(ok ? 200 : 503).json({
    success: ok,
    apps
  });
});

module.exports = router;
