const { listChanges } = require('../services/change-log.service');

async function list(req, res) {
  const { since, table, limit } = req.query;
  const rows = await listChanges({ since, table, limit });
  res.json(rows);
}

module.exports = {
  list
};
