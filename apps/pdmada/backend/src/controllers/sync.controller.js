const pool = require('../db/pool');

const allowedTables = new Set(['students', 'teachers', 'subjects', 'classes', 'school_years', 'semesters', 'teacher_tasks', 'additional_tasks']);

async function listChanges(req, res) {
  const since = req.query.since;
  let query = 'SELECT * FROM change_log ORDER BY changed_at ASC, id ASC LIMIT 500';
  let params = [];

  if (since) {
    query = 'SELECT * FROM change_log WHERE changed_at > ? ORDER BY changed_at ASC, id ASC LIMIT 500';
    params = [since];
  }

  const [rows] = await pool.query(query, params);
  res.json(rows);
}

async function applyChanges(req, res) {
  const changes = Array.isArray(req.body) ? req.body : [];
  if (!changes.length) return res.status(400).json({ message: 'No changes provided' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    for (const change of changes) {
      if (!change.table_name || !change.record_id || !change.operation) {
        throw new Error('Invalid change payload');
      }
      if (!allowedTables.has(change.table_name)) {
        throw new Error(`Unsupported table: ${change.table_name}`);
      }

      const data = change.data_json ? JSON.parse(change.data_json) : null;
      if (change.operation === 'delete') {
        await conn.query(`DELETE FROM ${change.table_name} WHERE id = ?`, [change.record_id]);
      } else {
        if (!data) throw new Error('Missing data_json for upsert');
        if (change.table_name === 'students') {
          await conn.query(
            'INSERT INTO students (id, nik, nis_local, nisn, nism, kip, name, birth_place, gender, birth_date, religion, student_status, previous_school, special_needs, blood_type, height_cm, weight_kg, transportation, distance_km, emergency_contact_name, emergency_contact_phone, emergency_contact_relation, family_card_number, citizenship, living_with, siblings_count, child_order, phone, pondok_pesantren, class_id, entry_date, school_year_id, father_nik, father_name, father_birth_place, father_birth_date, father_status, father_education, father_occupation, father_domicile, father_phone, father_income_monthly, father_address, mother_nik, mother_name, mother_birth_place, mother_birth_date, mother_status, mother_education, mother_occupation, mother_domicile, mother_phone, mother_income_monthly, mother_address, guardian_nik, guardian_name, guardian_birth_place, guardian_birth_date, guardian_status, guardian_education, guardian_occupation, guardian_domicile, guardian_phone, guardian_income_monthly, guardian_address, address, address_village, address_subdistrict, address_city, address_province, postal_code, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE nik = VALUES(nik), nis_local = VALUES(nis_local), nisn = VALUES(nisn), nism = VALUES(nism), kip = VALUES(kip), name = VALUES(name), birth_place = VALUES(birth_place), gender = VALUES(gender), birth_date = VALUES(birth_date), religion = VALUES(religion), student_status = VALUES(student_status), previous_school = VALUES(previous_school), special_needs = VALUES(special_needs), blood_type = VALUES(blood_type), height_cm = VALUES(height_cm), weight_kg = VALUES(weight_kg), transportation = VALUES(transportation), distance_km = VALUES(distance_km), emergency_contact_name = VALUES(emergency_contact_name), emergency_contact_phone = VALUES(emergency_contact_phone), emergency_contact_relation = VALUES(emergency_contact_relation), family_card_number = VALUES(family_card_number), citizenship = VALUES(citizenship), living_with = VALUES(living_with), siblings_count = VALUES(siblings_count), child_order = VALUES(child_order), phone = VALUES(phone), pondok_pesantren = VALUES(pondok_pesantren), class_id = VALUES(class_id), entry_date = VALUES(entry_date), school_year_id = VALUES(school_year_id), father_nik = VALUES(father_nik), father_name = VALUES(father_name), father_birth_place = VALUES(father_birth_place), father_birth_date = VALUES(father_birth_date), father_status = VALUES(father_status), father_education = VALUES(father_education), father_occupation = VALUES(father_occupation), father_domicile = VALUES(father_domicile), father_phone = VALUES(father_phone), father_income_monthly = VALUES(father_income_monthly), father_address = VALUES(father_address), mother_nik = VALUES(mother_nik), mother_name = VALUES(mother_name), mother_birth_place = VALUES(mother_birth_place), mother_birth_date = VALUES(mother_birth_date), mother_status = VALUES(mother_status), mother_education = VALUES(mother_education), mother_occupation = VALUES(mother_occupation), mother_domicile = VALUES(mother_domicile), mother_phone = VALUES(mother_phone), mother_income_monthly = VALUES(mother_income_monthly), mother_address = VALUES(mother_address), guardian_nik = VALUES(guardian_nik), guardian_name = VALUES(guardian_name), guardian_birth_place = VALUES(guardian_birth_place), guardian_birth_date = VALUES(guardian_birth_date), guardian_status = VALUES(guardian_status), guardian_education = VALUES(guardian_education), guardian_occupation = VALUES(guardian_occupation), guardian_domicile = VALUES(guardian_domicile), guardian_phone = VALUES(guardian_phone), guardian_income_monthly = VALUES(guardian_income_monthly), guardian_address = VALUES(guardian_address), address = VALUES(address), address_village = VALUES(address_village), address_subdistrict = VALUES(address_subdistrict), address_city = VALUES(address_city), address_province = VALUES(address_province), postal_code = VALUES(postal_code), is_active = VALUES(is_active)',
            [
              data.id || change.record_id,
              data.nik,
              data.nis_local,
              data.nisn,
              data.nism,
              data.kip,
              data.name,
              data.birth_place,
              data.gender,
              data.birth_date,
              data.religion,
              data.student_status,
              data.previous_school,
              data.special_needs,
              data.blood_type,
              data.height_cm,
              data.weight_kg,
              data.transportation,
              data.distance_km,
              data.emergency_contact_name,
              data.emergency_contact_phone,
              data.emergency_contact_relation,
              data.family_card_number,
              data.citizenship,
              data.living_with,
              data.siblings_count,
              data.child_order,
              data.phone,
              data.pondok_pesantren,
              data.class_id,
              data.entry_date,
              data.school_year_id,
              data.father_nik,
              data.father_name,
              data.father_birth_place,
              data.father_birth_date,
              data.father_status,
              data.father_education,
              data.father_occupation,
              data.father_domicile,
              data.father_phone,
              data.father_income_monthly,
              data.father_address,
              data.mother_nik,
              data.mother_name,
              data.mother_birth_place,
              data.mother_birth_date,
              data.mother_status,
              data.mother_education,
              data.mother_occupation,
              data.mother_domicile,
              data.mother_phone,
              data.mother_income_monthly,
              data.mother_address,
              data.guardian_nik,
              data.guardian_name,
              data.guardian_birth_place,
              data.guardian_birth_date,
              data.guardian_status,
              data.guardian_education,
              data.guardian_occupation,
              data.guardian_domicile,
              data.guardian_phone,
              data.guardian_income_monthly,
              data.guardian_address,
              data.address,
              data.address_village,
              data.address_subdistrict,
              data.address_city,
              data.address_province,
              data.postal_code,
              data.is_active
            ]
          );
        } else if (change.table_name === 'teachers') {
          await conn.query(
            'INSERT INTO teachers (id, niy, name, degree, subject, subject_id, phone, email, s1_university, s1_major, s1_grad_year, s2_university, s2_major, s2_grad_year, educator_certificate, certificate_major, nik, family_card_number, tmt, gender, birth_place, birth_date, address, address_village, address_subdistrict, address_city, address_province, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE niy = VALUES(niy), name = VALUES(name), degree = VALUES(degree), subject = VALUES(subject), subject_id = VALUES(subject_id), phone = VALUES(phone), email = VALUES(email), s1_university = VALUES(s1_university), s1_major = VALUES(s1_major), s1_grad_year = VALUES(s1_grad_year), s2_university = VALUES(s2_university), s2_major = VALUES(s2_major), s2_grad_year = VALUES(s2_grad_year), educator_certificate = VALUES(educator_certificate), certificate_major = VALUES(certificate_major), nik = VALUES(nik), family_card_number = VALUES(family_card_number), tmt = VALUES(tmt), gender = VALUES(gender), birth_place = VALUES(birth_place), birth_date = VALUES(birth_date), address = VALUES(address), address_village = VALUES(address_village), address_subdistrict = VALUES(address_subdistrict), address_city = VALUES(address_city), address_province = VALUES(address_province), is_active = VALUES(is_active)',
            [
              data.id || change.record_id,
              data.niy,
              data.name,
              data.degree,
              data.subject,
              data.subject_id || null,
              data.phone,
              data.email,
              data.s1_university,
              data.s1_major,
              data.s1_grad_year,
              data.s2_university,
              data.s2_major,
              data.s2_grad_year,
              data.educator_certificate,
              data.certificate_major,
              data.nik,
              data.family_card_number,
              data.tmt,
              data.gender,
              data.birth_place,
              data.birth_date,
              data.address,
              data.address_village,
              data.address_subdistrict,
              data.address_city,
              data.address_province,
              data.is_active
            ]
          );
        } else if (change.table_name === 'subjects') {
          await conn.query(
            'INSERT INTO subjects (id, code, name, group_name, grade_level, is_active) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE code = VALUES(code), name = VALUES(name), group_name = VALUES(group_name), grade_level = VALUES(grade_level), is_active = VALUES(is_active)',
            [data.id || change.record_id, data.code, data.name, data.group_name, data.grade_level, data.is_active]
          );
        } else if (change.table_name === 'classes') {
          await conn.query(
            'INSERT INTO classes (id, name, grade_level, homeroom_teacher, homeroom_teacher_id, room_name, curriculum, student_count, max_students, jtm_rombel, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), grade_level = VALUES(grade_level), homeroom_teacher = VALUES(homeroom_teacher), homeroom_teacher_id = VALUES(homeroom_teacher_id), room_name = VALUES(room_name), curriculum = VALUES(curriculum), student_count = VALUES(student_count), max_students = VALUES(max_students), jtm_rombel = VALUES(jtm_rombel), is_active = VALUES(is_active)',
            [
              data.id || change.record_id,
              data.name,
              data.grade_level,
              data.homeroom_teacher,
              data.homeroom_teacher_id || null,
              data.room_name,
              data.curriculum,
              data.student_count,
              data.max_students,
              data.jtm_rombel,
              data.is_active
            ]
          );
        } else if (change.table_name === 'teacher_tasks') {
          await conn.query(
            'INSERT INTO teacher_tasks (id, teacher_id, title, description, start_date, end_date, status) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE teacher_id = VALUES(teacher_id), title = VALUES(title), description = VALUES(description), start_date = VALUES(start_date), end_date = VALUES(end_date), status = VALUES(status)',
            [
              data.id || change.record_id,
              data.teacher_id,
              data.title,
              data.description,
              data.start_date,
              data.end_date,
              data.status
            ]
          );
        } else if (change.table_name === 'additional_tasks') {
          await conn.query(
            'INSERT INTO additional_tasks (id, name, is_active) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), is_active = VALUES(is_active)',
            [data.id || change.record_id, data.name, data.is_active]
          );
        } else if (change.table_name === 'school_years') {
          await conn.query(
            'INSERT INTO school_years (id, name, is_active) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), is_active = VALUES(is_active)',
            [data.id || change.record_id, data.name, data.is_active]
          );
        } else if (change.table_name === 'semesters') {
          await conn.query(
            'INSERT INTO semesters (id, name, is_active) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), is_active = VALUES(is_active)',
            [data.id || change.record_id, data.name, data.is_active]
          );
        }
      }

      await conn.query(
        'INSERT INTO change_log (table_name, record_id, operation, data_json, source) VALUES (?, ?, ?, ?, ?)',
        [change.table_name, change.record_id, change.operation, change.data_json || null, 'remote']
      );
    }

    await conn.commit();
    res.json({ message: 'Changes applied', count: changes.length });
  } catch (err) {
    await conn.rollback();
    res.status(400).json({ message: err.message });
  } finally {
    conn.release();
  }
}

module.exports = {
  listChanges,
  applyChanges
};
