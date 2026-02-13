const pool = require('../db');
const masterPool = pool.master;
const { monthKey } = require('../utils/date');
const { TTLCache } = require('../utils/cache');

const configCache = new TTLCache(30000);

async function getOtherExpenses(startDate, endDate) {
  const [rows] = await pool.query(
    `SELECT id, tanggal, kategori, penerima, jumlah, nominal, keterangan
     FROM pengeluaran_lain
     WHERE tanggal BETWEEN ? AND ?
     ORDER BY tanggal`,
    [startDate, endDate]
  );

  if (rows.length === 0) {
    const [prevMonthRow] = await pool.query(
      `SELECT DATE_FORMAT(tanggal, '%Y-%m-01') AS month_start
       FROM pengeluaran_lain
       WHERE tanggal < ?
       ORDER BY tanggal DESC
       LIMIT 1`,
      [startDate]
    );
    const prevMonthStart = prevMonthRow[0]?.month_start;
    if (prevMonthStart) {
      const [prevRows] = await pool.query(
        `SELECT kategori, penerima, jumlah, nominal, keterangan
         FROM pengeluaran_lain
         WHERE tanggal BETWEEN ? AND LAST_DAY(?)`,
        [prevMonthStart, prevMonthStart]
      );
      if (prevRows.length > 0) {
        const values = prevRows.map(r => [
          startDate,
          r.kategori,
          r.penerima || '',
          r.jumlah || 1,
          r.nominal || 0,
          r.keterangan || ''
        ]);
        await pool.query(
          `INSERT INTO pengeluaran_lain (tanggal, kategori, penerima, jumlah, nominal, keterangan)
           VALUES ?`,
          [values]
        );
      }
    }
  }

  const [finalRows] = await pool.query(
    `SELECT id, tanggal, kategori, penerima, jumlah, nominal, keterangan
     FROM pengeluaran_lain
     WHERE tanggal BETWEEN ? AND ?
     ORDER BY tanggal`,
    [startDate, endDate]
  );
  return finalRows.map(r => ({
    rowId: r.id,
    id: r.id,
    tanggal: r.tanggal,
    kategori: r.kategori,
    penerima: r.penerima,
    jumlah: parseInt(r.jumlah) || 1,
    nominal: parseFloat(r.nominal) || 0,
    totalNominal: (parseInt(r.jumlah) || 1) * (parseFloat(r.nominal) || 0),
    keterangan: r.keterangan
  }));
}

async function getActivities(startDate, endDate) {
  const [rows] = await pool.query(
    `SELECT k.id, k.tanggal, k.nama, GROUP_CONCAT(kg.guru_id ORDER BY kg.guru_id) AS guru_ids
     FROM kegiatan k
     LEFT JOIN kegiatan_guru kg ON kg.kegiatan_id = k.id
     WHERE k.tanggal BETWEEN ? AND ?
     GROUP BY k.id, k.tanggal, k.nama
     ORDER BY k.tanggal DESC, k.id DESC`,
    [startDate, endDate]
  );
  return rows.map(r => ({
    id: r.id,
    tanggal: r.tanggal,
    nama: r.nama,
    guruIds: r.guru_ids ? r.guru_ids.split(',') : []
  }));
}

