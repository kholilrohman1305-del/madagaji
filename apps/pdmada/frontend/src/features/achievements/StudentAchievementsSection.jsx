import React, { useEffect, useMemo, useState } from 'react';

const EMPTY_FORM = {
  id: null,
  student_id: '',
  title: '',
  achievement_category: 'akademik',
  achievement_type: '',
  level_name: '',
  organizer: '',
  achievement_date: '',
  rank_value: '',
  notes: '',
  is_active: 1
};

export function StudentAchievementsSection({ api, data, setError, pushToast }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [extracurriculars, setExtracurriculars] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [studentSearch, setStudentSearch] = useState('');
  const [showStudentOptions, setShowStudentOptions] = useState(false);
  const [filterClassId, setFilterClassId] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  async function loadRows() {
    setLoading(true);
    try {
      const list = await api.studentAffairs.listAchievements();
      setRows(Array.isArray(list) ? list : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadExtracurriculars() {
    try {
      const list = await api.extracurriculars.list();
      setExtracurriculars(Array.isArray(list) ? list : []);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadRows();
    loadExtracurriculars();
  }, []);

  const classByStudentId = useMemo(() => {
    const map = new Map();
    (data.students || []).forEach((student) => {
      map.set(Number(student.id), Number(student.class_id || 0));
    });
    return map;
  }, [data.students]);

  const classNameById = useMemo(() => {
    const map = new Map();
    (data.classes || []).forEach((cls) => map.set(Number(cls.id), cls.name || '-'));
    return map;
  }, [data.classes]);

  const activeStudents = useMemo(() => (
    (data.students || [])
      .filter((student) => String(student.student_status || '').toLowerCase() === 'aktif')
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'id'))
  ), [data.students]);

  const selectedStudent = useMemo(
    () => activeStudents.find((student) => Number(student.id) === Number(form.student_id)) || null,
    [activeStudents, form.student_id]
  );

  const studentOptions = useMemo(() => {
    const q = String(studentSearch || '').trim().toLowerCase();
    return activeStudents
      .filter((student) => {
        if (!q) return true;
        const className = classNameById.get(Number(student.class_id || 0)) || '';
        return (
          String(student.name || '').toLowerCase().includes(q)
          || String(student.nis_local || '').toLowerCase().includes(q)
          || String(className).toLowerCase().includes(q)
        );
      })
      .slice(0, 20);
  }, [activeStudents, studentSearch, classNameById]);

  const filteredRows = useMemo(() => {
    const q = String(query || '').trim().toLowerCase();
    return rows.filter((row) => {
      const studentClassId = classByStudentId.get(Number(row.student_id)) || 0;
      if (filterClassId !== 'all' && Number(filterClassId) !== studentClassId) return false;
      const category = String(row.achievement_category || 'akademik').toLowerCase();
      if (filterCategory !== 'all' && category !== filterCategory) return false;
      if (!q) return true;
      return (
        String(row.student_name || '').toLowerCase().includes(q)
        || String(row.title || '').toLowerCase().includes(q)
        || String(row.level_name || '').toLowerCase().includes(q)
        || String(row.rank_value || '').toLowerCase().includes(q)
      );
    });
  }, [rows, query, filterClassId, filterCategory, classByStudentId]);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pagedRows = useMemo(
    () => filteredRows.slice((page - 1) * pageSize, page * pageSize),
    [filteredRows, page, pageSize]
  );

  useEffect(() => {
    setPage(1);
  }, [query, filterClassId, filterCategory, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  function openCreate() {
    setForm({ ...EMPTY_FORM });
    setStudentSearch('');
    setShowStudentOptions(false);
    setShowForm(true);
  }

  function openEdit(item) {
    setForm({
      id: item.id,
      student_id: item.student_id ? String(item.student_id) : '',
      title: item.title || '',
      achievement_category: item.achievement_category === 'non_akademik' ? 'non_akademik' : 'akademik',
      achievement_type: item.achievement_type || '',
      level_name: item.level_name || '',
      organizer: item.organizer || '',
      achievement_date: item.achievement_date || '',
      rank_value: item.rank_value || '',
      notes: item.notes || '',
      is_active: Number(item.is_active) === 0 ? 0 : 1
    });
    const student = (data.students || []).find((s) => Number(s.id) === Number(item.student_id));
    setStudentSearch(student ? `${student.name} | ${classNameById.get(Number(student.class_id || 0)) || '-'}` : '');
    setShowStudentOptions(false);
    setShowForm(true);
  }

  async function submit() {
    if (!form.student_id || !String(form.title || '').trim()) {
      pushToast?.('error', 'Validasi gagal', 'Siswa dan judul prestasi wajib diisi.');
      return;
    }
    try {
      const payload = {
        student_id: Number(form.student_id),
        title: form.title,
        achievement_category: form.achievement_category === 'non_akademik' ? 'non_akademik' : 'akademik',
        achievement_type: form.achievement_type || null,
        level_name: form.level_name || null,
        organizer: form.organizer || null,
        achievement_date: form.achievement_date || null,
        rank_value: form.rank_value || null,
        notes: form.notes || null,
        is_active: Number(form.is_active) === 0 ? 0 : 1
      };
      if (form.id) {
        await api.studentAffairs.updateAchievement(form.id, payload);
      } else {
        await api.studentAffairs.createAchievement(payload);
      }
      await loadRows();
      setShowForm(false);
      setForm({ ...EMPTY_FORM });
      setStudentSearch('');
      setShowStudentOptions(false);
      pushToast?.('success', 'Prestasi tersimpan', 'Data prestasi siswa berhasil disimpan.');
    } catch (err) {
      setError(err.message);
      pushToast?.('error', 'Gagal simpan', err.message);
    }
  }

  async function remove(id) {
    if (!window.confirm('Hapus prestasi ini?')) return;
    try {
      await api.studentAffairs.deleteAchievement(id);
      await loadRows();
      pushToast?.('success', 'Prestasi dihapus', 'Data prestasi siswa berhasil dihapus.');
    } catch (err) {
      setError(err.message);
      pushToast?.('error', 'Gagal hapus', err.message);
    }
  }

  return (
    <>
      <section className="student-shell module-shell">
        <div className="student-filter-bar">
          <select className="filter" value={filterClassId} onChange={(e) => setFilterClassId(e.target.value)}>
            <option value="all">Semua Kelas</option>
            {data.classes.map((cls) => (
              <option key={cls.id} value={cls.id}>{cls.name}</option>
            ))}
          </select>
          <select className="filter" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
            <option value="all">Semua Kriteria</option>
            <option value="akademik">Prestasi Akademik</option>
            <option value="non_akademik">Prestasi Non Akademik</option>
          </select>
          <input className="filter full" placeholder="Cari siswa / prestasi..." value={query} onChange={(e) => setQuery(e.target.value)} />
          <button className="btn-gradient" onClick={openCreate}>Tambah Prestasi</button>
        </div>

        <div className="student-meta-bar">
          <span className="pill">Total prestasi: {filteredRows.length}</span>
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
        </div>

        <div className="table-card student-table-card">
          <div className="student-table">
            <div className="student-table-head sticky" style={{ gridTemplateColumns: '1.3fr 0.9fr 0.8fr 0.9fr 0.8fr 0.8fr 1fr' }}>
              <span>Siswa / Prestasi</span>
              <span>Kriteria</span>
              <span>Kelas</span>
              <span>Tanggal</span>
              <span>Tingkat</span>
              <span>Peringkat</span>
              <span>Aksi</span>
            </div>
            {loading && Array.from({ length: 5 }).map((_, index) => (
              <div className="student-table-row student-skeleton-row" style={{ gridTemplateColumns: '1.3fr 0.9fr 0.8fr 0.9fr 0.8fr 0.8fr 1fr' }} key={`ach-sk-${index}`}>
                <span className="student-skeleton" /><span className="student-skeleton" /><span className="student-skeleton" /><span className="student-skeleton" /><span className="student-skeleton" /><span className="student-skeleton" /><span className="student-skeleton" />
              </div>
            ))}
            {!loading && pagedRows.map((item) => {
              const classId = classByStudentId.get(Number(item.student_id)) || 0;
              return (
                <div className="student-table-row" style={{ gridTemplateColumns: '1.3fr 0.9fr 0.8fr 0.9fr 0.8fr 0.8fr 1fr' }} key={item.id}>
                  <span className="student-cell-info">
                    <span>
                      <span className="student-name">{item.student_name || '-'}</span>
                      <span className="student-gender">{item.title || '-'}{item.achievement_type ? ` · ${item.achievement_type}` : ''}</span>
                    </span>
                  </span>
                  <span>{String(item.achievement_category || 'akademik') === 'non_akademik' ? 'Non Akademik' : 'Akademik'}</span>
                  <span>{classNameById.get(classId) || '-'}</span>
                  <span>{item.achievement_date || '-'}</span>
                  <span>{item.level_name || '-'}</span>
                  <span>{item.rank_value || '-'}</span>
                  <span className="student-cell-actions">
                    <button className="icon-btn" title="Edit" onClick={() => openEdit(item)}>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9" /><path d="m16.5 3.5 4 4L7 21l-4 1 1-4 12.5-14.5Z" /></svg>
                    </button>
                    <button className="icon-btn danger" title="Hapus" onClick={() => remove(item.id)}>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></svg>
                    </button>
                  </span>
                </div>
              );
            })}
            {!loading && !filteredRows.length && <div className="module-empty-state">Belum ada data prestasi.</div>}
          </div>
        </div>
      </section>

      {showForm && (
        <div className="student-modal-overlay" onClick={() => setShowForm(false)}>
          <section className="student-modal student-modal-themed" onClick={(e) => e.stopPropagation()}>
            <div className="student-editor-head">
              <div>
                <h2>{form.id ? 'Edit Prestasi Siswa' : 'Tambah Prestasi Siswa'}</h2>
                <p>Kelola prestasi siswa untuk identitas potensi.</p>
              </div>
              <button className="ghost" onClick={() => setShowForm(false)}>Tutup</button>
            </div>

            <div className="student-compact-form">
              <label>Siswa *</label>
              <label>Judul Prestasi *</label>
              <div style={{ position: 'relative' }}>
                <input
                  value={studentSearch}
                  placeholder="Cari nama siswa / kelas / NIS..."
                  onFocus={() => setShowStudentOptions(true)}
                  onBlur={() => window.setTimeout(() => setShowStudentOptions(false), 120)}
                  onChange={(e) => {
                    setStudentSearch(e.target.value);
                    setShowStudentOptions(true);
                    if (selectedStudent && !String(e.target.value || '').includes(selectedStudent.name)) {
                      setForm((prev) => ({ ...prev, student_id: '' }));
                    }
                  }}
                />
                {showStudentOptions && (
                  <div className="student-search-options">
                    {!studentOptions.length && (
                      <button type="button" className="student-search-option" onMouseDown={(e) => e.preventDefault()}>
                        Tidak ada siswa ditemukan
                      </button>
                    )}
                    {studentOptions.map((student) => {
                      const className = classNameById.get(Number(student.class_id || 0)) || '-';
                      return (
                        <button
                          type="button"
                          key={student.id}
                          className="student-search-option"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setForm((prev) => ({ ...prev, student_id: String(student.id) }));
                            setStudentSearch(`${student.name} | ${className}`);
                            setShowStudentOptions(false);
                          }}
                        >
                          <strong>{student.name}</strong>
                          <span>{className} | {student.nis_local || '-'}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <input value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} />

              <label>Kriteria Prestasi</label>
              <label>Jenis</label>
              <select
                value={form.achievement_category}
                onChange={(e) => setForm((prev) => ({ ...prev, achievement_category: e.target.value, achievement_type: '' }))}
              >
                <option value="akademik">Prestasi Akademik</option>
                <option value="non_akademik">Prestasi Non Akademik</option>
              </select>
              {form.achievement_category === 'akademik' ? (
                <select value={form.achievement_type} onChange={(e) => setForm((prev) => ({ ...prev, achievement_type: e.target.value }))}>
                  <option value="">Pilih Mapel</option>
                  {(data.subjects || [])
                    .filter((item) => Number(item.is_active) === 1)
                    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'id'))
                    .map((item) => (
                      <option key={item.id} value={item.name}>{item.name}</option>
                    ))}
                </select>
              ) : (
                <select value={form.achievement_type} onChange={(e) => setForm((prev) => ({ ...prev, achievement_type: e.target.value }))}>
                  <option value="">Pilih Ekstrakurikuler</option>
                  {extracurriculars
                    .filter((item) => Number(item.is_active) === 1)
                    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'id'))
                    .map((item) => (
                      <option key={item.id} value={item.name}>{item.name}</option>
                    ))}
                </select>
              )}

              <label>Tingkat</label>
              <label>Penyelenggara</label>
              <select value={form.level_name} onChange={(e) => setForm((prev) => ({ ...prev, level_name: e.target.value }))}>
                <option value="">Pilih Tingkat</option>
                <option value="Kecamatan">Kecamatan</option>
                <option value="Kabupaten">Kabupaten</option>
                <option value="Provinsi">Provinsi</option>
                <option value="Nasional">Nasional</option>
              </select>
              <input value={form.organizer} onChange={(e) => setForm((prev) => ({ ...prev, organizer: e.target.value }))} />

              <label>Tanggal</label>
              <label>Peringkat / Predikat</label>
              <input type="date" value={form.achievement_date} onChange={(e) => setForm((prev) => ({ ...prev, achievement_date: e.target.value }))} />
              <input value={form.rank_value} onChange={(e) => setForm((prev) => ({ ...prev, rank_value: e.target.value }))} />

              <label>Status</label>
              <span />
              <select value={form.is_active} onChange={(e) => setForm((prev) => ({ ...prev, is_active: Number(e.target.value) }))}>
                <option value={1}>Aktif</option>
                <option value={0}>Nonaktif</option>
              </select>
              <span />

              <label className="full">Catatan</label>
              <textarea className="full" value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} />
            </div>

            <div className="actions student-form-actions">
              <button className="ghost" onClick={() => setShowForm(false)}>Batal</button>
              <button className="btn-gradient" onClick={submit}>Simpan</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
