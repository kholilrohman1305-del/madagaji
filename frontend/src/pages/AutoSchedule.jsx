import { useEffect, useMemo, useState } from 'react';
import api from '../api';
import { Wand2, Calendar, Clock, BookOpen, Users, Settings, Play, RotateCcw, Check, ChevronLeft, ChevronRight, Search, Save, CheckCircle2, AlertCircle, XCircle, Star } from 'lucide-react';

const DEFAULT_DAYS = ['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Ahad'];
const PAGE_SIZE = 10;

const STEPS = [
  { id: 1, label: 'Setup Slot Jam', icon: Clock },
  { id: 2, label: 'Mapel di Kelas', icon: BookOpen },
  { id: 3, label: 'Guru - Mapel', icon: Users },
  { id: 4, label: 'Aturan & Generate', icon: Settings }
];

export default function AutoSchedule() {
  const [step, setStep] = useState(1);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Step 1: Days & Hours Config
  const [days, setDays] = useState([]);
  const [hoursByDay, setHoursByDay] = useState({});
  const [slotDuration, setSlotDuration] = useState(45);
  const [startTimeByDay, setStartTimeByDay] = useState({});

  // Step 2: Class-Subject Matrix
  const [classSubjectsLocal, setClassSubjectsLocal] = useState({});
  const [matrixClassFilter, setMatrixClassFilter] = useState('');

  // Step 3: Teacher-Subject mapping with priority
  const [teacherSubjectsLocal, setTeacherSubjectsLocal] = useState({});
  const [teacherFilter, setTeacherFilter] = useState('');
  const [teacherPage, setTeacherPage] = useState(1);

  // Step 4: Teacher limits & Generate
  const [teacherLimitsLocal, setTeacherLimitsLocal] = useState({});
  const [limitFilter, setLimitFilter] = useState('');
  const [limitPage, setLimitPage] = useState(1);
  const [bulkMaxWeek, setBulkMaxWeek] = useState('');
  const [bulkMaxDay, setBulkMaxDay] = useState('');
  const [bulkMinLinier, setBulkMinLinier] = useState('');

  // Generate results
  const [generated, setGenerated] = useState([]);
  const [failed, setFailed] = useState([]);
  const [failedByClass, setFailedByClass] = useState({});
  const [linearWarnings, setLinearWarnings] = useState([]);
  const [viewDay, setViewDay] = useState('');
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);

  // Load initial data
  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get('/scheduler/meta'),
      api.get('/scheduler/config')
    ]).then(([metaRes, configRes]) => {
      setMeta(metaRes.data);
      const config = configRes.data || {};
      if (config.days) {
        setDays(config.days);
        setHoursByDay(config.hoursByDay || {});
        setSlotDuration(config.slotDuration || 45);
        setStartTimeByDay(config.startTimeByDay || {});
        setViewDay(config.days[0] || '');
      }

      // Initialize class-subject mapping
      const csMap = {};
      (metaRes.data?.classSubjects || []).forEach(cs => {
        if (!csMap[cs.class_id]) csMap[cs.class_id] = {};
        csMap[cs.class_id][cs.subject_id] = cs.hours_per_week || 2;
      });
      setClassSubjectsLocal(csMap);

      // Initialize teacher-subject mapping with priority
      const tsMap = {};
      (metaRes.data?.teacherSubjects || []).forEach(ts => {
        if (!tsMap[ts.teacher_id]) tsMap[ts.teacher_id] = [];
        tsMap[ts.teacher_id].push({ subjectId: ts.subject_id, priority: ts.priority || 1 });
      });
      // Sort by priority
      Object.keys(tsMap).forEach(tid => {
        tsMap[tid].sort((a, b) => a.priority - b.priority);
      });
      setTeacherSubjectsLocal(tsMap);

      // Initialize teacher limits
      const tlMap = {};
      (metaRes.data?.teacherLimits || []).forEach(tl => {
        tlMap[tl.teacher_id] = {
          maxWeek: tl.max_hours_per_week,
          maxDay: tl.max_hours_per_day,
          minLinier: tl.min_hours_linier
        };
      });
      setTeacherLimitsLocal(tlMap);
    }).finally(() => setLoading(false));
  }, []);

  // Step 1 handlers
  const toggleDay = (d) => {
    setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  };

  const saveConfig = async () => {
    setSaving(true);
    await api.put('/scheduler/config', { days, hoursByDay, slotDuration, startTimeByDay });
    setSaving(false);
  };

  // Step 2 handlers
  const toggleClassSubject = (classId, subjectId) => {
    setClassSubjectsLocal(prev => {
      const classMap = { ...prev[classId] } || {};
      if (classMap[subjectId]) {
        delete classMap[subjectId];
      } else {
        classMap[subjectId] = 2; // Default 2 hours per week
      }
      return { ...prev, [classId]: classMap };
    });
  };

  const setClassSubjectHours = (classId, subjectId, hours) => {
    setClassSubjectsLocal(prev => {
      const classMap = { ...prev[classId] } || {};
      classMap[subjectId] = hours;
      return { ...prev, [classId]: classMap };
    });
  };

  const saveClassSubjectsMatrix = async () => {
    setSaving(true);
    const mappings = [];
    Object.entries(classSubjectsLocal).forEach(([classId, subjects]) => {
      Object.entries(subjects).forEach(([subjectId, hoursPerWeek]) => {
        mappings.push({ classId: Number(classId), subjectId: Number(subjectId), hoursPerWeek });
      });
    });
    await api.put('/scheduler/class-subjects-matrix', { mappings });
    setSaving(false);
  };

  // Step 3 handlers
  const toggleTeacherSubject = (teacherId, subjectId) => {
    setTeacherSubjectsLocal(prev => {
      const current = prev[teacherId] || [];
      const exists = current.find(s => s.subjectId === subjectId);
      if (exists) {
        return { ...prev, [teacherId]: current.filter(s => s.subjectId !== subjectId) };
      } else {
        const maxPriority = current.length > 0 ? Math.max(...current.map(s => s.priority)) : 0;
        return { ...prev, [teacherId]: [...current, { subjectId, priority: maxPriority + 1 }] };
      }
    });
  };

  const setSubjectPriority = (teacherId, subjectId, priority) => {
    setTeacherSubjectsLocal(prev => {
      const current = prev[teacherId] || [];
      return {
        ...prev,
        [teacherId]: current.map(s => s.subjectId === subjectId ? { ...s, priority: Number(priority) } : s)
      };
    });
  };

  const saveTeacherSubjects = async (teacherId) => {
    const subjects = teacherSubjectsLocal[teacherId] || [];
    await api.put(`/scheduler/teacher-subjects/${teacherId}`, { subjects });
  };

  // Step 4 handlers
  const updateTeacherLimit = (teacherId, field, value) => {
    setTeacherLimitsLocal(prev => ({
      ...prev,
      [teacherId]: { ...prev[teacherId], [field]: value === '' ? null : Number(value) }
    }));
  };

  const saveTeacherLimit = async (teacherId) => {
    const limits = teacherLimitsLocal[teacherId] || {};
    await api.put(`/scheduler/teacher-limit/${teacherId}`, limits);
  };

  const applyBulkLimits = async () => {
    if (!meta?.teachers) return;
    setSaving(true);
    const limits = meta.teachers.map(t => ({
      teacherId: t.id,
      maxWeek: bulkMaxWeek !== '' ? Number(bulkMaxWeek) : (teacherLimitsLocal[t.id]?.maxWeek ?? null),
      maxDay: bulkMaxDay !== '' ? Number(bulkMaxDay) : (teacherLimitsLocal[t.id]?.maxDay ?? null),
      minLinier: bulkMinLinier !== '' ? Number(bulkMinLinier) : (teacherLimitsLocal[t.id]?.minLinier ?? null)
    }));
    await api.put('/scheduler/teacher-limits-bulk', { limits });
    // Refresh local state
    const tlMap = {};
    limits.forEach(l => {
      tlMap[l.teacherId] = { maxWeek: l.maxWeek, maxDay: l.maxDay, minLinier: l.minLinier };
    });
    setTeacherLimitsLocal(tlMap);
    setSaving(false);
    setBulkMaxWeek('');
    setBulkMaxDay('');
    setBulkMinLinier('');
  };

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await api.post('/scheduler/generate', { days, hoursByDay });
      setGenerated(res.data.generated || []);
      setFailed(res.data.failed || []);
      setFailedByClass(res.data.failedByClass || {});
      setLinearWarnings(res.data.linearWarnings || []);
      if (!viewDay && days.length > 0) setViewDay(days[0]);
    } finally {
      setGenerating(false);
    }
  };

  const apply = async () => {
    if (!confirm('Terapkan jadwal yang sudah di-generate ke database?')) return;
    setApplying(true);
    try {
      await api.post('/scheduler/apply', { rows: generated });
      alert('Jadwal berhasil diterapkan!');
    } finally {
      setApplying(false);
    }
  };

  const reset = async () => {
    if (!confirm('Reset semua jadwal? Data akan dihapus.')) return;
    await api.post('/scheduler/reset');
    setGenerated([]);
    setFailed([]);
    setFailedByClass({});
    setLinearWarnings([]);
  };

  // Filtered lists
  const filteredTeachers = useMemo(() => {
    if (!meta) return [];
    return meta.teachers.filter(t => t.name.toLowerCase().includes(teacherFilter.toLowerCase()));
  }, [meta, teacherFilter]);

  const filteredLimits = useMemo(() => {
    if (!meta) return [];
    return meta.teachers.filter(t => t.name.toLowerCase().includes(limitFilter.toLowerCase()));
  }, [meta, limitFilter]);

  const filteredClasses = useMemo(() => {
    if (!meta) return [];
    if (!matrixClassFilter) return meta.classes;
    return meta.classes.filter(c => c.name.toLowerCase().includes(matrixClassFilter.toLowerCase()));
  }, [meta, matrixClassFilter]);

  // Grid data for preview
  const colorBySubject = (name) => {
    const colors = ['#eef2ff', '#fce7f3', '#dcfce7', '#fef9c3', '#e0f2fe', '#fde68a', '#fee2e2', '#e9d5ff'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  const gridData = useMemo(() => {
    if (!meta || !viewDay) return { classes: [], hours: 0, map: new Map() };
    const classes = meta.classes || [];
    const hours = Number(hoursByDay[viewDay] || 0);
    const map = new Map();
    generated.filter(g => g.hari === viewDay).forEach(g => {
      const key = `${g.kelas}-${g.jamKe}`;
      const subject = meta.subjects.find(s => String(s.id) === String(g.mapelId))?.name || g.mapelId;
      const teacher = meta.teachers.find(t => String(t.id) === String(g.guruId))?.name || g.guruId;
      map.set(key, { subject, teacher });
    });
    return { classes, hours, map };
  }, [meta, viewDay, hoursByDay, generated]);

  // Validation
  const validation = useMemo(() => {
    const checks = [];
    const daysOk = days.length > 0;
    checks.push({ label: `${days.length} hari aktif`, ok: daysOk, type: daysOk ? 'valid' : 'invalid' });

    const hoursOk = days.every(d => (hoursByDay[d] || 0) > 0);
    checks.push({ label: 'Jam per hari lengkap', ok: hoursOk, type: hoursOk ? 'valid' : 'invalid' });

    const classesWithSubjects = Object.keys(classSubjectsLocal).filter(cid => Object.keys(classSubjectsLocal[cid] || {}).length > 0).length;
    const totalClasses = meta?.classes?.length || 0;
    const classMapOk = classesWithSubjects > 0;
    checks.push({
      label: `${classesWithSubjects}/${totalClasses} kelas punya mapel`,
      ok: classMapOk,
      type: classesWithSubjects === totalClasses ? 'valid' : (classesWithSubjects > 0 ? 'warning' : 'invalid')
    });

    const mappedTeachers = Object.keys(teacherSubjectsLocal).filter(tid => (teacherSubjectsLocal[tid] || []).length > 0).length;
    const totalTeachers = meta?.teachers?.length || 0;
    const teacherMapOk = mappedTeachers > 0;
    checks.push({
      label: `${mappedTeachers}/${totalTeachers} guru punya mapel`,
      ok: teacherMapOk,
      type: mappedTeachers === totalTeachers ? 'valid' : (mappedTeachers > 0 ? 'warning' : 'invalid')
    });

    return checks;
  }, [days, hoursByDay, classSubjectsLocal, teacherSubjectsLocal, meta]);

  const canGenerate = validation.every(v => v.type !== 'invalid');

  const goNext = () => setStep(s => Math.min(4, s + 1));
  const goPrev = () => setStep(s => Math.max(1, s - 1));
  const goToStep = (s) => setStep(s);

  if (loading) {
    return (
      <div className="modern-table-card">
        <div className="modern-table-title"><Wand2 size={24} /> Auto Jadwal</div>
        <div style={{ padding: 40 }}>
          <div className="skeleton-pulse" style={{ height: 400, borderRadius: 12 }}></div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="modern-table-card">
        <div className="modern-table-title"><Wand2 size={24} /> Auto Jadwal</div>

        {/* Stepper */}
        <div className="stepper">
          {STEPS.map((s, idx) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center' }}>
              <div className="step" onClick={() => goToStep(s.id)}>
                <div className={`step-number ${step === s.id ? 'active' : step > s.id ? 'completed' : 'pending'}`}>
                  {step > s.id ? <Check size={20} /> : s.id}
                </div>
                <span className={`step-label ${step === s.id ? 'active' : step > s.id ? 'completed' : ''}`}>
                  {s.label}
                </span>
              </div>
              {idx < STEPS.length - 1 && <div className={`step-connector ${step > s.id ? 'completed' : ''}`} />}
            </div>
          ))}
        </div>

        <div className="step-content">
          {/* Step 1: Setup Slot Jam */}
          {step === 1 && (
            <div>
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, fontSize: 16 }}>
                  <Calendar size={20} style={{ color: 'var(--primary-500)' }} /> Pilih Hari Aktif
                </div>
                <div className="chips-container">
                  {DEFAULT_DAYS.map(d => (
                    <div key={d} className={`chip ${days.includes(d) ? 'active' : 'inactive'}`} onClick={() => toggleDay(d)}>
                      {days.includes(d) && <Check size={14} />} {d}
                    </div>
                  ))}
                </div>
              </div>

              {days.length > 0 && (
                <>
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, fontSize: 16 }}>
                      <Clock size={20} style={{ color: 'var(--purple-500)' }} /> Jumlah Jam & Waktu
                    </div>
                    <div style={{ marginBottom: 16 }}>
                      <label className="form-label">Durasi per Jam Pelajaran (menit)</label>
                      <input type="number" value={slotDuration} onChange={e => setSlotDuration(Number(e.target.value))} style={{ width: 120 }} />
                    </div>
                    <div className="grid grid-3" style={{ maxWidth: 800 }}>
                      {days.map(d => (
                        <div key={d} style={{ background: 'var(--bg)', padding: 16, borderRadius: 12 }}>
                          <div style={{ fontWeight: 600, marginBottom: 12, color: 'var(--primary-600)' }}>{d}</div>
                          <div className="form-group" style={{ marginBottom: 8 }}>
                            <label className="form-label">Jumlah Jam</label>
                            <input type="number" min="0" max="12" value={hoursByDay[d] || 0} onChange={e => setHoursByDay({ ...hoursByDay, [d]: Number(e.target.value) })} />
                          </div>
                          <div className="form-group">
                            <label className="form-label">Jam Masuk</label>
                            <input type="time" value={startTimeByDay[d] || '07:00'} onChange={e => setStartTimeByDay({ ...startTimeByDay, [d]: e.target.value })} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <div className="step-actions">
                <div></div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button onClick={saveConfig} disabled={saving}><Save size={18} /> {saving ? 'Menyimpan...' : 'Simpan'}</button>
                  <button className="secondary" onClick={goNext} disabled={days.length === 0}>Lanjut <ChevronRight size={18} /></button>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Class-Subject Matrix */}
          {step === 2 && (
            <div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 16 }}>Mapping Mapel ke Kelas</div>
                <div style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 16 }}>
                  Centang mapel yang diajarkan di setiap kelas. Angka = jam per minggu.
                </div>
                <div className="toolbar" style={{ marginBottom: 16 }}>
                  <input placeholder="Filter kelas..." value={matrixClassFilter} onChange={e => setMatrixClassFilter(e.target.value)} style={{ maxWidth: 200 }} />
                  <button onClick={saveClassSubjectsMatrix} disabled={saving}><Save size={18} /> {saving ? 'Menyimpan...' : 'Simpan Semua'}</button>
                </div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ position: 'sticky', left: 0, background: 'var(--card-bg)', zIndex: 1 }}>Kelas</th>
                      {meta.subjects.map(s => (
                        <th key={s.id} style={{ textAlign: 'center', fontSize: 12, minWidth: 60 }}>{s.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredClasses.map(c => (
                      <tr key={c.id}>
                        <td style={{ fontWeight: 600, position: 'sticky', left: 0, background: 'var(--card-bg)', zIndex: 1 }}>{c.name}</td>
                        {meta.subjects.map(s => {
                          const hours = classSubjectsLocal[c.id]?.[s.id];
                          const isActive = hours !== undefined;
                          return (
                            <td key={s.id} style={{ textAlign: 'center', padding: 4 }}>
                              <div
                                onClick={() => toggleClassSubject(c.id, s.id)}
                                style={{
                                  width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  background: isActive ? 'var(--primary-100)' : 'var(--bg)',
                                  border: `2px solid ${isActive ? 'var(--primary-500)' : 'var(--border)'}`,
                                  cursor: 'pointer', fontWeight: 600, fontSize: 12,
                                  color: isActive ? 'var(--primary-700)' : 'var(--muted)'
                                }}
                              >
                                {isActive ? hours : '-'}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="step-actions">
                <button className="outline" onClick={goPrev}><ChevronLeft size={18} /> Kembali</button>
                <button className="secondary" onClick={goNext}>Lanjut <ChevronRight size={18} /></button>
              </div>
            </div>
          )}

          {/* Step 3: Teacher-Subject Mapping with Priority */}
          {step === 3 && (
            <div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 16 }}>Mapping Guru ke Mapel</div>
                <div style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 16 }}>
                  Klik mapel untuk toggle. <Star size={12} style={{ color: 'var(--warning-500)', display: 'inline' }} /> = Mapel Utama (Linier, prioritas 1)
                </div>
                <div className="toolbar" style={{ marginBottom: 0 }}>
                  <div className="search-wrapper">
                    <Search size={18} className="search-icon" />
                    <input placeholder="Cari guru..." value={teacherFilter} onChange={e => { setTeacherFilter(e.target.value); setTeacherPage(1); }} />
                  </div>
                  <button className="outline icon-only" onClick={() => setTeacherPage(p => Math.max(1, p - 1))} disabled={teacherPage === 1}><ChevronLeft size={18} /></button>
                  <span style={{ color: 'var(--muted)', fontSize: 14 }}>Hal {teacherPage}/{Math.ceil(filteredTeachers.length / PAGE_SIZE) || 1}</span>
                  <button className="outline icon-only" onClick={() => setTeacherPage(p => p + 1)} disabled={teacherPage >= Math.ceil(filteredTeachers.length / PAGE_SIZE)}><ChevronRight size={18} /></button>
                </div>
              </div>

              <div>
                {filteredTeachers.slice((teacherPage - 1) * PAGE_SIZE, teacherPage * PAGE_SIZE).map(t => {
                  const subjects = teacherSubjectsLocal[t.id] || [];
                  const mainSubject = subjects.find(s => s.priority === 1);
                  return (
                    <div key={t.id} className="teacher-card">
                      <div className="teacher-card-header">
                        <span className="teacher-card-name">{t.name}</span>
                        <span className="teacher-card-count">
                          {mainSubject ? (
                            <span style={{ color: 'var(--warning-600)' }}>
                              <Star size={12} style={{ marginRight: 4 }} />
                              {meta.subjects.find(s => s.id === mainSubject.subjectId)?.name || 'Utama'}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--danger-500)' }}>Belum ada mapel utama</span>
                          )}
                        </span>
                      </div>
                      <div className="chips-container" style={{ marginBottom: 12 }}>
                        {meta.subjects.map(s => {
                          const ts = subjects.find(x => x.subjectId === s.id);
                          const isActive = !!ts;
                          const isMain = ts?.priority === 1;
                          return (
                            <div
                              key={s.id}
                              className={`chip ${isActive ? 'active' : 'inactive'}`}
                              onClick={() => toggleTeacherSubject(t.id, s.id)}
                              style={isMain ? { background: 'var(--warning-100)', borderColor: 'var(--warning-500)', color: 'var(--warning-700)' } : {}}
                            >
                              {isMain && <Star size={12} />}
                              {isActive && !isMain && <Check size={12} />}
                              {s.name}
                              {isActive && (
                                <select
                                  value={ts.priority}
                                  onClick={e => e.stopPropagation()}
                                  onChange={e => setSubjectPriority(t.id, s.id, e.target.value)}
                                  style={{ marginLeft: 4, padding: '2px 4px', fontSize: 11, width: 40 }}
                                >
                                  {[1, 2, 3, 4, 5].map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <button className="outline sm" onClick={() => saveTeacherSubjects(t.id)}><Save size={14} /> Simpan</button>
                    </div>
                  );
                })}
              </div>

              <div className="step-actions">
                <button className="outline" onClick={goPrev}><ChevronLeft size={18} /> Kembali</button>
                <button className="secondary" onClick={goNext}>Lanjut <ChevronRight size={18} /></button>
              </div>
            </div>
          )}

          {/* Step 4: Rules & Generate */}
          {step === 4 && (
            <div>
              {/* Validation */}
              <div className="validation-list">
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Checklist Validasi</div>
                {validation.map((v, idx) => (
                  <div key={idx} className={`validation-item ${v.type}`}>
                    {v.type === 'valid' && <CheckCircle2 size={18} />}
                    {v.type === 'warning' && <AlertCircle size={18} />}
                    {v.type === 'invalid' && <XCircle size={18} />}
                    <span>{v.label}</span>
                  </div>
                ))}
              </div>

              {/* Bulk Limits */}
              <div style={{ marginBottom: 24, padding: 16, background: 'var(--bg)', borderRadius: 12 }}>
                <div style={{ fontWeight: 600, marginBottom: 12 }}>Operasi Masal - Batas Jam Guru</div>
                <div className="grid grid-4" style={{ gap: 12, marginBottom: 12 }}>
                  <div className="form-group">
                    <label className="form-label">Max/Minggu</label>
                    <input type="number" value={bulkMaxWeek} onChange={e => setBulkMaxWeek(e.target.value)} placeholder="Kosong = skip" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Max/Hari</label>
                    <input type="number" value={bulkMaxDay} onChange={e => setBulkMaxDay(e.target.value)} placeholder="Kosong = skip" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Min Jam Linier</label>
                    <input type="number" value={bulkMinLinier} onChange={e => setBulkMinLinier(e.target.value)} placeholder="Kosong = skip" />
                  </div>
                  <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <button onClick={applyBulkLimits} disabled={saving || (!bulkMaxWeek && !bulkMaxDay && !bulkMinLinier)}>
                      {saving ? 'Menyimpan...' : 'Terapkan ke Semua'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Individual Limits */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontWeight: 600, marginBottom: 12 }}>Batas Jam per Guru</div>
                <div className="toolbar" style={{ marginBottom: 12 }}>
                  <div className="search-wrapper">
                    <Search size={18} className="search-icon" />
                    <input placeholder="Cari guru..." value={limitFilter} onChange={e => { setLimitFilter(e.target.value); setLimitPage(1); }} />
                  </div>
                  <button className="outline icon-only" onClick={() => setLimitPage(p => Math.max(1, p - 1))} disabled={limitPage === 1}><ChevronLeft size={18} /></button>
                  <span style={{ color: 'var(--muted)', fontSize: 14 }}>Hal {limitPage}/{Math.ceil(filteredLimits.length / PAGE_SIZE) || 1}</span>
                  <button className="outline icon-only" onClick={() => setLimitPage(p => p + 1)} disabled={limitPage >= Math.ceil(filteredLimits.length / PAGE_SIZE)}><ChevronRight size={18} /></button>
                </div>
                <table className="table">
                  <thead><tr><th>Guru</th><th>Max/Minggu</th><th>Max/Hari</th><th>Min Linier</th><th>Aksi</th></tr></thead>
                  <tbody>
                    {filteredLimits.slice((limitPage - 1) * PAGE_SIZE, limitPage * PAGE_SIZE).map(t => {
                      const limits = teacherLimitsLocal[t.id] || {};
                      return (
                        <tr key={t.id}>
                          <td style={{ fontWeight: 600 }}>{t.name}</td>
                          <td><input type="number" value={limits.maxWeek ?? ''} onChange={e => updateTeacherLimit(t.id, 'maxWeek', e.target.value)} placeholder="∞" style={{ width: 70 }} /></td>
                          <td><input type="number" value={limits.maxDay ?? ''} onChange={e => updateTeacherLimit(t.id, 'maxDay', e.target.value)} placeholder="∞" style={{ width: 70 }} /></td>
                          <td><input type="number" value={limits.minLinier ?? ''} onChange={e => updateTeacherLimit(t.id, 'minLinier', e.target.value)} placeholder="-" style={{ width: 70 }} /></td>
                          <td><button className="outline sm" onClick={() => saveTeacherLimit(t.id)}><Save size={14} /></button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Generate Actions */}
              <div className="toolbar" style={{ marginBottom: 24 }}>
                <button className="secondary" onClick={generate} disabled={!canGenerate || generating}>
                  <Play size={18} /> {generating ? 'Generating...' : 'Generate Jadwal'}
                </button>
                <button className="outline" onClick={reset}><RotateCcw size={18} /> Reset</button>
                <button className="success" onClick={apply} disabled={generated.length === 0 || applying}>
                  <Check size={18} /> {applying ? 'Menerapkan...' : 'Terapkan ke Database'}
                </button>
              </div>

              {/* Linear Warnings */}
              {linearWarnings.length > 0 && (
                <div style={{ padding: 16, background: 'var(--warning-50)', borderRadius: 12, marginBottom: 16 }}>
                  <div style={{ fontWeight: 600, color: 'var(--warning-600)', marginBottom: 8 }}>
                    <AlertCircle size={18} style={{ display: 'inline', marginRight: 8 }} />
                    Peringatan Jam Linier
                  </div>
                  {linearWarnings.map((w, idx) => (
                    <div key={idx} style={{ fontSize: 13, marginBottom: 4 }}>
                      {w.teacherName}: {w.actual} jam (min: {w.required})
                    </div>
                  ))}
                </div>
              )}

              {/* Preview */}
              {generated.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontWeight: 600, marginBottom: 12 }}>Preview Jadwal</div>
                  <div className="toolbar" style={{ marginBottom: 16 }}>
                    <select value={viewDay} onChange={e => setViewDay(e.target.value)}>
                      {days.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <span style={{ color: 'var(--success-600)', fontWeight: 600 }}>Total: {generated.length} slot</span>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Kelas</th>
                          {Array.from({ length: gridData.hours }).map((_, i) => <th key={i}>Jam {i + 1}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {gridData.classes.map(c => (
                          <tr key={c.id}>
                            <td style={{ fontWeight: 700, color: 'var(--primary-700)' }}>{c.name}</td>
                            {Array.from({ length: gridData.hours }).map((_, i) => {
                              const cell = gridData.map.get(`${c.id}-${i + 1}`);
                              return (
                                <td key={i}>
                                  {cell ? (
                                    <div style={{ background: colorBySubject(cell.subject), borderRadius: 8, padding: '4px 6px', fontSize: 11 }}>
                                      <div style={{ fontWeight: 600 }}>{cell.subject}</div>
                                      <div style={{ color: 'var(--muted)' }}>{cell.teacher}</div>
                                    </div>
                                  ) : <span style={{ color: 'var(--muted)' }}>-</span>}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Failed */}
              {failed.length > 0 && (
                <div style={{ padding: 16, background: 'var(--danger-50)', borderRadius: 12 }}>
                  <div style={{ fontWeight: 600, color: 'var(--danger-600)', marginBottom: 8 }}>
                    <XCircle size={18} style={{ display: 'inline', marginRight: 8 }} />
                    Slot Gagal: {failed.length}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {failed.slice(0, 20).map((f, idx) => (
                      <span key={idx} style={{ background: 'white', padding: '4px 8px', borderRadius: 6, fontSize: 12 }}>
                        {f.hari} Jam-{f.jamKe} ({meta?.classes?.find(c => String(c.id) === String(f.kelas))?.name})
                      </span>
                    ))}
                    {failed.length > 20 && <span style={{ fontSize: 12, color: 'var(--danger-600)' }}>+{failed.length - 20} lainnya</span>}
                  </div>
                </div>
              )}

              {generated.length === 0 && !generating && (
                <div className="empty">Klik "Generate Jadwal" untuk membuat jadwal otomatis.</div>
              )}

              <div className="step-actions">
                <button className="outline" onClick={goPrev}><ChevronLeft size={18} /> Kembali</button>
                <div></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
