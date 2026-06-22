const ExcelJS = require('exceljs');

/**
 * Generate 2-sheet Excel template pre-filled with class/subject/teacher names.
 * Sheet 1: Class-Subject matrix (rows=classes, cols=subjects, cells=jam/minggu)
 * Sheet 2: Teacher-Subject list (teacher | subject | kelas, comma-separated)
 */
async function generateTemplate({ classes, subjects, teachers, teacherSubjectsRaw, classSubjectsRaw }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'JAMADA Auto Jadwal';
  wb.created = new Date();

  // ── Sheet 1: Mapping Mapel per Kelas ────────────────────────────────────
  const ws1 = wb.addWorksheet('Mapping Kelas');
  ws1.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];

  // Header row
  const hdrRow = ['Kelas', ...subjects.map(s => s.name)];
  ws1.addRow(hdrRow);

  // Style header
  const hdr = ws1.getRow(1);
  hdr.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
    cell.alignment = { horizontal: 'center', wrapText: true };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
  });
  ws1.getColumn(1).width = 22;
  subjects.forEach((_, i) => { ws1.getColumn(i + 2).width = 14; });

  // Build lookup for existing class-subject mappings
  const csMap = new Map(); // `${classId}_${subjectId}` → hours
  classSubjectsRaw.forEach(r => csMap.set(`${r.class_id}_${r.subject_id}`, r.hours_per_week || 0));

  classes.forEach((cls, ri) => {
    const row = [cls.name, ...subjects.map(s => csMap.get(`${cls.id}_${s.id}`) || 0)];
    const dataRow = ws1.addRow(row);
    dataRow.getCell(1).font = { bold: true };
    dataRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ri % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF' } };
    subjects.forEach((_, ci) => {
      const cell = dataRow.getCell(ci + 2);
      cell.alignment = { horizontal: 'center' };
      cell.numFmt = '0';
    });
  });

  ws1.addRow([]); // spacer
  ws1.addRow(['Petunjuk: Isi angka jam per minggu (0 = tidak ada mapel tersebut di kelas ini)']);
  const noteRow = ws1.lastRow;
  noteRow.getCell(1).font = { italic: true, color: { argb: 'FF94A3B8' } };

  // ── Sheet 2: Mapping Guru & Mapel ───────────────────────────────────────
  const ws2 = wb.addWorksheet('Mapping Guru');
  ws2.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];

  ws2.addRow(['Nama Guru', 'Mapel', 'Kelas (pisah koma, kosong = semua tingkat)']);
  const hdr2 = ws2.getRow(1);
  hdr2.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
    cell.alignment = { horizontal: 'center' };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
  });
  ws2.getColumn(1).width = 28;
  ws2.getColumn(2).width = 22;
  ws2.getColumn(3).width = 50;

  // Build existing teacher-subject data
  const subjectNameMap = new Map(subjects.map(s => [s.id, s.name]));
  const classNameMap = new Map(classes.map(c => [c.id, c.name]));
  const teacherMap = new Map(teachers.map(t => [t.id, t.name]));

  // Group by teacher_id + subject_id → collect class names
  const tsGroups = new Map();
  teacherSubjectsRaw.forEach(r => {
    const key = `${r.teacher_id}__${r.subject_id}`;
    if (!tsGroups.has(key)) tsGroups.set(key, { teacherId: r.teacher_id, subjectId: r.subject_id, classes: [] });
    if (r.class_id) tsGroups.get(key).classes.push(classNameMap.get(r.class_id) || '');
  });

  if (tsGroups.size > 0) {
    tsGroups.forEach(({ teacherId, subjectId, classes: cls }) => {
      const row = ws2.addRow([
        teacherMap.get(teacherId) || '',
        subjectNameMap.get(subjectId) || '',
        cls.filter(Boolean).join(', ')
      ]);
      row.eachCell(cell => { cell.alignment = { vertical: 'top' }; });
    });
  } else {
    // Empty rows for each teacher as placeholder
    teachers.forEach((t, ri) => {
      const row = ws2.addRow([t.name, '', '']);
      row.getCell(1).font = { bold: false };
      if (ri % 2 === 0) row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    });
  }

  ws2.addRow([]);
  const note2 = ws2.addRow([
    'Petunjuk:',
    'Satu baris = satu guru + satu mapel. Kolom "Kelas": isi nama kelas dipisah koma (misal: X PA 1, X PA 2). Kosong = mengajar semua tingkat.',
    ''
  ]);
  note2.getCell(1).font = { bold: true, italic: true, color: { argb: 'FF64748B' } };
  note2.getCell(2).font = { italic: true, color: { argb: 'FF94A3B8' } };

  // ── Sheet 3: Daftar Mapel (referensi) ───────────────────────────────────
  const ws3mapel = wb.addWorksheet('Daftar Mapel');
  ws3mapel.addRow(['No', 'Nama Mapel (gunakan persis)', 'Kode']);
  const hdr3m = ws3mapel.getRow(1);
  hdr3m.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD97706' } };
    cell.alignment = { horizontal: 'center' };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
  });
  ws3mapel.getColumn(1).width = 6;
  ws3mapel.getColumn(2).width = 34;
  ws3mapel.getColumn(3).width = 14;

  subjects.forEach((s, i) => {
    const row = ws3mapel.addRow([i + 1, s.name, s.code || '']);
    row.getCell(1).alignment = { horizontal: 'center' };
    row.getCell(3).alignment = { horizontal: 'center' };
    if (i % 2 === 0) {
      row.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEFCE8' } }; });
    }
  });
  ws3mapel.addRow([]);
  const noteMapel = ws3mapel.addRow(['Sheet ini hanya untuk referensi. Gunakan nama mapel persis seperti di atas saat mengisi Sheet "Mapping Kelas" dan "Mapping Guru".']);
  noteMapel.getCell(1).font = { italic: true, color: { argb: 'FF94A3B8' } };

  // ── Sheet 5: Daftar Guru (referensi) ────────────────────────────────────
  const wsGuru = wb.addWorksheet('Daftar Guru');
  wsGuru.addRow(['No', 'Nama Guru (gunakan persis)', 'Gender']);
  const hdrGuru = wsGuru.getRow(1);
  hdrGuru.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C3AED' } };
    cell.alignment = { horizontal: 'center' };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
  });
  wsGuru.getColumn(1).width = 6;
  wsGuru.getColumn(2).width = 34;
  wsGuru.getColumn(3).width = 12;

  teachers.forEach((t, i) => {
    const row = wsGuru.addRow([i + 1, t.name, t.gender === 'L' ? 'Laki-laki' : t.gender === 'P' ? 'Perempuan' : '']);
    row.getCell(1).alignment = { horizontal: 'center' };
    row.getCell(3).alignment = { horizontal: 'center' };
    if (i % 2 === 0) {
      row.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F3FF' } }; });
    }
  });
  wsGuru.addRow([]);
  const noteGuru = wsGuru.addRow(['Sheet ini hanya untuk referensi. Gunakan nama guru persis seperti di atas saat mengisi Sheet "Mapping Guru".']);
  noteGuru.getCell(1).font = { italic: true, color: { argb: 'FF94A3B8' } };

  // ── Sheet 6: Daftar Kelas (referensi) ────────────────────────────────────
  const wsKelas = wb.addWorksheet('Daftar Kelas');
  wsKelas.addRow(['No', 'Nama Kelas (gunakan persis)', 'Tingkat', 'Gender']);
  const hdrKelas = wsKelas.getRow(1);
  hdrKelas.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
    cell.alignment = { horizontal: 'center' };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
  });
  wsKelas.getColumn(1).width = 6;
  wsKelas.getColumn(2).width = 28;
  wsKelas.getColumn(3).width = 10;
  wsKelas.getColumn(4).width = 10;

  classes.forEach((c, i) => {
    const tingkat = c.name.toUpperCase().startsWith('XII') ? 'XII'
      : c.name.toUpperCase().startsWith('XI') ? 'XI'
      : c.name.toUpperCase().startsWith('X') ? 'X' : '';
    const kt = (c.kelas_type || '').toUpperCase();
    const gender = kt === 'PA' ? 'PA' : kt === 'PI' ? 'PI' : '';
    const row = wsKelas.addRow([i + 1, c.name, tingkat, gender]);
    row.getCell(1).alignment = { horizontal: 'center' };
    row.getCell(3).alignment = { horizontal: 'center' };
    row.getCell(4).alignment = { horizontal: 'center' };
    if (i % 2 === 0) {
      row.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDFA' } }; });
    }
  });

  return wb;
}

