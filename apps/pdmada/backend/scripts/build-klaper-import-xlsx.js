/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const SOURCE_FILE = 'C:/Users/KH CORP/Downloads/KLAPER SISWA 2021 sd 2025 (2).xlsx';
const TARGET_SHEETS = ['2023', '2024', '2025'];
const OUTPUT_FILE = path.resolve(__dirname, '../tmp/import_siswa_2023_2025.xlsx');

function norm(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function digits(value, maxLen) {
  const v = String(value || '').replace(/\D/g, '').trim();
  if (!v) return '';
  return maxLen ? v.slice(0, maxLen) : v;
}

function parseDate(value) {
  if (value === null || typeof value === 'undefined' || value === '') return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return '';
    if (parsed.m < 1 || parsed.m > 12 || parsed.d < 1 || parsed.d > 31) return '';
    return `${String(parsed.y).padStart(4, '0')}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
  }
  const text = String(value).trim();
  const m = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    let dd = a;
    let mm = b;
    if (b > 12 && a <= 12) {
      mm = a;
      dd = b;
    }
    const yy = Number(m[3]);
    const yyyy = yy < 100 ? (yy > 30 ? 1900 + yy : 2000 + yy) : yy;
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return '';
    return `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  }
  return '';
}

function normalizeGender(value) {
  const t = norm(value);
  if (!t || t === '-') return '';
  if (t.includes('laki') || t === 'l') return 'L';
  if (t.includes('perempuan') || t === 'p') return 'P';
  return '';
}

function normalizeStatus(value) {
  const t = norm(value);
  if (!t || t === '-') return 'aktif';
  if (t.includes('lulus') || t.includes('alumni')) return 'lulus';
  if (t.includes('pindah')) return 'pindah';
  if (t.includes('keluar') || t.includes('nonaktif') || t.includes('non aktif')) return 'keluar';
  return 'aktif';
}

function normalizeClassName(raw) {
  const text = String(raw || '').trim().toUpperCase();
  if (!text || text === '-') return '';
  const m = text.match(/^(XII|XI|X|\d{1,2})\s*[\.\-]?\s*(\d{1,2})/);
  if (!m) return '';
  let grade = m[1];
  const paralel = Number(m[2]);
  if (grade === 'X') grade = 10;
  else if (grade === 'XI') grade = 11;
  else if (grade === 'XII') grade = 12;
  else grade = Number(grade);
  return `${grade}.${paralel}`;
}

function findHeaderIndex(aoa) {
  for (let i = 0; i < Math.min(20, aoa.length); i += 1) {
    const row = aoa[i] || [];
    const hasName = row.some((c) => norm(c).includes('nama siswa'));
    const hasNis = row.some((c) => norm(c).includes('nis lokal'));
    if (hasName && hasNis) return i;
  }
  return -1;
}

function buildHeaderMap(headerRow) {
  const map = {};
  headerRow.forEach((cell, idx) => {
    const key = norm(cell);
    if (key) map[key] = idx;
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

function yearToSchoolYear(sheetName) {
  const y = Number(sheetName);
  if (!Number.isFinite(y)) return '';
  return `${y}/${y + 1}`;
}

function run() {
  const workbook = XLSX.readFile(SOURCE_FILE, { cellDates: true });
  const outputRows = [];

  for (const sheetName of TARGET_SHEETS) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    const headerIndex = findHeaderIndex(aoa);
    if (headerIndex < 0) continue;
    const map = buildHeaderMap(aoa[headerIndex]);

    const idxName = findCol(map, ['nama siswa']);
    const idxNik = findCol(map, ['nik) siswa', 'nik siswa']);
    const idxNisLocal = findCol(map, ['nis lokal']);
    const idxNism = findCol(map, ['nism']);
    const idxNisn = findCol(map, ['nisn']);
    const idxClass = findCol(map, ['kelas paralel']);
    const idxBirthPlace = findCol(map, ['tempat lahir']);
    const idxBirthDate = findCol(map, ['tanggallahir', 'tanggal lahir']);
    const idxGender = findCol(map, ['jenis kelamin']);
    const idxStatus = findCol(map, ['status siswa']);
    const idxHobby = findCol(map, ['hobi']);
    const idxAspiration = findCol(map, ['cita']);
    const idxPrevSchool = findCol(map, ['asal sekolah']);
    const idxAddress = findCol(map, ['alamat']);
    const idxVillage = findCol(map, ['desa/kelurahan']);
    const idxSubdistrict = findCol(map, ['kecamatan']);
    const idxCity = findCol(map, ['kab./kota', 'kabupaten/kota']);
    const idxProvince = findCol(map, ['provinsi']);
    const idxPostal = findCol(map, ['kode pos']);
    const idxKk = findCol(map, ['kartu keluarga']);
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

    for (let r = headerIndex + 1; r < aoa.length; r += 1) {
      const row = aoa[r] || [];
      const nama = String(row[idxName] || '').trim();
      const nis_local = digits(row[idxNisLocal], 20);
      let nisn = digits(row[idxNisn], 20);
      const nism = String(row[idxNism] || '').trim();
      if (!nama || (!nis_local && !nisn && !nism)) continue;
      if (!nisn && nis_local) nisn = `9${nis_local}`.slice(0, 20);
      if (!nisn) continue;

      outputRows.push({
        nama,
        nik: digits(row[idxNik], 20),
        nis_lokal: nis_local,
        nism,
        nisn,
        kelas: normalizeClassName(row[idxClass]),
        tempat_lahir: String(row[idxBirthPlace] || '').trim(),
        tanggal_lahir: parseDate(row[idxBirthDate]),
        jenis_kelamin: normalizeGender(row[idxGender]),
        status_siswa: normalizeStatus(row[idxStatus]),
        hobi: String(row[idxHobby] || '').trim(),
        cita_cita: String(row[idxAspiration] || '').trim(),
        asal_sekolah: String(row[idxPrevSchool] || '').trim(),
        alamat: String(row[idxAddress] || '').trim(),
        desa: String(row[idxVillage] || '').trim(),
        kecamatan: String(row[idxSubdistrict] || '').trim(),
        kabupaten: String(row[idxCity] || '').trim(),
        provinsi: String(row[idxProvince] || '').trim(),
        kode_pos: digits(row[idxPostal], 10),
        no_kk: digits(row[idxKk], 30),
        no_kip: digits(row[idxKip], 30),
        ayah_nama: String(row[idxFatherName] || '').trim(),
        ayah_nik: digits(row[idxFatherNik], 20),
        ayah_pekerjaan: String(row[idxFatherOcc] || '').trim(),
        ibu_nama: String(row[idxMotherName] || '').trim(),
        ibu_nik: digits(row[idxMotherNik], 20),
        ibu_pekerjaan: String(row[idxMotherOcc] || '').trim(),
        wali_nama: String(row[idxGuardianName] || '').trim(),
        wali_nik: digits(row[idxGuardianNik], 20),
        wali_pekerjaan: String(row[idxGuardianOcc] || '').trim(),
        tahun_ajaran: yearToSchoolYear(sheetName)
      });
    }
  }

  const outDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outBook = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(outputRows, { skipHeader: false });
  XLSX.utils.book_append_sheet(outBook, ws, 'students_import');
  XLSX.writeFile(outBook, OUTPUT_FILE);
  console.log(`Generated: ${OUTPUT_FILE}`);
  console.log(`Rows: ${outputRows.length}`);
}

run();
