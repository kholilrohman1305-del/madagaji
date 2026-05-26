const XLSX = require('xlsx');
const pool = require('../db/pool');

async function resolveClassId(name, cache) {
  if (!name) return null;
  const key = String(name).trim();
  if (!key) return null;
  if (cache.has(key)) return cache.get(key);
  const [rows] = await pool.query('SELECT id FROM classes WHERE name = ? LIMIT 1', [key]);
  if (rows.length) {
    cache.set(key, rows[0].id);
    return rows[0].id;
  }
  const [result] = await pool.query('INSERT INTO classes (name, is_active) VALUES (?, 1)', [key]);
  cache.set(key, result.insertId);
  return result.insertId;
}

async function resolveSchoolYearId(name, cache) {
  if (!name) return null;
  const key = String(name).trim();
  if (!key) return null;
  if (cache.has(key)) return cache.get(key);
  const [rows] = await pool.query('SELECT id FROM school_years WHERE name = ? LIMIT 1', [key]);
  if (rows.length) {
    cache.set(key, rows[0].id);
    return rows[0].id;
  }
  const [result] = await pool.query('INSERT INTO school_years (name, is_active) VALUES (?, 1)', [key]);
  cache.set(key, result.insertId);
  return result.insertId;
}

async function resolveSubjectRef(name, cache) {
  if (!name) return { id: null, name: null };
  const key = String(name).trim();
  if (!key) return { id: null, name: null };
  if (cache.has(key)) return cache.get(key);
  const [rows] = await pool.query('SELECT id, name FROM subjects WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1', [key]);
  const resolved = rows[0]
    ? { id: rows[0].id, name: rows[0].name }
    : { id: null, name: key };
  cache.set(key, resolved);
  return resolved;
}

async function resolveTeacherRef(name, cache) {
  if (!name) return { id: null, name: null };
  const key = String(name).trim();
  if (!key) return { id: null, name: null };
  if (cache.has(key)) return cache.get(key);
  const [rows] = await pool.query('SELECT id, name FROM teachers WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1', [key]);
  const resolved = rows[0]
    ? { id: rows[0].id, name: rows[0].name }
    : { id: null, name: key };
  cache.set(key, resolved);
  return resolved;
}