/**
 * Parse uploaded Excel buffer.
 * Returns { classMappings, teacherMappings, errors }
 *  classMappings: [{ className, subjectName, hoursPerWeek }]
 *  teacherMappings: [{ teacherName, subjectName, classNames: [] }]
 */
async function parseImportExcel(buffer, { classes, subjects, teachers }) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const errors = [];
  const classMappings = [];
  const teacherMappings = [];

  // Normalise for loose matching
  const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const classNameMap = new Map(classes.map(c => [norm(c.name), c]));
  const subjectNameMap = new Map(subjects.map(s => [norm(s.name), s]));
  const teacherNameMap = new Map(teachers.map(t => [norm(t.name), t]));

  // ── Sheet 1: Mapping Kelas ──────────────────────────────────────────────
  const ws1 = wb.getWorksheet('Mapping Kelas') || wb.getWorksheet(1);
  if (ws1) {
    const hdrRow = ws1.getRow(1);
    const subjectCols = []; // { colIndex, subjectObj }
    hdrRow.eachCell((cell, col) => {
      if (col === 1) return;
      const subObj = subjectNameMap.get(norm(cell.value));
      if (subObj) subjectCols.push({ col, subjectObj: subObj });
      else if (cell.value) errors.push(`Sheet 1: Mapel tidak ditemukan — "${cell.value}"`);
    });

    ws1.eachRow((row, ri) => {
      if (ri < 2) return;
      const cellVal = row.getCell(1).value;
      if (!cellVal || String(cellVal).startsWith('Petunjuk')) return;
      const clsObj = classNameMap.get(norm(cellVal));
      if (!clsObj) { errors.push(`Sheet 1: Kelas tidak ditemukan — "${cellVal}"`); return; }
      subjectCols.forEach(({ col, subjectObj }) => {
        const v = Number(row.getCell(col).value || 0);
        if (v > 0) classMappings.push({ classId: clsObj.id, className: clsObj.name, subjectId: subjectObj.id, subjectName: subjectObj.name, hoursPerWeek: v });
      });
    });
  }

  // ── Sheet 2: Mapping Guru ───────────────────────────────────────────────
  const ws2 = wb.getWorksheet('Mapping Guru') || wb.getWorksheet(2);
  if (ws2) {
    ws2.eachRow((row, ri) => {
      if (ri < 2) return;
      const tName = row.getCell(1).value;
      const sName = row.getCell(2).value;
      const clsRaw = row.getCell(3).value;
      if (!tName || !sName || String(tName).startsWith('Petunjuk')) return;

      const tObj = teacherNameMap.get(norm(tName));
      const sObj = subjectNameMap.get(norm(sName));
      if (!tObj) { errors.push(`Sheet 2: Guru tidak ditemukan — "${tName}"`); return; }
      if (!sObj) { errors.push(`Sheet 2: Mapel tidak ditemukan — "${sName}"`); return; }

      const classNames = String(clsRaw || '').split(',').map(s => s.trim()).filter(Boolean);
      const resolvedClasses = classNames.map(cn => {
        const c = classNameMap.get(norm(cn));
        if (!c) errors.push(`Sheet 2: Kelas tidak ditemukan — "${cn}" (guru: ${tName})`);
        return c ? { id: c.id, name: c.name } : null;
      }).filter(Boolean);

      teacherMappings.push({ teacherId: tObj.id, teacherName: tObj.name, subjectId: sObj.id, subjectName: sObj.name, classes: resolvedClasses });
    });
  }

  return { classMappings, teacherMappings, errors };
}

module.exports = { generateTemplate, parseImportExcel };
