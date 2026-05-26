const pool = require('../db/pool');

function validateParent(body) {
  const errors = [];
  if (!body.student_id) errors.push('student_id');
  if (!body.relation || body.relation.trim() === '') errors.push('relation');
  if (!body.name || body.name.trim() === '') errors.push('name');
  return errors;
}

function toNumberOrNull(value) {
  if (value === null || typeof value === 'undefined' || value === '') return null;
  return Number(value);
}

async function list(req, res) {
  const { student_id } = req.query;
  if (student_id) {
    const [rows] = await pool.query(
      'SELECT * FROM student_parents WHERE student_id = ? ORDER BY id DESC',
      [student_id]
    );
    return res.json(rows);
  }
  const [rows] = await pool.query('SELECT * FROM student_parents ORDER BY id DESC');
  res.json(rows);
}

async function getById(req, res) {
  const [rows] = await pool.query('SELECT * FROM student_parents WHERE id = ?', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ message: 'Parent not found' });
  res.json(rows[0]);
}

async function create(req, res) {
  const errors = validateParent(req.body);
  if (errors.length) return res.status(400).json({ message: 'Invalid payload', fields: errors });

  const {
    student_id,
    relation,
    nik,
    name,
    birth_place,
    birth_date,
    status,
    education,
    occupation,
    domicile,
    phone,
    income_monthly,
    address
  } = req.body;

  const [result] = await pool.query(
    'INSERT INTO student_parents (student_id, relation, nik, name, birth_place, birth_date, status, education, occupation, domicile, phone, income_monthly, address) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      student_id,
      relation,
      nik || null,
      name,
      birth_place || null,
      birth_date || null,
      status || null,
      education || null,
      occupation || null,
      domicile || null,
      phone || null,
      typeof income_monthly === 'number' ? income_monthly : toNumberOrNull(income_monthly),
      address || null
    ]
  );

  const [rows] = await pool.query('SELECT * FROM student_parents WHERE id = ?', [result.insertId]);
  await pool.query(
    'INSERT INTO change_log (table_name, record_id, operation, data_json) VALUES (?, ?, ?, ?)',
    ['student_parents', result.insertId, 'insert', JSON.stringify(rows[0])]
  );

  res.status(201).json(rows[0]);
}

async function update(req, res) {
  const {
    student_id,
    relation,
    nik,
    name,
    birth_place,
    birth_date,
    status,
    education,
    occupation,
    domicile,
    phone,
    income_monthly,
    address
  } = req.body;

  const [existing] = await pool.query('SELECT * FROM student_parents WHERE id = ?', [req.params.id]);
  if (!existing[0]) return res.status(404).json({ message: 'Parent not found' });

  const updated = {
    student_id: student_id ?? existing[0].student_id,
    relation: relation ?? existing[0].relation,
    nik: nik ?? existing[0].nik,
    name: name ?? existing[0].name,
    birth_place: birth_place ?? existing[0].birth_place,
    birth_date: birth_date ?? existing[0].birth_date,
    status: status ?? existing[0].status,
    education: education ?? existing[0].education,
    occupation: occupation ?? existing[0].occupation,
    domicile: domicile ?? existing[0].domicile,
    phone: phone ?? existing[0].phone,
    income_monthly: typeof income_monthly === 'undefined' ? existing[0].income_monthly : toNumberOrNull(income_monthly),
    address: address ?? existing[0].address
  };

  await pool.query(
    'UPDATE student_parents SET student_id = ?, relation = ?, nik = ?, name = ?, birth_place = ?, birth_date = ?, status = ?, education = ?, occupation = ?, domicile = ?, phone = ?, income_monthly = ?, address = ? WHERE id = ?',
    [
      updated.student_id,
      updated.relation,
      updated.nik,
      updated.name,
      updated.birth_place,
      updated.birth_date,
      updated.status,
      updated.education,
      updated.occupation,
      updated.domicile,
      updated.phone,
      updated.income_monthly,
      updated.address,
      req.params.id
    ]
  );

  const [rows] = await pool.query('SELECT * FROM student_parents WHERE id = ?', [req.params.id]);
  await pool.query(
    'INSERT INTO change_log (table_name, record_id, operation, data_json) VALUES (?, ?, ?, ?)',
    ['student_parents', req.params.id, 'update', JSON.stringify(rows[0])]
  );

  res.json(rows[0]);
}

async function remove(req, res) {
  const [existing] = await pool.query('SELECT * FROM student_parents WHERE id = ?', [req.params.id]);
  if (!existing[0]) return res.status(404).json({ message: 'Parent not found' });

  await pool.query('DELETE FROM student_parents WHERE id = ?', [req.params.id]);
  await pool.query(
    'INSERT INTO change_log (table_name, record_id, operation, data_json) VALUES (?, ?, ?, ?)',
    ['student_parents', req.params.id, 'delete', JSON.stringify(existing[0])]
  );

  res.json({ message: 'Deleted' });
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove
};
