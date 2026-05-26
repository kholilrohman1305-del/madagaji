const pool = require('../db/pool');
const { writeChange } = require('../services/change-log.service');
const { upsertTeacherAccount } = require('./users.controller');

function validateTeacher(body) {
  const errors = [];
  if (!body.niy || body.niy.trim() === '') errors.push('niy');
  if (!body.name || body.name.trim() === '') errors.push('name');
  return errors;
}

function normalizeTmt(value) {
  if (!value) return null;
  const str = String(value).trim();
  if (/^\d{4}$/.test(str)) {
    return `${str}-01-01`;
  }
  return str;
}

async function resolveSubjectRef(subjectId, subjectName) {
  const numericId = subjectId === null || typeof subjectId === 'undefined' || subjectId === '' ? null : Number(subjectId);
  if (numericId) {
    const [rows] = await pool.query('SELECT id, name FROM subjects WHERE id = ? LIMIT 1', [numericId]);
    if (rows[0]) return { subject_id: rows[0].id, subject: rows[0].name };
  }

  const rawName = String(subjectName || '').trim();
  if (!rawName) return { subject_id: null, subject: null };

  const [rows] = await pool.query('SELECT id, name FROM subjects WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1', [rawName]);
  if (rows[0]) return { subject_id: rows[0].id, subject: rows[0].name };
  return { subject_id: null, subject: rawName };
}

async function selectTeacherById(id) {
  const [rows] = await pool.query(
    `SELECT t.*,
            COALESCE(s.name, t.subject) AS subject,
            GROUP_CONCAT(tt.title ORDER BY tt.id SEPARATOR ', ') AS additional_tasks
     FROM teachers t
     LEFT JOIN subjects s ON s.id = t.subject_id
     LEFT JOIN teacher_tasks tt ON tt.teacher_id = t.id
     WHERE t.id = ?
     GROUP BY t.id, s.id`,
    [id]
  );
  return rows[0] || null;
}

async function list(req, res) {
  const [rows] = await pool.query(
    `SELECT t.*,
            COALESCE(s.name, t.subject) AS subject,
            GROUP_CONCAT(tt.title ORDER BY tt.id SEPARATOR ', ') AS additional_tasks
     FROM teachers t
     LEFT JOIN subjects s ON s.id = t.subject_id
     LEFT JOIN teacher_tasks tt ON tt.teacher_id = t.id
     GROUP BY t.id, s.id
     ORDER BY t.name ASC`
  );
  res.json(rows);
}

async function getById(req, res) {
  const row = await selectTeacherById(req.params.id);
  if (!row) return res.status(404).json({ message: 'Teacher not found' });
  res.json(row);
}

async function create(req, res) {
  const errors = validateTeacher(req.body);
  if (errors.length) return res.status(400).json({ message: 'Invalid payload', fields: errors });

  const {
    niy,
    name,
    classification,
    degree,
    subject,
    subject_id,
    additional_task,
    phone,
    email,
    s1_university,
    s1_major,
    s1_grad_year,
    s2_university,
    s2_major,
    s2_grad_year,
    educator_certificate,
    certificate_major,
    nik,
    family_card_number,
    tmt,
    gender,
    birth_place,
    birth_date,
    address,
    address_village,
    address_subdistrict,
    address_city,
    address_province,
    is_active = 1
  } = req.body;

  const resolvedSubject = await resolveSubjectRef(subject_id, subject);

  const [result] = await pool.query(
    'INSERT INTO teachers (niy, name, classification, degree, subject, subject_id, additional_task, phone, email, s1_university, s1_major, s1_grad_year, s2_university, s2_major, s2_grad_year, educator_certificate, certificate_major, nik, family_card_number, tmt, gender, birth_place, birth_date, address, address_village, address_subdistrict, address_city, address_province, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      niy,
      name,
      classification || null,
      degree || null,
      resolvedSubject.subject,
      resolvedSubject.subject_id,
      additional_task || null,
      phone || null,
      email || null,
      s1_university || null,
      s1_major || null,
      s1_grad_year || null,
      s2_university || null,
      s2_major || null,
      s2_grad_year || null,
      educator_certificate || null,
      certificate_major || null,
      nik || null,
      family_card_number || null,
      normalizeTmt(tmt),
      gender || null,
      birth_place || null,
      birth_date || null,
      address || null,
      address_village || null,
      address_subdistrict || null,
      address_city || null,
      address_province || null,
      is_active ? 1 : 0
    ]
  );

  const row = await selectTeacherById(result.insertId);
  await writeChange({ table: 'teachers', recordId: result.insertId, operation: 'insert', data: row });
  await upsertTeacherAccount(row);

  res.status(201).json(row);
}

