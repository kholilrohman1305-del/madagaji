import React, { useEffect, useMemo, useState } from 'react';

function toNumberOrNull(value) {
  if (value === '' || value === null || typeof value === 'undefined') return null;
  const num = Number(value);
  return Number.isNaN(num) ? null : num;
}

export function ClassSubjectSettingsSection({ api, data, setError, pushToast }) {
  const [loading, setLoading] = useState(false);
  const [settingsRows, setSettingsRows] = useState([]);
  const [filterSchoolYearId, setFilterSchoolYearId] = useState('all');
  const [filterSemesterId, setFilterSemesterId] = useState('all');

  const [detailClassId, setDetailClassId] = useState(null);
  const [settingClassId, setSettingClassId] = useState(null);
  const [settingSubjects, setSettingSubjects] = useState([]);
  const [showAddSubject, setShowAddSubject] = useState(false);

  const [showCopy, setShowCopy] = useState(false);
  const [copyTargets, setCopyTargets] = useState([]);

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

  const sortedSubjects = useMemo(() => {
    return [...(data.subjects || [])]
      .filter((item) => Number(item.is_active) === 1)
      .sort((a, b) => (Number(a.display_order || 0) - Number(b.display_order || 0))
        || String(a.name || '').localeCompare(String(b.name || ''), 'id'));
  }, [data.subjects]);

  const settingsByClass = useMemo(() => {
    const map = new Map();
    settingsRows.forEach((row) => {
      const classId = Number(row.class_id);
      if (!map.has(classId)) map.set(classId, []);
      map.get(classId).push(row);
    });
    return map;
  }, [settingsRows]);

  async function loadSettings() {
    if (!periodReady) {
      setSettingsRows([]);
      return;
    }
    setLoading(true);
    try {
      const rows = await api.classSubjectSettings.list({
        schoolYearId: filterSchoolYearId,
        semesterId: filterSemesterId
      });
      setSettingsRows(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSettings();
  }, [filterSchoolYearId, filterSemesterId]);

  const classRows = useMemo(() => {
    return [...(data.classes || [])]
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'id'))
      .map((classItem) => {
        const classId = Number(classItem.id);
        const studentsCount = data.students.filter(
          (student) => Number(student.class_id) === classId && String(student.student_status || '').toLowerCase() === 'aktif'
        ).length;
        const configuredSubjects = settingsByClass.get(classId) || [];
        const kkmNumbers = configuredSubjects
          .map((item) => Number(item.subject_kkm))
          .filter((val) => !Number.isNaN(val));
        const avgKkm = kkmNumbers.length
          ? (kkmNumbers.reduce((sum, val) => sum + val, 0) / kkmNumbers.length).toFixed(2)
          : '-';

        return {
          classId,
          className: classItem.name,
          schoolYearName: data.schoolYears.find((item) => String(item.id) === String(filterSchoolYearId))?.name || '-',
          semesterName: data.semesters.find((item) => String(item.id) === String(filterSemesterId))?.name || '-',
          studentsCount,
          subjectsCount: configuredSubjects.length,
          avgKkm
        };
      });
  }, [data.classes, data.students, data.schoolYears, data.semesters, filterSchoolYearId, filterSemesterId, settingsByClass]);

  function openSetting(classId) {
    const rows = (settingsByClass.get(Number(classId)) || [])
      .sort((a, b) => (Number(a.subject_display_order || 0) - Number(b.subject_display_order || 0))
        || String(a.subject_name || '').localeCompare(String(b.subject_name || ''), 'id'))
      .map((row, idx) => ({
        subject_id: Number(row.subject_id),
        subject_name: row.subject_name,
        group_name: row.subject_group_name || '-',
        kkm: row.subject_kkm ?? '',
        display_order: row.subject_display_order || idx + 1
      }));
    setSettingClassId(Number(classId));
    setSettingSubjects(rows);
    setShowAddSubject(false);
    setCopyTargets([]);
    setShowCopy(false);
  }

  function updateSettingSubject(index, field, value) {
    setSettingSubjects((prev) => prev.map((item, idx) => (
      idx === index ? { ...item, [field]: value } : item
    )));
  }

  function removeSettingSubject(subjectId) {
    setSettingSubjects((prev) => prev.filter((item) => Number(item.subject_id) !== Number(subjectId)));
  }

  const selectedSubjectIdSet = useMemo(
    () => new Set(settingSubjects.map((item) => Number(item.subject_id))),
    [settingSubjects]
  );

  const addableSubjects = useMemo(
    () => sortedSubjects.filter((item) => !selectedSubjectIdSet.has(Number(item.id))),
    [sortedSubjects, selectedSubjectIdSet]
  );

  function addSubjectToSetting(subject) {
    setSettingSubjects((prev) => [
      ...prev,
      {
        subject_id: Number(subject.id),
        subject_name: subject.name,
        group_name: subject.group_name || '-',
        kkm: subject.kkm ?? '',
        display_order: prev.length + 1
      }
    ]);
  }

  async function saveSettings() {
    if (!settingClassId || !periodReady) return;
    if (!settingSubjects.length) {
      pushToast?.('error', 'Mapel kosong', 'Tambahkan minimal 1 mapel untuk disimpan.');
      return;
    }

    const payloadSubjects = settingSubjects.map((item, idx) => ({
      subject_id: Number(item.subject_id),
      kkm: toNumberOrNull(item.kkm),
      display_order: toNumberOrNull(item.display_order) || (idx + 1)
    }));

    try {
      await api.classSubjectSettings.upsertPeriod({
        class_id: Number(settingClassId),
        school_year_id: Number(filterSchoolYearId),
        semester_id: Number(filterSemesterId),
        subjects: payloadSubjects
      });
      pushToast?.('success', 'Setting tersimpan', 'Mapel kelas berhasil diperbarui.');
      await loadSettings();
      setSettingClassId(null);
    } catch (err) {
      setError(err.message);
      pushToast?.('error', 'Gagal simpan setting', err.message);
    }
  }

  async function copyFromPrevious() {
    if (!settingClassId || !periodReady) return;
    try {
      await api.classSubjectSettings.copyFromPrevious({
        class_id: Number(settingClassId),
        school_year_id: Number(filterSchoolYearId),
        semester_id: Number(filterSemesterId)
      });
      const rows = await api.classSubjectSettings.list({
        classId: settingClassId,
        schoolYearId: filterSchoolYearId,
        semesterId: filterSemesterId
      });
      setSettingSubjects((rows || []).map((row, idx) => ({
        subject_id: Number(row.subject_id),
        subject_name: row.subject_name,
        group_name: row.subject_group_name || '-',
        kkm: row.subject_kkm ?? '',
        display_order: row.subject_display_order || idx + 1
      })));
      await loadSettings();
      pushToast?.('success', 'Copy berhasil', 'Mapel dari periode sebelumnya berhasil dimuat.');
    } catch (err) {
      setError(err.message);
      pushToast?.('error', 'Gagal copy periode sebelumnya', err.message);
    }
  }

  async function copyToClasses() {
    if (!copyTargets.length || !settingClassId || !periodReady) {
      pushToast?.('error', 'Kelas tujuan kosong', 'Pilih minimal satu kelas tujuan.');
      return;
    }
    try {
      await api.classSubjectSettings.copyPeriod({
        source_class_id: Number(settingClassId),
        target_class_ids: copyTargets.map(Number),
        school_year_id: Number(filterSchoolYearId),
        semester_id: Number(filterSemesterId)
      });
      pushToast?.('success', 'Copy berhasil', `Setting mapel berhasil dicopy ke ${copyTargets.length} kelas.`);
      setShowCopy(false);
      setCopyTargets([]);
      await loadSettings();
    } catch (err) {
      setError(err.message);
      pushToast?.('error', 'Gagal copy setting', err.message);
    }
  }

  const detailRows = useMemo(() => {
    if (!detailClassId) return [];
    return [...(settingsByClass.get(Number(detailClassId)) || [])].sort((a, b) => (
      Number(a.subject_display_order || 0) - Number(b.subject_display_order || 0)
    ) || String(a.subject_name || '').localeCompare(String(b.subject_name || ''), 'id'));
  }, [detailClassId, settingsByClass]);

  const settingClassName = data.classes.find((item) => Number(item.id) === Number(settingClassId))?.name || '-';
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
          <div className="filter full" style={{ display: 'flex', alignItems: 'center', color: '#64748b' }}>
            Mapel diatur per kelas, per tahun ajaran, dan per semester.
          </div>
        </div>

        {!periodReady && (
          <div className="module-empty-state">
            Pilih tahun ajaran dan semester terlebih dahulu.
          </div>
        )}

        {periodReady && (
          <div className="table-card student-table-card">
            <div className="student-table">
              <div className="student-table-head sticky" style={{ gridTemplateColumns: '1.3fr 1.2fr 1fr 0.9fr 0.9fr 0.7fr 1fr' }}>
                <span>Nama Kelas</span>
                <span>Tahun Ajaran Aktif</span>
                <span>Semester Aktif</span>
                <span>Jumlah Siswa</span>
                <span>Jumlah Mapel</span>
                <span>KKM</span>
                <span>Aksi</span>
              </div>
              {loading && Array.from({ length: 6 }).map((_, i) => (
                <div className="student-table-row student-skeleton-row" style={{ gridTemplateColumns: '1.3fr 1.2fr 1fr 0.9fr 0.9fr 0.7fr 1fr' }} key={`css-sk-${i}`}>
                  <span className="student-skeleton" /><span className="student-skeleton" /><span className="student-skeleton" /><span className="student-skeleton" /><span className="student-skeleton" /><span className="student-skeleton" /><span className="student-skeleton" />
                </div>
              ))}
              {!loading && classRows.map((row) => (
                <div className="student-table-row" style={{ gridTemplateColumns: '1.3fr 1.2fr 1fr 0.9fr 0.9fr 0.7fr 1fr' }} key={row.classId}>
                  <span>{row.className}</span>
                  <span>{row.schoolYearName}</span>
                  <span>{row.semesterName}</span>
                  <span>{row.studentsCount}</span>
                  <span>{row.subjectsCount}</span>
                  <span>{row.avgKkm}</span>
                  <span className="student-cell-actions">
                    <button className="icon-btn" title="Detail" onClick={() => setDetailClassId(row.classId)}>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12Z" /><circle cx="12" cy="12" r="3" /></svg>
                    </button>
                    <button className="icon-btn" title="Setting" onClick={() => openSetting(row.classId)}>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9" /><path d="m16.5 3.5 4 4L7 21l-4 1 1-4 12.5-14.5Z" /></svg>
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {detailClassId && (
        <div className="student-modal-overlay" onClick={() => setDetailClassId(null)}>
          <section className="student-modal student-modal-themed" onClick={(e) => e.stopPropagation()}>
            <div className="student-editor-head">
              <div>
                <h2>Detail Setting Mapel</h2>
                <p>{detailClassName} | {activeYearName} / {activeSemesterName}</p>
              </div>
              <button className="ghost" onClick={() => setDetailClassId(null)}>Tutup</button>
            </div>
            <div className="table-card student-table-card">
              <div className="student-table">
                <div className="student-table-head sticky" style={{ gridTemplateColumns: '1.4fr 1fr 0.8fr 0.8fr' }}>
                  <span>Mapel</span>
                  <span>Kelompok</span>
                  <span>KKM</span>
                  <span>Urutan</span>
                </div>
                {detailRows.map((item) => (
                  <div className="student-table-row" style={{ gridTemplateColumns: '1.4fr 1fr 0.8fr 0.8fr' }} key={item.id}>
                    <span>{item.subject_name}</span>
                    <span>{item.subject_group_name || '-'}</span>
                    <span>{item.subject_kkm ?? '-'}</span>
                    <span>{item.subject_display_order ?? 0}</span>
                  </div>
                ))}
                {!detailRows.length && <div className="module-empty-state">Belum ada mapel terpilih untuk kelas ini.</div>}
              </div>
            </div>
          </section>
        </div>
      )}

      {settingClassId && (
        <div className="student-modal-overlay" onClick={() => setSettingClassId(null)}>
          <section className="student-modal student-modal-themed" onClick={(e) => e.stopPropagation()}>
            <div className="student-editor-head">
              <div>
                <h2>Setting Mapel Kelas</h2>
                <p>{settingClassName} | {activeYearName} / {activeSemesterName}</p>
              </div>
              <button className="ghost" onClick={() => setSettingClassId(null)}>Tutup</button>
            </div>

            <div className="student-meta-bar">
              <span className="pill">Mapel terpilih: {settingSubjects.length}</span>
              <div className="head-actions">
                <button className="btn-import" onClick={() => setShowAddSubject((prev) => !prev)}>
                  {showAddSubject ? 'Sembunyikan Tambah Mapel' : 'Tambah Mapel'}
                </button>
                <button className="btn-export" onClick={copyFromPrevious}>Copy Semester Sebelumnya</button>
                <button className="btn-import" onClick={() => setShowCopy(true)}>Copy ke Kelas Lain</button>
              </div>
            </div>

            <div className="table-card student-table-card">
              <div className="student-table">
                <div className="student-table-head sticky" style={{ gridTemplateColumns: '1.2fr 1fr 0.8fr 0.8fr 0.6fr' }}>
                  <span>Mapel Terpilih</span>
                  <span>Kelompok</span>
                  <span>KKM</span>
                  <span>Urutan</span>
                  <span>Aksi</span>
                </div>
                {settingSubjects.map((item, index) => (
                  <div className="student-table-row" style={{ gridTemplateColumns: '1.2fr 1fr 0.8fr 0.8fr 0.6fr' }} key={item.subject_id}>
                    <span>{item.subject_name}</span>
                    <span>{item.group_name || '-'}</span>
                    <span>
                      <input
                        type="number"
                        min="0"
                        value={item.kkm}
                        onChange={(e) => updateSettingSubject(index, 'kkm', e.target.value)}
                      />
                    </span>
                    <span>
                      <input
                        type="number"
                        min="1"
                        value={item.display_order}
                        onChange={(e) => updateSettingSubject(index, 'display_order', e.target.value)}
                      />
                    </span>
                    <span className="student-cell-actions">
                      <button className="icon-btn danger" title="Hapus Mapel" onClick={() => removeSettingSubject(item.subject_id)}>
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></svg>
                      </button>
                    </span>
                  </div>
                ))}
                {!settingSubjects.length && <div className="module-empty-state">Belum ada mapel. Klik "Tambah Mapel".</div>}
              </div>
            </div>

            {showAddSubject && (
              <div className="table-card student-table-card" style={{ marginTop: 12 }}>
                <div className="student-table">
                  <div className="student-table-head sticky" style={{ gridTemplateColumns: '1.3fr 1fr 0.8fr 0.8fr 0.7fr' }}>
                    <span>Mapel Tersedia</span>
                    <span>Kelompok</span>
                    <span>KKM</span>
                    <span>Urutan</span>
                    <span>Aksi</span>
                  </div>
                  {addableSubjects.map((item) => (
                    <div className="student-table-row" style={{ gridTemplateColumns: '1.3fr 1fr 0.8fr 0.8fr 0.7fr' }} key={item.id}>
                      <span>{item.name}</span>
                      <span>{item.group_name || '-'}</span>
                      <span>{item.kkm ?? '-'}</span>
                      <span>{item.display_order ?? 0}</span>
                      <span className="student-cell-actions">
                        <button className="icon-btn" title="Tambah" onClick={() => addSubjectToSetting(item)}>
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14" /><path d="M5 12h14" /></svg>
                        </button>
                      </span>
                    </div>
                  ))}
                  {!addableSubjects.length && <div className="module-empty-state">Semua mapel aktif sudah dipilih.</div>}
                </div>
              </div>
            )}

            <div className="actions student-form-actions">
              <button className="ghost" onClick={() => setSettingClassId(null)}>Batal</button>
              <button className="btn-gradient" onClick={saveSettings} disabled={!settingSubjects.length}>Simpan Setting</button>
            </div>
          </section>
        </div>
      )}

      {showCopy && settingClassId && (
        <div className="student-modal-overlay" onClick={() => setShowCopy(false)}>
          <section className="student-modal student-modal-themed" onClick={(e) => e.stopPropagation()}>
            <div className="student-editor-head">
              <div>
                <h2>Copy Setting Mapel</h2>
                <p>Copy dari {settingClassName} ke kelas tujuan pada {activeYearName} / {activeSemesterName}.</p>
              </div>
              <button className="ghost" onClick={() => setShowCopy(false)}>Tutup</button>
            </div>
            <div className="student-compact-form">
              <label className="full">Kelas Tujuan</label>
              <div className="full" style={{ display: 'grid', gap: 8 }}>
                {data.classes.filter((item) => Number(item.id) !== Number(settingClassId)).map((item) => (
                  <label key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={copyTargets.includes(Number(item.id))}
                      onChange={(e) => {
                        const value = Number(item.id);
                        setCopyTargets((prev) => (
                          e.target.checked ? [...prev, value] : prev.filter((id) => id !== value)
                        ));
                      }}
                    />
                    <span>{item.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="actions student-form-actions">
              <button className="ghost" onClick={() => setShowCopy(false)}>Batal</button>
              <button className="btn-gradient" onClick={copyToClasses}>Copy Sekarang</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
