const pool = require('../db/pool');
const { writeChange } = require('../services/change-log.service');

const DEFAULT_SETTINGS = {
  id: 1,
  school_name: '',
  school_subtitle: '',
  npsn: '',
  nsm: '',
  address: '',
  village: '',
  city: '',
  province: '',
  postal_code: '',
  phone: '',
  email: '',
  website: '',
  logo_url: '',
  principal_name: '',
  principal_nip: ''
};

async function ensureRow() {
  await pool.query(
    `INSERT INTO school_settings
      (id, school_name, school_subtitle, npsn, nsm, address, village, city, province, postal_code, phone, email, website, logo_url, principal_name, principal_nip)
     VALUES (1, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '')
     ON DUPLICATE KEY UPDATE id = id`
  );
}

async function get(req, res) {
  await ensureRow();
  const [rows] = await pool.query('SELECT * FROM school_settings WHERE id = 1 LIMIT 1');
  res.json(rows[0] || DEFAULT_SETTINGS);
}

async function save(req, res) {
  await ensureRow();
  const payload = {
    school_name: req.body.school_name ?? '',
    school_subtitle: req.body.school_subtitle ?? '',
    npsn: req.body.npsn ?? '',
    nsm: req.body.nsm ?? '',
    address: req.body.address ?? '',
    village: req.body.village ?? '',
    city: req.body.city ?? '',
    province: req.body.province ?? '',
    postal_code: req.body.postal_code ?? '',
    phone: req.body.phone ?? '',
    email: req.body.email ?? '',
    website: req.body.website ?? '',
    logo_url: req.body.logo_url ?? '',
    principal_name: req.body.principal_name ?? '',
    principal_nip: req.body.principal_nip ?? ''
  };

  await pool.query(
    `UPDATE school_settings
     SET school_name = ?, school_subtitle = ?, npsn = ?, nsm = ?, address = ?, village = ?, city = ?, province = ?, postal_code = ?,
         phone = ?, email = ?, website = ?, logo_url = ?, principal_name = ?, principal_nip = ?, updated_at = NOW()
     WHERE id = 1`,
    [
      payload.school_name,
      payload.school_subtitle,
      payload.npsn,
      payload.nsm,
      payload.address,
      payload.village,
      payload.city,
      payload.province,
      payload.postal_code,
      payload.phone,
      payload.email,
      payload.website,
      payload.logo_url,
      payload.principal_name,
      payload.principal_nip
    ]
  );

  const [rows] = await pool.query('SELECT * FROM school_settings WHERE id = 1 LIMIT 1');
  await writeChange({
    table: 'school_settings',
    recordId: 1,
    operation: 'update',
    data: rows[0]
  });
  res.json(rows[0] || DEFAULT_SETTINGS);
}

module.exports = {
  get,
  save
};