async function update(req, res) {
  const {
    niy,
    name,
    classification,
    degree,
    subject,
    subject_id,
    additional_task,
    phone,
    email,
    s1_university,
    s1_major,
    s1_grad_year,
    s2_university,
    s2_major,
    s2_grad_year,
    educator_certificate,
    certificate_major,
    nik,
    family_card_number,
    tmt,
    gender,
    birth_place,
    birth_date,
    address,
    address_village,
    address_subdistrict,
    address_city,
    address_province,
    is_active
  } = req.body;
  const [existing] = await pool.query('SELECT * FROM teachers WHERE id = ?', [req.params.id]);
  if (!existing[0]) return res.status(404).json({ message: 'Teacher not found' });
  const previousName = existing[0].name;

  const resolvedSubject = typeof subject_id === 'undefined' && typeof subject === 'undefined'
    ? { subject_id: existing[0].subject_id, subject: existing[0].subject }
    : await resolveSubjectRef(subject_id, subject);

  const updated = {
    niy: niy ?? existing[0].niy,
    name: name ?? existing[0].name,
    classification: classification ?? existing[0].classification,
    degree: degree ?? existing[0].degree,
    subject: resolvedSubject.subject,
    subject_id: resolvedSubject.subject_id,
    additional_task: additional_task ?? existing[0].additional_task,
    phone: phone ?? existing[0].phone,
    email: email ?? existing[0].email,
    s1_university: s1_university ?? existing[0].s1_university,
    s1_major: s1_major ?? existing[0].s1_major,
    s1_grad_year: s1_grad_year ?? existing[0].s1_grad_year,
    s2_university: s2_university ?? existing[0].s2_university,
    s2_major: s2_major ?? existing[0].s2_major,
    s2_grad_year: s2_grad_year ?? existing[0].s2_grad_year,
    educator_certificate: educator_certificate ?? existing[0].educator_certificate,
    certificate_major: certificate_major ?? existing[0].certificate_major,
    nik: nik ?? existing[0].nik,
    family_card_number: family_card_number ?? existing[0].family_card_number,
    tmt: typeof tmt === 'undefined' ? existing[0].tmt : normalizeTmt(tmt),
    gender: gender ?? existing[0].gender,
    birth_place: birth_place ?? existing[0].birth_place,
    birth_date: birth_date ?? existing[0].birth_date,
    address: address ?? existing[0].address,
    address_village: address_village ?? existing[0].address_village,
    address_subdistrict: address_subdistrict ?? existing[0].address_subdistrict,
    address_city: address_city ?? existing[0].address_city,
    address_province: address_province ?? existing[0].address_province,
    is_active: typeof is_active === 'undefined' ? existing[0].is_active : (is_active ? 1 : 0)
  };

  await pool.query(
    'UPDATE teachers SET niy = ?, name = ?, classification = ?, degree = ?, subject = ?, subject_id = ?, additional_task = ?, phone = ?, email = ?, s1_university = ?, s1_major = ?, s1_grad_year = ?, s2_university = ?, s2_major = ?, s2_grad_year = ?, educator_certificate = ?, certificate_major = ?, nik = ?, family_card_number = ?, tmt = ?, gender = ?, birth_place = ?, birth_date = ?, address = ?, address_village = ?, address_subdistrict = ?, address_city = ?, address_province = ?, is_active = ? WHERE id = ?',
    [
      updated.niy,
      updated.name,
      updated.classification,
      updated.degree,
      updated.subject,
      updated.subject_id,
      updated.additional_task,
      updated.phone,
      updated.email,
      updated.s1_university,
      updated.s1_major,
      updated.s1_grad_year,
      updated.s2_university,
      updated.s2_major,
      updated.s2_grad_year,
      updated.educator_certificate,
      updated.certificate_major,
      updated.nik,
      updated.family_card_number,
      updated.tmt,
      updated.gender,
      updated.birth_place,
      updated.birth_date,
      updated.address,
      updated.address_village,
      updated.address_subdistrict,
      updated.address_city,
      updated.address_province,
      updated.is_active,
      req.params.id
    ]
  );

  if (String(previousName || '').trim() && String(previousName || '').trim() !== String(updated.name || '').trim()) {
    await pool.query(
      'UPDATE classes SET homeroom_teacher_id = ?, homeroom_teacher = ? WHERE homeroom_teacher_id = ? OR LOWER(TRIM(homeroom_teacher)) = LOWER(TRIM(?))',
      [req.params.id, updated.name, req.params.id, previousName]
    );
  }

  const row = await selectTeacherById(req.params.id);
  await writeChange({ table: 'teachers', recordId: req.params.id, operation: 'update', data: row });
  await upsertTeacherAccount(row);

  res.json(row);
}

async function bulkUpdate(req, res) {
  const { ids, classification } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ message: 'IDs required' });
  }

  const allowed = new Set(['PNS', 'Inpassing', 'Sertifikasi', 'Non Sertifikasi', '']);
  if (typeof classification !== 'undefined' && !allowed.has(classification)) {
    return res.status(400).json({ message: 'Invalid classification' });
  }

  await pool.query('UPDATE teachers SET classification = ? WHERE id IN (?)', [
    classification || null,
    ids
  ]);

  const [rows] = await pool.query('SELECT * FROM teachers WHERE id IN (?)', [ids]);
  for (const row of rows) {
    await writeChange({ table: 'teachers', recordId: row.id, operation: 'update', data: row });
  }

  res.json({ message: 'Updated', count: rows.length });
}

async function remove(req, res) {
  const [existing] = await pool.query('SELECT * FROM teachers WHERE id = ?', [req.params.id]);
  if (!existing[0]) return res.status(404).json({ message: 'Teacher not found' });

  await pool.query(
    'UPDATE classes SET homeroom_teacher_id = NULL, homeroom_teacher = NULL WHERE homeroom_teacher_id = ? OR LOWER(TRIM(homeroom_teacher)) = LOWER(TRIM(?))',
    [req.params.id, existing[0].name]
  );
  await pool.query('DELETE FROM teachers WHERE id = ?', [req.params.id]);
  await writeChange({ table: 'teachers', recordId: req.params.id, operation: 'delete', data: existing[0] });

  res.json({ message: 'Deleted' });
}

module.exports = {
  list,
  getById,
  create,
  update,
  bulkUpdate,
  remove
};
