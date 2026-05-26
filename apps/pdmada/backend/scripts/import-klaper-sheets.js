/* eslint-disable no-console */
require('dotenv').config();
const XLSX = require('xlsx');
const pool = require('../src/db/pool');
const { upsertStudentAccount } = require('../src/controllers/users.controller');

const FILE_PATH = 'C:/Users/KH CORP/Downloads/KLAPER SISWA 2021 sd 2025 (2).xlsx';
const TARGET_SHEETS = ['2023', '2024', '2025'];

function norm(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\n/g, ' ')
    .trim();
}

function parseExcelDate(value) {
  if (value === null || typeof value === 'undefined' || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    if (parsed.m < 1 || parsed.m > 12 || parsed.d < 1 || parsed.d > 31) return null;
    const yyyy = String(parsed.y).padStart(4, '0');
    const mm = String(parsed.m).padStart(2, '0');
    const dd = String(parsed.d).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  const text = String(value).trim();
  if (!text) return null;
  const m = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    let dd = a;
    let mm = b;
    if (b > 12 && a <= 12) {
      // Some rows use mm/dd/yyyy format.
      mm = a;
      dd = b;
    }
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    const yRaw = Number(m[3]);
    const yyyy = yRaw < 100 ? (yRaw > 30 ? 1900 + yRaw : 2000 + yRaw) : yRaw;
    return `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  }
  const d = new Date(text);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function normalizeGender(value) {
  const t = norm(value);
  if (!t || t === '-') return null;
  if (t.includes('laki')) return 'L';
  if (t.includes('perempuan')) return 'P';
  if (t === 'l') return 'L';
  if (t === 'p') return 'P';
  return null;
}

function normalizeStatus(value) {
  const t = norm(value);
  if (!t || t === '-') return 'aktif';
  if (t.includes('lulus') || t.includes('alumni')) return 'lulus';
  if (t.includes('pindah')) return 'pindah';
  if (t.includes('keluar') || t.includes('nonaktif') || t.includes('non aktif')) return 'keluar';
  return 'aktif';
}

function normalizeClassName(rawClass) {
  const text = String(rawClass || '').trim().toUpperCase();
  if (!text || text === '-') return '';
  const match = text.match(/^(XII|XI|X|\d{1,2})\s*[\.\-]?\s*(\d{1,2})/);
  if (!match) {
    const pureNum = text.match(/^(\d{1,2})\.(\d{1,2})/);
    if (pureNum) return `${Number(pureNum[1])}.${Number(pureNum[2])}`;
    return '';
  }
  let grade = match[1];
  const paralel = Number(match[2]);
  if (grade === 'X') grade = 10;
  else if (grade === 'XI') grade = 11;
  else if (grade === 'XII') grade = 12;
  else grade = Number(grade);
  return `${grade}.${paralel}`;
}

function digits(value, maxLen) {
  const v = String(value || '').replace(/\D/g, '').trim();
  if (!v) return null;
  return maxLen ? v.slice(0, maxLen) : v;
}

function findHeaderIndex(aoa) {
  for (let i = 0; i < Math.min(20, aoa.length); i += 1) {
    const row = aoa[i] || [];
    const hasName = row.some((c) => norm(c).includes('nama siswa'));
    const hasNisLocal = row.some((c) => norm(c).includes('nis lokal'));
    if (hasName && hasNisLocal) return i;
  }
  return -1;
}

function buildHeaderMap(headerRow) {
  const map = {};
  headerRow.forEach((cell, idx) => {
    const key = norm(cell);
    if (!key) return;
    map[key] = idx;
  });
  return map;
}

function findCol(map, patterns) {
  const entries = Object.entries(map);
  for (const p of patterns) {
    const found = entries.find(([k]) => k.includes(p));
    if (found) return found[1];
  }
  return -1;
}

async function run() {
  const workbook = XLSX.readFile(FILE_PATH, { cellDates: true });
  const [classRows] = await pool.query('SELECT id, name FROM classes');
  const classIdByName = new Map(classRows.map((r) => [String(r.name).trim().toUpperCase(), r.id]));
  const [schoolYears] = await pool.query('SELECT id, name, is_active FROM school_years ORDER BY id DESC');
  const activeSchoolYear = schoolYears.find((r) => Number(r.is_active) === 1) || schoolYears[0] || null;

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const sheetStats = [];

  for (const sheetName of TARGET_SHEETS) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    const headerIndex = findHeaderIndex(aoa);
    if (headerIndex < 0) continue;
    const headerRow = aoa[headerIndex];
    const map = buildHeaderMap(headerRow);

    const idxName = findCol(map, ['nama siswa']);
    const idxNisLocal = findCol(map, ['nis lokal']);
    const idxNism = findCol(map, ['nism']);
    const idxNisn = findCol(map, ['nisn']);
    const idxNik = findCol(map, ['nik) siswa', 'nik siswa']);
    const idxBirthPlace = findCol(map, ['tempat lahir']);
    const idxBirthDate = findCol(map, ['tanggallahir', 'tanggal lahir']);
    const idxGender = findCol(map, ['jenis kelamin']);
    const idxStatus = findCol(map, ['status siswa']);
    const idxHobby = findCol(map, ['hobi']);
    const idxAspiration = findCol(map, ['cita']);
    const idxClass = findCol(map, ['kelas paralel']);
    const idxPrevSchool = findCol(map, ['asal sekolah']);
    const idxAddress = findCol(map, ['alamat']);
    const idxVillage = findCol(map, ['desa/kelurahan']);
    const idxSubdistrict = findCol(map, ['kecamatan']);
    const idxCity = findCol(map, ['kab./kota', 'kabupaten/kota']);
    const idxProvince = findCol(map, ['provinsi']);
    const idxPostal = findCol(map, ['kode pos']);
    const idxKk = findCol(map, ['no. kartu keluarga', 'kartu keluarga']);
    const idxKip = findCol(map, ['kartu indonesia pintar', 'nomor kip']);
    const idxFatherName = findCol(map, ['nama lengkap ayah']);
    const idxFatherNik = findCol(map, ['nik/nomor ktp ayah']);
    const idxFatherOcc = findCol(map, ['pekerjaan ayah']);
    const idxMotherName = findCol(map, ['nama lengkap ibu']);
    const idxMotherNik = findCol(map, ['nik/nomor ktp ibu']);
    const idxMotherOcc = findCol(map, ['pekerjaan ibu']);
    const idxGuardianName = findCol(map, ['nama lengkap wali']);
    const idxGuardianNik = findCol(map, ['nik/nomor ktp wali']);
    const idxGuardianOcc = findCol(map, ['pekerjaan wali']);

    let sheetInserted = 0;
    let sheetUpdated = 0;
    let sheetSkipped = 0;

    for (let r = headerIndex + 1; r < aoa.length; r += 1) {
      const row = aoa[r] || [];
      const name = String(row[idxName] || '').trim();
      const nisLocal = digits(row[idxNisLocal], 20) || '';
      const nism = String(row[idxNism] || '').trim();
      let nisn = digits(row[idxNisn], 20) || '';
      const nik = digits(row[idxNik], 20) || '';

      if (!name && !nisLocal && !nism && !nisn) continue;
      if (!name || (!nisLocal && !nisn)) {
        skipped += 1;
        sheetSkipped += 1;
        continue;
      }

      if (!nisn) {
        nisn = nisLocal ? `9${nisLocal}`.slice(0, 20) : '';
      }
      if (!nisn) {
        skipped += 1;
        sheetSkipped += 1;
        continue;
      }

      const classNameNorm = normalizeClassName(row[idxClass]);
      const classId = classNameNorm ? (classIdByName.get(classNameNorm.toUpperCase()) || null) : null;

      const payload = {
        nik: nik || null,
        nis_local: nisLocal || null,
        nisn,
        nism: nism || null,
        kip: digits(row[idxKip], 30) || null,
        name,
        birth_place: String(row[idxBirthPlace] || '').trim() || null,
        gender: normalizeGender(row[idxGender]),
        birth_date: parseExcelDate(row[idxBirthDate]),
        student_status: normalizeStatus(row[idxStatus]),
        previous_school: String(row[idxPrevSchool] || '').trim() || null,
        hobby: String(row[idxHobby] || '').trim() || null,
        aspiration: String(row[idxAspiration] || '').trim() || null,
        class_id: classId,
        school_year_id: activeSchoolYear ? activeSchoolYear.id : null,
        father_name: String(row[idxFatherName] || '').trim() || null,
        father_nik: digits(row[idxFatherNik], 20) || null,
        father_occupation: String(row[idxFatherOcc] || '').trim() || null,
        mother_name: String(row[idxMotherName] || '').trim() || null,
        mother_nik: digits(row[idxMotherNik], 20) || null,
        mother_occupation: String(row[idxMotherOcc] || '').trim() || null,
        guardian_name: String(row[idxGuardianName] || '').trim() || null,
        guardian_nik: digits(row[idxGuardianNik], 20) || null,
        guardian_occupation: String(row[idxGuardianOcc] || '').trim() || null,
        address: String(row[idxAddress] || '').trim() || null,
        address_village: String(row[idxVillage] || '').trim() || null,
        address_subdistrict: String(row[idxSubdistrict] || '').trim() || null,
        address_city: String(row[idxCity] || '').trim() || null,
        address_province: String(row[idxProvince] || '').trim() || null,
        postal_code: digits(row[idxPostal], 10) || null,
        family_card_number: digits(row[idxKk], 30) || null,
        is_active: normalizeStatus(row[idxStatus]) === 'aktif' ? 1 : 0
      };

      const [existingRows] = await pool.query(
        `SELECT id FROM students
         WHERE (nis_local IS NOT NULL AND nis_local <> '' AND nis_local = ?)
            OR (nisn = ?)
            OR (nism IS NOT NULL AND nism <> '' AND nism = ?)
         LIMIT 1`,
        [payload.nis_local || '', payload.nisn, payload.nism || '']
      );

      if (existingRows[0]) {
        await pool.query(
          `UPDATE students SET
            nik=?, nis_local=?, nisn=?, nism=?, kip=?, name=?, birth_place=?, gender=?, birth_date=?,
            student_status=?, previous_school=?, hobby=?, aspiration=?, class_id=?, school_year_id=?,
            father_name=?, father_nik=?, father_occupation=?, mother_name=?, mother_nik=?, mother_occupation=?,
            guardian_name=?, guardian_nik=?, guardian_occupation=?, address=?, address_village=?, address_subdistrict=?,
            address_city=?, address_province=?, postal_code=?, family_card_number=?, is_active=?
           WHERE id=?`,
          [
            payload.nik,
            payload.nis_local,
            payload.nisn,
            payload.nism,
            payload.kip,
            payload.name,
            payload.birth_place,
            payload.gender,
            payload.birth_date,
            payload.student_status,
            payload.previous_school,
            payload.hobby,
            payload.aspiration,
            payload.class_id,
            payload.school_year_id,
            payload.father_name,
            payload.father_nik,
            payload.father_occupation,
            payload.mother_name,
            payload.mother_nik,
            payload.mother_occupation,
            payload.guardian_name,
            payload.guardian_nik,
            payload.guardian_occupation,
            payload.address,
            payload.address_village,
            payload.address_subdistrict,
            payload.address_city,
            payload.address_province,
            payload.postal_code,
            payload.family_card_number,
            payload.is_active,
            existingRows[0].id
          ]
        );
        updated += 1;
        sheetUpdated += 1;
        const [rows] = await pool.query('SELECT id, nis_local, nisn, is_active FROM students WHERE id = ?', [existingRows[0].id]);
        if (rows[0]) await upsertStudentAccount(rows[0]);
      } else {
        const [result] = await pool.query(
          `INSERT INTO students (
            nik, nis_local, nisn, nism, kip, name, birth_place, gender, birth_date, student_status,
            previous_school, hobby, aspiration, class_id, school_year_id, father_name, father_nik, father_occupation,
            mother_name, mother_nik, mother_occupation, guardian_name, guardian_nik, guardian_occupation,
            address, address_village, address_subdistrict, address_city, address_province, postal_code, family_card_number, is_active
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            payload.nik,
            payload.nis_local,
            payload.nisn,
            payload.nism,
            payload.kip,
            payload.name,
            payload.birth_place,
            payload.gender,
            payload.birth_date,
            payload.student_status,
            payload.previous_school,
            payload.hobby,
            payload.aspiration,
            payload.class_id,
            payload.school_year_id,
            payload.father_name,
            payload.father_nik,
            payload.father_occupation,
            payload.mother_name,
            payload.mother_nik,
            payload.mother_occupation,
            payload.guardian_name,
            payload.guardian_nik,
            payload.guardian_occupation,
            payload.address,
            payload.address_village,
            payload.address_subdistrict,
            payload.address_city,
            payload.address_province,
            payload.postal_code,
            payload.family_card_number,
            payload.is_active
          ]
        );
        inserted += 1;
        sheetInserted += 1;
        const [rows] = await pool.query('SELECT id, nis_local, nisn, is_active FROM students WHERE id = ?', [result.insertId]);
        if (rows[0]) await upsertStudentAccount(rows[0]);
      }
    }

    sheetStats.push({ sheet: sheetName, inserted: sheetInserted, updated: sheetUpdated, skipped: sheetSkipped });
  }

  console.log('IMPORT DONE');
  sheetStats.forEach((s) => {
    console.log(`- Sheet ${s.sheet}: insert=${s.inserted}, update=${s.updated}, skip=${s.skipped}`);
  });
  console.log(`TOTAL: insert=${inserted}, update=${updated}, skip=${skipped}`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('IMPORT FAILED:', err.message);
    process.exit(1);
  });
