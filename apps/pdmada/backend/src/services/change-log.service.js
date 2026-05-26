const pool = require('../db/pool');

async function writeChange({ table, recordId, operation, data, source = 'local', conn = pool }) {
  if (!table || !recordId || !operation) return;
  await conn.query(
    'INSERT INTO change_log (table_name, record_id, operation, data_json, source) VALUES (?, ?, ?, ?, ?)',
    [table, recordId, operation, data ? JSON.stringify(data) : null, source]
  );
}

async function listChanges({ since, table, limit = 200 }) {
  let query = 'SELECT * FROM change_log';
  const params = [];
  const where = [];

  if (since) {
    where.push('changed_at > ?');
    params.push(since);
  }
  if (table) {
    where.push('table_name = ?');
    params.push(table);
  }
  if (where.length) {
    query += ` WHERE ${where.join(' AND ')}`;
  }
  query += ' ORDER BY changed_at DESC, id DESC LIMIT ?';
  params.push(Number(limit) || 200);

  const [rows] = await pool.query(query, params);
  return rows;
}

module.exports = {
  writeChange,
  listChanges
};
