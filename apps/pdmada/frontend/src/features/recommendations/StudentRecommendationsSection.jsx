import React, { useEffect, useMemo, useState } from 'react';

export function StudentRecommendationsSection({ api, data, setError, pushToast }) {
  const activeSchoolYear = useMemo(
    () => (data.schoolYears || []).find((item) => Number(item.is_active) === 1),
    [data.schoolYears]
  );
  const activeSemester = useMemo(
    () => (data.semesters || []).find((item) => Number(item.is_active) === 1),
    [data.semesters]
  );

  const [category, setCategory] = useState('akademik');
  const [subjectId, setSubjectId] = useState('');
  const [extracurricularName, setExtracurricularName] = useState('');
  const [classId, setClassId] = useState('all');
  const [schoolYearId, setSchoolYearId] = useState('all');
  const [semesterId, setSemesterId] = useState('all');
  const [limit, setLimit] = useState(10);
  const [loading, setLoading] = useState(false);
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [result, setResult] = useState({ subject: null, target: null, items: [], total_candidates: 0, model: null, category: 'akademik' });
  const [selectedIds, setSelectedIds] = useState([]);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailStudent, setDetailStudent] = useState(null);
  const [detailScores, setDetailScores] = useState([]);
  const [detailAchievements, setDetailAchievements] = useState([]);
  const [autoPeriodInitialized, setAutoPeriodInitialized] = useState(false);

  useEffect(() => {
    if (!subjectId) {
      const mathSubject = (data.subjects || []).find((item) => String(item.name || '').toLowerCase().includes('matematika'));
      if (mathSubject) setSubjectId(String(mathSubject.id));
    }
    if (!extracurricularName) {
      const firstEks = (data.extracurriculars || []).find((item) => Number(item.is_active) === 1);
      if (firstEks) setExtracurricularName(String(firstEks.name || ''));
    }
    if (!autoPeriodInitialized) {
      if (activeSchoolYear?.id) setSchoolYearId(String(activeSchoolYear.id));
      if (activeSemester?.id) setSemesterId(String(activeSemester.id));
      if (activeSchoolYear?.id || activeSemester?.id) setAutoPeriodInitialized(true);
    }
  }, [data.subjects, data.extracurriculars, subjectId, extracurricularName, autoPeriodInitialized, activeSchoolYear?.id, activeSemester?.id]);

  async function runRecommendation() {
    if (category === 'akademik' && !subjectId) {
      pushToast?.('error', 'Mapel wajib dipilih', 'Pilih mapel terlebih dahulu.');
      return;
    }
    if (category === 'non_akademik' && !String(extracurricularName || '').trim()) {
      pushToast?.('error', 'Ekstrakurikuler wajib dipilih', 'Pilih ekstrakurikuler terlebih dahulu.');
      return;
    }
    setLoading(true);
    try {
      const response = await api.recommendations.recommendStudents({
        category,
        subjectId: category === 'akademik' ? subjectId : null,
        extracurricularName: category === 'non_akademik' ? extracurricularName : null,
        classId,
        schoolYearId,
        semesterId,
        limit
      });
      setResult(response || { subject: null, target: null, items: [], total_candidates: 0, model: null, category });
      setSelectedIds([]);
    } catch (err) {
      setError(err.message);
      pushToast?.('error', 'Gagal membuat rekomendasi', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function openDetail(row) {
    setDetailStudent(row);
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const [scores, achievements] = await Promise.all([
        api.studentScores.list({
          studentId: row.student_id,
          schoolYearId,
          semesterId
        }),
        api.studentAffairs.listAchievements(row.student_id)
      ]);
      setDetailScores(Array.isArray(scores) ? scores : []);
      setDetailAchievements(Array.isArray(achievements) ? achievements : []);
    } catch (err) {
      setError(err.message);
      pushToast?.('error', 'Gagal memuat detail siswa', err.message);
    } finally {
      setDetailLoading(false);
    }
  }

  const isAcademic = (result.category || category) !== 'non_akademik';
  const items = Array.isArray(result.items) ? result.items : [];
  const allSelected = items.length > 0 && selectedIds.length === items.length;
  const targetName = result.target?.name || result.subject?.name || '-';

  async function saveSelectedFeedback() {
    if (!isAcademic) return;
    if (!items.length || !selectedIds.length || !result.subject?.id) return;
    setSavingFeedback(true);
    try {
      const idSet = new Set(selectedIds.map(Number));
      const payloadItems = items
        .filter((row) => idSet.has(Number(row.student_id)))
        .map((row) => ({
          subject_id: result.subject.id,
          student_id: row.student_id,
          class_id: row.class_id || null,
          school_year_id: schoolYearId !== 'all' ? Number(schoolYearId) : null,
          semester_id: semesterId !== 'all' ? Number(semesterId) : null,
          academic_score: row.avg_subject_score,
          achievement_score: row.achievement_score,
          recommendation_score: row.recommendation_score,
          selected_by_school: 1,
          outcome_label: null,
          notes: 'Dipilih dari menu rekomendasi siswa'
        }));

      await api.recommendations.saveFeedback({ items: payloadItems });
      pushToast?.('success', 'Kandidat tersimpan', `${payloadItems.length} siswa ditandai sebagai kandidat.`);
      setSelectedIds([]);
    } catch (err) {
      setError(err.message);
      pushToast?.('error', 'Gagal simpan kandidat', err.message);
    } finally {
      setSavingFeedback(false);
    }
  }

  return (
    <>
      <section className="student-shell module-shell">
        <div className="student-filter-bar">
          <select className="filter" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="akademik">Akademik</option>
            <option value="non_akademik">Non Akademik</option>
          </select>

          {category === 'akademik' ? (
            <select className="filter" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="">Pilih Mapel</option>
              {(data.subjects || [])
                .filter((item) => Number(item.is_active) === 1)
                .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'id'))
                .map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
            </select>
          ) : (
            <select className="filter" value={extracurricularName} onChange={(e) => setExtracurricularName(e.target.value)}>
              <option value="">Pilih Ekstrakurikuler</option>
              {(data.extracurriculars || [])
                .filter((item) => Number(item.is_active) === 1)
                .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'id'))
                .map((item) => (
                  <option key={item.id} value={item.name}>{item.name}</option>
                ))}
            </select>
          )}

          <select className="filter" value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="all">Semua Kelas</option>
            {(data.classes || []).map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
          <select className="filter" value={schoolYearId} onChange={(e) => setSchoolYearId(e.target.value)}>
            <option value="all">Semua Tahun Ajaran</option>
            {(data.schoolYears || []).map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
          <select className="filter" value={semesterId} onChange={(e) => setSemesterId(e.target.value)}>
            <option value="all">Semua Semester</option>
            {(data.semesters || []).map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
          <select className="filter" value={limit} onChange={(e) => setLimit(Number(e.target.value) || 10)}>
            <option value={5}>Top 5</option>
            <option value={10}>Top 10</option>
            <option value={20}>Top 20</option>
          </select>
          <button className="btn-gradient" onClick={runRecommendation} disabled={loading}>
            {loading ? 'Memproses...' : 'Rekomendasikan'}
          </button>
        </div>

        <div className="student-meta-bar">
          <span className="pill">Kategori: {isAcademic ? 'Akademik' : 'Non Akademik'}</span>
          <span className="pill">Target: {targetName}</span>
          <span className="pill">Kandidat: {result.total_candidates || 0}</span>
          {isAcademic ? (
            <span className="pill">
              Bobot: Nilai {Math.round((result.model?.academic_weight || 0.8) * 100)}% + Prestasi {Math.round((result.model?.achievement_weight || 0.2) * 100)}%
            </span>
          ) : (
            <span className="pill">
              Bobot: Aktivitas Ekstra {Math.round((result.model?.extracurricular_weight || 0.7) * 100)}% + Prestasi {Math.round((result.model?.achievement_weight || 0.3) * 100)}%
            </span>
          )}
          {isAcademic && (
            <button className="btn-import" onClick={saveSelectedFeedback} disabled={!selectedIds.length || savingFeedback}>
              {savingFeedback ? 'Menyimpan...' : `Simpan Kandidat (${selectedIds.length})`}
            </button>
          )}
        </div>

        <div className="table-card student-table-card">
          <div className="student-table">
            <div className="student-table-head sticky" style={{ gridTemplateColumns: '0.5fr 0.55fr 1.35fr 0.8fr 1.05fr 0.95fr 0.95fr 1.2fr' }}>
              <span>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) => {
                    if (e.target.checked) setSelectedIds(items.map((row) => Number(row.student_id)));
                    else setSelectedIds([]);
                  }}
                />
              </span>
              <span>Rank</span>
              <span>Siswa</span>
              <span>Kelas</span>
              <span>{isAcademic ? 'Nilai Rata-rata' : 'Aktivitas Ekstra'}</span>
              <span>{isAcademic ? 'Nilai Tertinggi' : 'Skor Ekstra'}</span>
              <span>Skor Prestasi</span>
              <span>Skor Rekomendasi / Detail</span>
            </div>

            {loading && Array.from({ length: 6 }).map((_, i) => (
              <div className="student-table-row student-skeleton-row" style={{ gridTemplateColumns: '0.5fr 0.55fr 1.35fr 0.8fr 1.05fr 0.95fr 0.95fr 1.2fr' }} key={`recommend-sk-${i}`}>
                <span className="student-skeleton" />
                <span className="student-skeleton" /><span className="student-skeleton" /><span className="student-skeleton" /><span className="student-skeleton" /><span className="student-skeleton" /><span className="student-skeleton" /><span className="student-skeleton" />
              </div>
            ))}

            {!loading && items.map((row, index) => (
              <div className="student-table-row" style={{ gridTemplateColumns: '0.5fr 0.55fr 1.35fr 0.8fr 1.05fr 0.95fr 0.95fr 1.2fr' }} key={row.student_id}>
                <span>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(Number(row.student_id))}
                    onChange={(e) => {
                      const sid = Number(row.student_id);
                      setSelectedIds((prev) => (
                        e.target.checked
                          ? (prev.includes(sid) ? prev : [...prev, sid])
                          : prev.filter((id) => id !== sid)
                      ));
                    }}
                  />
                </span>
                <span><strong>#{index + 1}</strong></span>
                <span><strong>{row.student_name}</strong><br /><small>{row.nis_local || '-'}</small></span>
                <span>{row.class_name || '-'}</span>
                <span>{isAcademic ? (row.avg_subject_score ?? '-') : (row.extracurricular_activity || '-')}</span>
                <span>{isAcademic ? (row.best_subject_score ?? '-') : (row.extracurricular_score ?? '-')}</span>
                <span>{row.achievement_score ?? '-'}</span>
                <span className="student-cell-actions">
                  <span>
                    <strong>{row.recommendation_score ?? '-'}</strong><br />
                    <small>{row.achievements_relevant || 0} relevan</small>
                  </span>
                  <button className="icon-btn" title="Detail" onClick={() => openDetail(row)}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12Z" /><circle cx="12" cy="12" r="3" /></svg>
                  </button>
                </span>
              </div>
            ))}

            {!loading && !items.length && (
              <div className="module-empty-state">
                Belum ada hasil. Pilih target lalu klik "Rekomendasikan".
              </div>
            )}
          </div>
        </div>
      </section>

      {detailOpen && (
        <div className="student-modal-overlay" onClick={() => setDetailOpen(false)}>
          <section className="student-modal student-modal-themed" onClick={(e) => e.stopPropagation()}>
            <div className="student-editor-head">
              <div>
                <h2>Detail Rekomendasi Siswa</h2>
                <p>{detailStudent?.student_name || '-'} | {detailStudent?.class_name || '-'}</p>
              </div>
              <button className="ghost" onClick={() => setDetailOpen(false)}>Tutup</button>
            </div>

            {detailLoading ? (
              <div className="module-empty-state">Memuat detail nilai dan prestasi...</div>
            ) : (
              <>
                <div className="table-card student-table-card" style={{ marginBottom: 10 }}>
                  <div className="student-meta-bar"><span className="pill">List Nilai Siswa</span></div>
                  <div className="student-table">
                    <div className="student-table-head sticky" style={{ gridTemplateColumns: '1.1fr 0.9fr 0.9fr 1fr 1fr' }}>
                      <span>Mapel</span>
                      <span>Nilai</span>
                      <span>KKM</span>
                      <span>Tahun Ajaran</span>
                      <span>Semester</span>
                    </div>
                    {detailScores.map((row) => (
                      <div className="student-table-row" style={{ gridTemplateColumns: '1.1fr 0.9fr 0.9fr 1fr 1fr' }} key={row.id}>
                        <span>{row.subject_name || '-'}</span>
                        <span>{row.score_value ?? '-'}</span>
                        <span>{row.subject_kkm ?? '-'}</span>
                        <span>{row.school_year_name || '-'}</span>
                        <span>{row.semester_name || '-'}</span>
                      </div>
                    ))}
                    {!detailScores.length && <div className="module-empty-state">Belum ada data nilai.</div>}
                  </div>
                </div>

                <div className="table-card student-table-card">
                  <div className="student-meta-bar"><span className="pill">List Prestasi Siswa</span></div>
                  <div className="student-table">
                    <div className="student-table-head sticky" style={{ gridTemplateColumns: '1.1fr 0.9fr 0.9fr 0.8fr 0.8fr' }}>
                      <span>Prestasi</span>
                      <span>Kategori</span>
                      <span>Jenis</span>
                      <span>Tingkat</span>
                      <span>Peringkat</span>
                    </div>
                    {detailAchievements.map((row) => (
                      <div className="student-table-row" style={{ gridTemplateColumns: '1.1fr 0.9fr 0.9fr 0.8fr 0.8fr' }} key={row.id}>
                        <span>{row.title || '-'}</span>
                        <span>{row.achievement_category === 'non_akademik' ? 'Non Akademik' : 'Akademik'}</span>
                        <span>{row.achievement_type || '-'}</span>
                        <span>{row.level_name || '-'}</span>
                        <span>{row.rank_value || '-'}</span>
                      </div>
                    ))}
                    {!detailAchievements.length && <div className="module-empty-state">Belum ada data prestasi.</div>}
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}