function normalizeKey(key) {
  return String(key || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

function pickValue(row, keys) {
  for (const key of keys) {
    if (typeof row[key] !== 'undefined' && row[key] !== null && row[key] !== '') return row[key];
  }
  return null;
}

function normalizeExcelDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    const iso = value.toISOString().slice(0, 10);
    return iso;
  }
  const str = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  if (/^\d{4}$/.test(str)) return `${str}-01-01`;
  if (/^\d+(\.\d+)?$/.test(str)) {
    const excelDate = Number(str);
    if (!Number.isNaN(excelDate)) {
      const ms = (excelDate - 25569) * 86400 * 1000;
      const d = new Date(ms);
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
  }
  return str;
}

async function importXlsx(req, res) {
  const { entity } = req.params;
  if (!req.file) return res.status(400).json({ message: 'File is required' });

  const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
  const rows = rawRows.map((row) => {
    const normalized = {};
    Object.keys(row).forEach((key) => {
      normalized[normalizeKey(key)] = row[key];
    });
    return normalized;
  });

  let inserted = 0;
  let updated = 0;
  const classCache = new Map();
  const schoolYearCache = new Map();
  const subjectCache = new Map();
  const teacherCache = new Map();

  for (const row of rows) {
    if (entity === 'students') {
      const nisn = pickValue(row, ['nisn']);
      const name = pickValue(row, ['nama', 'nama_siswa', 'name']);
      if (!nisn || !name) continue;
      const className = pickValue(row, ['kelas', 'class', 'class_name']);
      const schoolYearName = pickValue(row, ['tahun_ajaran', 'school_year']);
      const resolvedClassId = await resolveClassId(className, classCache);
      const resolvedSchoolYearId = await resolveSchoolYearId(schoolYearName, schoolYearCache);

      const data = {
        nik: pickValue(row, ['nik']),
        nis_local: pickValue(row, ['nis_lokal', 'nis_local', 'nomor_induk', 'nomor_induk_lokal']),
        nisn,
        nism: pickValue(row, ['nism']),
        kip: pickValue(row, ['no_kip', 'kip']),
        name,
        birth_place: pickValue(row, ['tempat_lahir', 'birth_place']),
        gender: pickValue(row, ['jenis_kelamin', 'gender']),
        birth_date: pickValue(row, ['tanggal_lahir', 'birth_date']),
        religion: pickValue(row, ['agama', 'religion']),
        student_status: pickValue(row, ['status_siswa', 'status', 'student_status']) || 'aktif',
        previous_school: pickValue(row, ['asal_sekolah', 'previous_school']),
        school_origin_npsn: pickValue(row, ['npsn_asal_sekolah', 'school_origin_npsn']),
        no_akta_lahir: pickValue(row, ['no_akta_lahir', 'nomor_akta_lahir']),
        special_needs: pickValue(row, ['kebutuhan_khusus', 'special_needs']),
        paud: pickValue(row, ['paud']),
        tk: pickValue(row, ['tk', 'taman_kanakkanak']),
        hobby: pickValue(row, ['hobi', 'hobby']),
        aspiration: pickValue(row, ['citacita', 'cita_cita', 'aspiration']),
        blood_type: pickValue(row, ['gol_darah', 'blood_type']),
        height_cm: pickValue(row, ['tinggi_cm', 'height_cm']),
        weight_kg: pickValue(row, ['berat_kg', 'weight_kg']),
        transportation: pickValue(row, ['transportasi', 'transportation']),
        distance_km: pickValue(row, ['jarak_km', 'distance_km']),
        penerima_kps: String(pickValue(row, ['penerima_kps', 'is_kps'])) === '1' ? 1 : 0,
        no_kps: pickValue(row, ['no_kps', 'nomor_kps', 'no_kip', 'kip']),
        emergency_contact_name: pickValue(row, ['nama_darurat', 'emergency_contact_name']),
        emergency_contact_phone: pickValue(row, ['telp_darurat', 'emergency_contact_phone']),
        emergency_contact_relation: pickValue(row, ['hubungan_darurat', 'emergency_contact_relation']),
        family_card_number: pickValue(row, ['no_kk', 'nomor_kk', 'family_card_number']),
        citizenship: pickValue(row, ['kewarganegaraan', 'citizenship']),
        living_with: pickValue(row, ['tinggal_bersama', 'living_with']),
        siblings_count: pickValue(row, ['jumlah_saudara', 'siblings_count']),
        child_order: pickValue(row, ['anak_ke', 'child_order']),
        class_id: pickValue(row, ['class_id', 'kelas_id']) || resolvedClassId,
        entry_date: pickValue(row, ['tanggal_masuk', 'entry_date']),
        school_year_id: pickValue(row, ['school_year_id', 'tahun_ajaran_id']) || resolvedSchoolYearId,
        phone: pickValue(row, ['no_hp', 'phone']),
        pondok_pesantren: pickValue(row, ['pondok_pesantren']),
        father_nik: pickValue(row, ['ayah_nik', 'father_nik']),
        father_name: pickValue(row, ['ayah_nama', 'father_name']),
        father_birth_place: pickValue(row, ['ayah_tempat_lahir', 'father_birth_place']),
        father_birth_date: pickValue(row, ['ayah_tanggal_lahir', 'father_birth_date']),
        father_status: pickValue(row, ['ayah_status', 'father_status']),
        father_education: pickValue(row, ['ayah_pendidikan', 'father_education']),
        father_occupation: pickValue(row, ['ayah_pekerjaan', 'father_occupation']),
        father_domicile: pickValue(row, ['ayah_domisili', 'father_domicile']),
        father_phone: pickValue(row, ['ayah_no_hp', 'father_phone']),
        father_income_monthly: pickValue(row, ['ayah_penghasilan_bulanan', 'father_income_monthly']),
        father_address: pickValue(row, ['ayah_alamat', 'father_address']),
        mother_nik: pickValue(row, ['ibu_nik', 'mother_nik']),
        mother_name: pickValue(row, ['ibu_nama', 'mother_name']),
        mother_birth_place: pickValue(row, ['ibu_tempat_lahir', 'mother_birth_place']),
        mother_birth_date: pickValue(row, ['ibu_tanggal_lahir', 'mother_birth_date']),
        mother_status: pickValue(row, ['ibu_status', 'mother_status']),
        mother_education: pickValue(row, ['ibu_pendidikan', 'mother_education']),
        mother_occupation: pickValue(row, ['ibu_pekerjaan', 'mother_occupation']),
        mother_domicile: pickValue(row, ['ibu_domisili', 'mother_domicile']),
        mother_phone: pickValue(row, ['ibu_no_hp', 'mother_phone']),
        mother_income_monthly: pickValue(row, ['ibu_penghasilan_bulanan', 'mother_income_monthly']),
        mother_address: pickValue(row, ['ibu_alamat', 'mother_address']),
        guardian_nik: pickValue(row, ['wali_nik', 'guardian_nik']),
        guardian_name: pickValue(row, ['wali_nama', 'guardian_name']),
        guardian_birth_place: pickValue(row, ['wali_tempat_lahir', 'guardian_birth_place']),
        guardian_birth_date: pickValue(row, ['wali_tanggal_lahir', 'guardian_birth_date']),
        guardian_status: pickValue(row, ['wali_status', 'guardian_status']),
        guardian_education: pickValue(row, ['wali_pendidikan', 'guardian_education']),
        guardian_occupation: pickValue(row, ['wali_pekerjaan', 'guardian_occupation']),
        guardian_domicile: pickValue(row, ['wali_domisili', 'guardian_domicile']),
        guardian_phone: pickValue(row, ['wali_no_hp', 'guardian_phone']),
        guardian_income_monthly: pickValue(row, ['wali_penghasilan_bulanan', 'guardian_income_monthly']),
        guardian_address: pickValue(row, ['wali_alamat', 'guardian_address']),
        address: pickValue(row, ['alamat', 'address']),
        address_dusun: pickValue(row, ['dusun', 'address_dusun']),
        address_rt: pickValue(row, ['rt', 'address_rt']),
        address_rw: pickValue(row, ['rw', 'address_rw']),
        address_village: pickValue(row, ['desa', 'kelurahan', 'address_village']),
        address_subdistrict: pickValue(row, ['kecamatan', 'address_subdistrict']),
        address_city: pickValue(row, ['kabupaten', 'kota', 'address_city']),
        address_province: pickValue(row, ['provinsi', 'address_province']),
        postal_code: pickValue(row, ['kode_pos', 'postal_code']),
        latitude: pickValue(row, ['lintang', 'latitude']),
        longitude: pickValue(row, ['bujur', 'longitude']),
        is_active: String(pickValue(row, ['aktif', 'is_active'])) === '0' ? 0 : 1
      };

      const columns = Object.keys(data);
      const placeholders = columns.map(() => '?').join(', ');
      const updates = columns.filter((col) => col !== 'nisn').map((col) => `${col}=VALUES(${col})`).join(', ');
      const values = columns.map((col) => {
        if (col === 'class_id' || col === 'school_year_id') return data[col] || null;
        if (col === 'birth_date' || col === 'entry_date' || col.endsWith('_birth_date')) return normalizeExcelDate(data[col]);
        if (col === 'is_active' || col === 'penerima_kps') return Number(data[col] || 0);
        return data[col] === '' ? null : data[col];
      });

      const [result] = await pool.query(
        `INSERT INTO students (${columns.join(', ')})
         VALUES (${placeholders})
         ON DUPLICATE KEY UPDATE ${updates}`,
        values
      );
      if (result.affectedRows > 1) updated += 1;
      else inserted += 1;
    } else if (entity === 'teachers') {
      const niy = pickValue(row, ['niy']);
      const name = pickValue(row, ['nama', 'name']);
      if (!niy || !name) continue;
      const subjectRef = await resolveSubjectRef(pickValue(row, ['mapel', 'subject']), subjectCache);
      const [result] = await pool.query(
        `INSERT INTO teachers (niy, name, classification, degree, subject, subject_id, additional_task, phone, email, s1_university, s1_major, s1_grad_year, s2_university, s2_major, s2_grad_year, educator_certificate, certificate_major, nik, family_card_number, tmt, gender, birth_place, birth_date, address, address_village, address_subdistrict, address_city, address_province, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), classification = VALUES(classification), degree = VALUES(degree), subject = VALUES(subject), subject_id = VALUES(subject_id), additional_task = VALUES(additional_task), phone = VALUES(phone), email = VALUES(email), s1_university = VALUES(s1_university), s1_major = VALUES(s1_major), s1_grad_year = VALUES(s1_grad_year), s2_university = VALUES(s2_university), s2_major = VALUES(s2_major), s2_grad_year = VALUES(s2_grad_year), educator_certificate = VALUES(educator_certificate), certificate_major = VALUES(certificate_major), nik = VALUES(nik), family_card_number = VALUES(family_card_number), tmt = VALUES(tmt), gender = VALUES(gender), birth_place = VALUES(birth_place), birth_date = VALUES(birth_date), address = VALUES(address), address_village = VALUES(address_village), address_subdistrict = VALUES(address_subdistrict), address_city = VALUES(address_city), address_province = VALUES(address_province), is_active = VALUES(is_active)`,
        [
          niy,
          name,
          pickValue(row, ['klasifikasi', 'classification']),
          pickValue(row, ['gelar', 'degree']),
          subjectRef.name,
          subjectRef.id,
          pickValue(row, ['tugas_tambahan', 'additional_task']),
          pickValue(row, ['no_telp', 'phone']),
          pickValue(row, ['email']),
          pickValue(row, ['s1_university', 's1_universitas']),
          pickValue(row, ['s1_prodi', 's1_major']),
          pickValue(row, ['s1_tahun_lulus', 's1_grad_year']),
          pickValue(row, ['s2_university', 's2_universitas']),
          pickValue(row, ['s2_prodi', 's2_major']),
          pickValue(row, ['s2_tahun_lulus', 's2_grad_year']),
          pickValue(row, ['sertifikat_pendidik', 'educator_certificate']),
          pickValue(row, ['prodi_sertifikat', 'certificate_major']),
          pickValue(row, ['nik']),
          pickValue(row, ['no_kk', 'family_card_number']),
          normalizeExcelDate(pickValue(row, ['tmt'])),
          pickValue(row, ['jenis_kelamin', 'gender']),
          pickValue(row, ['tempat_lahir', 'birth_place']),
          normalizeExcelDate(pickValue(row, ['tanggal_lahir', 'birth_date'])),
          pickValue(row, ['alamat', 'address']),
          pickValue(row, ['desa', 'kelurahan', 'address_village']),
          pickValue(row, ['kecamatan', 'address_subdistrict']),
          pickValue(row, ['kabupaten', 'kota', 'address_city']),
          pickValue(row, ['provinsi', 'address_province']),
          String(pickValue(row, ['aktif', 'is_active'])) === '0' ? 0 : 1
        ]
      );
      if (result.affectedRows > 1) updated += 1;
      else inserted += 1;
    } else if (entity === 'subjects') {
      const name = pickValue(row, ['mata_pelajaran', 'name', 'mapel']);
      if (!name) continue;
      const code = pickValue(row, ['kode', 'code']) || name.replace(/\s+/g, '_').slice(0, 20);
      const groupName = pickValue(row, ['kelompok', 'group', 'group_name']);
      const [existingSubjectRows] = await pool.query('SELECT id, name FROM subjects WHERE code = ? LIMIT 1', [code]);
      const existingSubject = existingSubjectRows[0] || null;
      const [result] = await pool.query(
        `INSERT INTO subjects (code, name, group_name, grade_level, is_active)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), group_name = VALUES(group_name), grade_level = VALUES(grade_level), is_active = VALUES(is_active)`,
        [
          code,
          name,
          groupName || null,
          null,
          String(pickValue(row, ['aktif', 'is_active'])) === '0' ? 0 : 1
        ]
      );
      const [subjectRows] = await pool.query('SELECT id, name FROM subjects WHERE code = ? LIMIT 1', [code]);
      const savedSubject = subjectRows[0] || null;
      if (savedSubject) {
        if (existingSubject && String(existingSubject.name || '').trim() !== String(savedSubject.name || '').trim()) {
          await pool.query(
            'UPDATE teachers SET subject_id = ?, subject = ? WHERE subject_id = ? OR LOWER(TRIM(subject)) = LOWER(TRIM(?))',
            [savedSubject.id, savedSubject.name, savedSubject.id, existingSubject.name]
          );
        } else {
          await pool.query(
            'UPDATE teachers SET subject_id = ?, subject = ? WHERE LOWER(TRIM(subject)) = LOWER(TRIM(?))',
            [savedSubject.id, savedSubject.name, savedSubject.name]
          );
        }
      }
      if (result.affectedRows > 1) updated += 1;
      else inserted += 1;
    } else if (entity === 'teacherTasks') {
      const niy = pickValue(row, ['niy']);
      const title = pickValue(row, ['tugas', 'title']);
      if (!niy || !title) continue;
      const [teacherRows] = await pool.query('SELECT id FROM teachers WHERE niy = ? LIMIT 1', [niy]);
      if (!teacherRows[0]) continue;
      const teacherId = teacherRows[0].id;
      const [result] = await pool.query(
        `INSERT INTO teacher_tasks (teacher_id, title, description, start_date, end_date, status)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE description = VALUES(description), start_date = VALUES(start_date), end_date = VALUES(end_date), status = VALUES(status)`,
        [
          teacherId,
          title,
          pickValue(row, ['deskripsi', 'description']),
          pickValue(row, ['tanggal_mulai', 'start_date']),
          pickValue(row, ['tanggal_selesai', 'end_date']),
          pickValue(row, ['status']) || 'aktif'
        ]
      );
      if (result.affectedRows > 1) updated += 1;
      else inserted += 1;
    } else if (entity === 'additionalTasks') {
      const name = pickValue(row, ['nama_tugas', 'name']);
      if (!name) continue;
      const [result] = await pool.query(
        `INSERT INTO additional_tasks (name, is_active)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE is_active = VALUES(is_active)`,
        [
          name,
          String(pickValue(row, ['aktif', 'is_active'])) === '0' ? 0 : 1
        ]
      );
      if (result.affectedRows > 1) updated += 1;
      else inserted += 1;
    } else if (entity === 'classes') {
      const name = pickValue(row, ['kelas', 'name']);
      if (!name) continue;
      const teacherRef = await resolveTeacherRef(pickValue(row, ['wali_kelas', 'homeroom_teacher']), teacherCache);
      const [result] = await pool.query(
        `INSERT INTO classes (name, grade_level, homeroom_teacher, homeroom_teacher_id, room_name, curriculum, student_count, max_students, jtm_rombel, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE grade_level = VALUES(grade_level), homeroom_teacher = VALUES(homeroom_teacher), homeroom_teacher_id = VALUES(homeroom_teacher_id), room_name = VALUES(room_name), curriculum = VALUES(curriculum), student_count = VALUES(student_count), max_students = VALUES(max_students), jtm_rombel = VALUES(jtm_rombel), is_active = VALUES(is_active)`,
        [
          name,
          pickValue(row, ['tingkat', 'grade_level']),
          teacherRef.name,
          teacherRef.id,
          pickValue(row, ['nama_ruangan', 'room_name']),
          pickValue(row, ['kurikulum', 'curriculum']),
          pickValue(row, ['jumlah_siswa', 'student_count']),
          pickValue(row, ['kapasitas', 'max_students']),
          pickValue(row, ['jtm_rombel', 'jtm']),
          String(pickValue(row, ['aktif', 'is_active'])) === '0' ? 0 : 1
        ]
      );
      if (result.affectedRows > 1) updated += 1;
      else inserted += 1;
    } else if (entity === 'schoolYears') {
      const name = pickValue(row, ['tahun_ajaran', 'name']);
      if (!name) continue;
      const [result] = await pool.query(
        `INSERT INTO school_years (name, is_active)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE is_active = VALUES(is_active)`,
        [
          name,
          String(pickValue(row, ['aktif', 'is_active'])) === '0' ? 0 : 1
        ]
      );
      if (result.affectedRows > 1) updated += 1;
      else inserted += 1;
    } else if (entity === 'semesters') {
      const name = pickValue(row, ['semester', 'name']);
      if (!name) continue;
      const [result] = await pool.query(
        `INSERT INTO semesters (name, is_active)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE is_active = VALUES(is_active)`,
        [
          name,
          String(pickValue(row, ['aktif', 'is_active'])) === '0' ? 0 : 1
        ]
      );
      if (result.affectedRows > 1) updated += 1;
      else inserted += 1;
    }
  }

  res.json({ message: 'Import selesai', inserted, updated });
}

module.exports = {
  importXlsx
};
