import React, { useEffect, useMemo, useState } from 'react';

const INITIAL_SCORE_FORM = {
  id: null,
  student_id: '',
  class_id: '',
  subject_id: '',
  school_year_id: '',
  semester_id: '',
  score_value: '',
  achievement_note: ''
};

export function StudentScoresSection({ api, data, setError, pushToast }) {
  const [rows, setRows] = useState([]);
  const [subjectSettingsRows, setSubjectSettingsRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const [filterSchoolYearId, setFilterSchoolYearId] = useState('all');
  const [filterSemesterId, setFilterSemesterId] = useState('all');
  const [classQuery, setClassQuery] = useState('');

  const [showDetail, setShowDetail] = useState(false);
  const [detailClassId, setDetailClassId] = useState(null);
  const [detailQuery, setDetailQuery] = useState('');
  const [detailSubjectId, setDetailSubjectId] = useState('all');

  const [showForm, setShowForm] = useState(false);
  const [showBulkForm, setShowBulkForm] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [form, setForm] = useState(INITIAL_SCORE_FORM);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importClassId, setImportClassId] = useState('');

  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkMeta, setBulkMeta] = useState({
    class_id: '',
    subject_id: '',
    school_year_id: '',
    semester_id: '',
    mass_score: '',
    mass_note: ''
  });
  const [bulkRows, setBulkRows] = useState([]);

  const activeSchoolYear = useMemo(
    () => data.schoolYears.find((year) => Number(year.is_active) === 1),
    [data.schoolYears]
  );
  const activeSemester = useMemo(
    () => data.semesters.find((semester) => Number(semester.is_active) === 1),
    [data.semesters]
  );

  useEffect(() => {
    if (filterSchoolYearId === 'all' && activeSchoolYear?.id) setFilterSchoolYearId(String(activeSchoolYear.id));
    if (filterSemesterId === 'all' && activeSemester?.id) setFilterSemesterId(String(activeSemester.id));
  }, [filterSchoolYearId, filterSemesterId, activeSchoolYear?.id, activeSemester?.id]);

  const periodReady = filterSchoolYearId !== 'all' && filterSemesterId !== 'all';

  useEffect(() => {
    async function loadSubjectSettings() {
      if (!periodReady) {
        setSubjectSettingsRows([]);
        return;
      }
      try {
        const rowsResult = await api.classSubjectSettings.list({
          schoolYearId: filterSchoolYearId,
          semesterId: filterSemesterId
        });
        setSubjectSettingsRows(Array.isArray(rowsResult) ? rowsResult : []);
      } catch (err) {
        setError(err.message);
      }
    }
    loadSubjectSettings();
  }, [api, setError, periodReady, filterSchoolYearId, filterSemesterId]);

  async function loadRows() {
    if (!periodReady) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const list = await api.studentScores.list({
        schoolYearId: filterSchoolYearId,
        semesterId: filterSemesterId
      });
      setRows(Array.isArray(list) ? list : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRows();
  }, [filterSchoolYearId, filterSemesterId]);

  const settingsByClass = useMemo(() => {
    const map = new Map();
    subjectSettingsRows.forEach((row) => {
      const classId = Number(row.class_id);
      if (!map.has(classId)) map.set(classId, []);
      map.get(classId).push(row);
    });
    return map;
  }, [subjectSettingsRows]);

  const rowsByClass = useMemo(() => {
    const map = new Map();
    rows.forEach((row) => {
      const classId = Number(row.class_id);
      if (!map.has(classId)) map.set(classId, []);
      map.get(classId).push(row);
    });
    return map;
  }, [rows]);

  const classRows = useMemo(() => {
    const q = String(classQuery || '').trim().toLowerCase();
    return [...(data.classes || [])]
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'id'))
      .map((classItem) => {
        const classId = Number(classItem.id);
        const studentsCount = data.students.filter(
          (student) => Number(student.class_id) === classId && String(student.student_status || '').toLowerCase() === 'aktif'
        ).length;
        const classSubjects = settingsByClass.get(classId) || [];
        const classScores = rowsByClass.get(classId) || [];
        return {
          classId,
          className: classItem.name,
          studentsCount,
          subjectsCount: classSubjects.length,
          scoresCount: classScores.length
        };
      })
      .filter((row) => !q || row.className.toLowerCase().includes(q));
  }, [data.classes, data.students, settingsByClass, rowsByClass, classQuery]);

  function openDetail(classId) {
    setDetailClassId(Number(classId));
    setDetailQuery('');
    setDetailSubjectId('all');
    setShowDetail(true);
  }

  function openCreate(classId) {
    setForm({
      ...INITIAL_SCORE_FORM,
      class_id: String(classId),
      school_year_id: String(filterSchoolYearId),
      semester_id: String(filterSemesterId)
    });
    setShowForm(true);
  }

  function openEdit(row) {
    setForm({
      id: row.id,
      student_id: row.student_id ? String(row.student_id) : '',
      class_id: row.class_id ? String(row.class_id) : '',
      subject_id: row.subject_id ? String(row.subject_id) : '',
      school_year_id: row.school_year_id ? String(row.school_year_id) : '',
      semester_id: row.semester_id ? String(row.semester_id) : '',
      score_value: row.score_value ?? '',
      achievement_note: row.achievement_note || ''
    });
    setShowForm(true);
  }

  function openBulkCreate(classId) {
    setBulkMeta({
      class_id: String(classId),
      subject_id: '',
      school_year_id: String(filterSchoolYearId),
      semester_id: String(filterSemesterId),
      mass_score: '',
      mass_note: ''
    });
    setBulkRows([]);
    setShowBulkForm(true);
  }

  function openImport(classId) {
    setImportClassId(String(classId));
    setImportFile(null);
    setShowImportModal(true);
  }

  function downloadTemplate(classId) {
    if (!filterSchoolYearId || filterSchoolYearId === 'all' || !filterSemesterId || filterSemesterId === 'all') {
      pushToast?.('error', 'Periode belum dipilih', 'Pilih tahun ajaran dan semester terlebih dahulu.');
      return;
    }
    const url = api.studentScores.templateUrl({
      classId,
      schoolYearId: filterSchoolYearId,
      semesterId: filterSemesterId
    });
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  const allowedSubjectOptions = useMemo(() => {
    if (!form.class_id || !form.school_year_id || !form.semester_id) return [];
    const ids = (settingsByClass.get(Number(form.class_id)) || [])
      .filter((item) => Number(item.school_year_id) === Number(form.school_year_id) && Number(item.semester_id) === Number(form.semester_id))
      .map((item) => Number(item.subject_id));
    const idSet = new Set(ids);
    return [...(data.subjects || [])]
      .filter((item) => idSet.has(Number(item.id)))
      .sort((a, b) => (Number(a.display_order || 0) - Number(b.display_order || 0))
        || String(a.name || '').localeCompare(String(b.name || ''), 'id'));
  }, [form.class_id, form.school_year_id, form.semester_id, settingsByClass, data.subjects]);

  const bulkSubjectOptions = useMemo(() => {
    if (!bulkMeta.class_id || !bulkMeta.school_year_id || !bulkMeta.semester_id) return [];
    const ids = (settingsByClass.get(Number(bulkMeta.class_id)) || [])
      .filter((item) => Number(item.school_year_id) === Number(bulkMeta.school_year_id) && Number(item.semester_id) === Number(bulkMeta.semester_id))
      .map((item) => Number(item.subject_id));
    const idSet = new Set(ids);
    return [...(data.subjects || [])]
      .filter((item) => idSet.has(Number(item.id)))
      .sort((a, b) => (Number(a.display_order || 0) - Number(b.display_order || 0))
        || String(a.name || '').localeCompare(String(b.name || ''), 'id'));
  }, [bulkMeta.class_id, bulkMeta.school_year_id, bulkMeta.semester_id, settingsByClass, data.subjects]);

  const detailRows = useMemo(() => {
    if (!detailClassId) return [];
    const q = String(detailQuery || '').trim().toLowerCase();
    return [...(rowsByClass.get(Number(detailClassId)) || [])]
      .filter((row) => detailSubjectId === 'all' || String(row.subject_id) === String(detailSubjectId))
      .filter((row) => !q
        || String(row.student_name || '').toLowerCase().includes(q)
        || String(row.nis_local || '').toLowerCase().includes(q)
        || String(row.subject_name || '').toLowerCase().includes(q))
      .sort((a, b) => String(a.student_name || '').localeCompare(String(b.student_name || ''), 'id'));
  }, [rowsByClass, detailClassId, detailQuery, detailSubjectId]);

  async function submit() {
    try {
      await api.studentScores.upsert({
        student_id: Number(form.student_id),
        class_id: form.class_id ? Number(form.class_id) : null,
        subject_id: Number(form.subject_id),
        school_year_id: Number(form.school_year_id),
        semester_id: Number(form.semester_id),
        score_value: form.score_value === '' ? null : Number(form.score_value),
        achievement_note: form.achievement_note || null
      });
      pushToast?.('success', 'Nilai tersimpan', 'Nilai mapel berhasil disimpan.');
      setShowForm(false);
      setForm(INITIAL_SCORE_FORM);
      await loadRows();
    } catch (err) {
      setError(err.message);
      pushToast?.('error', 'Gagal simpan nilai', err.message);
    }
  }

  async function remove(id) {
    if (!confirm('Hapus data nilai ini?')) return;
    try {
      await api.studentScores.remove(id);
      pushToast?.('success', 'Nilai dihapus', 'Data nilai siswa berhasil dihapus.');
      await loadRows();
    } catch (err) {
      setError(err.message);
      pushToast?.('error', 'Gagal hapus nilai', err.message);
    }
  }

  async function loadBulkStudents() {
    if (!bulkMeta.class_id) return;
    setBulkLoading(true);
    try {
      const classStudents = data.students
        .filter((student) => Number(student.class_id) === Number(bulkMeta.class_id))
        .filter((student) => String(student.student_status || '').toLowerCase() === 'aktif')
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'id'));
      setBulkRows(classStudents.map((student) => ({
        student_id: student.id,
        student_name: student.name,
        nis_local: student.nis_local,
        class_id: student.class_id,
        score_value: '',
        achievement_note: ''
      })));
    } finally {
      setBulkLoading(false);
    }
  }

  function applyMassToBulkRows() {
    setBulkRows((prev) => prev.map((row) => ({
      ...row,
      score_value: bulkMeta.mass_score === '' ? row.score_value : bulkMeta.mass_score,
      achievement_note: bulkMeta.mass_note || row.achievement_note
    })));
  }

  function setBulkRow(index, field, value) {
    setBulkRows((prev) => prev.map((row, idx) => (idx === index ? { ...row, [field]: value } : row)));
  }

  async function submitBulk() {
    if (!bulkMeta.class_id || !bulkMeta.subject_id || !bulkMeta.school_year_id || !bulkMeta.semester_id) return;
    const items = bulkRows
      .filter((row) => row.score_value !== '' || row.achievement_note)
      .map((row) => ({
        student_id: row.student_id,
        class_id: Number(bulkMeta.class_id),
        subject_id: Number(bulkMeta.subject_id),
        school_year_id: Number(bulkMeta.school_year_id),
        semester_id: Number(bulkMeta.semester_id),
        score_value: row.score_value === '' ? null : Number(row.score_value),
        achievement_note: row.achievement_note || null
      }));

    if (!items.length) {
      pushToast?.('error', 'Tidak ada data', 'Isi minimal satu nilai siswa terlebih dahulu.');
      return;
    }

    setBulkSaving(true);
    try {
      await api.studentScores.bulkUpsert(items);
      pushToast?.('success', 'Input masal berhasil', `${items.length} data nilai tersimpan.`);
      setShowBulkForm(false);
      await loadRows();
    } catch (err) {
      setError(err.message);
      pushToast?.('error', 'Input masal gagal', err.message);
    } finally {
      setBulkSaving(false);
    }
  }

  async function submitImport() {
    if (!importClassId || !importFile) {
      pushToast?.('error', 'File belum dipilih', 'Pilih file Excel untuk import nilai.');
      return;
    }
    setImporting(true);
    try {
      const result = await api.studentScores.importXlsx({
        classId: importClassId,
        schoolYearId: filterSchoolYearId,
        semesterId: filterSemesterId,
        file: importFile
      });
      pushToast?.(
        'success',
        'Import nilai berhasil',
        `Insert: ${result.inserted || 0}, Update: ${result.updated || 0}, Siswa terpengaruh: ${result.affected_students || 0}`
      );
      setShowImportModal(false);
      setImportFile(null);
      await loadRows();
      if (showDetail && detailClassId && Number(detailClassId) === Number(importClassId)) {
        setDetailQuery('');
      }
    } catch (err) {
      setError(err.message);
      pushToast?.('error', 'Import nilai gagal', err.message);
    } finally {
      setImporting(false);
    }
  }

  const detailClassName = data.classes.find((item) => Number(item.id) === Number(detailClassId))?.name || '-';
  const activeYearName = data.schoolYears.find((item) => String(item.id) === String(filterSchoolYearId))?.name || '-';
  const activeSemesterName = data.semesters.find((item) => String(item.id) === String(filterSemesterId))?.name || '-';

  return (
    <>
      <section className="student-shell module-shell">
        <div className="student-filter-bar">
          <select className="filter" value={filterSchoolYearId} onChange={(e) => setFilterSchoolYearId(e.target.value)}>
            <option value="all">Pilih Tahun Ajaran</option>
            {data.schoolYears.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <select className="filter" value={filterSemesterId} onChange={(e) => setFilterSemesterId(e.target.value)}>
            <option value="all">Pilih Semester</option>
            {data.semesters.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <input className="filter full" placeholder="Cari kelas..." value={classQuery} onChange={(e) => setClassQuery(e.target.value)} />
        </div>

        {!periodReady && (
          <div className="module-empty-state">Pilih tahun ajaran dan semester terlebih dahulu.</div>
        )}

        {periodReady && (
          <div className="table-card student-table-card">
            <div className="student-table">
              <div className="student-table-head sticky" style={{ gridTemplateColumns: '1.4fr 1.2fr 1fr 0.9fr 0.9fr 1fr' }}>
                <span>Nama Kelas</span>
                <span>Tahun Ajaran</span>
                <span>Semester</span>
                <span>Jumlah Siswa</span>
                <span>Jumlah Mapel</span>
                <span>Aksi</span>
              </div>
              {loading && Array.from({ length: 6 }).map((_, i) => (
                <div className="student-table-row student-skeleton-row" style={{ gridTemplateColumns: '1.4fr 1.2fr 1fr 0.9fr 0.9fr 1fr' }} key={`score-class-sk-${i}`}>
                  <span className="student-skeleton" /><span className="student-skeleton" /><span className="student-skeleton" /><span className="student-skeleton" /><span className="student-skeleton" /><span className="student-skeleton" />
                </div>
              ))}
              {!loading && classRows.map((row) => (
                <div className="student-table-row" style={{ gridTemplateColumns: '1.4fr 1.2fr 1fr 0.9fr 0.9fr 1fr' }} key={row.classId}>
                  <span>{row.className}</span>
                  <span>{activeYearName}</span>
                  <span>{activeSemesterName}</span>
                  <span>{row.studentsCount}</span>
                  <span>{row.subjectsCount}</span>
                  <span className="student-cell-actions">
                    <button className="icon-btn" title="Download Template" onClick={() => downloadTemplate(row.classId)}>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>
                    </button>
                    <button className="icon-btn" title="Import Nilai Excel" onClick={() => openImport(row.classId)}>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 21V9" /><path d="m17 14-5-5-5 5" /><path d="M5 3h14" /></svg>
                    </button>
                    <button className="icon-btn" title="Detail Nilai" onClick={() => openDetail(row.classId)}>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12Z" /><circle cx="12" cy="12" r="3" /></svg>
                    </button>
                    <button className="icon-btn" title="Input Masal" onClick={() => openBulkCreate(row.classId)}>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14" /><path d="M5 12h14" /></svg>
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {showDetail && detailClassId && (
        <div className="student-modal-overlay" onClick={() => setShowDetail(false)}>
          <section className="student-modal student-modal-themed" onClick={(e) => e.stopPropagation()}>
            <div className="student-editor-head">
              <div>
                <h2>Detail Nilai Kelas</h2>
                <p>{detailClassName} | {activeYearName} / {activeSemesterName}</p>
              </div>
              <button className="ghost" onClick={() => setShowDetail(false)}>Tutup</button>
            </div>

            <div className="student-filter-bar">
              <select className="filter" value={detailSubjectId} onChange={(e) => setDetailSubjectId(e.target.value)}>
                <option value="all">Semua Mapel</option>
                {(settingsByClass.get(Number(detailClassId)) || []).map((item) => (
                  <option key={`${item.class_id}-${item.subject_id}`} value={item.subject_id}>{item.subject_name}</option>
                ))}
              </select>
              <input className="filter full" placeholder="Cari siswa / mapel..." value={detailQuery} onChange={(e) => setDetailQuery(e.target.value)} />
            </div>

            <div className="student-meta-bar">
              <span className="pill">Total nilai: {detailRows.length}</span>
              <div className="head-actions">
                <button className="btn-gradient" onClick={() => openCreate(detailClassId)}>Tambah Nilai</button>
                <button className="btn-import" onClick={() => downloadTemplate(detailClassId)}>Template Excel</button>
                <button className="btn-import" onClick={() => openImport(detailClassId)}>Import Excel</button>
                <button className="btn-import" onClick={() => openBulkCreate(detailClassId)}>Input Nilai Masal</button>
              </div>
            </div>

            <div className="table-card student-table-card">
              <div className="student-table">
                <div className="student-table-head sticky" style={{ gridTemplateColumns: '1.8fr 1fr 0.8fr 0.8fr 1fr 0.9fr' }}>
                  <span>Siswa</span>
                  <span>Mapel</span>
                  <span>KKM</span>
                  <span>Nilai</span>
                  <span>Capaian</span>
                  <span>Aksi</span>
                </div>
                {detailRows.map((row) => (
                  <div className="student-table-row" style={{ gridTemplateColumns: '1.8fr 1fr 0.8fr 0.8fr 1fr 0.9fr' }} key={row.id}>
                    <span className="student-cell-info">
                      <span>
                        <span className="student-name">{row.student_name || '-'}</span>
                        <span className="student-gender">NIS: {row.nis_local || '-'}</span>
                      </span>
                    </span>
                    <span>{row.subject_name || '-'}</span>
                    <span>{row.subject_kkm ?? '-'}</span>
                    <span>{row.score_value ?? '-'}</span>
                    <span>{row.achievement_note || '-'}</span>
                    <span className="student-cell-actions">
                      <button className="icon-btn" title="Edit" onClick={() => openEdit(row)}>
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9" /><path d="m16.5 3.5 4 4L7 21l-4 1 1-4 12.5-14.5Z" /></svg>
                      </button>
                      <button className="icon-btn danger" title="Hapus" onClick={() => remove(row.id)}>
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></svg>
                      </button>
                    </span>
                  </div>
                ))}
                {!detailRows.length && <div className="module-empty-state">Belum ada nilai untuk kelas ini pada periode terpilih.</div>}
              </div>
            </div>
          </section>
        </div>
      )}

      {showForm && (
        <div className="student-modal-overlay" onClick={() => setShowForm(false)}>
          <section className="student-modal student-modal-themed" onClick={(e) => e.stopPropagation()}>
            <div className="student-editor-head">
              <div>
                <h2>{form.id ? 'Edit Nilai Mapel' : 'Tambah Nilai Mapel'}</h2>
                <p>Input nilai per siswa, mapel, dan periode akademik.</p>
              </div>
              <button className="ghost" onClick={() => setShowForm(false)}>Tutup</button>
            </div>

            <div className="student-compact-form">
              <label>Siswa</label>
              <label>Kelas</label>
              <select value={form.student_id} onChange={(e) => setForm((prev) => ({ ...prev, student_id: e.target.value }))}>
                <option value="">Pilih Siswa</option>
                {data.students
                  .filter((item) => !form.class_id || Number(item.class_id) === Number(form.class_id))
                  .filter((item) => String(item.student_status || '').toLowerCase() === 'aktif')
                  .map((item) => <option key={item.id} value={item.id}>{item.name} ({item.nis_local || '-'})</option>)}
              </select>
              <select value={form.class_id} onChange={(e) => setForm((prev) => ({ ...prev, class_id: e.target.value, subject_id: '' }))}>
                <option value="">Pilih Kelas</option>
                {data.classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>

              <label>Mapel</label>
              <label>Nilai</label>
              <select value={form.subject_id} onChange={(e) => setForm((prev) => ({ ...prev, subject_id: e.target.value }))}>
                <option value="">Pilih Mapel</option>
                {allowedSubjectOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <input type="number" min="0" max="100" value={form.score_value} onChange={(e) => setForm((prev) => ({ ...prev, score_value: e.target.value }))} />

              <label>Tahun Ajaran</label>
              <label>Semester</label>
              <select value={form.school_year_id} onChange={(e) => setForm((prev) => ({ ...prev, school_year_id: e.target.value, subject_id: '' }))}>
                <option value="">Pilih Tahun Ajaran</option>
                {data.schoolYears.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <select value={form.semester_id} onChange={(e) => setForm((prev) => ({ ...prev, semester_id: e.target.value, subject_id: '' }))}>
                <option value="">Pilih Semester</option>
                {data.semesters.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>

              <label className="full">Catatan Capaian</label>
              <textarea className="full" value={form.achievement_note} onChange={(e) => setForm((prev) => ({ ...prev, achievement_note: e.target.value }))} />
            </div>

            <div className="actions student-form-actions">
              <button className="ghost" onClick={() => setShowForm(false)}>Batal</button>
              <button className="btn-gradient" onClick={submit} disabled={!form.student_id || !form.subject_id || !form.school_year_id || !form.semester_id || !form.class_id}>
                Simpan
              </button>
            </div>
          </section>
        </div>
      )}

      {showBulkForm && (
        <div className="student-modal-overlay" onClick={() => setShowBulkForm(false)}>
          <section className="student-modal student-modal-themed" onClick={(e) => e.stopPropagation()}>
            <div className="student-editor-head">
              <div>
                <h2>Input Nilai Masal</h2>
                <p>Isi nilai mapel satu kali untuk satu kelas.</p>
              </div>
              <button className="ghost" onClick={() => setShowBulkForm(false)}>Tutup</button>
            </div>

            <div className="student-compact-form">
              <label>Kelas</label>
              <label>Mapel</label>
              <select value={bulkMeta.class_id} onChange={(e) => setBulkMeta((prev) => ({ ...prev, class_id: e.target.value, subject_id: '' }))}>
                <option value="">Pilih Kelas</option>
                {data.classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <select value={bulkMeta.subject_id} onChange={(e) => setBulkMeta((prev) => ({ ...prev, subject_id: e.target.value }))}>
                <option value="">Pilih Mapel</option>
                {bulkSubjectOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>

              <label>Tahun Ajaran</label>
              <label>Semester</label>
              <select value={bulkMeta.school_year_id} onChange={(e) => setBulkMeta((prev) => ({ ...prev, school_year_id: e.target.value, subject_id: '' }))}>
                <option value="">Pilih Tahun Ajaran</option>
                {data.schoolYears.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <select value={bulkMeta.semester_id} onChange={(e) => setBulkMeta((prev) => ({ ...prev, semester_id: e.target.value, subject_id: '' }))}>
                <option value="">Pilih Semester</option>
                {data.semesters.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>

            <div className="actions student-form-actions" style={{ marginTop: 12 }}>
              <button className="btn-import" onClick={loadBulkStudents} disabled={!bulkMeta.class_id || bulkLoading}>
                {bulkLoading ? 'Memuat...' : 'Muat Siswa'}
              </button>
            </div>

            {!!bulkRows.length && (
              <>
                <div className="student-compact-form" style={{ marginTop: 12 }}>
                  <label>Nilai Untuk Semua</label>
                  <label>Catatan Untuk Semua</label>
                  <input type="number" min="0" max="100" value={bulkMeta.mass_score} onChange={(e) => setBulkMeta((prev) => ({ ...prev, mass_score: e.target.value }))} />
                  <input value={bulkMeta.mass_note} onChange={(e) => setBulkMeta((prev) => ({ ...prev, mass_note: e.target.value }))} />
                </div>
                <div className="actions student-form-actions" style={{ marginTop: 8 }}>
                  <button className="ghost" onClick={applyMassToBulkRows}>Terapkan ke Semua</button>
                </div>
                <div className="table-card student-table-card" style={{ marginTop: 12, maxHeight: '45vh', overflow: 'auto' }}>
                  <div className="student-table">
                    <div className="student-table-head sticky" style={{ gridTemplateColumns: '1.8fr 0.8fr 1.6fr' }}>
                      <span>Siswa</span>
                      <span>Nilai</span>
                      <span>Catatan</span>
                    </div>
                    {bulkRows.map((row, index) => (
                      <div className="student-table-row" style={{ gridTemplateColumns: '1.8fr 0.8fr 1.6fr' }} key={row.student_id}>
                        <span className="student-cell-info">
                          <span>
                            <span className="student-name">{row.student_name}</span>
                            <span className="student-gender">NIS: {row.nis_local || '-'}</span>
                          </span>
                        </span>
                        <span><input type="number" min="0" max="100" value={row.score_value} onChange={(e) => setBulkRow(index, 'score_value', e.target.value)} /></span>
                        <span><input value={row.achievement_note} onChange={(e) => setBulkRow(index, 'achievement_note', e.target.value)} /></span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div className="actions student-form-actions">
              <button className="ghost" onClick={() => setShowBulkForm(false)}>Batal</button>
              <button className="btn-gradient" onClick={submitBulk} disabled={bulkSaving || !bulkRows.length || !bulkMeta.subject_id || !bulkMeta.school_year_id || !bulkMeta.semester_id}>
                {bulkSaving ? 'Menyimpan...' : 'Simpan Masal'}
              </button>
            </div>
          </section>
        </div>
      )}

      {showImportModal && (
        <div className="student-modal-overlay" onClick={() => setShowImportModal(false)}>
          <section className="student-modal student-modal-themed" onClick={(e) => e.stopPropagation()}>
            <div className="student-editor-head">
              <div>
                <h2>Import Nilai Excel</h2>
                <p>
                  Kelas:{' '}
                  {data.classes.find((item) => String(item.id) === String(importClassId))?.name || '-'} | {activeYearName} / {activeSemesterName}
                </p>
              </div>
              <button className="ghost" onClick={() => setShowImportModal(false)}>Tutup</button>
            </div>

            <div className="student-compact-form">
              <label className="full">Langkah Import</label>
              <div className="full" style={{ color: '#64748b', fontSize: 13 }}>
                1) Download template sesuai kelas. 2) Isi nilai dan capaian per mapel. 3) Upload file Excel untuk proses otomatis.
              </div>
              <label>Template</label>
              <label>File Import</label>
              <button className="btn-import" type="button" onClick={() => downloadTemplate(importClassId)}>Download Template</button>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => setImportFile(e.target.files?.[0] || null)}
              />
            </div>

            <div className="actions student-form-actions">
              <button className="ghost" onClick={() => setShowImportModal(false)}>Batal</button>
              <button className="btn-gradient" onClick={submitImport} disabled={importing || !importFile}>
                {importing ? 'Mengimpor...' : 'Import Nilai'}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
