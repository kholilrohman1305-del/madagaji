const pool = require('../db/pool');

function normalizeName(value) {
  return String(value || '').trim();
}

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pondok_pesantren (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_pondok_pesantren_name (name)
    )
  `);
}

async function list(req, res) {
  await ensureTable();
  const [rows] = await pool.query(`
    SELECT p.id, p.name, p.is_active
    FROM pondok_pesantren p
    UNION
    SELECT NULL AS id, s.pondok_pesantren AS name, 1 AS is_active
    FROM students s
    WHERE s.pondok_pesantren IS NOT NULL
      AND TRIM(s.pondok_pesantren) <> ''
      AND NOT EXISTS (
        SELECT 1
        FROM pondok_pesantren p2
        WHERE LOWER(TRIM(p2.name)) = LOWER(TRIM(s.pondok_pesantren))
      )
    ORDER BY name ASC
  `);
  res.json(rows);
}

async function create(req, res) {
  await ensureTable();
  const name = normalizeName(req.body.name);
  const isActive = Number(req.body.is_active) === 0 ? 0 : 1;
  if (!name) return res.status(400).json({ message: 'name is required' });

  const [exists] = await pool.query(
    'SELECT id FROM pondok_pesantren WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1',
    [name]
  );
  if (exists.length) return res.status(400).json({ message: 'Nama pondok pesantren sudah ada' });

  const [result] = await pool.query(
    'INSERT INTO pondok_pesantren (name, is_active) VALUES (?, ?)',
    [name, isActive]
  );
  const [rows] = await pool.query('SELECT * FROM pondok_pesantren WHERE id = ?', [result.insertId]);
  res.status(201).json(rows[0]);
}

async function update(req, res) {
  await ensureTable();
  const id = req.params.id;
  const name = normalizeName(req.body.name);
  const isActive = Number(req.body.is_active) === 0 ? 0 : 1;
  if (!name) return res.status(400).json({ message: 'name is required' });

  const [existingRows] = await pool.query('SELECT * FROM pondok_pesantren WHERE id = ?', [id]);
  if (!existingRows.length) return res.status(404).json({ message: 'Pondok pesantren not found' });

  const existing = existingRows[0];
  const [dup] = await pool.query(
    'SELECT id FROM pondok_pesantren WHERE id <> ? AND LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1',
    [id, name]
  );
  if (dup.length) return res.status(400).json({ message: 'Nama pondok pesantren sudah ada' });

  await pool.query('UPDATE pondok_pesantren SET name = ?, is_active = ? WHERE id = ?', [name, isActive, id]);

  if (normalizeName(existing.name) !== name) {
    await pool.query(
      'UPDATE students SET pondok_pesantren = ? WHERE LOWER(TRIM(pondok_pesantren)) = LOWER(TRIM(?))',
      [name, existing.name]
    );
  }

  const [rows] = await pool.query('SELECT * FROM pondok_pesantren WHERE id = ?', [id]);
  res.json(rows[0]);
}

async function remove(req, res) {
  await ensureTable();
  const id = req.params.id;
  const [existingRows] = await pool.query('SELECT * FROM pondok_pesantren WHERE id = ?', [id]);
  if (!existingRows.length) return res.status(404).json({ message: 'Pondok pesantren not found' });

  const existing = existingRows[0];
  await pool.query('DELETE FROM pondok_pesantren WHERE id = ?', [id]);
  await pool.query(
    'UPDATE students SET pondok_pesantren = NULL WHERE LOWER(TRIM(pondok_pesantren)) = LOWER(TRIM(?))',
    [existing.name]
  );

  res.json({ message: 'Deleted' });
}

module.exports = {
  list,
  create,
  update,
  remove
};
