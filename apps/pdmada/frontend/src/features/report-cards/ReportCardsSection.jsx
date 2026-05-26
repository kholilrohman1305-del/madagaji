import React, { useEffect, useMemo, useState } from 'react';

function formatScore(value) {
  if (value === null || value === undefined || value === '') return '-';
  const number = Number(value);
  if (Number.isNaN(number)) return '-';
  return number % 1 === 0 ? String(number) : number.toFixed(2);
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('id-ID');
}

function scorePredicate(value) {
  const number = Number(value);
  if (Number.isNaN(number)) return '-';
  if (number >= 90) return 'A';
  if (number >= 80) return 'B';
  if (number >= 70) return 'C';
  if (number >= 60) return 'D';
  return 'E';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildSchoolProfile(settings) {
  return {
    school_name: settings?.school_name || import.meta.env.VITE_SCHOOL_NAME || 'SEKOLAH',
    school_subtitle: settings?.school_subtitle || import.meta.env.VITE_SCHOOL_SUBNAME || 'MASTER DATA SEKOLAH',
    npsn: settings?.npsn || import.meta.env.VITE_SCHOOL_NPSN || '-',
    nsm: settings?.nsm || '-',
    address: settings?.address || import.meta.env.VITE_SCHOOL_ADDRESS || '-',
    city: settings?.city || '-',
    province: settings?.province || '-',
    phone: settings?.phone || import.meta.env.VITE_SCHOOL_PHONE || '-',
    email: settings?.email || import.meta.env.VITE_SCHOOL_EMAIL || '-',
    website: settings?.website || '-',
    logo_url: settings?.logo_url || '',
    principal_name: settings?.principal_name || import.meta.env.VITE_SCHOOL_PRINCIPAL || 'Kepala Madrasah',
    principal_nip: settings?.principal_nip || import.meta.env.VITE_SCHOOL_PRINCIPAL_NIP || '-'
  };
}

function openPrintWindow(title, html) {
  const nextWindow = window.open('', '_blank', 'width=1100,height=800');
  if (!nextWindow) return;
  nextWindow.document.open();
  nextWindow.document.write(`<!doctype html><html><head><meta charset="utf-8" /><title>${title}</title></head><body>${html}<script>window.print();</script></body></html>`);
  nextWindow.document.close();
}

function buildReportPrintHtml(report, schoolProfile, extras = {}) {
  const attendance = report.report_meta || {};
  const student = extras.student || {};
  const classInfo = extras.classInfo || {};
  const gradeRaw = String(classInfo.grade_level || report.class_name || '').toLowerCase();
  const phaseLabel = gradeRaw.includes('10')
    ? 'Fase E'
    : (gradeRaw.includes('11') || gradeRaw.includes('12') ? 'Fase F' : '-');
  const groupedScores = new Map();

  (report.scores || []).forEach((item) => {
    const key = item.subject_group_name || 'Kelompok Mata Pelajaran';
    if (!groupedScores.has(key)) groupedScores.set(key, []);
    groupedScores.get(key).push(item);
  });

  const scoreRowsHtml = groupedScores.size
    ? Array.from(groupedScores.entries()).map(([groupName, items]) => `
      <tr class="group-row"><td colspan="4">${escapeHtml(groupName)}</td></tr>
      ${items.map((item, index) => `
        <tr>
          <td class="center">${index + 1}</td>
          <td>${escapeHtml(item.subject_name || '-')}</td>
          <td class="center">${formatScore(item.score_value)}</td>
          <td>${escapeHtml(item.achievement_note || '-')}</td>
        </tr>
      `).join('')}
    `).join('')
    : '<tr><td colspan="4" class="center">Belum ada data nilai</td></tr>';

  const totalScore = (report.scores || [])
    .map((item) => Number(item.score_value))
    .filter((value) => !Number.isNaN(value))
    .reduce((sum, value) => sum + value, 0);

  const logoHtml = schoolProfile.logo_url
    ? `<img class="logo" src="${escapeHtml(schoolProfile.logo_url)}" alt="Logo Madrasah" />`
    : '';

  return `
    <style>
      @page { size: A4; margin: 10mm 10mm 12mm; }
      body { font-family: Arial, sans-serif; color: #111; margin: 0; font-size: 12px; }
      .sheet { width: 100%; page-break-after: always; }
      .sheet:last-child { page-break-after: auto; }
      .header { display: grid; grid-template-columns: 68px 1fr; gap: 10px; align-items: center; border-bottom: 2px solid #111; padding-bottom: 7px; margin-bottom: 8px; }
      .logo { width: 60px; height: 60px; object-fit: contain; }
      .center { text-align: center; }
      .school-name { font-size: 17px; font-weight: 700; margin: 0; text-transform: uppercase; }
      .school-subtitle { font-size: 17px; font-weight: 700; margin: 1px 0; text-transform: uppercase; }
      .meta { font-size: 11px; margin: 1px 0; }
      .student-meta { width: 100%; border-collapse: collapse; margin: 6px 0 8px; }
      .student-meta td { padding: 2px 4px; vertical-align: top; }
      .student-meta td:nth-child(1), .student-meta td:nth-child(4) { width: 132px; }
      .student-meta td:nth-child(2), .student-meta td:nth-child(5) { width: 10px; }
      .title { font-size: 15px; font-weight: 700; text-transform: uppercase; margin: 6px 0 6px; text-align: center; }
      .scores { width: 100%; border-collapse: collapse; }
      .scores th, .scores td { border: 1px solid #111; padding: 4px 6px; vertical-align: top; }
      .scores th { text-transform: none; font-size: 12px; background: #fff; }
      .scores .group-row td { background: #fff; font-weight: 700; }
      .scores tfoot td { font-weight: 700; }
      .sec-title { font-weight: 700; text-transform: none; margin: 10px 0 6px; font-size: 14px; }
      .simple-table { width: 100%; border-collapse: collapse; }
      .simple-table th, .simple-table td { border: 1px solid #111; padding: 5px 6px; }
      .simple-table th { background: #fff; font-size: 12px; text-transform: none; }
      .signature-wrap { margin-top: 14px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
      .signature { text-align: center; font-size: 11px; }
      .signature .space { height: 58px; }
      .notes-box { border: 1px solid #111; min-height: 54px; padding: 6px; }
    </style>

    <section class="sheet">
      <div class="header">
        <div>${logoHtml}</div>
        <div class="center">
          <p class="school-name">KEMENTERIAN AGAMA REPUBLIK INDONESIA</p>
          <p class="school-subtitle">${escapeHtml(schoolProfile.school_name)}</p>
          <p class="meta">${escapeHtml(schoolProfile.address)}</p>
          <p class="meta">${escapeHtml(schoolProfile.city)} - ${escapeHtml(schoolProfile.province)}</p>
        </div>
      </div>

      <table class="student-meta">
        <tr>
          <td>NAMA</td><td>:</td><td>${escapeHtml(report.student_name || '-')}</td>
          <td>Kelas</td><td>:</td><td>${escapeHtml(report.class_name || '-')}</td>
        </tr>
        <tr>
          <td>NIS/NISN</td><td>:</td><td>${escapeHtml(report.nis_local || '-')} / ${escapeHtml(student.nisn || '-')}</td>
          <td>Fase</td><td>:</td><td>${escapeHtml(phaseLabel)}</td>
        </tr>
        <tr>
          <td>Madrasah</td><td>:</td><td>${escapeHtml(schoolProfile.school_name || '-')}</td>
          <td>Semester</td><td>:</td><td>${escapeHtml(report.semester_name || '-')}</td>
        </tr>
        <tr>
          <td>Alamat</td><td>:</td><td>${escapeHtml(student.address || schoolProfile.address || '-')}</td>
          <td>Tahun Ajaran</td><td>:</td><td>${escapeHtml(report.school_year_name || '-')}</td>
        </tr>
      </table>

      <div class="title">Capaian Hasil Belajar</div>
      <table class="scores">
        <thead>
          <tr>
            <th width="40">No</th>
            <th>Mata Pelajaran</th>
            <th width="95">Nilai Akhir</th>
            <th>Capaian Kompetensi</th>
          </tr>
        </thead>
        <tbody>${scoreRowsHtml}</tbody>
        <tfoot>
          <tr>
            <td colspan="2" class="center"><strong>Jumlah</strong></td>
            <td class="center"><strong>${formatScore(totalScore)}</strong></td>
            <td><strong>Rata-rata: ${formatScore(report.average_score)}</strong></td>
          </tr>
        </tfoot>
      </table>
    </section>

    <section class="sheet">
      <div class="sec-title">Ekstrakurikuler</div>
      <table class="simple-table">
        <thead><tr><th width="40">No</th><th>Kegiatan Ekstrakurikuler</th><th width="80">Nilai</th><th>Keterangan</th></tr></thead>
        <tbody>
          <tr><td class="center">1</td><td>${escapeHtml(attendance.extracurricular_activity || '-')}</td><td class="center">${escapeHtml(attendance.extracurricular_predicate || '-')}</td><td></td></tr>
          <tr><td class="center">2</td><td></td><td class="center"></td><td></td></tr>
        </tbody>
      </table>

      <div class="sec-title">Prestasi</div>
      <table class="simple-table">
        <thead><tr><th width="40">No</th><th>Jenis Prestasi</th><th>Keterangan</th></tr></thead>
        <tbody>
          <tr><td class="center">1</td><td></td><td></td></tr>
          <tr><td class="center">2</td><td></td><td></td></tr>
          <tr><td class="center">3</td><td></td><td></td></tr>
        </tbody>
      </table>

      <div class="sec-title">Ketidakhadiran</div>
      <table class="simple-table">
        <tbody>
          <tr><td width="150">Sakit</td><td width="16">:</td><td>${attendance.attendance_sick ?? '-'}</td><td width="60">Hari</td></tr>
          <tr><td>Izin</td><td>:</td><td>${attendance.attendance_permit ?? '-'}</td><td>Hari</td></tr>
          <tr><td>Alpa</td><td>:</td><td>${attendance.attendance_absent ?? '-'}</td><td>Hari</td></tr>
        </tbody>
      </table>

      <div class="sec-title">Catatan Wali Kelas</div>
      <div class="notes-box">${escapeHtml(attendance.homeroom_note || '-')}</div>

      <div class="sec-title">Tanggapan Orang Tua/Wali</div>
      <div class="notes-box"></div>

      <div class="signature-wrap">
        <div class="signature">
          <div>Orang Tua/Wali</div>
          <div class="space"></div>
          <div>....................................</div>
        </div>
        <div class="signature">
          <div>Wali Kelas</div>
          <div class="space"></div>
          <div><strong>${escapeHtml(classInfo.homeroom_teacher || '-')}</strong></div>
          <div>NIP. ${escapeHtml(classInfo.homeroom_teacher_nip || '-')}</div>
        </div>
        <div class="signature">
          <div>Mengetahui</div>
          <div>Kepala Madrasah</div>
          <div class="space"></div>
          <div><strong>${escapeHtml(schoolProfile.principal_name)}</strong></div>
          <div>NIP. ${escapeHtml(schoolProfile.principal_nip)}</div>
        </div>
      </div>
    </section>
  `;
}

function buildLedgerPrintHtml({ className, schoolYearName, semesterName, subjects, studentRows, schoolProfile }) {
  return `
    <style>
      @page { size: landscape; margin: 12mm; }
      body { font-family: Arial, sans-serif; color: #111827; margin: 0; }
      .center { text-align: center; }
      .school-name { font-size: 18px; font-weight: 700; text-transform: uppercase; margin: 0; }
      .school-subtitle { font-size: 14px; font-weight: 700; margin: 2px 0; }
      .meta { font-size: 12px; margin: 2px 0; }
      .title { margin: 14px 0 10px; font-size: 16px; font-weight: 700; text-transform: uppercase; text-align: center; }
      .ledger { width: 100%; border-collapse: collapse; font-size: 11px; }
      .ledger th, .ledger td { border: 1px solid #d1d5db; padding: 6px 7px; text-align: center; }
      .ledger th { background: #f3f4f6; text-transform: uppercase; }
      .ledger td:first-child, .ledger th:first-child,
      .ledger td:nth-child(2), .ledger th:nth-child(2) { text-align: left; }
    </style>
    <div class="center">
      <p class="school-name">${schoolProfile.school_name}</p>
      <p class="school-subtitle">${schoolProfile.school_subtitle}</p>
      <p class="meta">Leger Nilai Kelas ${className || '-'}</p>
      <p class="meta">${schoolYearName || '-'} | ${semesterName || '-'}</p>
    </div>
    <div class="title">Leger Nilai</div>
    <table class="ledger">
      <thead>
        <tr>
          <th width="44">No</th>
          <th width="220">Siswa</th>
          ${subjects.map((subject) => `<th>${subject.name}</th>`).join('')}
          <th width="80">Rata-rata</th>
        </tr>
      </thead>
      <tbody>
        ${studentRows.map((row, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>${row.student_name}</td>
            ${subjects.map((subject) => `<td>${formatScore(row.scoresBySubject[subject.id])}</td>`).join('')}
            <td><strong>${formatScore(row.average_score)}</strong></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function buildCoverPrintHtml({ report, schoolProfile }) {
  return `
    <style>
      @page { size: A4; margin: 0; }
      body { margin: 0; font-family: "Segoe UI", Arial, sans-serif; }
      .cover {
        height: 100vh;
        box-sizing: border-box;
        padding: 28mm 20mm;
        border: 6px double #0f172a;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        color: #0f172a;
      }
      .title-1 { font-size: 20px; font-weight: 800; text-transform: uppercase; margin: 0; }
      .title-2 { font-size: 28px; font-weight: 900; text-transform: uppercase; margin: 10px 0 8px; letter-spacing: 1px; }
      .subtitle { font-size: 14px; font-weight: 700; margin: 0; text-transform: uppercase; }
      .logo { width: 120px; height: 120px; object-fit: contain; margin: 28px 0; }
      .student { margin-top: 16px; border: 2px solid #334155; border-radius: 10px; padding: 14px 16px; width: 100%; max-width: 520px; }
      .student h3 { margin: 0 0 10px; font-size: 18px; text-transform: uppercase; }
      .student p { margin: 6px 0; font-size: 14px; font-weight: 600; }
      .footer { margin-top: auto; font-size: 12px; line-height: 1.6; }
    </style>
    <section class="cover">
      <p class="title-1">Kementerian Agama Republik Indonesia</p>
      <p class="title-2">Rapor Peserta Didik</p>
      <p class="subtitle">${escapeHtml(schoolProfile.school_name)}</p>
      ${schoolProfile.logo_url ? `<img class="logo" src="${escapeHtml(schoolProfile.logo_url)}" alt="Logo" />` : ''}
      <div class="student">
        <h3>${escapeHtml(report.student_name || '-')}</h3>
        <p>NIS: ${escapeHtml(report.nis_local || '-')}</p>
        <p>Kelas: ${escapeHtml(report.class_name || '-')}</p>
        <p>Tahun Ajaran: ${escapeHtml(report.school_year_name || '-')}</p>
      </div>
      <div class="footer">
        <div>${escapeHtml(schoolProfile.address || '-')}</div>
        <div>${escapeHtml(schoolProfile.city || '-')} - ${escapeHtml(schoolProfile.province || '-')}</div>
      </div>
    </section>
  `;
}

function buildIdentityPrintHtml({ report, student, schoolProfile }) {
  return `
    <style>
      @page { size: A4; margin: 12mm; }
      body { margin: 0; font-family: "Segoe UI", Arial, sans-serif; color: #111827; font-size: 12px; }
      .head { display: grid; grid-template-columns: 64px 1fr; gap: 10px; align-items: center; border-bottom: 2px solid #111827; padding-bottom: 8px; margin-bottom: 10px; }
      .logo { width: 58px; height: 58px; object-fit: contain; }
      .center { text-align: center; }
      .title { margin: 0; font-size: 18px; text-transform: uppercase; font-weight: 800; }
      .subtitle { margin: 2px 0; font-size: 13px; font-weight: 700; text-transform: uppercase; }
      .meta { margin: 1px 0; font-size: 11px; }
      .section-title { margin: 12px 0 6px; font-size: 13px; font-weight: 800; text-transform: uppercase; }
      table { width: 100%; border-collapse: collapse; }
      td { border: 1px solid #cbd5e1; padding: 6px 8px; vertical-align: top; }
      td.label { width: 210px; font-weight: 600; background: #f8fafc; }
      .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    </style>
    <section>
      <div class="head">
        <div>${schoolProfile.logo_url ? `<img class="logo" src="${escapeHtml(schoolProfile.logo_url)}" alt="Logo" />` : ''}</div>
        <div class="center">
          <p class="title">${escapeHtml(schoolProfile.school_name)}</p>
          <p class="subtitle">Identitas Peserta Didik</p>
          <p class="meta">${escapeHtml(schoolProfile.address || '-')} | ${escapeHtml(schoolProfile.phone || '-')}</p>
        </div>
      </div>

      <div class="section-title">Data Diri</div>
      <table>
        <tr><td class="label">Nama Lengkap</td><td>${escapeHtml(report.student_name || '-')}</td></tr>
        <tr><td class="label">NIS / NISN</td><td>${escapeHtml(report.nis_local || '-')} / ${escapeHtml(student?.nisn || '-')}</td></tr>
        <tr><td class="label">NIK</td><td>${escapeHtml(student?.nik || '-')}</td></tr>
        <tr><td class="label">Jenis Kelamin</td><td>${escapeHtml(student?.gender || '-')}</td></tr>
        <tr><td class="label">Tempat, Tanggal Lahir</td><td>${escapeHtml(student?.birth_place || '-')} , ${escapeHtml(student?.birth_date || '-')}</td></tr>
        <tr><td class="label">Agama</td><td>${escapeHtml(student?.religion || '-')}</td></tr>
        <tr><td class="label">Alamat</td><td>${escapeHtml(student?.address || '-')}</td></tr>
      </table>

      <div class="section-title">Akademik</div>
      <table>
        <tr><td class="label">Kelas</td><td>${escapeHtml(report.class_name || '-')}</td></tr>
        <tr><td class="label">Tahun Ajaran</td><td>${escapeHtml(report.school_year_name || '-')}</td></tr>
        <tr><td class="label">Semester</td><td>${escapeHtml(report.semester_name || '-')}</td></tr>
        <tr><td class="label">Status Siswa</td><td>${escapeHtml(student?.student_status || '-')}</td></tr>
      </table>

      <div class="section-title">Data Orang Tua / Wali</div>
      <div class="two-col">
        <table>
          <tr><td class="label">Nama Ayah</td><td>${escapeHtml(student?.father_name || '-')}</td></tr>
          <tr><td class="label">Pekerjaan Ayah</td><td>${escapeHtml(student?.father_occupation || '-')}</td></tr>
          <tr><td class="label">No HP Ayah</td><td>${escapeHtml(student?.father_phone || '-')}</td></tr>
        </table>
        <table>
          <tr><td class="label">Nama Ibu</td><td>${escapeHtml(student?.mother_name || '-')}</td></tr>
          <tr><td class="label">Pekerjaan Ibu</td><td>${escapeHtml(student?.mother_occupation || '-')}</td></tr>
          <tr><td class="label">No HP Ibu</td><td>${escapeHtml(student?.mother_phone || '-')}</td></tr>
        </table>
      </div>
    </section>
  `;
}

function buildRecapLedgerPrintHtml({ periods, studentRows, schoolProfile, className }) {
  return `
    <style>
      @page { size: landscape; margin: 10mm; }
      body { font-family: Arial, sans-serif; margin: 0; color: #111; font-size: 11px; }
      .center { text-align: center; }
      .school-name { font-size: 18px; font-weight: 700; text-transform: uppercase; margin: 0; }
      .meta { margin: 2px 0; }
      .title { margin: 10px 0 8px; font-size: 15px; font-weight: 700; text-transform: uppercase; text-align: center; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #111; padding: 5px 6px; text-align: center; }
      th { background: #fff; font-weight: 700; }
      td.left, th.left { text-align: left; }
    </style>
    <div class="center">
      <p class="school-name">${escapeHtml(schoolProfile.school_name)}</p>
      <p class="meta">Rekap Leger Nilai ${escapeHtml(className || 'Semua Kelas')}</p>
    </div>
    <div class="title">Rekap Nilai Siswa Antar Semester</div>
    <table>
      <thead>
        <tr>
          <th width="44">No</th>
          <th class="left" width="220">Siswa</th>
          ${periods.map((period) => `<th>${escapeHtml(period.label)}</th>`).join('')}
          <th width="88">Rata-rata</th>
        </tr>
      </thead>
      <tbody>
        ${studentRows.map((row, index) => `
          <tr>
            <td>${index + 1}</td>
            <td class="left"><strong>${escapeHtml(row.student_name)}</strong><div>${escapeHtml(row.nis_local || '-')}</div></td>
            ${periods.map((period) => `<td>${formatScore(row.periodScores[period.key])}</td>`).join('')}
            <td><strong>${formatScore(row.finalAverage)}</strong></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

export function ReportCardsSection({ api, data, setError, pushToast }) {
  const [mode, setMode] = useState('report');
  const [rows, setRows] = useState([]);
  const [recapRows, setRecapRows] = useState([]);
  const [recapLoading, setRecapLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filterClassId, setFilterClassId] = useState('all');
  const [filterSchoolYearId, setFilterSchoolYearId] = useState('all');
  const [filterSemesterId, setFilterSemesterId] = useState('all');
  const [query, setQuery] = useState('');
  const [selectedReport, setSelectedReport] = useState(null);
  const [schoolSettings, setSchoolSettings] = useState(null);
  const [configuredSubjects, setConfiguredSubjects] = useState([]);
  const [reportPage, setReportPage] = useState(1);
  const [reportPageSize, setReportPageSize] = useState(20);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerPageSize, setLedgerPageSize] = useState(20);
  const [recapPage, setRecapPage] = useState(1);
  const [recapPageSize, setRecapPageSize] = useState(20);

  const activeSchoolYear = useMemo(() => data.schoolYears.find((year) => Number(year.is_active) === 1), [data.schoolYears]);
  const activeSemester = useMemo(() => data.semesters.find((semester) => Number(semester.is_active) === 1), [data.semesters]);

  useEffect(() => {
    if (filterSchoolYearId === 'all' && activeSchoolYear?.id) setFilterSchoolYearId(String(activeSchoolYear.id));
    if (filterSemesterId === 'all' && activeSemester?.id) setFilterSemesterId(String(activeSemester.id));
  }, [activeSchoolYear, activeSemester, filterSchoolYearId, filterSemesterId]);

  useEffect(() => {
    api.schoolSettings.get().then(setSchoolSettings).catch(() => null);
  }, [api]);

  useEffect(() => {
    async function loadRows() {
      setLoading(true);
      try {
        const list = await api.reportCards.list({
          classId: filterClassId,
          schoolYearId: filterSchoolYearId,
          semesterId: filterSemesterId,
          q: query
        });
        setRows(Array.isArray(list) ? list : []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadRows();
  }, [api, filterClassId, filterSchoolYearId, filterSemesterId, query, setError]);

  useEffect(() => {
    async function loadRecapRows() {
      if (mode !== 'recap') return;
      setRecapLoading(true);
      try {
        const list = await api.reportCards.list({
          classId: filterClassId,
          q: query
        });
        setRecapRows(Array.isArray(list) ? list : []);
      } catch (err) {
        setError(err.message);
      } finally {
        setRecapLoading(false);
      }
    }
    loadRecapRows();
  }, [api, mode, filterClassId, query, setError]);

  useEffect(() => {
    async function loadConfiguredSubjects() {
      if (filterClassId === 'all' || filterSchoolYearId === 'all' || filterSemesterId === 'all') {
        setConfiguredSubjects([]);
        return;
      }
      try {
        const rows = await api.classSubjectSettings.list({
          classId: filterClassId,
          schoolYearId: filterSchoolYearId,
          semesterId: filterSemesterId
        });
        setConfiguredSubjects(Array.isArray(rows) ? rows : []);
      } catch (err) {
        setError(err.message);
      }
    }
    loadConfiguredSubjects();
  }, [api, filterClassId, filterSchoolYearId, filterSemesterId, setError]);

  const ledgerSubjects = useMemo(() => {
    const map = new Map();
    configuredSubjects.forEach((item) => {
      if (!map.has(item.subject_id)) {
        map.set(item.subject_id, {
          id: item.subject_id,
          name: item.subject_name || '-',
          display_order: item.subject_display_order || 0
        });
      }
    });
    rows.forEach((row) => {
      (row.scores || []).forEach((score) => {
        if (!map.has(score.subject_id)) {
          map.set(score.subject_id, {
            id: score.subject_id,
            name: score.subject_name || '-',
            display_order: score.subject_display_order || 0
          });
        }
      });
    });
    return Array.from(map.values()).sort((a, b) => (a.display_order - b.display_order) || a.name.localeCompare(b.name, 'id'));
  }, [rows, configuredSubjects]);

  const ledgerStudents = useMemo(() => rows.map((row) => ({
    student_id: row.student_id,
    student_name: row.student_name,
    nis_local: row.nis_local,
    scoresBySubject: Object.fromEntries((row.scores || []).map((score) => [score.subject_id, score.score_value])),
    average_score: row.average_score
  })), [rows]);
  const reportTotalPages = Math.max(1, Math.ceil(rows.length / reportPageSize));
  const reportPagedRows = useMemo(
    () => rows.slice((reportPage - 1) * reportPageSize, reportPage * reportPageSize),
    [rows, reportPage, reportPageSize]
  );
  const ledgerTotalPages = Math.max(1, Math.ceil(ledgerStudents.length / ledgerPageSize));
  const ledgerPagedStudents = useMemo(
    () => ledgerStudents.slice((ledgerPage - 1) * ledgerPageSize, ledgerPage * ledgerPageSize),
    [ledgerStudents, ledgerPage, ledgerPageSize]
  );

  const recapPeriods = useMemo(() => {
    const map = new Map();
    recapRows.forEach((row) => {
      const yearName = String(row.school_year_name || '-');
      const semesterName = String(row.semester_name || '-');
      const key = `${row.school_year_id || 0}-${row.semester_id || 0}`;
      if (!map.has(key)) {
        const semesterLower = semesterName.toLowerCase();
        map.set(key, {
          key,
          label: `${yearName} - ${semesterName}`,
          yearId: Number(row.school_year_id || 0),
          semesterOrder: semesterLower.includes('ganjil') ? 1 : semesterLower.includes('genap') ? 2 : 99
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => {
      if (a.yearId !== b.yearId) return a.yearId - b.yearId;
      return a.semesterOrder - b.semesterOrder;
    });
  }, [recapRows]);

  const recapStudents = useMemo(() => {
    const map = new Map();
    recapRows.forEach((row) => {
      const studentId = Number(row.student_id);
      if (!map.has(studentId)) {
        map.set(studentId, {
          student_id: studentId,
          student_name: row.student_name || '-',
          nis_local: row.nis_local || '-',
          periodScores: {},
          scoreList: []
        });
      }
      const item = map.get(studentId);
      const periodKey = `${row.school_year_id || 0}-${row.semester_id || 0}`;
      item.periodScores[periodKey] = row.average_score;
      if (row.average_score !== null && row.average_score !== undefined && row.average_score !== '') {
        const num = Number(row.average_score);
        if (!Number.isNaN(num)) item.scoreList.push(num);
      }
    });
    return Array.from(map.values())
      .map((item) => ({
        ...item,
        finalAverage: item.scoreList.length
          ? (item.scoreList.reduce((sum, value) => sum + value, 0) / item.scoreList.length)
          : null
      }))
      .sort((a, b) => String(a.student_name).localeCompare(String(b.student_name), 'id'));
  }, [recapRows]);
  const recapTotalPages = Math.max(1, Math.ceil(recapStudents.length / recapPageSize));
  const recapPagedStudents = useMemo(
    () => recapStudents.slice((recapPage - 1) * recapPageSize, recapPage * recapPageSize),
    [recapStudents, recapPage, recapPageSize]
  );

  const schoolProfile = buildSchoolProfile(schoolSettings);
  const selectedClassName = filterClassId === 'all' ? '-' : (data.classes.find((item) => String(item.id) === String(filterClassId))?.name || '-');
  const selectedYearName = data.schoolYears.find((item) => String(item.id) === String(filterSchoolYearId))?.name || '-';
  const selectedSemesterName = data.semesters.find((item) => String(item.id) === String(filterSemesterId))?.name || '-';
  const studentsById = useMemo(() => {
    const map = new Map();
    (data.students || []).forEach((student) => map.set(Number(student.id), student));
    return map;
  }, [data.students]);
  const classesById = useMemo(() => {
    const map = new Map();
    (data.classes || []).forEach((classItem) => map.set(Number(classItem.id), classItem));
    return map;
  }, [data.classes]);

  function printReport(report) {
    const studentDetail = studentsById.get(Number(report.student_id)) || null;
    const classInfo = classesById.get(Number(report.class_id)) || null;
    openPrintWindow(
      `Rapor-${report.student_name}`,
      buildReportPrintHtml(report, schoolProfile, { student: studentDetail, classInfo })
    );
  }

  function printMassReports() {
    if (!rows.length) {
      pushToast?.('error', 'Belum ada data', 'Tidak ada data rapor untuk dicetak masal.');
      return;
    }
    const html = rows.map((report) => {
      const studentDetail = studentsById.get(Number(report.student_id)) || null;
      const classInfo = classesById.get(Number(report.class_id)) || null;
      return buildReportPrintHtml(report, schoolProfile, { student: studentDetail, classInfo });
    }).join('<div style="page-break-after:always"></div>');
    openPrintWindow(
      `Rapor-Masal-${selectedClassName}-${selectedYearName}-${selectedSemesterName}`,
      html
    );
  }

  function printCover(report) {
    openPrintWindow(
      `Sampul-Rapor-${report.student_name}`,
      buildCoverPrintHtml({ report, schoolProfile })
    );
  }

  function printIdentity(report) {
    const studentDetail = studentsById.get(Number(report.student_id)) || null;
    openPrintWindow(
      `Identitas-${report.student_name}`,
      buildIdentityPrintHtml({ report, student: studentDetail, schoolProfile })
    );
  }

  function printLedger() {
    if (!ledgerStudents.length) {
      pushToast?.('error', 'Belum ada data', 'Tidak ada nilai untuk dicetak pada filter ini.');
      return;
    }
    openPrintWindow(
      `Leger-${selectedClassName}-${selectedYearName}-${selectedSemesterName}`,
      buildLedgerPrintHtml({
        className: selectedClassName,
        schoolYearName: selectedYearName,
        semesterName: selectedSemesterName,
        subjects: ledgerSubjects,
        studentRows: ledgerStudents,
        schoolProfile
      })
    );
  }

  function printRecapLedger() {
    if (!recapStudents.length || !recapPeriods.length) {
      pushToast?.('error', 'Belum ada data', 'Tidak ada data rekap leger untuk dicetak.');
      return;
    }
    openPrintWindow(
      `Rekap-Leger-${selectedClassName}`,
      buildRecapLedgerPrintHtml({
        periods: recapPeriods,
        studentRows: recapStudents,
        schoolProfile,
        className: selectedClassName
      })
    );
  }

  useEffect(() => {
    setReportPage(1);
    setLedgerPage(1);
    setRecapPage(1);
  }, [mode, filterClassId, filterSchoolYearId, filterSemesterId, query, reportPageSize, ledgerPageSize, recapPageSize]);

  useEffect(() => {
    if (reportPage > reportTotalPages) setReportPage(reportTotalPages);
  }, [reportPage, reportTotalPages]);
  useEffect(() => {
    if (ledgerPage > ledgerTotalPages) setLedgerPage(ledgerTotalPages);
  }, [ledgerPage, ledgerTotalPages]);
  useEffect(() => {
    if (recapPage > recapTotalPages) setRecapPage(recapTotalPages);
  }, [recapPage, recapTotalPages]);

  return (
    <>
      <section className="student-shell module-shell">
        <div className="module-segmented">
          <button className={mode === 'report' ? 'module-segment active' : 'module-segment'} onClick={() => setMode('report')}>Rapor Siswa</button>
          <button className={mode === 'ledger' ? 'module-segment active' : 'module-segment'} onClick={() => setMode('ledger')}>Leger Kelas</button>
          <button className={mode === 'recap' ? 'module-segment active' : 'module-segment'} onClick={() => setMode('recap')}>Rekap Leger</button>
        </div>

        <div className="student-filter-bar">
          <select className="filter" value={filterClassId} onChange={(e) => setFilterClassId(e.target.value)}>
            <option value="all">Semua Kelas</option>
            {data.classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <select className="filter" value={filterSchoolYearId} onChange={(e) => setFilterSchoolYearId(e.target.value)}>
            <option value="all">Semua Tahun Ajaran</option>
            {data.schoolYears.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <select className="filter" value={filterSemesterId} onChange={(e) => setFilterSemesterId(e.target.value)}>
            <option value="all">Semua Semester</option>
            {data.semesters.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <input className="filter full" placeholder="Cari siswa..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>

        <div className="student-meta-bar">
          <span className="pill">{mode === 'recap' ? `Rekap: ${recapRows.length}` : `Rapor: ${rows.length}`}</span>
          <span className="pill">{mode === 'recap' ? `Periode: ${recapPeriods.length}` : `Mapel: ${ledgerSubjects.length}`}</span>
          <span className="pill">Kelas: {selectedClassName}</span>
          {mode === 'report' && (
            <div className="student-pagination">
              <button className="ghost" disabled={reportPage <= 1} onClick={() => setReportPage((p) => Math.max(1, p - 1))}>Prev</button>
              <span>Halaman {reportPage} / {reportTotalPages}</span>
              <button className="ghost" disabled={reportPage >= reportTotalPages} onClick={() => setReportPage((p) => Math.min(reportTotalPages, p + 1))}>Next</button>
              <select className="filter" value={reportPageSize} onChange={(e) => setReportPageSize(Number(e.target.value) || 20)}>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          )}
          {mode === 'ledger' && (
            <div className="student-pagination">
              <button className="ghost" disabled={ledgerPage <= 1} onClick={() => setLedgerPage((p) => Math.max(1, p - 1))}>Prev</button>
              <span>Halaman {ledgerPage} / {ledgerTotalPages}</span>
              <button className="ghost" disabled={ledgerPage >= ledgerTotalPages} onClick={() => setLedgerPage((p) => Math.min(ledgerTotalPages, p + 1))}>Next</button>
              <select className="filter" value={ledgerPageSize} onChange={(e) => setLedgerPageSize(Number(e.target.value) || 20)}>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          )}
          {mode === 'recap' && (
            <div className="student-pagination">
              <button className="ghost" disabled={recapPage <= 1} onClick={() => setRecapPage((p) => Math.max(1, p - 1))}>Prev</button>
              <span>Halaman {recapPage} / {recapTotalPages}</span>
              <button className="ghost" disabled={recapPage >= recapTotalPages} onClick={() => setRecapPage((p) => Math.min(recapTotalPages, p + 1))}>Next</button>
              <select className="filter" value={recapPageSize} onChange={(e) => setRecapPageSize(Number(e.target.value) || 20)}>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          )}
          <div className="head-actions">
            {mode === 'report' && <button className="btn-export" onClick={printMassReports}>Cetak Rapor Masal</button>}
            {mode === 'ledger' && <button className="btn-export" onClick={printLedger}>Cetak Leger</button>}
            {mode === 'recap' && <button className="btn-export" onClick={printRecapLedger}>Cetak Rekap Leger</button>}
          </div>
        </div>

        {mode === 'report' && (
          <div className="table-card student-table-card">
            <div className="student-table">
              <div className="student-table-head sticky" style={{ gridTemplateColumns: '1.8fr 1fr 1fr 0.9fr 0.9fr 0.9fr 1.2fr' }}>
                <span>Siswa</span>
                <span>Kelas</span>
                <span>Tahun Ajaran</span>
                <span>Semester</span>
                <span>Mapel</span>
                <span>Rata-rata</span>
                <span>Aksi</span>
              </div>
              {loading && Array.from({ length: 5 }).map((_, index) => (
                <div className="student-table-row student-skeleton-row" style={{ gridTemplateColumns: '1.8fr 1fr 1fr 0.9fr 0.9fr 0.9fr 1.2fr' }} key={`report-sk-${index}`}>
                  <span className="student-skeleton" /><span className="student-skeleton" /><span className="student-skeleton" /><span className="student-skeleton" /><span className="student-skeleton" /><span className="student-skeleton" /><span className="student-skeleton" />
                </div>
              ))}
              {!loading && reportPagedRows.map((report) => (
                <div className="student-table-row" style={{ gridTemplateColumns: '1.8fr 1fr 1fr 0.9fr 0.9fr 0.9fr 1.2fr' }} key={`${report.student_id}-${report.school_year_id || 0}-${report.semester_id || 0}`}>
                  <span className="student-cell-info">
                    <span>
                      <span className="student-name">{report.student_name}</span>
                      <span className="student-gender">NIS: {report.nis_local || '-'} | Ekstra: {report.report_meta?.extracurricular_activity || '-'}</span>
                    </span>
                  </span>
                  <span>{report.class_name || '-'}</span>
                  <span>{report.school_year_name || '-'}</span>
                  <span>{report.semester_name || '-'}</span>
                  <span>{report.subject_count}</span>
                  <span>{formatScore(report.average_score)}</span>
                  <span className="student-cell-actions">
                    <button className="icon-btn" title="Detail" onClick={() => setSelectedReport(report)}>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12Z" /><circle cx="12" cy="12" r="3" /></svg>
                    </button>
                    <button className="icon-btn" title="Cetak Sampul" onClick={() => printCover(report)}>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" /></svg>
                    </button>
                    <button className="icon-btn" title="Cetak Identitas" onClick={() => printIdentity(report)}>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4" /><path d="M6 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /></svg>
                    </button>
                    <button className="icon-btn" title="Cetak Rapor" onClick={() => printReport(report)}>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9V2h12v7" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M6 14h12v8H6z" /></svg>
                    </button>
                  </span>
                </div>
              ))}
              {!loading && rows.length === 0 && <div className="module-empty-state">Belum ada data rapor untuk filter yang dipilih.</div>}
            </div>
          </div>
        )}

        {mode === 'ledger' && (
          <div className="table-card">
            <div className="module-ledger-wrap">
              <table className="module-ledger-table">
                <thead>
                  <tr>
                    <th>No</th>
                    <th>Siswa</th>
                    {ledgerSubjects.map((subject) => <th key={subject.id}>{subject.name}</th>)}
                    <th>Rata-rata</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerPagedStudents.map((student, index) => (
                    <tr key={student.student_id}>
                      <td>{(ledgerPage - 1) * ledgerPageSize + index + 1}</td>
                      <td className="left"><strong>{student.student_name}</strong><div>{student.nis_local || '-'}</div></td>
                      {ledgerSubjects.map((subject) => <td key={`${student.student_id}-${subject.id}`}>{formatScore(student.scoresBySubject[subject.id])}</td>)}
                      <td><strong>{formatScore(student.average_score)}</strong></td>
                    </tr>
                  ))}
                  {!loading && ledgerStudents.length === 0 && <tr><td colSpan={ledgerSubjects.length + 3}>Belum ada data leger untuk filter yang dipilih.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {mode === 'recap' && (
          <div className="table-card">
            <div className="module-ledger-wrap">
              <table className="module-ledger-table">
                <thead>
                  <tr>
                    <th>No</th>
                    <th>Siswa</th>
                    {recapPeriods.map((period) => <th key={period.key}>{period.label}</th>)}
                    <th>Rata-rata</th>
                  </tr>
                </thead>
                <tbody>
                  {recapPagedStudents.map((student, index) => (
                    <tr key={student.student_id}>
                      <td>{(recapPage - 1) * recapPageSize + index + 1}</td>
                      <td className="left"><strong>{student.student_name}</strong><div>{student.nis_local || '-'}</div></td>
                      {recapPeriods.map((period) => (
                        <td key={`${student.student_id}-${period.key}`}>{formatScore(student.periodScores[period.key])}</td>
                      ))}
                      <td><strong>{formatScore(student.finalAverage)}</strong></td>
                    </tr>
                  ))}
                  {!recapLoading && recapStudents.length === 0 && <tr><td colSpan={recapPeriods.length + 3}>Belum ada data rekap leger untuk filter yang dipilih.</td></tr>}
                  {recapLoading && <tr><td colSpan={recapPeriods.length + 3}>Memuat data rekap...</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {selectedReport && (
        <div className="student-modal-overlay" onClick={() => setSelectedReport(null)}>
          <section className="student-modal student-modal-themed" onClick={(e) => e.stopPropagation()}>
            <div className="student-editor-head">
              <div>
                <h2>Detail Rapor</h2>
                <p>{selectedReport.student_name} · {selectedReport.class_name || '-'} · {selectedReport.school_year_name || '-'} / {selectedReport.semester_name || '-'}</p>
              </div>
              <button className="ghost" onClick={() => setSelectedReport(null)}>Tutup</button>
            </div>

            <div className="module-stats-grid">
              <article className="module-stat-card"><span>Rata-rata</span><strong>{formatScore(selectedReport.average_score)}</strong></article>
              <article className="module-stat-card"><span>Jumlah Mapel</span><strong>{selectedReport.subject_count}</strong></article>
              <article className="module-stat-card"><span>Ekstrakurikuler</span><strong>{selectedReport.report_meta?.extracurricular_activity || '-'}</strong></article>
            </div>

            <div className="table-card student-table-card">
              <div className="student-table">
                <div className="student-table-head sticky" style={{ gridTemplateColumns: '1.3fr 0.7fr 0.7fr 0.7fr 1.5fr' }}>
                  <span>Mapel</span>
                  <span>Nilai</span>
                  <span>Predikat</span>
                  <span>KKM</span>
                  <span>Capaian</span>
                </div>
                {(selectedReport.scores || []).map((score) => (
                  <div className="student-table-row" style={{ gridTemplateColumns: '1.3fr 0.7fr 0.7fr 0.7fr 1.5fr' }} key={score.id}>
                    <span>{score.subject_name || '-'}</span>
                    <span>{formatScore(score.score_value)}</span>
                    <span>{scorePredicate(score.score_value)}</span>
                    <span>{formatScore(score.subject_kkm)}</span>
                    <span>{score.achievement_note || '-'}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="module-attendance-summary">
              <span>Sakit: {selectedReport.report_meta?.attendance_sick ?? '-'}</span>
              <span>Izin: {selectedReport.report_meta?.attendance_permit ?? '-'}</span>
              <span>Alfa: {selectedReport.report_meta?.attendance_absent ?? '-'}</span>
              <span>Predikat Ekstra: {selectedReport.report_meta?.extracurricular_predicate || '-'}</span>
            </div>

            <div className="actions student-form-actions">
              <button className="ghost" onClick={() => setSelectedReport(null)}>Tutup</button>
              <button className="btn-export" onClick={() => printReport(selectedReport)}>Cetak Rapor</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

