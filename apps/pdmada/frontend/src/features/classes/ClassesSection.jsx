import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip
} from 'recharts';

const DEFAULT_STATS = {
  topStudents: [],
  quick: {
    averageScore: 0,
    highestScore: 0,
    lowestScore: 0,
    masteryRate: 0,
    scoredStudents: 0,
    scoreEntries: 0
  },
  gradeBuckets: []
};

export function ClassesSection({
  api,
  data,
  visibleList,
  loading,
  listPage,
  setListPage,
  listPageSize,
  setListPageSize,
  listTotalPages,
  totalRows,
  filterStatus,
  setFilterStatus,
  filterQuery,
  setFilterQuery,
  startEdit,
  removeItem,
  showForm,
  viewOnly,
  setShowForm,
  setViewOnly,
  form,
  setField,
  submit,
  resetForm,
  editingId,
  onRefresh,
  setError,
  pushToast
}) {
  const homeroomTeacherOptions = ((data?.teachers || [])
    .filter((teacher) => Number(teacher.is_active) === 1)
    .map((teacher) => ({
      id: String(teacher.id),
      name: String(teacher.name || '').trim()
    }))
    .filter((teacher) => teacher.name))
    .sort((a, b) => a.name.localeCompare(b.name, 'id'));
  const teacherNameById = Object.fromEntries(homeroomTeacherOptions.map((teacher) => [teacher.id, teacher.name]));

  const [selectedStudentId, setSelectedStudentId] = React.useState('');
  const [studentSearch, setStudentSearch] = React.useState('');
  const [assigning, setAssigning] = React.useState(false);
  const [classStatsLoading, setClassStatsLoading] = React.useState(false);
  const [classModalTab, setClassModalTab] = React.useState('overview');
  const [classStats, setClassStats] = React.useState(DEFAULT_STATS);

  const studentsByClass = React.useMemo(() => (
    (data?.students || []).reduce((acc, student) => {
      const classId = Number(student.class_id || 0);
      if (!classId) return acc;
      if (!acc[classId]) acc[classId] = [];
      acc[classId].push(student);
      return acc;
    }, {})
  ), [data?.students]);

  const currentClassId = Number(form.classes?.id || editingId.classes || 0);
  const enrolledStudents = currentClassId ? (studentsByClass[currentClassId] || []) : [];
  const enrolledCount = enrolledStudents.length;
  const enrolledStudentIdsKey = React.useMemo(
    () => enrolledStudents.map((item) => Number(item.id)).filter(Boolean).sort((a, b) => a - b).join(','),
    [enrolledStudents]
  );
  const displayClassName = form.classes.name || '-';
  const displayHomeroom = form.classes.homeroom_teacher || '-';
  const displayCapacity = Number(form.classes.max_students || 0) || 0;

  const availableStudents = (data?.students || [])
    .filter((student) => String(student.student_status || '').toLowerCase() === 'aktif' || Number(student.is_active) === 1)
    .filter((student) => Number(student.class_id || 0) !== currentClassId)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'id'));

  const searchedStudents = availableStudents
    .filter((student) => {
      const q = String(studentSearch || '').trim().toLowerCase();
      if (!q) return false;
      const name = String(student.name || '').toLowerCase();
      const nis = String(student.nis_local || student.nisn || '').toLowerCase();
      return name.includes(q) || nis.includes(q);
    })
    .slice(0, 12);

  const selectedStudent = availableStudents.find((student) => String(student.id) === String(selectedStudentId)) || null;
  const activeSchoolYear = (data?.schoolYears || []).find((item) => Number(item.is_active) === 1) || null;
  const activeSemester = (data?.semesters || []).find((item) => Number(item.is_active) === 1) || null;

  React.useEffect(() => {
    let cancelled = false;

    async function loadClassStats() {
      if (!showForm || !currentClassId || !api?.studentScores?.list) {
        if (!cancelled) setClassStats(DEFAULT_STATS);
        return;
      }

      setClassStatsLoading(true);
      try {
        const rows = await api.studentScores.list({ classId: currentClassId });
        if (cancelled) return;

        const activeStudentIds = new Set(enrolledStudents.map((item) => Number(item.id)));
        const scopedRows = (rows || []).filter((row) => activeStudentIds.has(Number(row.student_id)));
        const numericScores = scopedRows
          .map((row) => Number(row.score_value))
          .filter((score) => !Number.isNaN(score));
        const scoreEntries = numericScores.length;
        const averageScore = scoreEntries ? numericScores.reduce((sum, score) => sum + score, 0) / scoreEntries : 0;
        const highestScore = scoreEntries ? Math.max(...numericScores) : 0;
        const lowestScore = scoreEntries ? Math.min(...numericScores) : 0;

        const rowsWithKkm = scopedRows.filter((row) => {
          const score = Number(row.score_value);
          const kkm = Number(row.subject_kkm);
          return !Number.isNaN(score) && !Number.isNaN(kkm) && kkm > 0;
        }).length;
        const masteryRows = scopedRows.filter((row) => {
          const score = Number(row.score_value);
          const kkm = Number(row.subject_kkm);
          return !Number.isNaN(score) && !Number.isNaN(kkm) && kkm > 0 && score >= kkm;
        }).length;
        const masteryRate = rowsWithKkm ? (masteryRows / rowsWithKkm) * 100 : 0;

        const byStudent = scopedRows.reduce((acc, row) => {
          const sid = Number(row.student_id);
          if (!sid) return acc;
          if (!acc[sid]) {
            acc[sid] = {
              studentId: sid,
              studentName: row.student_name || '-',
              nis: row.nis_local || '-',
              scores: []
            };
          }
          const score = Number(row.score_value);
          if (!Number.isNaN(score)) acc[sid].scores.push(score);
          return acc;
        }, {});

        const topStudents = Object.values(byStudent)
          .map((item) => ({
            ...item,
            avgScore: item.scores.length ? item.scores.reduce((sum, score) => sum + score, 0) / item.scores.length : 0,
            subjectCount: item.scores.length
          }))
          .filter((item) => item.subjectCount > 0)
          .sort((a, b) => b.avgScore - a.avgScore)
          .slice(0, 5);

        const scoredStudents = Object.values(byStudent).filter((item) => item.scores.length > 0).length;
        const gradeBuckets = [
          { name: '90-100', min: 90, max: 100 },
          { name: '80-89', min: 80, max: 89.99 },
          { name: '70-79', min: 70, max: 79.99 },
          { name: '< 70', min: -999, max: 69.99 }
        ].map((bucket) => ({
          name: bucket.name,
          total: numericScores.filter((score) => score >= bucket.min && score <= bucket.max).length
        }));

        setClassStats({
          topStudents,
          quick: {
            averageScore,
            highestScore,
            lowestScore,
            masteryRate,
            scoredStudents,
            scoreEntries
          },
          gradeBuckets
        });
      } catch (_) {
        if (!cancelled) setClassStats(DEFAULT_STATS);
      } finally {
        if (!cancelled) setClassStatsLoading(false);
      }
    }

    loadClassStats();
    return () => {
      cancelled = true;
    };
  }, [showForm, currentClassId, api, enrolledStudentIdsKey]);

  async function assignStudentToClass() {
    if (!currentClassId || !selectedStudentId) return;
    setAssigning(true);
    try {
      await api.students.update(selectedStudentId, { class_id: currentClassId });
      setSelectedStudentId('');
      setStudentSearch('');
      await onRefresh?.();
      pushToast?.('success', 'Siswa ditambahkan', 'Siswa berhasil dimasukkan ke kelas ini.');
    } catch (err) {
      setError?.(err.message);
      pushToast?.('error', 'Gagal menambah siswa', err.message);
    } finally {
      setAssigning(false);
    }
  }

  function formatScore(value) {
    const n = Number(value);
    if (Number.isNaN(n) || n <= 0) return '-';
    return n.toFixed(2);
  }

  return (
    <>
      <section className="student-shell">
        <div className="student-filter-bar">
          <select className="filter" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="all">Semua Status</option>
            <option value="active">Aktif</option>
            <option value="inactive">Nonaktif</option>
          </select>
          <input className="filter full" placeholder="Cari kelas, tingkat, wali kelas..." value={filterQuery} onChange={(e) => setFilterQuery(e.target.value)} />
        </div>
        <div className="student-meta-bar">
          <span className="pill">Total ditemukan: {totalRows}</span>
          <div className="student-pagination">
            <button className="ghost" disabled={listPage <= 1} onClick={() => setListPage((p) => Math.max(1, p - 1))}>Prev</button>
            <span>Halaman {listPage} / {listTotalPages}</span>
            <button className="ghost" disabled={listPage >= listTotalPages} onClick={() => setListPage((p) => Math.min(listTotalPages, p + 1))}>Next</button>
            <select className="filter" value={listPageSize} onChange={(e) => setListPageSize(Number(e.target.value) || 20)}>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>

        <div className="table-card student-table-card">
          <div className="student-table">
            <div className="student-table-head sticky class-head">
              <span>Kelas</span>
              <span>Tingkat</span>
              <span>Wali Kelas</span>
              <span>Kapasitas</span>
              <span>Status</span>
              <span>Aksi</span>
            </div>
            {loading && Array.from({ length: 5 }).map((_, idx) => (
              <div className="student-table-row student-skeleton-row class-row" key={`c-sk-${idx}`}>
                <span className="student-skeleton" />
                <span className="student-skeleton" />
                <span className="student-skeleton" />
                <span className="student-skeleton" />
                <span className="student-skeleton" />
                <span className="student-skeleton" />
              </div>
            ))}
            {!loading && visibleList.map((item) => (
              <div className="student-table-row class-row" key={item.id}>
                <span className="student-name">{item.name}</span>
                <span>{item.grade_level || '-'}</span>
                <span>{item.homeroom_teacher || '-'}</span>
                <span>{`${(studentsByClass[Number(item.id)] || []).length}/${item.max_students || 0}`}</span>
                <span><span className={`status-badge ${Number(item.is_active) === 1 ? 'aktif' : 'nonaktif'}`}>{Number(item.is_active) === 1 ? 'Aktif' : 'Nonaktif'}</span></span>
                <span className="student-cell-actions">
                  <button className="icon-btn" title="Edit" onClick={() => startEdit('classes', item)}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9" /><path d="m16.5 3.5 4 4L7 21l-4 1 1-4 12.5-14.5Z" /></svg>
                  </button>
                  <button className="icon-btn danger" title="Hapus" onClick={() => removeItem('classes', item.id)}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></svg>
                  </button>
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {showForm && (
        <div className="student-modal-overlay" onClick={() => { setShowForm(false); setViewOnly(false); }}>
          <section className="student-modal class-modal-modern" onClick={(e) => e.stopPropagation()}>
            <div className="student-editor-head">
              <div className="class-editor-head-main">
                <h2>{viewOnly ? 'Detail Kelas' : (editingId.classes ? 'Edit Kelas' : 'Tambah Kelas')}</h2>
                {!viewOnly && (
                  <div className="class-editor-tabs">
                    <button className={classModalTab === 'overview' ? 'active' : ''} onClick={() => setClassModalTab('overview')}>Ringkasan</button>
                    <button className={classModalTab === 'form' ? 'active' : ''} onClick={() => setClassModalTab('form')}>Pengaturan</button>
                  </div>
                )}
              </div>
              <button className="ghost" onClick={() => { setShowForm(false); setViewOnly(false); }}>Tutup</button>
            </div>

            <div className="class-modal-layout">
              <div className="class-modal-main">
                <div className="class-modal-title">
                  <div>
                    <h3>{displayClassName}</h3>
                    <p>{form.classes.grade_level || '-'} • {displayHomeroom}</p>
                  </div>
                  <div className="class-title-teacher">
                    <div className="class-title-avatar">{String(displayHomeroom || 'K').slice(0, 1).toUpperCase()}</div>
                    <div>
                      <strong>{displayHomeroom}</strong>
                      <small>Wali Kelas</small>
                    </div>
                  </div>
                </div>

                {(viewOnly || classModalTab === 'overview') && (
                  <>
                    <section className="class-panel">
                      <h4>Ikhtisar Kelas</h4>
                      <div className="class-summary-cards class-summary-compact">
                        <article>
                          <span>Siswa</span>
                          <strong>{enrolledCount}</strong>
                        </article>
                        <article>
                          <span>Kapasitas</span>
                          <strong>{displayCapacity || '-'}</strong>
                        </article>
                        <article>
                          <span>Semester</span>
                          <strong>{activeSemester?.name || '-'}</strong>
                        </article>
                      </div>
                    </section>

                    <section className="class-panel">
                      <h4>Deskripsi Kelas</h4>
                      <p className="class-description">{form.classes.curriculum || 'Belum ada deskripsi kelas.'}</p>
                    </section>

                    <div className="class-stat-grid">
                      <article className="class-stat-card">
                        <span>Rata-rata Nilai</span>
                        <strong>{formatScore(classStats.quick.averageScore)}</strong>
                        <small>Keseluruhan nilai siswa aktif</small>
                      </article>
                      <article className="class-stat-card">
                        <span>Nilai Tertinggi</span>
                        <strong>{formatScore(classStats.quick.highestScore)}</strong>
                        <small>Skor tertinggi yang tercatat</small>
                      </article>
                      <article className="class-stat-card">
                        <span>Nilai Terendah</span>
                        <strong>{formatScore(classStats.quick.lowestScore)}</strong>
                        <small>Skor terendah yang tercatat</small>
                      </article>
                      <article className="class-stat-card">
                        <span>Ketuntasan KKM</span>
                        <strong>{classStats.quick.masteryRate ? `${classStats.quick.masteryRate.toFixed(1)}%` : '-'}</strong>
                        <small>{classStats.quick.scoreEntries || 0} nilai tercatat</small>
                      </article>
                    </div>
                    <div className="class-analytics-grid">
                      <section className="class-chart-card">
                        <header>
                          <h5>Distribusi Nilai</h5>
                          <small>{activeSchoolYear?.name || '-'} / {activeSemester?.name || '-'}</small>
                        </header>
                        {classStatsLoading ? (
                          <div className="class-chart-empty">Memuat statistik...</div>
                        ) : (
                          <ResponsiveContainer width="100%" height={190}>
                            <BarChart data={classStats.gradeBuckets}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#dbe3ef" />
                              <XAxis dataKey="name" stroke="#64748b" fontSize={12} />
                              <YAxis allowDecimals={false} stroke="#64748b" fontSize={12} />
                              <Tooltip />
                              <Bar dataKey="total" fill="#2563eb" radius={[8, 8, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        )}
                      </section>

                      <section className="class-chart-card">
                        <header>
                          <h5>Potensi Siswa Terbaik</h5>
                          <small>Top 5 berdasarkan rata-rata nilai</small>
                        </header>
                        <div className="class-top-students">
                          {classStatsLoading && <div className="class-chart-empty">Memuat data siswa...</div>}
                          {!classStatsLoading && classStats.topStudents.length === 0 && (
                            <div className="class-chart-empty">Belum ada nilai untuk menghitung potensi.</div>
                          )}
                          {!classStatsLoading && classStats.topStudents.map((item, idx) => (
                            <div className="class-top-row" key={`${item.studentId}-${idx}`}>
                              <div>
                                <strong>{idx + 1}. {item.studentName}</strong>
                                <small>{item.nis}</small>
                              </div>
                              <div className="class-top-score">
                                <strong>{item.avgScore.toFixed(2)}</strong>
                                <small>{item.subjectCount} mapel</small>
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    </div>
                  </>
                )}

                {!viewOnly && classModalTab === 'form' && (
                  <div className="student-compact-form">
                    <label>Nama Kelas</label>
                    <label>Tingkat</label>
                    <input disabled={viewOnly} value={form.classes.name || ''} onChange={(e) => setField('classes', 'name', e.target.value)} />
                    <input disabled={viewOnly} value={form.classes.grade_level || ''} onChange={(e) => setField('classes', 'grade_level', e.target.value)} />

                    <label>Wali Kelas</label>
                    <label>Ruangan</label>
                    <select
                      disabled={viewOnly}
                      value={form.classes.homeroom_teacher_id || ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        setField('classes', 'homeroom_teacher_id', value);
                        setField('classes', 'homeroom_teacher', teacherNameById[value] || '');
                      }}
                    >
                      <option value="">Pilih wali kelas</option>
                      {homeroomTeacherOptions.map((teacher) => (
                        <option key={teacher.id} value={teacher.id}>{teacher.name}</option>
                      ))}
                    </select>
                    <input disabled={viewOnly} value={form.classes.room_name || ''} onChange={(e) => setField('classes', 'room_name', e.target.value)} />

                    <label>Kurikulum</label>
                    <label>JTM Rombel</label>
                    <input disabled={viewOnly} value={form.classes.curriculum || ''} onChange={(e) => setField('classes', 'curriculum', e.target.value)} />
                    <input disabled={viewOnly} value={form.classes.jtm_rombel || ''} onChange={(e) => setField('classes', 'jtm_rombel', e.target.value)} />

                    <label>Kapasitas</label>
                    <label>Status</label>
                    <input disabled={viewOnly} type="number" value={form.classes.max_students || ''} onChange={(e) => setField('classes', 'max_students', e.target.value)} />
                    <select disabled={viewOnly} value={form.classes.is_active ? '1' : '0'} onChange={(e) => setField('classes', 'is_active', e.target.value === '1')}>
                      <option value="1">Aktif</option>
                      <option value="0">Nonaktif</option>
                    </select>
                  </div>
                )}
              </div>

              <aside className="class-modal-side">
                <h4>Siswa Terdaftar ({enrolledCount})</h4>
                {!viewOnly && currentClassId > 0 && (
                  <div className="class-assign-bar">
                    <input
                      type="text"
                      placeholder="Cari nama / NIS siswa..."
                      value={studentSearch}
                      onChange={(e) => {
                        setStudentSearch(e.target.value);
                        if (!e.target.value.trim()) setSelectedStudentId('');
                      }}
                    />
                    {studentSearch.trim() && (
                      <div className="class-search-list">
                        {searchedStudents.length === 0 && <div className="class-search-empty">Tidak ada siswa cocok.</div>}
                        {searchedStudents.map((student) => (
                          <button
                            type="button"
                            key={student.id}
                            className={`class-search-item ${String(selectedStudentId) === String(student.id) ? 'active' : ''}`}
                            onClick={() => {
                              setSelectedStudentId(String(student.id));
                              setStudentSearch(`${student.name} (${student.nis_local || student.nisn || '-'})`);
                            }}
                          >
                            <span>{student.name}</span>
                            <small>{student.nis_local || student.nisn || '-'}</small>
                          </button>
                        ))}
                      </div>
                    )}
                    {selectedStudent && (
                      <div className="class-selected-student">
                        Terpilih: <strong>{selectedStudent.name}</strong> ({selectedStudent.nis_local || selectedStudent.nisn || '-'})
                      </div>
                    )}
                    <button className="primary" disabled={!selectedStudentId || assigning} onClick={assignStudentToClass}>
                      {assigning ? 'Memproses...' : '+ Tambah Siswa'}
                    </button>
                  </div>
                )}
                <div className="class-student-list">
                  {!enrolledStudents.length && <div className="class-student-empty">Belum ada siswa pada kelas ini.</div>}
                  {enrolledStudents.slice(0, 18).map((student) => (
                    <div className="class-student-item" key={student.id}>
                      <span>{student.name}</span>
                      <small>{student.nis_local || student.nisn || '-'}</small>
                    </div>
                  ))}
                </div>
              </aside>
            </div>

            {!viewOnly && (
              <div className="actions student-form-actions">
                <button className="ghost" onClick={() => { setShowForm(false); setViewOnly(false); }}>Batal</button>
                <button className="primary" onClick={() => submit('classes')}>{editingId.classes ? 'Update' : 'Simpan'}</button>
                <button className="ghost" onClick={() => resetForm('classes')}>Reset</button>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
