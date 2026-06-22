// Lightweight shared-secret guard for server-to-server calls from sibling
// apps (pdmada, etc). Intentionally separate from authRequired (JWT/cookie
// user auth) — this is not a user session, it's a trusted backend caller.
function internalAuth(req, res, next) {
  const expected = process.env.INTERNAL_API_KEY;
  if (!expected) {
    return res.status(503).json({ success: false, message: 'INTERNAL_API_KEY belum dikonfigurasi di madagaji.' });
  }
  const provided = req.headers['x-internal-key'];
  if (!provided || provided !== expected) {
    return res.status(401).json({ success: false, message: 'Unauthorized.' });
  }
  next();
}

module.exports = { internalAuth };
