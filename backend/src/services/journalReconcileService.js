const pool = require('../db');
const attendance = require('./attendanceService');
const { formatDateToYMD } = require('../utils/date');

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

// Nama mapel/guru bisa beda ejaan antar sistem (mis. "Alquran Hadis" vs
// "Alqur'an Hadis") — bandingkan setelah membuang non-alfanumerik.
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Cocokkan satu entri jurnal emada ke jadwal: hari (dari tanggal) + guru +
// kelas + mapel harus sama (strict — aturan penggajian). Dipakai oleh route
// /api/external/journal-sync (push realtime dari emada) dan oleh job
// rekonsiliasi di bawah, supaya keduanya tidak pernah beda perilaku.
// Return: { matched, slots: [{tanggal,jamKe,kelas,guruId,status}], reason }
async function matchJournalToSchedule({ tanggal, guruNama, kelasNama, mapelNama, jamKe }) {
  const masterPool = pool.master;
  const jamList = (Array.isArray(jamKe) ? jamKe : String(jamKe).split(',')).map(j => String(j).trim()).filter(Boolean);
  if (!tanggal || !guruNama || !kelasNama || jamList.length === 0) {
    return { matched: false, slots: [], reason: 'payload tidak lengkap' };
  }

  // Lookup teacher id dari master berdasarkan nama
  const [teacherRows] = await masterPool.query(
    'SELECT id FROM teachers WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND is_active=1 LIMIT 1',
    [guruNama]
  );
  let masterGuruId = teacherRows.length > 0 ? String(teacherRows[0].id) : null;
  if (!masterGuruId) {
    const [fuzzyRows] = await masterPool.query(
      'SELECT id FROM teachers WHERE LOWER(TRIM(name)) LIKE ? AND is_active=1 LIMIT 1',
      [`%${guruNama.toLowerCase().trim()}%`]
    );
    if (fuzzyRows.length > 0) masterGuruId = String(fuzzyRows[0].id);
  }
  if (!masterGuruId) return { matched: false, slots: [], reason: `guru "${guruNama}" tidak ditemukan di master` };

  // Lookup kelas id dari master berdasarkan nama
  const [classRows] = await masterPool.query(
    'SELECT id FROM classes WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1',
    [kelasNama]
  );
  let masterKelasId = classRows.length > 0 ? String(classRows[0].id) : null;
  if (!masterKelasId) {
    const [fuzzyClassRows] = await masterPool.query(
      'SELECT id FROM classes WHERE LOWER(TRIM(name)) LIKE ? LIMIT 1',
      [`%${kelasNama.toLowerCase().trim()}%`]
    );
    if (fuzzyClassRows.length > 0) masterKelasId = String(fuzzyClassRows[0].id);
  }
  if (!masterKelasId) return { matched: false, slots: [], reason: `kelas "${kelasNama}" tidak ditemukan di master` };

  // Lookup mapel id dari master subjects dengan perbandingan ternormalisasi
  if (!mapelNama) return { matched: false, slots: [], reason: 'mapelNama tidak dikirim' };
  const [subjectRows] = await masterPool.query('SELECT id, name FROM subjects WHERE is_active=1');
  const targetMapel = norm(mapelNama);
  let subject = subjectRows.find(r => norm(r.name) === targetMapel);
  if (!subject && targetMapel) {
    subject = subjectRows.find(r => {
      const n = norm(r.name);
      return n && (n.includes(targetMapel) || targetMapel.includes(n));
    });
  }
  if (!subject) return { matched: false, slots: [], reason: `mapel "${mapelNama}" tidak ditemukan di master` };
  const masterMapelId = String(subject.id);

  // Cocokkan dengan jadwal: hari (dari tanggal) + guru + kelas + mapel.
  const hari = DAY_NAMES[new Date(tanggal).getDay()];
  const [jadwalRows] = await pool.query(
    'SELECT guru_id, kelas, jam_ke FROM jadwal WHERE guru_id = ? AND kelas = ? AND mapel_id = ? AND hari = ?',
    [masterGuruId, masterKelasId, masterMapelId, hari]
  );
  if (jadwalRows.length === 0) {
    return { matched: false, slots: [], reason: `tidak ada jadwal ${hari} untuk guru+kelas+mapel ini` };
  }

  // Slot yang dihijaukan mengikuti jadwal. Jika jam jurnal beririsan dengan
  // jam jadwal, hanya slot yang beririsan yang dicatat; jika penomoran jam
  // antar sistem berbeda (tidak ada irisan), catat seluruh slot jadwal
  // yang cocok — kecocokan hari+guru+kelas+mapel sudah terpenuhi.
  const jadwalJams = [...new Set(jadwalRows.map(r => String(r.jam_ke).trim()))];
  const intersect = jadwalJams.filter(j => jamList.includes(j));
  const slots = intersect.length > 0 ? intersect : jadwalJams;

  return {
    matched: true,
    guruId: String(jadwalRows[0].guru_id),
    kelasId: String(jadwalRows[0].kelas),
    mapelId: masterMapelId,
    slots: slots.map(j => ({
      tanggal,
      jamKe: j,
      kelas: String(jadwalRows[0].kelas),
      guruId: String(jadwalRows[0].guru_id),
      status: 'Hadir'
    }))
  };
}

