const enabled = String(process.env.HTTP_LOG || '').toLowerCase() === 'true';

module.exports = (req, res, next) => {
  if (!enabled) return next();
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const ms = Number(end - start) / 1e6;
    const msg = `${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms`;
    console.log(msg);
  });
  next();
};
