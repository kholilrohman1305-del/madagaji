const { randomUUID } = require('crypto');

module.exports = (req, res, next) => {
  const incoming = req.headers['x-request-id'];
  const id = incoming && String(incoming).trim() ? String(incoming) : randomUUID();
  req.id = id;
  res.setHeader('x-request-id', id);
  next();
};