// ── Job rekonsiliasi: tarik ulang jurnal emada untuk hari berjalan ──────────
// Push realtime dari emada bersifat fire-and-forget — bisa hilang saat
// MadaFlow lambat/down. Job ini menambal celah itu: tiap interval, tarik
// SEMUA jurnal hari ini dari emada lalu isi baris kehadiran yang belum ada.
// Hanya INSERT baris yang hilang — baris yang sudah ada (termasuk input
// manual Izin/Tidak Hadir petugas) tidak pernah ditimpa.

const EMADA_BASE_URL = (process.env.EMADA_BASE_URL || '').replace(/\/+$/, '');
const EMADA_WEBHOOK_KEY = process.env.EMADA_WEBHOOK_KEY || '';

async function fetchEmadaJournals(dateString) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(
      `${EMADA_BASE_URL}/api/stats/jurnal-hari-ini?tanggal=${encodeURIComponent(dateString)}`,
      { headers: { 'x-pdmada-key': EMADA_WEBHOOK_KEY }, signal: controller.signal }
    );
    const body = await res.json().catch(() => null);
    if (!res.ok || !body || body.ok !== true || !Array.isArray(body.data)) {
      throw new Error(body?.message || `HTTP ${res.status}`);
    }
    return body.data;
  } finally {
    clearTimeout(timer);
  }
}

async function reconcileDay(dateString) {
  if (!EMADA_BASE_URL || !EMADA_WEBHOOK_KEY) {
    return { skipped: true, reason: 'EMADA_BASE_URL / EMADA_WEBHOOK_KEY belum diset' };
  }

  const journals = await fetchEmadaJournals(dateString);
  if (journals.length === 0) return { skipped: false, journals: 0, inserted: 0, unmatched: 0 };

  // Baris kehadiran yang sudah ada — apa pun statusnya — tidak disentuh.
  const [existingRows] = await pool.query(
    'SELECT jam_ke, kelas, guru_id FROM kehadiran WHERE tanggal_only = ?',
    [dateString]
  );
  const existingKeys = new Set(existingRows.map(r => `${r.guru_id}-${r.kelas}-${r.jam_ke}`));

  // Kelompokkan baris jurnal per guru+kelas+mapel (satu entri jurnal emada
  // per jam) supaya pencocokan jadwalnya sama dengan payload push realtime.
  const groups = new Map();
  journals.forEach((row) => {
    const key = `${norm(row.guruNama)}|${norm(row.namaKelas)}|${norm(row.namaMapel)}`;
    if (!groups.has(key)) {
      groups.set(key, { guruNama: row.guruNama, kelasNama: row.namaKelas, mapelNama: row.namaMapel, jamKe: [] });
    }
    groups.get(key).jamKe.push(String(row.jamKe));
  });

  let inserted = 0;
  let unmatched = 0;
  const toInsert = [];
  for (const group of groups.values()) {
    // eslint-disable-next-line no-await-in-loop
    const result = await matchJournalToSchedule({ tanggal: dateString, ...group });
    if (!result.matched) { unmatched += 1; continue; }
    result.slots.forEach((slot) => {
      const key = `${slot.guruId}-${slot.kelas}-${slot.jamKe}`;
      if (existingKeys.has(key)) return;
      existingKeys.add(key);
      toInsert.push(slot);
    });
  }

  if (toInsert.length > 0) {
    await attendance.saveBulkAttendance(toInsert);
    inserted = toInsert.length;
  }
  return { skipped: false, journals: journals.length, groups: groups.size, inserted, unmatched };
}

let reconcileTimer = null;
let reconcileRunning = false;

function startJournalReconciler() {
  const intervalMs = Number(process.env.JOURNAL_RECONCILE_INTERVAL_MS || 600000);
  if (!intervalMs || intervalMs <= 0) {
    console.log('[journal-reconcile] nonaktif (JOURNAL_RECONCILE_INTERVAL_MS=0).');
    return;
  }
  if (!EMADA_BASE_URL || !EMADA_WEBHOOK_KEY) {
    console.warn('[journal-reconcile] EMADA_BASE_URL / EMADA_WEBHOOK_KEY belum diset — job tidak dijalankan.');
    return;
  }

  const run = async () => {
    if (reconcileRunning) return; // jangan tumpang tindih saat emada lambat
    reconcileRunning = true;
    const today = formatDateToYMD(new Date());
    try {
      const result = await reconcileDay(today);
      if (!result.skipped && (result.inserted > 0 || result.unmatched > 0)) {
        console.log(`[journal-reconcile] ${today}: ${result.journals} jurnal, ${result.inserted} kehadiran baru, ${result.unmatched} grup tanpa jadwal cocok.`);
      }
    } catch (err) {
      // Hari libur atau emada tak terjangkau — cukup dicatat, coba lagi interval berikutnya.
      console.warn(`[journal-reconcile] ${today} gagal: ${err.message}`);
    } finally {
      reconcileRunning = false;
    }
  };

  // Jalankan sekali tak lama setelah start (menambal push yang hilang saat
  // MadaFlow baru restart), lalu berkala.
  setTimeout(run, 15000);
  reconcileTimer = setInterval(run, intervalMs);
  if (reconcileTimer.unref) reconcileTimer.unref();
  console.log(`[journal-reconcile] aktif — tiap ${Math.round(intervalMs / 60000)} menit menarik jurnal emada hari berjalan.`);
}

module.exports = { matchJournalToSchedule, reconcileDay, startJournalReconciler };