async function addActivity({ tanggal, nama, guruIds }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [res] = await conn.query('INSERT INTO kegiatan (tanggal, nama) VALUES (?, ?)', [tanggal, nama]);
    const kegiatanId = res.insertId;
    if (Array.isArray(guruIds) && guruIds.length > 0) {
      const values = guruIds.map(id => [kegiatanId, id]);
      await conn.query('INSERT INTO kegiatan_guru (kegiatan_id, guru_id) VALUES ?', [values]);
    }
    await conn.commit();
    return { success: true, message: 'Kegiatan berhasil ditambahkan.' };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function getConfigMap() {
  const cached = configCache.get('config');
  if (cached) return cached;
  const [rows] = await pool.query('SELECT config_key, config_value FROM konfigurasi');
  const map = new Map(rows.map(r => [r.config_key, r.config_value]));
  configCache.set('config', map, 30000);
  return map;
}

async function addOtherExpense(data) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT id FROM pengeluaran_lain ORDER BY id DESC LIMIT 1 FOR UPDATE');
    const lastId = rows[0]?.id || 'P000';
    const num = parseInt(String(lastId).substring(1)) + 1;
    const newId = `P${String(num).padStart(3, '0')}`;
    await conn.query(
      'INSERT INTO pengeluaran_lain (id, tanggal, kategori, penerima, jumlah, nominal, keterangan) VALUES (?,?,?,?,?,?,?)',
      [newId, data.tanggal, data.kategori, data.penerima, data.jumlah || 1, data.nominal, data.keterangan]
    );
    await conn.commit();
    return { success: true, message: 'Pengeluaran berhasil ditambahkan.' };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function updateOtherExpense(data) {
  await pool.query(
    'UPDATE pengeluaran_lain SET tanggal=?, kategori=?, penerima=?, jumlah=?, nominal=?, keterangan=? WHERE id=?',
    [data.tanggal, data.kategori, data.penerima, data.jumlah || 1, data.nominal, data.keterangan, data.id]
  );
  return { success: true, message: 'Pengeluaran berhasil diperbarui.' };
}

async function deleteOtherExpense(id) {
  await pool.query('DELETE FROM pengeluaran_lain WHERE id=?', [id]);
  return { success: true, message: 'Pengeluaran berhasil dihapus.' };
}

async function getTeacherAttendanceSummary(startDate, endDate) {
  const configMap = await getConfigMap();

  const TARIFFS = {
    RATE_MENGAJAR: parseFloat(configMap.get('RATE_MENGAJAR')) || 0,
    RATE_HADIR: parseFloat(configMap.get('RATE_HADIR')) || 0,
    RATE_IZIN: parseFloat(configMap.get('RATE_IZIN')) || 0,
    RATE_TIDAK_HADIR: parseFloat(configMap.get('RATE_TIDAK_HADIR')) || 0,
    RATE_TRANSPORT: parseFloat(configMap.get('RATE_TRANSPORT')) || 0,
    RATE_TRANSPORT_PNS: parseFloat(configMap.get('RATE_TRANSPORT_PNS')) || 0,
    RATE_TRANSPORT_INPASSING: parseFloat(configMap.get('RATE_TRANSPORT_INPASSING')) || 0,
    RATE_TRANSPORT_SERTIFIKASI: parseFloat(configMap.get('RATE_TRANSPORT_SERTIFIKASI')) || 0,
    RATE_TRANSPORT_NON_SERTIFIKASI: parseFloat(configMap.get('RATE_TRANSPORT_NON_SERTIFIKASI')) || 0,
    WIYATHA_1_5: parseFloat(configMap.get('WIYATHA_1_5')) || 0,
    WIYATHA_6_10: parseFloat(configMap.get('WIYATHA_6_10')) || 0,
    WIYATHA_11_15: parseFloat(configMap.get('WIYATHA_11_15')) || 0,
    WIYATHA_16_20: parseFloat(configMap.get('WIYATHA_16_20')) || 0,
    WIYATHA_21_25: parseFloat(configMap.get('WIYATHA_21_25')) || 0,
    WIYATHA_26_PLUS: parseFloat(configMap.get('WIYATHA_26_PLUS')) || 0
  };

  const transportRates = {
    PNS: TARIFFS.RATE_TRANSPORT_PNS || TARIFFS.RATE_TRANSPORT,
    INPASSING: TARIFFS.RATE_TRANSPORT_INPASSING || TARIFFS.RATE_TRANSPORT,
    SERTIFIKASI: TARIFFS.RATE_TRANSPORT_SERTIFIKASI || TARIFFS.RATE_TRANSPORT,
    'NON SERTIFIKASI': TARIFFS.RATE_TRANSPORT_NON_SERTIFIKASI || TARIFFS.RATE_TRANSPORT
  };

  const normalizeClassification = (value) => {
    const v = String(value || '').trim().toLowerCase();
    if (v === 'pns') return 'PNS';
    if (v === 'inpassing') return 'INPASSING';
    if (v === 'sertifikasi') return 'SERTIFIKASI';
    return 'NON SERTIFIKASI';
  };

  const [teacherTasksRowsRaw] = await masterPool.query(
    `SELECT id, teacher_id, title
     FROM teacher_tasks
     WHERE status = 'aktif'
     ORDER BY teacher_id, id`
  );
  const [taskRates] = await pool.query('SELECT task_id, nominal FROM teacher_task_rates');
  const taskRateMap = new Map(taskRates.map(r => [String(r.task_id), Number(r.nominal || 0)]));
  const teacherTasksRows = teacherTasksRowsRaw.map(r => ({
    ...r,
    nominal: taskRateMap.get(String(r.id)) || 0
  }));
  const teacherTasksMap = new Map();
  teacherTasksRows.forEach(r => {
    const key = String(r.teacher_id);
    if (!teacherTasksMap.has(key)) teacherTasksMap.set(key, []);
    teacherTasksMap.get(key).push({
      title: r.title,
      nominal: parseFloat(r.nominal) || 0
    });
  });

  const [manualRows] = await pool.query('SELECT guru_id, periode, transport_hari, transport_acara FROM transport_manual');
  const manualTransportMap = new Map();
  manualRows.forEach(r => {
    const key = `${r.guru_id}|${r.periode}`;
    manualTransportMap.set(key, { transportHari: r.transport_hari, transportAcara: parseInt(r.transport_acara) || 0 });
  });

  const [activityRows] = await pool.query(
    `SELECT kg.guru_id, COUNT(*) AS total
     FROM kegiatan_guru kg
     JOIN kegiatan k ON k.id = kg.kegiatan_id
     WHERE k.tanggal BETWEEN ? AND ?
     GROUP BY kg.guru_id`,
    [startDate, endDate]
  );
  const activityMap = new Map(activityRows.map(r => [String(r.guru_id), parseInt(r.total) || 0]));

  const [guruRows] = await masterPool.query('SELECT id, name, tmt, classification FROM teachers WHERE is_active=1');
  const guruMap = new Map();
  guruRows.forEach(r => {
    const tmtYear = (() => {
      if (!r.tmt) return 0;
      if (typeof r.tmt === 'number') return r.tmt;
      const dt = new Date(r.tmt);
      return Number.isNaN(dt.getTime()) ? 0 : dt.getFullYear();
    })();
    const classification = normalizeClassification(r.classification);
    guruMap.set(String(r.id), {
      guruId: String(r.id),
      nama: r.name,
      tmt: parseInt(tmtYear, 10) || 0,
      classification,
      totalHadir: 0,
      totalIzin: 0,
      totalTidakHadir: 0,
      transportDays: []
    });
  });

  const [attendanceRows] = await pool.query(
    'SELECT tanggal_only, guru_id, status, jumlah_jam FROM kehadiran WHERE tanggal_only BETWEEN ? AND ?',
    [startDate, endDate]
  );

  attendanceRows.forEach(r => {
    if (!guruMap.has(r.guru_id)) return;
    const guru = guruMap.get(r.guru_id);
    const jam = parseInt(r.jumlah_jam) || 0;
    if (r.status === 'Hadir') {
      guru.totalHadir += jam;
      guru.transportDays.push(r.tanggal_only);
    } else if (r.status === 'Izin') {
      guru.totalIzin += jam;
    } else if (r.status === 'Tidak Hadir') {
      guru.totalTidakHadir += jam;
    }
  });

  const currentYear = new Date().getFullYear();
  const teacherResults = [];

  const monthsInRange = new Set();
  let iter = new Date(startDate);
  const end = new Date(endDate);
  while (iter <= end) {
    monthsInRange.add(`${iter.getFullYear()}-${String(iter.getMonth() + 1).padStart(2, '0')}`);
    iter.setMonth(iter.getMonth() + 1);
    iter.setDate(1);
  }

  guruMap.forEach(data => {
    const { guruId, nama, tmt, totalHadir, totalIzin, totalTidakHadir, transportDays, classification } = data;

    let totalTransportHari = 0;
    let totalTransportAcara = 0;

    monthsInRange.forEach(periode => {
      const key = `${guruId}|${periode}`;
      const manual = manualTransportMap.get(key);

      if (manual && manual.transportHari !== null && manual.transportHari !== '') {
        totalTransportHari += parseInt(manual.transportHari) || 0;
      } else {
        const [year, month] = periode.split('-').map(Number);
        const daysInThisMonth = transportDays.filter(d => {
          const dt = new Date(d);
          return dt.getFullYear() === year && (dt.getMonth() + 1) === month;
        });
        const uniqueDays = new Set(daysInThisMonth.map(d => new Date(d).toDateString()));
        totalTransportHari += uniqueDays.size;
      }
      if (manual) totalTransportAcara += manual.transportAcara;
    });

    const pengabdian = tmt > 0 ? currentYear - tmt : 0;
    let wiyathabakti = 0;
    if (pengabdian >= 26) wiyathabakti = TARIFFS.WIYATHA_26_PLUS;
    else if (pengabdian >= 21) wiyathabakti = TARIFFS.WIYATHA_21_25;
    else if (pengabdian >= 16) wiyathabakti = TARIFFS.WIYATHA_16_20;
    else if (pengabdian >= 11) wiyathabakti = TARIFFS.WIYATHA_11_15;
    else if (pengabdian >= 6) wiyathabakti = TARIFFS.WIYATHA_6_10;
    else if (pengabdian >= 1) wiyathabakti = TARIFFS.WIYATHA_1_5;

    const rateHadir = TARIFFS.RATE_HADIR || TARIFFS.RATE_MENGAJAR;
    const rateTransport = transportRates[classification] || TARIFFS.RATE_TRANSPORT;
    const bisyarohJam = totalHadir * rateHadir;
    const bisyarohIzin = totalIzin * TARIFFS.RATE_IZIN;
    const bisyarohTidakHadir = totalTidakHadir * TARIFFS.RATE_TIDAK_HADIR;
    const bisyarohMengajar = bisyarohJam + bisyarohIzin + bisyarohTidakHadir;
    const bisyarohTransport = totalTransportHari * rateTransport;
    const jumlahKegiatan = activityMap.get(String(guruId)) || 0;
    const bisyarohTransportKegiatan = jumlahKegiatan * rateTransport;
    const tasks = teacherTasksMap.get(String(guruId)) || [];
    const honorTugas = tasks.reduce((sum, t) => sum + (t.nominal || 0), 0);
    const t1 = tasks[0] || null;
    const t2 = tasks[1] || null;
    const t3 = tasks[2] || null;
    const totalBisyaroh =
      bisyarohMengajar +
      bisyarohTransport +
      bisyarohTransportKegiatan +
      honorTugas +
      wiyathabakti;

    teacherResults.push({
      guruId,
      nama,
      tmt,
      classification,
      transportRate: rateTransport,
      bisyarohMengajar,
      totalHadir,
      totalIzin,
      totalTidakHadir,
      totalTransportHari,
      totalTransportAcara,
      jumlahKegiatan,
      wiyathabakti,
      bisyarohTransport,
      bisyarohTransportKegiatan,
      tugasTambahan1: t1 ? `${t1.title} (${t1.nominal})` : '',
      tugasTambahan2: t2 ? `${t2.title} (${t2.nominal})` : '',
      tugasTambahan3: t3 ? `${t3.title} (${t3.nominal})` : '',
      honorTugas,
      totalBisyaroh,
      isExpense: false
    });
  });

  const otherExpenses = await getOtherExpenses(startDate, endDate);
  const expenseItems = otherExpenses.map(exp => ({
    nama: exp.kategori,
    tmt: '-',
    bisyarohMengajar: '-',
    totalHadir: '-',
    totalTransportHari: '-',
    totalTransportAcara: '-',
    jumlahKegiatan: '-',
    wiyathabakti: '-',
    bisyarohTransport: '-',
    bisyarohTransportKegiatan: '-',
    tugasTambahan1: '-',
    tugasTambahan2: '-',
    tugasTambahan3: '-',
    honorTugas: '-',
    jumlah: exp.jumlah || 1,
    nominal: exp.nominal || 0,
    totalNominal: exp.totalNominal || ((exp.jumlah || 1) * (exp.nominal || 0)),
    totalBisyaroh: -Math.abs(exp.totalNominal || exp.nominal),
    isExpense: true,
    tanggal: exp.tanggal
  }));

  const combined = teacherResults.concat(expenseItems);
  combined.sort((a, b) => {
    if (!a.isExpense && !b.isExpense) {
      const tmtA = Number(a.tmt) || 0;
      const tmtB = Number(b.tmt) || 0;
      if (tmtA !== tmtB) return tmtA - tmtB;
    }
    if (a.isExpense && !b.isExpense) return 1;
    if (!a.isExpense && b.isExpense) return -1;
    if (a.isExpense && b.isExpense) return new Date(a.tanggal) - new Date(b.tanggal);
    return b.totalBisyaroh - a.totalBisyaroh || a.nama.localeCompare(b.nama);
  });

  return combined;
}

async function getFinancialSummary(startDate, endDate) {
  const summaryData = await getTeacherAttendanceSummary(startDate, endDate);
  const totalHonorarium = summaryData.filter(i => !i.isExpense).reduce((t, i) => t + (i.totalBisyaroh || 0), 0);
  const totalPengeluaran = summaryData.filter(i => i.isExpense).reduce((t, i) => t + Math.abs(i.totalBisyaroh || 0), 0);
  return {
    totalHonorarium,
    totalPengeluaran,
    grandTotal: totalHonorarium - totalPengeluaran
  };
}

async function getTotalBisyarohBreakdown(startDate, endDate) {
  const summaryData = await getTeacherAttendanceSummary(startDate, endDate);
  const teachers = summaryData.filter(i => !i.isExpense);
  const expenses = summaryData.filter(i => i.isExpense);

  const wiyathabakti = teachers.reduce((t, i) => t + (Number(i.wiyathabakti) || 0), 0);
  const bisyarohMengajar = teachers.reduce((t, i) => t + (Number(i.bisyarohMengajar) || 0), 0);
  const transportKehadiran = teachers.reduce((t, i) => t + (Number(i.bisyarohTransport) || 0), 0);
  const transportKegiatan = teachers.reduce((t, i) => t + (Number(i.bisyarohTransportKegiatan) || 0), 0);
  const bisyarohKehadiran = transportKehadiran + transportKegiatan;
  const bisyarohTugasTambahan = teachers.reduce((t, i) => t + (Number(i.honorTugas) || 0), 0);
  const pengeluaranLain = expenses.reduce((t, i) => t + Math.abs(Number(i.totalNominal || i.totalBisyaroh || 0)), 0);

  const total = wiyathabakti + bisyarohMengajar + bisyarohKehadiran + bisyarohTugasTambahan;

  return {
    wiyathabakti,
    bisyarohMengajar,
    bisyarohKehadiran,
    bisyarohTugasTambahan,
    transportKehadiran,
    transportKegiatan,
    pengeluaranLain,
    total
  };
}

async function getManualTransportData(periode) {
  const [teachers] = await pool.query('SELECT guru_id, nama FROM guru ORDER BY nama');

  const [attendanceRows] = await pool.query(
    'SELECT tanggal_only, guru_id, status FROM kehadiran WHERE DATE_FORMAT(tanggal_only, "%Y-%m") = ?',
    [periode]
  );
  const defaultTransportMap = new Map();
  attendanceRows.forEach(r => {
    if (r.status === 'Hadir') {
      if (!defaultTransportMap.has(r.guru_id)) defaultTransportMap.set(r.guru_id, new Set());
      defaultTransportMap.get(r.guru_id).add(r.tanggal_only);
    }
  });

  const [manualRows] = await pool.query('SELECT guru_id, periode, transport_hari, transport_acara FROM transport_manual WHERE periode = ?', [periode]);
  const manualMap = new Map();
  manualRows.forEach(r => manualMap.set(r.guru_id, { transportHari: r.transport_hari, transportAcara: r.transport_acara || 0 }));

  const result = teachers.map(t => {
    const defaultDays = (defaultTransportMap.get(t.guru_id) || new Set()).size;
    const override = manualMap.get(t.guru_id);
    const finalJumlahHari = (override && override.transportHari !== null && override.transportHari !== '') ? override.transportHari : defaultDays;

    return {
      guruId: t.guru_id,
      nama: t.nama,
      jumlahHari: finalJumlahHari,
      jumlahAcara: override ? override.transportAcara : 0
    };
  });

  return result;
}

async function saveBulkManualTransport(transportData) {
  if (!Array.isArray(transportData) || transportData.length === 0) {
    return { success: true, message: 'Tidak ada data transport manual.' };
  }

  const rows = transportData.map(item => [
    item.guruId,
    item.periode,
    item.jumlahHari || 0,
    item.jumlahAcara || 0
  ]);

  await pool.query(
    `INSERT INTO transport_manual (guru_id, periode, transport_hari, transport_acara)
     VALUES ?
     ON DUPLICATE KEY UPDATE
       transport_hari=VALUES(transport_hari),
       transport_acara=VALUES(transport_acara)`,
    [rows]
  );

  return { success: true, message: 'Transport manual berhasil disimpan.' };
}

async function getPayslipData(startDate, endDate, guruId) {
  const summaryData = await getTeacherAttendanceSummary(startDate, endDate);
  const teacherData = summaryData.find(i => i.guruId === guruId && !i.isExpense);
  if (!teacherData) throw new Error('Data guru tidak ditemukan untuk periode ini.');

  const configMap = await getConfigMap();

  const rateMengajar = parseFloat(configMap.get('RATE_MENGAJAR')) || 0;
  const rateHadir = parseFloat(configMap.get('RATE_HADIR')) || rateMengajar;
  const rateIzin = parseFloat(configMap.get('RATE_IZIN')) || 0;
  const rateTidakHadir = parseFloat(configMap.get('RATE_TIDAK_HADIR')) || 0;
  const rateTransport = teacherData.transportRate || parseFloat(configMap.get('RATE_TRANSPORT')) || 0;
  const currentYear = new Date().getFullYear();
  const pengabdianYears = teacherData.tmt ? Math.max(0, currentYear - Number(teacherData.tmt)) : 0;

  return {
    nama: teacherData.nama,
    periode: monthKey(startDate),
    pengabdianYears,
    tugasTambahan1: teacherData.tugasTambahan1 || '',
    tugasTambahan2: teacherData.tugasTambahan2 || '',
    tugasTambahan3: teacherData.tugasTambahan3 || '',
    pendapatan: [
      { nama: 'Honor Hadir', qty: teacherData.totalHadir, rate: rateHadir, total: teacherData.totalHadir * rateHadir },
      { nama: 'Honor Izin', qty: teacherData.totalIzin || 0, rate: rateIzin, total: (teacherData.totalIzin || 0) * rateIzin },
      { nama: 'Honor Tidak Hadir', qty: teacherData.totalTidakHadir || 0, rate: rateTidakHadir, total: (teacherData.totalTidakHadir || 0) * rateTidakHadir },
      { nama: 'Transport Harian', qty: teacherData.totalTransportHari, rate: rateTransport, total: teacherData.totalTransportHari * rateTransport },
      { nama: 'Transport Acara', qty: teacherData.totalTransportAcara, rate: rateTransport, total: teacherData.totalTransportAcara * rateTransport },
      { nama: 'Wiyathabakti', qty: 1, rate: teacherData.wiyathabakti, total: teacherData.wiyathabakti },
      { nama: 'Tugas Tambahan', qty: 1, rate: teacherData.honorTugas, total: teacherData.honorTugas }
    ],
    totalPendapatan: teacherData.totalBisyaroh,
    gajiBersih: teacherData.totalBisyaroh
  };
}

async function getAllPayslipsData(startDate, endDate) {
  const summaryData = await getTeacherAttendanceSummary(startDate, endDate);
  const allTeacherData = summaryData.filter(i => !i.isExpense && i.totalBisyaroh > 0);

  const configMap = await getConfigMap();
  const rateMengajar = parseFloat(configMap.get('RATE_MENGAJAR')) || 0;
  const rateHadir = parseFloat(configMap.get('RATE_HADIR')) || rateMengajar;
  const rateIzin = parseFloat(configMap.get('RATE_IZIN')) || 0;
  const rateTidakHadir = parseFloat(configMap.get('RATE_TIDAK_HADIR')) || 0;
  const currentYear = new Date().getFullYear();

  return allTeacherData.map(t => ({
    transportRate: t.transportRate || 0,
    nama: t.nama,
    periode: monthKey(startDate),
    pengabdianYears: t.tmt ? Math.max(0, currentYear - Number(t.tmt)) : 0,
    tugasTambahan1: t.tugasTambahan1 || '',
    tugasTambahan2: t.tugasTambahan2 || '',
    tugasTambahan3: t.tugasTambahan3 || '',
    pendapatan: [
      { nama: 'Honor Hadir', qty: t.totalHadir, rate: rateHadir, total: t.totalHadir * rateHadir },
      { nama: 'Honor Izin', qty: t.totalIzin || 0, rate: rateIzin, total: (t.totalIzin || 0) * rateIzin },
      { nama: 'Honor Tidak Hadir', qty: t.totalTidakHadir || 0, rate: rateTidakHadir, total: (t.totalTidakHadir || 0) * rateTidakHadir },
      { nama: 'Transport Harian', qty: t.totalTransportHari, rate: t.transportRate || 0, total: t.totalTransportHari * (t.transportRate || 0) },
      { nama: 'Transport Acara', qty: t.totalTransportAcara, rate: t.transportRate || 0, total: t.totalTransportAcara * (t.transportRate || 0) },
      { nama: 'Wiyathabakti', qty: 1, rate: t.wiyathabakti, total: t.wiyathabakti },
      { nama: 'Tugas Tambahan', qty: 1, rate: t.honorTugas, total: t.honorTugas }
    ],
    gajiBersih: t.totalBisyaroh
  }));
}

module.exports = {
  getTeacherAttendanceSummary,
  getFinancialSummary,
  getTotalBisyarohBreakdown,
  getManualTransportData,
  saveBulkManualTransport,
  getPayslipData,
  getAllPayslipsData,
  getOtherExpenses,
  getActivities,
  addActivity,
  addOtherExpense,
  updateOtherExpense,
  deleteOtherExpense
};
