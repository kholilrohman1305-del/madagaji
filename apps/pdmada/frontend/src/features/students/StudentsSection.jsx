import React, { useEffect, useMemo, useRef, useState } from 'react';

const AVATAR_COLORS = ['#0f766e', '#1d4ed8', '#059669', '#ea580c', '#dc2626', '#0891b2', '#7c2d92', '#b45309'];
const FORM_TABS = [
  { key: 'identity', label: 'Data Diri' },
  { key: 'academic', label: 'Akademik' },
  { key: 'parents', label: 'Data Orang Tua' },
  { key: 'address', label: 'Alamat' }
];

const RELIGION_OPTIONS = [
  'Islam',
  'Kristen',
  'Katolik',
  'Hindu',
  'Buddha',
  'Konghucu',
  'Kepercayaan terhadap Tuhan YME'
];

function getInitials(name) {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getAvatarColor(name) {
  if (!name) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getStatusClass(item) {
  const status = String(item.student_status || '').toLowerCase();
  if (status === 'aktif' || (!status && item.is_active)) return 'aktif';
  if (status === 'pindah' || status === 'keluar') return 'nonaktif';
  if (status === 'lulus') return 'cuti';
  if (!item.is_active) return 'nonaktif';
  return 'aktif';
}

function getStatusLabel(item) {
  const status = String(item.student_status || '').toLowerCase();
  if (status === 'aktif') return 'Aktif';
  if (status === 'pindah') return 'Pindah';
  if (status === 'keluar') return 'Non-Aktif';
  if (status === 'lulus') return 'Alumni';
  return item.is_active ? 'Aktif' : 'Non-Aktif';
}

function formatScore(value) {
  if (value === null || value === undefined || value === '') return '-';
  const n = Number(value);
  if (Number.isNaN(n)) return '-';
  return n % 1 === 0 ? String(n) : n.toFixed(2);
}

function formatDocDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('id-ID');
}

function getFormErrors(form) {
  const errors = [];
  if (!String(form.students.nis_local || '').trim()) errors.push('NIS wajib diisi.');
  if (!String(form.students.name || '').trim()) errors.push('Nama lengkap wajib diisi.');
  if (!String(form.students.class_id || '').trim()) errors.push('Kelas wajib dipilih.');
  return errors;
}

function getHistoryStatusLabel(row) {
  const status = String(row?.status || '').toLowerCase();
  if (status === 'naik') return 'Aktif';
  if (status === 'aktif') return 'Aktif';
  if (status === 'lulus') return 'Alumni';
  if (!status) return '-';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function getHistoryNotesLabel(row) {
  const status = String(row?.status || '').toLowerCase();
  const notes = String(row?.notes || '').trim();
  if (status === 'naik') {
    if (/naik dari kelas/i.test(notes)) return notes;
    const fromClass = String(row?.from_class_name || '').trim();
    const toClass = String(row?.class_name || '').trim();
    if (fromClass && toClass) return `Naik dari kelas ${fromClass} ke ${toClass}`;
    if (fromClass) return `Naik dari kelas ${fromClass}`;
    return notes || 'Naik kelas';
  }
  return notes || '-';
}

export function StudentsSection({
  api,
  data,
  visibleList,
  loading,
  filterClassId,
  setFilterClassId,
  filterSchoolYearId,
  setFilterSchoolYearId,
  studentCategoryFilter,
  setStudentCategoryFilter,
  filterQuery,
  setFilterQuery,
  studentPage,
  setStudentPage,
  studentPageSize,
  setStudentPageSize,
  studentTotalPages,
  totalRows,
  studentSortBy,
  setStudentSortBy,
  studentSortDir,
  setStudentSortDir,
  resetStudentFilters,
  classNameMap,
  section,
  openDetail,
  startEdit,
  showForm,
  viewOnly,
  editingId,
  setShowForm,
  setViewOnly,
  studentFormTab,
  setStudentFormTab,
  form,
  setField,
  submit,
  resetForm
}) {
  const [regencyOptions, setRegencyOptions] = useState([]);
  const [birthPlaceSearch, setBirthPlaceSearch] = useState('');
  const [learningHistory, setLearningHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [reportHistory, setReportHistory] = useState([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [achievements, setAchievements] = useState([]);
  const [achievementLoading, setAchievementLoading] = useState(false);
  const [studentDocuments, setStudentDocuments] = useState([]);
  const [uploadingDocKey, setUploadingDocKey] = useState('');
  const studentDocInputRefs = useRef({});
  const currentErrors = getFormErrors(form);
  const entryYear = form.students.entry_date ? String(form.students.entry_date).slice(0, 4) : '';
  const selectedBirthPlace = String(form.students.birth_place || '');
  const modalStatusClass = getStatusClass(form.students || {});
  const modalStatusLabel = getStatusLabel(form.students || {});

  useEffect(() => {
    let isMounted = true;
    async function loadRegencies() {
      try {
        const res = await fetch('https://www.emsifa.com/api-wilayah-indonesia/api/regencies.json');
        if (!res.ok) throw new Error('Failed to load regencies');
        const rows = await res.json();
        if (!Array.isArray(rows)) return;
        if (isMounted) {
          const names = Array.from(new Set(rows.map((row) => String(row.name || '').trim()).filter(Boolean)));
          names.sort((a, b) => a.localeCompare(b, 'id'));
          setRegencyOptions(names);
        }
      } catch (error) {
        if (isMounted) {
          setRegencyOptions([]);
        }
      }
    }
    loadRegencies();
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    setBirthPlaceSearch(selectedBirthPlace);
  }, [selectedBirthPlace]);

  useEffect(() => {
    async function loadStudentDocuments() {
      const studentId = Number(form.students?.id || editingId.students || 0);
      if (!studentId || !showForm || !api?.studentAffairs?.listDocuments) {
        setStudentDocuments([]);
        return;
      }
      try {
        const rows = await api.studentAffairs.listDocuments(studentId, 'student');
        setStudentDocuments(Array.isArray(rows) ? rows : []);
      } catch (error) {
        setStudentDocuments([]);
      }
    }
    loadStudentDocuments();
  }, [api, showForm, form.students?.id, editingId.students]);

  const studentDocItems = useMemo(() => ([
    { key: 'kk', label: 'KK', type: 'KK', accept: '.pdf,.jpg,.jpeg,application/pdf,image/jpeg' },
    { key: 'ktp_ortu', label: 'KTP Ortu', type: 'KTP Ortu', accept: '.pdf,.jpg,.jpeg,application/pdf,image/jpeg' },
    { key: 'ijazah_smp_mts', label: 'Ijazah SMP/Mts', type: 'Ijazah SMP/Mts', accept: '.pdf,.jpg,.jpeg,application/pdf,image/jpeg' },
    { key: 'kip', label: 'KIP', type: 'KIP', accept: '.pdf,.jpg,.jpeg,application/pdf,image/jpeg' }
  ]), []);

  function getStudentDocument(type) {
    return studentDocuments.find((doc) => String(doc.document_type || '').toLowerCase() === String(type || '').toLowerCase()) || null;
  }

  async function handleStudentDocumentUpload(item, event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const studentId = Number(form.students?.id || editingId.students || 0);
    if (!studentId) return;
    setUploadingDocKey(item.key);
    try {
      const uploaded = await api.uploads.uploadDocument(file);
      const existing = getStudentDocument(item.type);
      const payload = {
        owner_type: 'student',
        owner_id: studentId,
        document_type: item.type,
        file_url: uploaded.file_url,
        status: 'valid'
      };
      if (existing?.id) {
        await api.studentAffairs.updateDocument(existing.id, payload, 'student');
      } else {
        await api.studentAffairs.createDocument(payload);
      }
      const rows = await api.studentAffairs.listDocuments(studentId, 'student');
      setStudentDocuments(Array.isArray(rows) ? rows : []);
    } catch (error) {
      console.error(error);
    } finally {
      setUploadingDocKey('');
      event.target.value = '';
    }
  }

  useEffect(() => {
    async function loadLearningHistory(studentId) {
      if (!studentId || !api?.studentAffairs?.listClassHistories) {
        setLearningHistory([]);
        return;
      }
      setHistoryLoading(true);
      try {
        const rows = await api.studentAffairs.listClassHistories(studentId);
        setLearningHistory(Array.isArray(rows) ? rows : []);
      } catch (error) {
        setLearningHistory([]);
      } finally {
        setHistoryLoading(false);
      }
    }
    if (!showForm) return;
    loadLearningHistory(form.students.id);
  }, [showForm, form.students.id, api]);

  useEffect(() => {
    async function loadReportHistory(studentId) {
      if (!studentId || !api?.reportCards?.list) {
        setReportHistory([]);
        return;
      }
      setReportLoading(true);
      try {
        const rows = await api.reportCards.list({ studentId });
        const normalized = Array.isArray(rows) ? rows : [];
        normalized.sort((a, b) => {
          const ay = Number(a.school_year_id || 0);
          const by = Number(b.school_year_id || 0);
          if (ay !== by) return by - ay;
          const as = String(a.semester_name || '').toLowerCase().includes('ganjil') ? 1 : 2;
          const bs = String(b.semester_name || '').toLowerCase().includes('ganjil') ? 1 : 2;
          return as - bs;
        });
        setReportHistory(normalized);
      } catch (error) {
        setReportHistory([]);
      } finally {
        setReportLoading(false);
      }
    }
    if (!showForm) return;
    loadReportHistory(form.students.id);
  }, [showForm, form.students.id, api]);

  useEffect(() => {
    async function loadAchievements(studentId) {
      if (!studentId || !api?.studentAffairs?.listAchievements) {
        setAchievements([]);
        return;
      }
      setAchievementLoading(true);
      try {
        const rows = await api.studentAffairs.listAchievements(studentId);
        setAchievements(Array.isArray(rows) ? rows : []);
      } catch (error) {
        setAchievements([]);
      } finally {
        setAchievementLoading(false);
      }
    }
    if (!showForm) return;
    loadAchievements(form.students.id);
  }, [showForm, form.students.id, api]);

  const latestReport = useMemo(() => reportHistory[0] || null, [reportHistory]);
  const achievementStats = useMemo(() => {
    const activeRows = (achievements || []).filter((item) => Number(item.is_active) !== 0);
    const latest = activeRows.slice().sort((a, b) => String(b.achievement_date || '').localeCompare(String(a.achievement_date || ''), 'id'))[0] || null;
    return {
      total: activeRows.length,
      latestTitle: latest?.title || '-',
      latestLevel: latest?.level_name || '-'
    };
  }, [achievements]);

  const filteredRegencies = useMemo(() => {
    if (!birthPlaceSearch.trim()) return regencyOptions;
    const q = birthPlaceSearch.trim().toLowerCase();
    return regencyOptions.filter((name) => name.toLowerCase().includes(q));
  }, [regencyOptions, birthPlaceSearch]);

  function numericOnly(value, maxLength = 30) {
    return String(value || '').replace(/\D/g, '').slice(0, maxLength);
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
          <select className="filter" value={studentSortBy} onChange={(e) => setStudentSortBy(e.target.value)}>
            <option value="name">Urut Nama</option>
            <option value="nisn">Urut NISN</option>
            <option value="class">Urut Kelas</option>
            <option value="status">Urut Status</option>
            <option value="entry_date">Urut Tanggal Masuk</option>
          </select>
          <select className="filter" value={studentSortDir} onChange={(e) => setStudentSortDir(e.target.value)}>
            <option value="asc">A-Z / Lama-Baru</option>
            <option value="desc">Z-A / Baru-Lama</option>
          </select>
          <input
            className="filter"
            placeholder="Cari nama, NISN, NIS lokal..."
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
          />
          <button className="ghost" onClick={resetStudentFilters}>Reset Filter</button>
        </div>

        <div className="student-meta-bar">
          <span className="pill">Total ditemukan: {totalRows}</span>
          <div className="student-pagination">
            <button className="ghost" disabled={studentPage <= 1} onClick={() => setStudentPage((p) => Math.max(1, p - 1))}>Prev</button>
            <span>Halaman {studentPage} / {studentTotalPages}</span>
            <button className="ghost" disabled={studentPage >= studentTotalPages} onClick={() => setStudentPage((p) => Math.min(studentTotalPages, p + 1))}>Next</button>
            <select className="filter" value={studentPageSize} onChange={(e) => { setStudentPageSize(Number(e.target.value)); setStudentPage(1); }}>
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>

        <div className="table-card student-table-card">
          <div className="student-table">
            <div className="student-table-head sticky">
              <span>SISWA</span>
              <span>ID SISWA</span>
              <span>KELAS</span>
              <span>PONPES</span>
              <span>STATUS</span>
              <span>AKSI</span>
            </div>
            {loading && (
              Array.from({ length: 6 }).map((_, idx) => (
                <div className="student-table-row student-skeleton-row" key={`sk-${idx}`}>
                  <span className="student-skeleton" />
                  <span className="student-skeleton" />
                  <span className="student-skeleton" />
                  <span className="student-skeleton" />
                  <span className="student-skeleton" />
                  <span className="student-skeleton" />
                </div>
              ))
            )}
            {!loading && visibleList.map((item) => {
              const initials = getInitials(item.name);
              const avatarColor = getAvatarColor(item.name);
              const statusClass = getStatusClass(item);
              const statusLabel = getStatusLabel(item);
              const gender = item.gender === 'P' ? 'Perempuan' : item.gender === 'L' ? 'Laki-laki' : '';

              return (
                <div className="student-table-row" key={item.id}>
                  <span className="student-cell-info">
                    <span className="avatar-circle" style={{ background: avatarColor }}>{initials}</span>
                    <span>
                      <span className="student-name">{item.name}</span>
                      {gender && <span className="student-gender">{gender}</span>}
                    </span>
                  </span>
                  <span className="student-cell-id">{item.nis_local || item.nisn || '-'}</span>
                  <span>
                    {item.class_id ? (
                      <span className="class-badge">{classNameMap[item.class_id] || `ID ${item.class_id}`}</span>
                    ) : '-'}
                  </span>
                  <span className="student-cell-ponpes">{item.pondok_pesantren || '-'}</span>
                  <span>
                    <span className={`status-badge ${statusClass}`}>{statusLabel}</span>
                  </span>
                  <span className="student-cell-actions">
                    <button className="icon-btn" title="Detail" onClick={() => openDetail(section, item)}>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Z" /><circle cx="12" cy="12" r="3" /></svg>
                    </button>
                    <button className="icon-btn" title="Edit" onClick={() => startEdit(section, item)}>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9" /><path d="m16.5 3.5 4 4L7 21l-4 1 1-4 12.5-14.5Z" /></svg>
                    </button>
                  </span>
                </div>
              );
            })}
            {!loading && visibleList.length === 0 && (
              <div className="student-empty">
                <h4>Data tidak ditemukan</h4>
                <p>Coba ubah filter, kata kunci pencarian, atau tambahkan siswa baru.</p>
                <button className="btn-green" onClick={() => { setViewOnly(false); resetForm(section); setShowForm(true); }}>
                  Tambah Siswa
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {showForm && (
        <div className="student-modal-overlay" onClick={() => { setShowForm(false); setViewOnly(false); }}>
          <section className="student-modal student-modal-themed" onClick={(e) => e.stopPropagation()}>
          <div className="student-editor-head">
            <div>
              <h2>{viewOnly ? 'Detail Siswa' : (editingId.students ? 'Edit Siswa' : 'Tambah Siswa')}</h2>
              <p>Lengkapi data utama siswa.</p>
            </div>
            <button className="ghost" onClick={() => { setShowForm(false); setViewOnly(false); }}>Tutup</button>
          </div>

          {!viewOnly && currentErrors.length > 0 && (
            <div className="student-step-alert">
              {currentErrors.join(' ')}
            </div>
          )}

          <div className="student-modal-preview">
            <div className="student-profile-layout">
              <div className="student-profile-main">
                <div className="student-profile-heading">STUDENT PROFILE | DATA SISWA</div>
                <div className="student-profile-top">
                  <div className="student-photo-wrap">
                    <div className="student-photo-ring">
                      <div className="student-photo-text">{getInitials(form.students.name || 'Siswa')}</div>
                    </div>
                  </div>
                  <div className="student-profile-meta">
                    <h2>{form.students.name || 'Nama Siswa'}</h2>
                    <p>NIS: {form.students.nis_local || '-'} | Class {classNameMap[form.students.class_id] || '-'}</p>
                    <div className="student-profile-actions">
                      <button className="btn-profile-edit" type="button" onClick={() => setStudentFormTab('identity')}>Edit Profil</button>
                      <button className="btn-profile-print" type="button" onClick={() => window.print()}>Cetak Data</button>
                    </div>
                  </div>
                  <div className="student-profile-status">
                    <span className={`status-badge ${modalStatusClass}`}>{modalStatusLabel}</span>
                  </div>
                </div>

                <div className="student-profile-cards student-profile-form">
                  <div className="student-modal-tabs">
                    {FORM_TABS.map((tab) => (
                      <button
                        key={tab.key}
                        className={studentFormTab === tab.key ? 'active' : ''}
                        onClick={() => setStudentFormTab(tab.key)}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {studentFormTab === 'identity' && (
                    <div className="student-compact-form">
                      <label>NIS *</label>
                      <label>NISN</label>
                      <input
                        disabled={viewOnly}
                        inputMode="numeric"
                        value={form.students.nis_local || ''}
                        onChange={(e) => setField('students', 'nis_local', numericOnly(e.target.value, 25))}
                      />
                      <input
                        disabled={viewOnly}
                        inputMode="numeric"
                        value={form.students.nisn || ''}
                        onChange={(e) => setField('students', 'nisn', numericOnly(e.target.value, 25))}
                      />
                      <label className="full">Nama Lengkap *</label>
                      <input className="full" disabled={viewOnly} value={form.students.name || ''} onChange={(e) => setField('students', 'name', e.target.value)} />
                      <label>NIK</label>
                      <label>NISM</label>
                      <input
                        disabled={viewOnly}
                        inputMode="numeric"
                        value={form.students.nik || ''}
                        onChange={(e) => setField('students', 'nik', numericOnly(e.target.value, 20))}
                      />
                      <input
                        disabled={viewOnly}
                        inputMode="numeric"
                        value={form.students.nism || ''}
                        onChange={(e) => setField('students', 'nism', numericOnly(e.target.value, 25))}
                      />
                      <label>No.KK</label>
                      <label>No.KIP</label>
                      <input
                        disabled={viewOnly}
                        inputMode="numeric"
                        value={form.students.family_card_number || ''}
                        onChange={(e) => setField('students', 'family_card_number', numericOnly(e.target.value, 20))}
                      />
                      <input
                        disabled={viewOnly}
                        inputMode="numeric"
                        value={form.students.kip || ''}
                        onChange={(e) => setField('students', 'kip', numericOnly(e.target.value, 30))}
                      />
                      <label>Jenis Kelamin</label>
                      <label>Agama</label>
                      <select disabled={viewOnly} value={form.students.gender || 'L'} onChange={(e) => setField('students', 'gender', e.target.value)}>
                        <option value="L">Laki-laki</option>
                        <option value="P">Perempuan</option>
                      </select>
                      <select disabled={viewOnly} value={form.students.religion || ''} onChange={(e) => setField('students', 'religion', e.target.value)}>
                        <option value="">Pilih Agama</option>
                        {RELIGION_OPTIONS.map((agama) => (
                          <option key={agama} value={agama}>{agama}</option>
                        ))}
                      </select>
                      <label>Tempat Lahir</label>
                      <label>Tanggal Lahir</label>
                      <div className="stacked-select">
                        <input
                          disabled={viewOnly}
                          placeholder="Cari kabupaten/kota..."
                          value={birthPlaceSearch}
                          onChange={(e) => setBirthPlaceSearch(e.target.value)}
                        />
                        <select
                          disabled={viewOnly}
                          value={selectedBirthPlace}
                          onChange={(e) => {
                            setField('students', 'birth_place', e.target.value);
                            setBirthPlaceSearch(e.target.value);
                          }}
                        >
                          <option value="">Pilih Kabupaten/Kota</option>
                          {filteredRegencies.map((name) => (
                            <option key={name} value={name}>{name}</option>
                          ))}
                        </select>
                      </div>
                      <input disabled={viewOnly} type="date" value={form.students.birth_date || ''} onChange={(e) => setField('students', 'birth_date', e.target.value)} />
                    </div>
                  )}

                  {studentFormTab === 'academic' && (
                    <div className="student-compact-form">
                      <label>Kelas *</label>
                      <label>Status</label>
                      <select disabled={viewOnly} value={form.students.class_id || ''} onChange={(e) => setField('students', 'class_id', e.target.value)}>
                        <option value="">-- Pilih Kelas --</option>
                        {data.classes.map((cls) => <option key={cls.id} value={cls.id}>{cls.name}</option>)}
                      </select>
                      <select disabled={viewOnly} value={form.students.student_status || 'aktif'} onChange={(e) => setField('students', 'student_status', e.target.value)}>
                        <option value="aktif">Aktif</option>
                        <option value="pindah">Pindah</option>
                        <option value="lulus">Lulus</option>
                        <option value="keluar">Keluar</option>
                      </select>
                      <label>Tahun Ajaran</label>
                      <label>Tahun Masuk</label>
                      <select disabled={viewOnly} value={form.students.school_year_id || ''} onChange={(e) => setField('students', 'school_year_id', e.target.value)}>
                        <option value="">-- Pilih Tahun Ajaran --</option>
                        {data.schoolYears.map((sy) => <option key={sy.id} value={sy.id}>{sy.name}</option>)}
                      </select>
                      <input
                        disabled={viewOnly}
                        placeholder="Contoh: 2026"
                        value={entryYear}
                        onChange={(e) => {
                          const year = e.target.value.replace(/\D/g, '').slice(0, 4);
                          setField('students', 'entry_date', year ? `${year}-07-01` : '');
                        }}
                      />
                      <label className="full">Asal Madrasah</label>
                      <input className="full" disabled={viewOnly} value={form.students.previous_school || ''} onChange={(e) => setField('students', 'previous_school', e.target.value)} />
                      <label>NPSN Asal Madrasah</label>
                      <label>Pondok Pesantren</label>
                      <input disabled={viewOnly} value={form.students.school_origin_npsn || ''} onChange={(e) => setField('students', 'school_origin_npsn', e.target.value)} />
                      <select disabled={viewOnly} value={form.students.pondok_pesantren || ''} onChange={(e) => setField('students', 'pondok_pesantren', e.target.value)}>
                        <option value="">Pilih pondok pesantren</option>
                        {data.pondokPesantren.filter((ponpes) => Number(ponpes.is_active) === 1).map((ponpes) => (
                          <option key={ponpes.id || ponpes.name} value={ponpes.name}>{ponpes.name}</option>
                        ))}
                      </select>
                      <label>Hobi</label>
                      <label>Cita-cita</label>
                      <input disabled={viewOnly} value={form.students.hobby || ''} onChange={(e) => setField('students', 'hobby', e.target.value)} />
                      <input disabled={viewOnly} value={form.students.aspiration || ''} onChange={(e) => setField('students', 'aspiration', e.target.value)} />
                    </div>
                  )}

                  {studentFormTab === 'parents' && (
                    <div className="student-compact-form">
                      <label>NIK Ayah</label>
                      <label>Nama Ayah</label>
                      <input disabled={viewOnly} value={form.students.father_nik || ''} onChange={(e) => setField('students', 'father_nik', e.target.value)} />
                      <input disabled={viewOnly} value={form.students.father_name || ''} onChange={(e) => setField('students', 'father_name', e.target.value)} />
                      <label>Pekerjaan Ayah</label>
                      <label>No HP Ayah</label>
                      <input disabled={viewOnly} value={form.students.father_occupation || ''} onChange={(e) => setField('students', 'father_occupation', e.target.value)} />
                      <input disabled={viewOnly} value={form.students.father_phone || ''} onChange={(e) => setField('students', 'father_phone', e.target.value)} />
                      <label>NIK Ibu</label>
                      <label>Nama Ibu</label>
                      <input disabled={viewOnly} value={form.students.mother_nik || ''} onChange={(e) => setField('students', 'mother_nik', e.target.value)} />
                      <input disabled={viewOnly} value={form.students.mother_name || ''} onChange={(e) => setField('students', 'mother_name', e.target.value)} />
                      <label>Pekerjaan Ibu</label>
                      <label>No HP Ibu</label>
                      <input disabled={viewOnly} value={form.students.mother_occupation || ''} onChange={(e) => setField('students', 'mother_occupation', e.target.value)} />
                      <input disabled={viewOnly} value={form.students.mother_phone || ''} onChange={(e) => setField('students', 'mother_phone', e.target.value)} />
                      <label>NIK Wali</label>
                      <label>Nama Wali</label>
                      <input disabled={viewOnly} value={form.students.guardian_nik || ''} onChange={(e) => setField('students', 'guardian_nik', e.target.value)} />
                      <input disabled={viewOnly} value={form.students.guardian_name || ''} onChange={(e) => setField('students', 'guardian_name', e.target.value)} />
                      <label>Pekerjaan Wali</label>
                      <label>No HP Wali</label>
                      <input disabled={viewOnly} value={form.students.guardian_occupation || ''} onChange={(e) => setField('students', 'guardian_occupation', e.target.value)} />
                      <input disabled={viewOnly} value={form.students.guardian_phone || ''} onChange={(e) => setField('students', 'guardian_phone', e.target.value)} />
                    </div>
                  )}

                  {studentFormTab === 'address' && (
                    <div className="student-compact-form">
                      <label className="full">Alamat</label>
                      <textarea className="full" disabled={viewOnly} value={form.students.address || ''} onChange={(e) => setField('students', 'address', e.target.value)} />
                      <label>Dusun</label>
                      <label>RT</label>
                      <input disabled={viewOnly} value={form.students.address_dusun || ''} onChange={(e) => setField('students', 'address_dusun', e.target.value)} />
                      <input disabled={viewOnly} value={form.students.address_rt || ''} onChange={(e) => setField('students', 'address_rt', e.target.value)} />
                      <label>RW</label>
                      <label>Kelurahan / Desa</label>
                      <input disabled={viewOnly} value={form.students.address_rw || ''} onChange={(e) => setField('students', 'address_rw', e.target.value)} />
                      <input disabled={viewOnly} value={form.students.address_village || ''} onChange={(e) => setField('students', 'address_village', e.target.value)} />
                      <label>Kecamatan</label>
                      <label>Kabupaten/Kota</label>
                      <input disabled={viewOnly} value={form.students.address_subdistrict || ''} onChange={(e) => setField('students', 'address_subdistrict', e.target.value)} />
                      <input disabled={viewOnly} value={form.students.address_city || ''} onChange={(e) => setField('students', 'address_city', e.target.value)} />
                      <label>Provinsi</label>
                      <label>Kode Pos</label>
                      <input disabled={viewOnly} value={form.students.address_province || ''} onChange={(e) => setField('students', 'address_province', e.target.value)} />
                      <input disabled={viewOnly} value={form.students.postal_code || ''} onChange={(e) => setField('students', 'postal_code', e.target.value)} />
                    </div>
                  )}

                </div>
              </div>

              <aside className="student-profile-side">
                <article className="side-card">
                  <h4>STATISTIK SISWA</h4>
                  <div className="stats-mini">
                    <div><span>Total</span><strong>{totalRows}</strong></div>
                    <div><span>Aktif</span><strong>{visibleList.filter((s) => String(s.student_status || '').toLowerCase() === 'aktif').length}</strong></div>
                    <div><span>Alumni</span><strong>{visibleList.filter((s) => String(s.student_status || '').toLowerCase() === 'lulus').length}</strong></div>
                    <div><span>Prestasi</span><strong>{achievementStats.total}</strong></div>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 12 }}>
                    <strong>Prestasi Terbaru:</strong> {achievementStats.latestTitle}
                    <br />
                    <strong>Tingkat:</strong> {achievementStats.latestLevel}
                  </div>
                </article>
                <article className="side-card">
                  <h4>RIWAYAT AKADEMIK TERAKHIR</h4>
                  {reportLoading && <ul><li>Memuat data rapor...</li></ul>}
                  {!reportLoading && latestReport && (
                    <ul>
                      <li>{latestReport.school_year_name || '-'} - {latestReport.semester_name || '-'}</li>
                      <li>Rata-rata: {formatScore(latestReport.average_score)}</li>
                      <li>Jumlah Mapel: {latestReport.subject_count || 0}</li>
                      <li>Ekstra: {latestReport.report_meta?.extracurricular_activity || '-'}</li>
                    </ul>
                  )}
                  {!reportLoading && !latestReport && (
                    <ul><li>Belum ada data rapor</li></ul>
                  )}
                </article>
                <article className="side-card">
                  <h4>DOKUMEN</h4>
                  <div className="doc-grid">
                    {studentDocItems.map((item) => {
                      const doc = getStudentDocument(item.type);
                      const isUploading = uploadingDocKey === item.key;
                      return (
                        <div key={item.key} className="doc-item">
                          <button
                            type="button"
                            className="ghost"
                            disabled={isUploading}
                            onClick={() => {
                              if (viewOnly && doc?.file_url) {
                                window.open(api.resolveFileUrl(doc.file_url), '_blank', 'noopener,noreferrer');
                              } else {
                                studentDocInputRefs.current[item.key]?.click();
                              }
                            }}
                            title={doc?.file_url ? `Lihat ${item.label}` : `Upload ${item.label}`}
                          >
                            <input
                              type="file"
                              accept={item.accept}
                              style={{ display: 'none' }}
                              ref={(el) => { studentDocInputRefs.current[item.key] = el; }}
                              onChange={(e) => handleStudentDocumentUpload(item, e)}
                            />
                            {isUploading ? 'Uploading...' : item.label}
                          </button>
                          <small className={`doc-meta ${doc?.file_url ? 'ok' : 'pending'}`}>
                            {doc?.file_url ? `Terupload • ${formatDocDate(doc.updated_at || doc.created_at)}` : 'Belum upload'}
                          </small>
                        </div>
                      );
                    })}
                  </div>
                </article>
              </aside>
            </div>

            <div className="learning-history-card">
              <div className="learning-history-head">Riwayat Belajar</div>
              <div className="learning-history-table">
                <div className="learning-history-row head">
                  <span>Tahun Ajaran - Semester</span>
                  <span>Tanggal Mulai</span>
                  <span>Kelas</span>
                  <span>Status Keaktifan</span>
                  <span>Keterangan</span>
                </div>
                {historyLoading && (
                  <div className="learning-history-row">
                    <span>Memuat...</span><span>-</span><span>-</span><span>-</span><span>-</span>
                  </div>
                )}
                {!historyLoading && learningHistory.map((row) => (
                  <div className="learning-history-row" key={row.id}>
                    <span>{`${row.school_year_name || '-'}${row.semester_name ? ` - ${row.semester_name}` : ''}`}</span>
                    <span>{row.start_date || '-'}</span>
                    <span>{row.class_name || '-'}</span>
                    <span>{getHistoryStatusLabel(row)}</span>
                    <span>{getHistoryNotesLabel(row)}</span>
                  </div>
                ))}
                {!historyLoading && !learningHistory.length && (
                  <div className="learning-history-row">
                    <span>Belum ada riwayat belajar</span><span>-</span><span>-</span><span>-</span><span>-</span>
                  </div>
                )}
              </div>
            </div>

            <div className="learning-history-card">
              <div className="learning-history-head">Rekap Nilai Rapor</div>
              <div className="learning-history-table">
                <div className="learning-history-row head">
                  <span>Tahun Ajaran - Semester</span>
                  <span>Kelas</span>
                  <span>Jumlah Mapel</span>
                  <span>Rata-rata</span>
                  <span>Ekstrakurikuler</span>
                </div>
                {reportLoading && (
                  <div className="learning-history-row">
                    <span>Memuat...</span><span>-</span><span>-</span><span>-</span><span>-</span>
                  </div>
                )}
                {!reportLoading && reportHistory.map((row, idx) => (
                  <div className="learning-history-row" key={`${row.student_id}-${row.school_year_id || 0}-${row.semester_id || 0}-${idx}`}>
                    <span>{`${row.school_year_name || '-'}${row.semester_name ? ` - ${row.semester_name}` : ''}`}</span>
                    <span>{row.class_name || '-'}</span>
                    <span>{row.subject_count || 0}</span>
                    <span>{formatScore(row.average_score)}</span>
                    <span>{row.report_meta?.extracurricular_activity || '-'}</span>
                  </div>
                ))}
                {!reportLoading && !reportHistory.length && (
                  <div className="learning-history-row">
                    <span>Belum ada data nilai rapor</span><span>-</span><span>-</span><span>-</span><span>-</span>
                  </div>
                )}
              </div>
            </div>

            <div className="learning-history-card">
              <div className="learning-history-head">Prestasi Siswa</div>
              <div className="learning-history-table">
                <div className="learning-history-row head">
                  <span>Prestasi</span>
                  <span>Tingkat</span>
                  <span>Tanggal</span>
                  <span>Peringkat</span>
                  <span>Keterangan</span>
                </div>
                {achievementLoading && (
                  <div className="learning-history-row">
                    <span>Memuat...</span><span>-</span><span>-</span><span>-</span><span>-</span>
                  </div>
                )}
                {!achievementLoading && achievements.map((row) => (
                  <div className="learning-history-row" key={row.id}>
                    <span>{row.title || '-'}</span>
                    <span>{row.level_name || '-'}</span>
                    <span>{row.achievement_date || '-'}</span>
                    <span>{row.rank_value || '-'}</span>
                    <span>{row.achievement_type || '-'}</span>
                  </div>
                ))}
                {!achievementLoading && !achievements.length && (
                  <div className="learning-history-row">
                    <span>Belum ada data prestasi</span><span>-</span><span>-</span><span>-</span><span>-</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="actions student-form-actions">
            {!viewOnly && (
              <>
                <button className="ghost" onClick={() => { setShowForm(false); setViewOnly(false); }}>Batal</button>
                <button className="primary" disabled={currentErrors.length > 0} onClick={() => submit('students')}>
                  {editingId.students ? 'Update' : 'Simpan'}
                </button>
              </>
            )}
          </div>
          </section>
        </div>
      )}
    </>
  );
}
