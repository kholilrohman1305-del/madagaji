import React, { useEffect, useMemo, useState } from 'react';

function formatDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('id-ID');
}

function normalizeStatus(value) {
  const s = String(value || '').toLowerCase();
  if (s === 'lulus') return 'Alumni';
  if (s === 'pindah') return 'Pindah';
  if (s === 'keluar') return 'Keluar';
  return 'Aktif';
}

function buildHistoryNote(row) {
  const status = String(row?.status || '').toLowerCase();
  const rawNotes = String(row?.notes || '').trim();
  if (status !== 'naik') return rawNotes || '-';
  if (/naik dari kelas/i.test(rawNotes)) return rawNotes;
  const fromClass = String(row?.from_class_name || '').trim();
  const toClass = String(row?.class_name || '').trim();
  if (fromClass && toClass) return `Naik dari kelas ${fromClass} ke ${toClass}`;
  if (fromClass) return `Naik dari kelas ${fromClass}`;
  return rawNotes || 'Naik kelas';
}

function genderLabel(value) {
  const v = String(value || '').toUpperCase();
  if (v === 'L') return 'Laki-Laki';
  if (v === 'P') return 'Perempuan';
  return '-';
}

export function BukuIndukSection({ api, data, loading, setError }) {
  const [rows, setRows] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [filterClassId, setFilterClassId] = useState('all');
  const [filterSchoolYearId, setFilterSchoolYearId] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterQuery, setFilterQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailCache, setDetailCache] = useState({});
  const [selectedIds, setSelectedIds] = useState([]);
  const [schoolSettings, setSchoolSettings] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const activeSchoolYear = useMemo(
    () => data.schoolYears.find((year) => Number(year.is_active) === 1),
    [data.schoolYears]
  );

  useEffect(() => {
    if (filterSchoolYearId === 'all' && activeSchoolYear?.id) {
      setFilterSchoolYearId(String(activeSchoolYear.id));
    }
  }, [activeSchoolYear, filterSchoolYearId]);

  async function loadRows() {
    setListLoading(true);
    try {
      const list = await api.bukuInduk.list({
        classId: filterClassId,
        schoolYearId: filterSchoolYearId,
        status: filterStatus,
        q: filterQuery
      });
      setRows(Array.isArray(list) ? list : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setListLoading(false);
    }
  }

  useEffect(() => {
    loadRows();
  }, [filterClassId, filterSchoolYearId, filterStatus, filterQuery]);

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => rows.some((row) => row.id === id)));
  }, [rows]);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pagedRows = useMemo(
    () => rows.slice((page - 1) * pageSize, page * pageSize),
    [rows, page, pageSize]
  );

  useEffect(() => {
    setPage(1);
  }, [filterClassId, filterSchoolYearId, filterStatus, filterQuery, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    api.schoolSettings.get().then(setSchoolSettings).catch(() => null);
  }, [api]);

  async function getDetail(studentId) {
    if (detailCache[studentId]) return detailCache[studentId];
    const detail = await api.bukuInduk.detail(studentId);
    setDetailCache((prev) => ({ ...prev, [studentId]: detail }));
    return detail;
  }

  async function openDetail(studentId) {
    setDetailLoading(true);
    try {
      const detail = await getDetail(studentId);
      setSelected(detail);
    } catch (err) {
      setError(err.message);
    } finally {
      setDetailLoading(false);
    }
  }

  function exportCsv() {
    const url = api.bukuInduk.exportCsvUrl({
      classId: filterClassId,
      schoolYearId: filterSchoolYearId,
      status: filterStatus,
      q: filterQuery
    });
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  const allSelected = pagedRows.length > 0 && pagedRows.every((row) => selectedIds.includes(row.id));

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !pagedRows.some((row) => row.id === id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...pagedRows.map((r) => r.id)])));
    }
  }

  function toggleSelect(id) {
    setSelectedIds((prev) => (
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    ));
  }

  function getSchoolProfile() {
    return {
      name: schoolSettings?.school_name || import.meta.env.VITE_SCHOOL_NAME || 'SEKOLAH MENENGAH ATAS',
      subName: schoolSettings?.school_subtitle || import.meta.env.VITE_SCHOOL_SUBNAME || 'MASTER DATA SEKOLAH',
      npsn: schoolSettings?.npsn || import.meta.env.VITE_SCHOOL_NPSN || '-',
      address: schoolSettings?.address || import.meta.env.VITE_SCHOOL_ADDRESS || '-',
      email: schoolSettings?.email || import.meta.env.VITE_SCHOOL_EMAIL || '-',
      phone: schoolSettings?.phone || import.meta.env.VITE_SCHOOL_PHONE || '-',
      principal: schoolSettings?.principal_name || import.meta.env.VITE_SCHOOL_PRINCIPAL || 'Kepala Madrasah',
      principalNip: schoolSettings?.principal_nip || import.meta.env.VITE_SCHOOL_PRINCIPAL_NIP || '-'
    };
  }

  function openPrintWindow(title, html) {
    const w = window.open('', '_blank', 'width=1000,height=700');
    if (!w) return;
    w.document.open();
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>${title}</title></head><body>${html}<script>window.print();</script></body></html>`);
    w.document.close();
  }

  function buildBiodataPrintHtml(detail) {
    const s = detail.student;
    const latestMutation = Array.isArray(detail.mutations) && detail.mutations.length ? detail.mutations[0] : null;
    const school = getSchoolProfile();

    const tanggalMasuk = s.entry_date ? formatDate(s.entry_date) : '-';
    const tahunMasuk = s.entry_date ? String(s.entry_date).slice(0, 4) : '-';
    const statusKeluar = normalizeStatus(s.student_status);
    const tanggalKeluar = latestMutation?.mutation_date ? formatDate(latestMutation.mutation_date) : '-';
    const suratPindah = latestMutation?.reason || latestMutation?.notes || '-';
    const jurusan = s.major || s.department || '-';
    const noHpOrtu = s.father_phone || s.mother_phone || '-';
    const penghasilanOrtu = [s.father_income_monthly, s.mother_income_monthly].filter(Boolean).join(' / ') || '-';

    return `
    <style>
      @page { size: A4; margin: 14mm; }
      body { font-family: Arial, sans-serif; color: #111; margin: 0; }
      .page { min-height: 100%; }
      .page + .page { page-break-before: always; }
      .center { text-align: center; }
      .school-title { font-size: 18px; font-weight: 700; text-transform: uppercase; margin: 0; }
      .school-sub { font-size: 16px; font-weight: 700; text-transform: uppercase; margin: 2px 0; }
      .school-meta { font-size: 12px; margin: 2px 0; }
      .main-title { margin: 10px 0 12px; font-size: 16px; font-weight: 700; text-transform: uppercase; }
      .section-title { font-size: 14px; font-weight: 700; margin: 12px 0 6px; }
      .sub-title { font-size: 13px; font-weight: 700; margin: 10px 0 4px; }
      table.form { width: 100%; border-collapse: collapse; font-size: 12px; }
      table.form td { padding: 3px 4px; vertical-align: top; }
      table.form td.label { width: 190px; }
      table.form td.sep { width: 10px; text-align: center; }
      .finger-box { width: 140px; height: 70px; border: 1px dashed #999; text-align: center; font-size: 10px; color: #666; display: inline-flex; align-items: center; justify-content: center; }
      .signature { margin-top: 40px; text-align: right; font-size: 12px; }
      .mt-8 { margin-top: 8px; }
      .two-col { width: 100%; border-collapse: collapse; font-size: 12px; }
      .two-col td { width: 50%; vertical-align: top; padding: 0 6px 0 0; }
    </style>

    <section class="page">
      <div class="center">
        <p class="school-title">${school.name}</p>
        <p class="school-sub">${school.subName}</p>
        <p class="school-meta">NPSN: ${school.npsn}</p>
        <p class="school-meta">Alamat: ${school.address}</p>
        <p class="school-meta">Email: ${school.email} , Hp. ${school.phone}</p>
        <p class="main-title">Data Induk Peserta Didik</p>
      </div>

      <div class="section-title">1. Tentang Diri Peserta Didik</div>
      <table class="form">
        <tr><td class="label">Nama</td><td class="sep">:</td><td>${s.name || '-'}</td><td rowspan="4" style="text-align:right;"><div class="finger-box">Cap 3 Jari Tengah Kiri</div></td></tr>
        <tr><td class="label">NISN</td><td class="sep">:</td><td>${s.nisn || '-'}</td></tr>
        <tr><td class="label">NIS Lokal</td><td class="sep">:</td><td>${s.nis_local || '-'}</td></tr>
        <tr><td class="label">Jenis Kelamin</td><td class="sep">:</td><td>${genderLabel(s.gender)}</td></tr>
        <tr><td class="label">Tempat / Tgl Lahir</td><td class="sep">:</td><td colspan="2">${s.birth_place || '-'}, ${formatDate(s.birth_date)}</td></tr>
        <tr><td class="label">Agama</td><td class="sep">:</td><td colspan="2">${s.religion || '-'}</td></tr>
        <tr><td class="label">Anak Ke</td><td class="sep">:</td><td colspan="2">${s.child_order || '-'}</td></tr>
        <tr><td class="label">Jumlah Saudara</td><td class="sep">:</td><td colspan="2">${s.siblings_count || '-'}</td></tr>
        <tr><td class="label">Cita-Cita</td><td class="sep">:</td><td colspan="2">${s.aspiration || '-'}</td></tr>
        <tr><td class="label">Hobi</td><td class="sep">:</td><td colspan="2">${s.hobby || '-'}</td></tr>
        <tr><td class="label">No. Hp</td><td class="sep">:</td><td colspan="2">${s.phone || '-'}</td></tr>
        <tr><td class="label">E-Mail</td><td class="sep">:</td><td colspan="2">${s.email || '-'}</td></tr>
      </table>

      <div class="sub-title">a. Masuk di Madrasah ini</div>
      <table class="form">
        <tr><td class="label">Dari Madrasah</td><td class="sep">:</td><td>${s.previous_school || '-'}</td></tr>
        <tr><td class="label">Tahun Masuk</td><td class="sep">:</td><td>${tahunMasuk}</td></tr>
        <tr><td class="label">Tanggal Masuk</td><td class="sep">:</td><td>${tanggalMasuk}</td></tr>
        <tr><td class="label">No Ijazah</td><td class="sep">:</td><td>${s.ijazah_number || '-'}</td></tr>
        <tr><td class="label">Diterima di Kelas</td><td class="sep">:</td><td>${s.class_name || '-'}</td></tr>
        <tr><td class="label">Jurusan</td><td class="sep">:</td><td>${jurusan}</td></tr>
        <tr><td class="label">Surat Pindah (*Jika Pindahan)</td><td class="sep">:</td><td>${suratPindah}</td></tr>
      </table>

      <div class="sub-title">b. Keluar dari Madrasah ini</div>
      <table class="form">
        <tr><td class="label">Status</td><td class="sep">:</td><td>${statusKeluar}</td></tr>
        <tr><td class="label">Nomor Ijazah</td><td class="sep">:</td><td>${s.graduate_certificate_number || '-'}</td></tr>
        <tr><td class="label">Tanggal</td><td class="sep">:</td><td>${tanggalKeluar}</td></tr>
        <tr><td class="label">Ijazah Diserahkan</td><td class="sep">:</td><td>${s.ijazah_handover_date || '-'}</td></tr>
      </table>

      <div class="sub-title">c. Lain - Lain</div>
      <table class="form">
        <tr><td class="label">No Peserta Ujian</td><td class="sep">:</td><td>${s.exam_participant_number || '-'}</td></tr>
        <tr><td class="label">No Kartu Keluarga</td><td class="sep">:</td><td>${s.family_card_number || '-'}</td></tr>
        <tr><td class="label">No Akta</td><td class="sep">:</td><td>${s.no_akta_lahir || '-'}</td></tr>
        <tr><td class="label">No KIP</td><td class="sep">:</td><td>${s.kip || '-'}</td></tr>
        <tr><td class="label">No PKH</td><td class="sep">:</td><td>${s.no_pkh || '-'}</td></tr>
        <tr><td class="label">No KKS</td><td class="sep">:</td><td>${s.no_kks || '-'}</td></tr>
      </table>
    </section>

    <section class="page">
      <div class="main-title center">Data Induk Peserta Didik</div>
      <div class="sub-title">d. Tempat Tinggal</div>
      <table class="form">
        <tr><td class="label">Alamat - Desa</td><td class="sep">:</td><td>${s.address || '-'} - ${s.address_village || '-'}</td></tr>
        <tr><td class="label">RT / RW</td><td class="sep">:</td><td>RT. ${s.address_rt || '-'} / RW. ${s.address_rw || '-'}</td></tr>
        <tr><td class="label">Kecamatan</td><td class="sep">:</td><td>${s.address_subdistrict || '-'}</td></tr>
        <tr><td class="label">Kabupaten</td><td class="sep">:</td><td>${s.address_city || '-'}</td></tr>
        <tr><td class="label">Provinsi</td><td class="sep">:</td><td>${s.address_province || '-'}</td></tr>
        <tr><td class="label">Kode Pos</td><td class="sep">:</td><td>${s.postal_code || '-'}</td></tr>
        <tr><td class="label">Tempat Tinggal Sementara / Tetap</td><td class="sep">:</td><td>${s.living_with || '-'}</td></tr>
        <tr><td class="label">Kepemilikan Tempat Tinggal</td><td class="sep">:</td><td>${s.house_ownership || '-'}</td></tr>
        <tr><td class="label">Koordinat</td><td class="sep">:</td><td>${s.latitude || '-'}, ${s.longitude || '-'}</td></tr>
      </table>

      <div class="section-title">2. Orang Tua / Wali</div>
      <div class="sub-title">a. Orang Tua</div>
      <table class="two-col">
        <tr>
          <td>
            <table class="form">
              <tr><td class="label">1. Ayah</td><td class="sep"></td><td></td></tr>
              <tr><td class="label">Nama</td><td class="sep">:</td><td>${s.father_name || '-'}</td></tr>
              <tr><td class="label">NIK</td><td class="sep">:</td><td>${s.father_nik || '-'}</td></tr>
              <tr><td class="label">Tgl Lahir</td><td class="sep">:</td><td>${formatDate(s.father_birth_date)}</td></tr>
              <tr><td class="label">Tempat Lahir</td><td class="sep">:</td><td>${s.father_birth_place || '-'}</td></tr>
              <tr><td class="label">Agama</td><td class="sep">:</td><td>${s.religion || '-'}</td></tr>
              <tr><td class="label">Pendidikan</td><td class="sep">:</td><td>${s.father_education || '-'}</td></tr>
              <tr><td class="label">Pekerjaan</td><td class="sep">:</td><td>${s.father_occupation || '-'}</td></tr>
              <tr><td class="label">Status</td><td class="sep">:</td><td>${s.father_status || '-'}</td></tr>
            </table>
          </td>
          <td>
            <table class="form">
              <tr><td class="label">2. Ibu</td><td class="sep"></td><td></td></tr>
              <tr><td class="label">Nama</td><td class="sep">:</td><td>${s.mother_name || '-'}</td></tr>
              <tr><td class="label">NIK</td><td class="sep">:</td><td>${s.mother_nik || '-'}</td></tr>
              <tr><td class="label">Tgl Lahir</td><td class="sep">:</td><td>${formatDate(s.mother_birth_date)}</td></tr>
              <tr><td class="label">Tempat Lahir</td><td class="sep">:</td><td>${s.mother_birth_place || '-'}</td></tr>
              <tr><td class="label">Agama</td><td class="sep">:</td><td>${s.religion || '-'}</td></tr>
              <tr><td class="label">Pendidikan</td><td class="sep">:</td><td>${s.mother_education || '-'}</td></tr>
              <tr><td class="label">Pekerjaan</td><td class="sep">:</td><td>${s.mother_occupation || '-'}</td></tr>
              <tr><td class="label">Status</td><td class="sep">:</td><td>${s.mother_status || '-'}</td></tr>
            </table>
          </td>
        </tr>
      </table>
      <table class="form mt-8">
        <tr><td class="label">Penghasilan Orang Tua</td><td class="sep">:</td><td>${penghasilanOrtu}</td></tr>
        <tr><td class="label">No HP Ortu</td><td class="sep">:</td><td>${noHpOrtu}</td></tr>
      </table>

      <div class="sub-title">b. Wali</div>
      <table class="form">
        <tr><td class="label">Nama</td><td class="sep">:</td><td>${s.guardian_name || '-'}</td></tr>
        <tr><td class="label">NIK Wali</td><td class="sep">:</td><td>${s.guardian_nik || '-'}</td></tr>
        <tr><td class="label">Tgl Lahir</td><td class="sep">:</td><td>${formatDate(s.guardian_birth_date)}</td></tr>
        <tr><td class="label">Alamat</td><td class="sep">:</td><td>${s.guardian_address || '-'}</td></tr>
        <tr><td class="label">Agama</td><td class="sep">:</td><td>${s.religion || '-'}</td></tr>
        <tr><td class="label">Pendidikan</td><td class="sep">:</td><td>${s.guardian_education || '-'}</td></tr>
        <tr><td class="label">Pekerjaan</td><td class="sep">:</td><td>${s.guardian_occupation || '-'}</td></tr>
        <tr><td class="label">No HP Wali</td><td class="sep">:</td><td>${s.guardian_phone || '-'}</td></tr>
      </table>

      <div class="signature">
        Mengetahui,<br/>
        Kepala ${school.name}<br/><br/><br/><br/>
        ${school.principal}<br/>
        NIP: ${school.principalNip}
      </div>
    </section>`;
  }

  function buildNilaiPrintHtml(detail) {
    const s = detail.student || {};
    const school = getSchoolProfile();
    const classMeta = data.classes.find((c) => Number(c.id) === Number(s.class_id));
    const gradeLevel = String(classMeta?.grade_level || '').trim();
    const className = s.class_name || classMeta?.name || '-';

    const scores = Array.isArray(detail.scores) ? detail.scores : [];
    const scoreMap = {};
    for (const item of scores) {
      const key = `${item.subject_id}`;
      if (!scoreMap[key]) scoreMap[key] = {};
      const sem = String(item.semester_name || '').toLowerCase();
      if (sem.includes('ganjil')) scoreMap[key].ganjil = item;
      if (sem.includes('genap')) scoreMap[key].genap = item;
    }

    const subjects = (data.subjects || [])
      .filter((sub) => {
        if (!gradeLevel) return true;
        const g = String(sub.grade_level || '').trim().toLowerCase();
        if (!g) return true;
        return g === gradeLevel.toLowerCase();
      })
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'id'));

    const subjectRows = subjects.length
      ? subjects.map((sub, idx) => {
        const ganjil = scoreMap[String(sub.id)]?.ganjil;
        const genap = scoreMap[String(sub.id)]?.genap;
        return `
          <tr>
            <td>${idx + 1}</td>
            <td>${sub.name || '-'}</td>
            <td style="text-align:center;">${ganjil?.score_value ?? '-'}</td>
            <td style="text-align:center;">${ganjil?.achievement_note || '-'}</td>
            <td style="text-align:center;">${genap?.score_value ?? '-'}</td>
            <td style="text-align:center;">${genap?.achievement_note || '-'}</td>
          </tr>
        `;
      }).join('')
      : '<tr><td colspan="6" style="text-align:center;">Belum ada data mata pelajaran</td></tr>';

    return `
    <style>
      @page { size: A4; margin: 14mm; }
      body { font-family: Arial, sans-serif; color: #111; margin: 0; }
      .center { text-align: center; }
      .school-title { font-size: 18px; font-weight: 700; text-transform: uppercase; margin: 0; }
      .school-sub { font-size: 16px; font-weight: 700; text-transform: uppercase; margin: 2px 0; }
      .school-meta { font-size: 12px; margin: 2px 0; }
      .main-title { margin: 10px 0 12px; font-size: 16px; font-weight: 700; text-transform: uppercase; }
      .section-title { font-size: 14px; font-weight: 700; margin: 10px 0 6px; text-transform: uppercase; }
      .meta-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 8px; }
      .meta-table td { padding: 2px 4px; }
      .nilai-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 4px; }
      .nilai-table th, .nilai-table td { border: 1px solid #1f2937; padding: 6px 6px; }
      .nilai-table th { background: #f3f4f6; }
      .sub-block { margin-top: 12px; }
      .plain { width: 100%; border-collapse: collapse; font-size: 12px; }
      .plain td { padding: 3px 4px; border-bottom: 1px solid #d1d5db; }
    </style>

    <div class="center">
      <p class="school-title">${school.name}</p>
      <p class="school-sub">${school.subName}</p>
      <p class="school-meta">NPSN: ${school.npsn}</p>
      <p class="school-meta">Alamat: ${school.address}</p>
      <p class="school-meta">Email: ${school.email} , Hp. ${school.phone}</p>
      <p class="main-title">Data Induk Peserta Didik</p>
    </div>

    <div class="section-title">I. Pencapaian Kompetensi Peserta Didik</div>
    <table class="meta-table">
      <tr>
        <td width="80">Nama</td><td width="10">:</td><td>${s.name || '-'}</td>
        <td width="80">Madrasah</td><td width="10">:</td><td>${school.name}</td>
      </tr>
      <tr>
        <td>NISN</td><td>:</td><td>${s.nisn || '-'}</td>
        <td>Kelas</td><td>:</td><td>${className}</td>
      </tr>
      <tr>
        <td>NIS</td><td>:</td><td>${s.nis_local || '-'}</td>
        <td>Tahun Ajaran</td><td>:</td><td>${s.school_year_name || '-'}</td>
      </tr>
    </table>

    <div class="sub-block">
      <strong>A. Intrakurikuler</strong>
      <table class="nilai-table">
        <thead>
          <tr>
            <th width="40">No.</th>
            <th>Mata Pelajaran</th>
            <th width="70">Ganjil</th>
            <th width="110">Capaian Ganjil</th>
            <th width="70">Genap</th>
            <th width="110">Capaian Genap</th>
          </tr>
        </thead>
        <tbody>
          ${subjectRows}
          <tr>
            <td colspan="4" style="text-align:right;"><strong>Jumlah</strong></td>
            <td colspan="2" style="text-align:center;">-</td>
          </tr>
          <tr>
            <td colspan="4" style="text-align:right;"><strong>Rata-Rata</strong></td>
            <td colspan="2" style="text-align:center;">-</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="sub-block">
      <strong>B. Ekstrakurikuler</strong>
      <table class="plain">
        <tr><td width="220">Semester Gasal</td><td>-</td><td width="220">Semester Genap</td><td>-</td></tr>
      </table>
    </div>

    <div class="sub-block">
      <strong>C. Kehadiran</strong>
      <table class="plain">
        <tr><td width="220">Ganjil - Sakit</td><td>-</td><td width="220">Genap - Sakit</td><td>-</td></tr>
        <tr><td>Ganjil - Izin</td><td>-</td><td>Genap - Izin</td><td>-</td></tr>
        <tr><td>Ganjil - Tanpa Keterangan</td><td>-</td><td>Genap - Tanpa Keterangan</td><td>-</td></tr>
      </table>
    </div>`;
  }

  async function printBiodataByStudentId(studentId) {
    try {
      const detail = await getDetail(studentId);
      openPrintWindow(`Biodata - ${detail.student?.name || '-'}`, buildBiodataPrintHtml(detail));
    } catch (err) {
      setError(err.message);
    }
  }

  async function printNilaiByStudentId(studentId) {
    try {
      const detail = await getDetail(studentId);
      openPrintWindow(`Daftar Nilai - ${detail.student?.name || '-'}`, buildNilaiPrintHtml(detail));
    } catch (err) {
      setError(err.message);
    }
  }

  async function printMassal(kind) {
    const ids = selectedIds.length ? selectedIds : rows.map((r) => r.id);
    if (!ids.length) return;
    try {
      const details = [];
      for (const id of ids) {
        const detail = await getDetail(id);
        details.push(detail);
      }
      const bodyHtml = details.map((detail, idx) => {
        const html = kind === 'nilai' ? buildNilaiPrintHtml(detail) : buildBiodataPrintHtml(detail);
        if (idx === 0) return html;
        return `<div style="page-break-before: always;"></div>${html}`;
      }).join('');
      const title = kind === 'nilai' ? 'Daftar Nilai Massal' : 'Biodata Massal';
      openPrintWindow(title, bodyHtml);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <section className="student-shell">
        <div className="student-filter-bar">
          <select className="filter" value={filterClassId} onChange={(e) => setFilterClassId(e.target.value)}>
            <option value="all">Semua Kelas</option>
            {data.classes.map((cls) => (
              <option key={cls.id} value={cls.id}>{cls.name}</option>
            ))}
          </select>
          <select className="filter" value={filterSchoolYearId} onChange={(e) => setFilterSchoolYearId(e.target.value)}>
            <option value="all">Semua Tahun Ajaran</option>
            {data.schoolYears.map((year) => (
              <option key={year.id} value={year.id}>{year.name}</option>
            ))}
          </select>
          <select className="filter" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="all">Semua Status</option>
            <option value="aktif">Aktif</option>
            <option value="pindah">Pindah</option>
            <option value="lulus">Alumni</option>
            <option value="keluar">Keluar</option>
          </select>
          <input
            className="filter full"
            placeholder="Cari nama, NIS, NISN, NISM..."
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
          />
        </div>

        <div className="student-meta-bar">
          <span className="pill">Total data: {rows.length}</span>
          <div className="student-pagination">
            <button className="ghost" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</button>
            <span>Halaman {page} / {totalPages}</span>
            <button className="ghost" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</button>
            <select className="filter" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value) || 20)}>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
          <div className="head-actions">
            <button className="btn-export" onClick={exportCsv}>Export CSV</button>
            <button className="btn-import" onClick={() => printMassal('biodata')}>Cetak Biodata Masal</button>
            <button className="btn-import" onClick={() => printMassal('nilai')}>Cetak Nilai Masal</button>
          </div>
        </div>

        <div className="table-card student-table-card buku-induk-table-wrap">
          <div className="student-table buku-induk-table">
            <div className="student-table-head sticky buku-induk-head">
              <span>
                <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
              </span>
              <span>NIS</span>
              <span>Nama Siswa</span>
              <span>Kelas Saat Ini</span>
              <span>Tahun Ajaran</span>
              <span>Status</span>
              <span>Aksi</span>
            </div>

            {(loading || listLoading) && Array.from({ length: 6 }).map((_, idx) => (
              <div className="student-table-row student-skeleton-row buku-induk-row" key={`bi-sk-${idx}`}>
                <span className="student-skeleton" />
                <span className="student-skeleton" />
                <span className="student-skeleton" />
                <span className="student-skeleton" />
                <span className="student-skeleton" />
                <span className="student-skeleton" />
                <span className="student-skeleton" />
              </div>
            ))}

            {!loading && !listLoading && pagedRows.map((row) => (
              <div className="student-table-row buku-induk-row" key={row.id}>
                <span>
                  <input type="checkbox" checked={selectedIds.includes(row.id)} onChange={() => toggleSelect(row.id)} />
                </span>
                <span className="student-cell-id">{row.nis_local || '-'}</span>
                <span className="student-cell-info">
                  <span>
                    <span className="student-name">{row.name || '-'}</span>
                    <span className="student-gender">NISN: {row.nisn || '-'}</span>
                  </span>
                </span>
                <span>{row.class_name || '-'}</span>
                <span>{row.school_year_name || '-'}</span>
                <span><span className={`status-badge ${String(row.student_status || '').toLowerCase() === 'aktif' ? 'aktif' : 'nonaktif'}`}>{normalizeStatus(row.student_status)}</span></span>
                <span className="student-cell-actions buku-induk-actions">
                  <button className="icon-btn" onClick={() => openDetail(row.id)} title="Detail Buku Induk">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Z" /><circle cx="12" cy="12" r="3" /></svg>
                  </button>
                  <button className="icon-btn" onClick={() => printBiodataByStudentId(row.id)} title="Cetak Biodata">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9V2h12v7" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M6 14h12v8H6z" /></svg>
                  </button>
                  <button className="icon-btn" onClick={() => printNilaiByStudentId(row.id)} title="Cetak Daftar Nilai">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /></svg>
                  </button>
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {(selected || detailLoading) && (
        <div className="student-modal-overlay" onClick={() => setSelected(null)}>
          <section className="student-modal student-modal-themed buku-induk-modal" onClick={(e) => e.stopPropagation()}>
            <div className="student-editor-head">
              <div>
                <h2>Buku Induk Siswa</h2>
                <p>Ringkasan identitas dan riwayat belajar siswa.</p>
              </div>
              <button className="ghost" onClick={() => setSelected(null)}>Tutup</button>
            </div>

            {detailLoading && <div className="empty-state">Memuat detail...</div>}

            {!detailLoading && selected && (
              <div className="buku-induk-detail">
                <div className="buku-induk-card-grid">
                  <article className="side-card">
                    <h4>IDENTITAS</h4>
                    <ul className="buku-induk-kv">
                      <li><span>Nama</span><strong>{selected.student.name || '-'}</strong></li>
                      <li><span>NIS / NISN</span><strong>{selected.student.nis_local || '-'} / {selected.student.nisn || '-'}</strong></li>
                      <li><span>NISM</span><strong>{selected.student.nism || '-'}</strong></li>
                      <li><span>Kelas</span><strong>{selected.student.class_name || '-'}</strong></li>
                      <li><span>Status</span><strong>{normalizeStatus(selected.student.student_status)}</strong></li>
                    </ul>
                  </article>
                  <article className="side-card">
                    <h4>DATA AKADEMIK</h4>
                    <ul className="buku-induk-kv">
                      <li><span>Tahun Ajaran</span><strong>{selected.student.school_year_name || '-'}</strong></li>
                      <li><span>Tgl Masuk</span><strong>{formatDate(selected.student.entry_date)}</strong></li>
                      <li><span>Asal Madrasah</span><strong>{selected.student.previous_school || '-'}</strong></li>
                      <li><span>NPSN Asal</span><strong>{selected.student.school_origin_npsn || '-'}</strong></li>
                    </ul>
                  </article>
                </div>

                <div className="learning-history-card">
                  <div className="learning-history-head">Riwayat Belajar</div>
                  <div className="learning-history-table">
                    <div className="learning-history-row head buku-induk-history-row">
                      <span>Tahun Ajaran - Semester</span>
                      <span>Tanggal Mulai</span>
                      <span>Kelas</span>
                      <span>Status Keaktifan</span>
                      <span>Keterangan</span>
                    </div>
                    {selected.histories.map((row) => (
                      <div className="learning-history-row buku-induk-history-row" key={row.id}>
                        <span>{`${row.school_year_name || '-'}${row.semester_name ? ` - ${row.semester_name}` : ''}`}</span>
                        <span>{formatDate(row.start_date)}</span>
                        <span>{row.class_name || '-'}</span>
                        <span>{normalizeStatus(row.status)}</span>
                        <span>{buildHistoryNote(row)}</span>
                      </div>
                    ))}
                    {!selected.histories.length && (
                      <div className="learning-history-row buku-induk-history-row">
                        <span>Belum ada riwayat belajar</span><span>-</span><span>-</span><span>-</span><span>-</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
