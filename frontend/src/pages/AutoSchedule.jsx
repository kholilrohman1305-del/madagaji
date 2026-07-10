import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { showConfirm } from '../utils/confirm';
import { toast } from '../utils/toast';

const ALL_DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
const TINGKAT_LIST = ['X', 'XI', 'XII'];

const CELL_COLORS = [
  { bg: '#dbeafe', text: '#1e40af' }, { bg: '#dcfce7', text: '#166534' },
  { bg: '#fef9c3', text: '#854d0e' }, { bg: '#fce7f3', text: '#9d174d' },
  { bg: '#ede9fe', text: '#5b21b6' }, { bg: '#ffedd5', text: '#9a3412' },
  { bg: '#cffafe', text: '#155e75' }, { bg: '#fee2e2', text: '#991b1b' },
  { bg: '#d1fae5', text: '#065f46' }, { bg: '#e0e7ff', text: '#3730a3' },
  { bg: '#fbcfe8', text: '#831843' }, { bg: '#a7f3d0', text: '#064e3b' },
  { bg: '#bfdbfe', text: '#1e3a8a' }, { bg: '#fde68a', text: '#78350f' },
  { bg: '#c7d2fe', text: '#3730a3' }, { bg: '#a5f3fc', text: '#0e7490' },
  { bg: '#fca5a5', text: '#7f1d1d' }, { bg: '#6ee7b7', text: '#064e3b' },
  { bg: '#fed7aa', text: '#7c2d12' }, { bg: '#d8b4fe', text: '#581c87' },
];

// Returns 'PA', 'PI', or '' (campuran/unknown) from kelas_type or class name
function getKelasGender(cls) {
  const t = (cls?.kelas_type || '').toUpperCase();
  if (t === 'PA') return 'PA';
  if (t === 'PI') return 'PI';
  // Fallback to name detection
  return extractClassGender(cls?.name || '') === 'L' ? 'PA'
       : extractClassGender(cls?.name || '') === 'P' ? 'PI' : '';
}

function extractTingkat(className) {
  const n = String(className || '').toUpperCase().trim();
  if (n.startsWith('XII')) return 'XII';
  if (n.startsWith('XI'))  return 'XI';
  if (n.startsWith('X'))   return 'X';
  if (n.startsWith('12'))  return 'XII';
  if (n.startsWith('11'))  return 'XI';
  if (n.startsWith('10'))  return 'X';
  return '';
}

function extractClassGender(className) {
  const n = String(className || '').toUpperCase().replace(/[.\-_]/g, ' ');
  if (/\bPA\b|\bPUTRA\b/.test(n)) return 'L';
  if (/\bPI\b|\bPUTRI\b/.test(n)) return 'P';
  return '';
}

function minutesToTime(totalMinutes) {
  const mins = ((Number(totalMinutes) % 1440) + 1440) % 1440;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function timeToMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
  if (!match) return null;
  const h = Math.min(23, Math.max(0, Number(match[1]) || 0));
  const m = Math.min(59, Math.max(0, Number(match[2]) || 0));
  return h * 60 + m;
}

function getSlotTime(slotTimesByTingkat, tingkat, day, jam, startTimeByDay = {}, slotDuration = 45) {
  const saved = slotTimesByTingkat?.[tingkat]?.[day]?.[jam] || slotTimesByTingkat?.[tingkat]?.[day]?.[String(jam)];
  if (saved?.start && saved?.end) return saved;
  const startBase = timeToMinutes(startTimeByDay?.[day]) ?? 7 * 60;
  const start = startBase + (Number(jam) - 1) * Number(slotDuration || 45);
  const end = start + Number(slotDuration || 45);
  return { start: minutesToTime(start), end: minutesToTime(end) };
}

function checkClientConflict(schedule, hari, jamKe, kelas, newGuruId, excludeIdx = -1) {
  if (!newGuruId) return null;
  for (let i = 0; i < schedule.length; i++) {
    if (i === excludeIdx) continue;
    const r = schedule[i];
    if (String(r.guruId) === String(newGuruId) && r.hari === hari &&
        String(r.jamKe) === String(jamKe) && String(r.kelas) !== String(kelas)) return r;
  }
  return null;
}

function buildSubjectGroups(tsArr) {
  const map = new Map();
  tsArr.forEach(({ subjectId, tingkat, classId, isLinear }) => {
    const key = String(subjectId); // always string — matches sid = String(s.id) in render
    if (!map.has(key)) map.set(key, { tingkats: new Set(), classIds: new Set(), isLinear: false });
    const g = map.get(key);
    const normalizedClassId = String(classId || '');
    if (normalizedClassId) g.classIds.add(normalizedClassId);
    else g.tingkats.add(tingkat === undefined ? '' : tingkat);
    if (isLinear) g.isLinear = true;
  });
  return map;
}

function flattenSubjectGroups(groups) {
  const arr = [];
  groups.forEach(({ tingkats, classIds, isLinear }, subjectId) => {
    tingkats.forEach(tingkat => arr.push({ subjectId, tingkat, isLinear }));
    classIds.forEach(classId => arr.push({ subjectId, tingkat: '', classId, isLinear }));
    if (!tingkats.size && !classIds.size) arr.push({ subjectId, tingkat: '', isLinear });
  });
  return arr;
}

export default function AutoSchedule() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState(null);

  // Step 1
  const [days, setDays] = useState(['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu']);
  const [hoursByDay, setHoursByDay] = useState({});
  const [maxHoursByTingkat, setMaxHoursByTingkat] = useState({ X: 0, XI: 0, XII: 0 });
  const [slotsByTingkat, setSlotsByTingkat] = useState({ X: {}, XI: {}, XII: {} });
  const [tingkatSlotTab, setTingkatSlotTab] = useState('X');
  const [slotDuration, setSlotDuration] = useState(45);
  const [startTimeByDay, setStartTimeByDay] = useState({});
  const [slotTimesByTingkat, setSlotTimesByTingkat] = useState({ X: {}, XI: {}, XII: {} });
  const [step1Saving, setStep1Saving] = useState(false);

  // Step 2
  const [classSubjectsLocal, setClassSubjectsLocal] = useState({});
  const [subjectModal, setSubjectModal] = useState(null);
  const [classSearch, setClassSearch] = useState('');
  const [resettingClassId, setResettingClassId] = useState('');

  // Step 3
  const [teacherSubjectsLocal, setTeacherSubjectsLocal] = useState({});
  const [teacherModal, setTeacherModal] = useState(null);
  const [teacherModalSaving, setTeacherModalSaving] = useState(false);
  const [modalLevelFilters, setModalLevelFilters] = useState({});
  const [genderFilter, setGenderFilter] = useState('');
  const [teacherSearch, setTeacherSearch] = useState('');
  const [resettingTeacherId, setResettingTeacherId] = useState('');
  const [resettingAllTeachers, setResettingAllTeachers] = useState(false);

  // Step 4
  const [teacherLimitsLocal, setTeacherLimitsLocal] = useState({});
  const [subjectLimitsLocal, setSubjectLimitsLocal] = useState({});
  const [limitSearch, setLimitSearch] = useState('');
  const [bulkMaxWeek, setBulkMaxWeek] = useState('');
  const [bulkMaxDay, setBulkMaxDay] = useState('');
  const [bulkMinLinier, setBulkMinLinier] = useState('');

  // Step 5 — Manual Plot (Locked Slots) — matriks per kelas
  const [lockedSlots, setLockedSlots] = useState([]);
  const [lockedSlotsLoading, setLockedSlotsLoading] = useState(false);
  const [plotClass, setPlotClass] = useState('');
  const [plotEdit, setPlotEdit] = useState(null); // { hari, jam }
  const [plotTeacher, setPlotTeacher] = useState('');
  const [plotMapel, setPlotMapel] = useState('');
  const [lockSaving, setLockSaving] = useState(false);
  const [importModal, setImportModal] = useState(null); // { phase: 'upload'|'preview', data }

  // Step 6
  const [generated, setGenerated] = useState(null);
  const [failed, setFailed] = useState([]);
  const [capacityWarnings, setCapacityWarnings] = useState(null);
  const [linearWarnings, setLinearWarnings] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [previewTab, setPreviewTab] = useState('matrix');
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedGuruPreview, setSelectedGuruPreview] = useState('');
  const [conflictAlert, setConflictAlert] = useState(null);
  const [editingCell, setEditingCell] = useState(null);
  const [editTeacher, setEditTeacher] = useState('');
  const [editMapel, setEditMapel] = useState('');

  // Step 7
  const [finalizing, setFinalizing] = useState(false);
  const [finalized, setFinalized] = useState(false);

  const loadLockedSlots = () => {
    setLockedSlotsLoading(true);
    api.get('/scheduler/locked-slots').then(r => setLockedSlots(r.data || [])).finally(() => setLockedSlotsLoading(false));
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([api.get('/scheduler/meta'), api.get('/scheduler/config'), api.get('/scheduler/locked-slots')])
      .then(([metaRes, cfgRes, lockedRes]) => {
        setMeta(metaRes.data);
        setLockedSlots(lockedRes.data || []);
        const cfg = cfgRes.data || {};
        if (cfg.days) {
          setDays(cfg.days);
          const hbd = cfg.hoursByDay || {};
          setHoursByDay(hbd);
          setStartTimeByDay(cfg.startTimeByDay || {});
          setSlotTimesByTingkat(cfg.slotTimesByTingkat || { X: {}, XI: {}, XII: {} });
          setSlotDuration(cfg.slotDuration || 45);

          if (cfg.slotsByTingkat) {
            setSlotsByTingkat(cfg.slotsByTingkat);
            const mh = {};
            TINGKAT_LIST.forEach(t => {
              const vals = Object.values(cfg.slotsByTingkat[t] || {});
              mh[t] = vals.length ? Math.max(0, ...vals.map(arr => arr.length ? Math.max(...arr) : 0)) : 0;
            });
            setMaxHoursByTingkat(mh);
          } else if (cfg.hoursByDayByTingkat) {
            const sts = {};
            const mh = {};
            TINGKAT_LIST.forEach(t => {
              sts[t] = {};
              let maxN = 0;
              cfg.days.forEach(day => {
                const n = Number(cfg.hoursByDayByTingkat[t]?.[day] || 0);
                sts[t][day] = Array.from({ length: n }, (_, i) => i + 1);
                if (n > maxN) maxN = n;
              });
              mh[t] = maxN;
            });
            setSlotsByTingkat(sts);
            setMaxHoursByTingkat(mh);
          } else if (Object.keys(hbd).length) {
            const sts = {};
            const mh = {};
            let globalMax = 0;
            TINGKAT_LIST.forEach(t => {
              sts[t] = {};
              cfg.days.forEach(day => {
                const n = Number(hbd[day] || 0);
                sts[t][day] = Array.from({ length: n }, (_, i) => i + 1);
                if (n > globalMax) globalMax = n;
              });
              mh[t] = globalMax;
            });
            setSlotsByTingkat(sts);
            setMaxHoursByTingkat(mh);
          }
        }
        const csMap = {};
        (metaRes.data?.classSubjects || []).forEach(cs => {
          if (!csMap[cs.class_id]) csMap[cs.class_id] = {};
          csMap[cs.class_id][cs.subject_id] = cs.hours_per_week || 2;
        });
        setClassSubjectsLocal(csMap);
        const tsMap = {};
        (metaRes.data?.teacherSubjects || []).forEach(ts => {
          if (!tsMap[ts.teacher_id]) tsMap[ts.teacher_id] = [];
          tsMap[ts.teacher_id].push({
            subjectId: ts.subject_id,
            tingkat: ts.tingkat || '',
            classId: ts.class_id ? String(ts.class_id) : '',
            isLinear: ts.is_linear === 1 || ts.is_linear === true
          });
        });
        setTeacherSubjectsLocal(tsMap);
        const tlMap = {};
        (metaRes.data?.teacherLimits || []).forEach(tl => {
          tlMap[tl.teacher_id] = {
            maxWeek: tl.max_hours_per_week ?? '',
            maxDay: tl.max_hours_per_day ?? '',
            minLinier: tl.min_hours_linier ?? '',
            availableSlots: Array.isArray(tl.available_slots) ? tl.available_slots.map(Number) : [],
            availableDays: Array.isArray(tl.available_days) ? tl.available_days : [],
            classGenderPref: tl.class_gender_pref || 'both'
          };
        });
        setTeacherLimitsLocal(tlMap);
        const slMap = {};
        (metaRes.data?.subjectLimits || []).forEach(sl => {
          slMap[sl.subject_id] = Array.isArray(sl.available_slots) ? sl.available_slots.map(Number) : [];
        });
        setSubjectLimitsLocal(slMap);
      })
      .finally(() => setLoading(false));
  }, []);

  // ── Computed ─────────────────────────────────────────────────────────────

  const guruMapelColorMap = useMemo(() => {
    if (!generated) return {};
    const keys = [...new Set(generated.map(r => `${r.guruId}-${r.mapelId}`))].sort();
    const map = {};
    keys.forEach((key, idx) => { map[key] = CELL_COLORS[idx % CELL_COLORS.length]; });
    return map;
  }, [generated]);

  const globalMaxHours = useMemo(() => {
    let max = 0;
    TINGKAT_LIST.forEach(t => {
      Object.values(slotsByTingkat[t] || {}).forEach(slots => {
        if (slots.length) { const m = Math.max(...slots); if (m > max) max = m; }
      });
    });
    return max;
  }, [slotsByTingkat]);

  // Kapasitas slot mingguan per tingkat = jumlah slot yang TERCENTANG saja
  // pada hari-hari aktif. Hari aktif yang belum pernah disentuh dihitung penuh
  // (1..maxJam), sama seperti normalisasi di saveStep1.
  const capacityByTingkat = useMemo(() => {
    const cap = {};
    TINGKAT_LIST.forEach(t => {
      cap[t] = days.reduce((sum, day) => {
        const arr = slotsByTingkat[t]?.[day];
        return sum + (arr !== undefined ? arr.length : (maxHoursByTingkat[t] || 0));
      }, 0);
    });
    return cap;
  }, [days, slotsByTingkat, maxHoursByTingkat]);

  const guruSummary = useMemo(() => {
    if (!generated || !meta) return [];
    const map = new Map();
    generated.forEach(r => {
      if (!map.has(r.guruId)) {
        const teacher = meta.teachers?.find(t => String(t.id) === String(r.guruId));
        map.set(r.guruId, { guruId: r.guruId, teacher, totalJam: 0, mapels: new Set(), kelas: new Set() });
      }
      const g = map.get(r.guruId);
      g.totalJam++;
      const subj = meta.subjects?.find(s => String(s.id) === String(r.mapelId));
      if (subj) g.mapels.add(subj.name);
      const cls = meta.classes?.find(c => String(c.id) === String(r.kelas));
      if (cls) g.kelas.add(cls.name);
    });
    return [...map.values()].sort((a, b) => (a.teacher?.name || '').localeCompare(b.teacher?.name || ''));
  }, [generated, meta]);

  // ── Step 1 ───────────────────────────────────────────────────────────────

  // Toggle hari aktif. Saat hari diaktifkan, langsung isi slot penuh (1..maxJam)
  // untuk SEMUA tingkat — tanpa ini, hari baru (mis. Minggu) tidak punya slot
  // aktif dan hasil generate akan kosong di hari tersebut.
  const toggleActiveDay = (d) => {
    const isActive = days.includes(d);
    if (isActive) {
      setDays(prev => prev.filter(x => x !== d));
      setSlotsByTingkat(prev => {
        const next = {};
        TINGKAT_LIST.forEach(t => {
          const dayMap = { ...(prev[t] || {}) };
          delete dayMap[d];
          next[t] = dayMap;
        });
        return next;
      });
    } else {
      setDays(prev => ALL_DAYS.filter(x => prev.includes(x) || x === d));
      setSlotsByTingkat(prev => {
        const next = {};
        TINGKAT_LIST.forEach(t => {
          const maxH = maxHoursByTingkat[t] || 0;
          const existing = prev[t]?.[d];
          next[t] = {
            ...(prev[t] || {}),
            [d]: existing?.length ? existing : Array.from({ length: maxH }, (_, i) => i + 1)
          };
        });
        return next;
      });
    }
  };

  const setMaxForTingkat = (tingkat, rawVal) => {
    const n = Math.max(0, Math.min(12, Number(rawVal) || 0));
    const oldMax = maxHoursByTingkat[tingkat] || 0;
    setMaxHoursByTingkat(prev => ({ ...prev, [tingkat]: n }));
    setSlotsByTingkat(prev => {
      const daySlots = {};
      days.forEach(day => {
        const existing = prev[tingkat]?.[day] || [];
        let result;
        if (n > oldMax) {
          result = existing.filter(x => x <= n);
          for (let i = oldMax + 1; i <= n; i++) result.push(i);
        } else {
          result = existing.filter(x => x <= n);
        }
        daySlots[day] = result.sort((a, b) => a - b);
      });
      return { ...prev, [tingkat]: daySlots };
    });
  };

  const toggleSlot = (tingkat, day, jam) => {
    setSlotsByTingkat(prev => {
      const existing = prev[tingkat]?.[day] || [];
      const updated = existing.includes(jam)
        ? existing.filter(x => x !== jam)
        : [...existing, jam].sort((a, b) => a - b);
      return { ...prev, [tingkat]: { ...(prev[tingkat] || {}), [day]: updated } };
    });
  };

  const updateSlotTime = (tingkat, day, jam, field, value) => {
    setSlotTimesByTingkat(prev => {
      const current = getSlotTime(prev, tingkat, day, jam, startTimeByDay, slotDuration);
      return {
        ...prev,
        [tingkat]: {
          ...(prev[tingkat] || {}),
          [day]: {
            ...(prev[tingkat]?.[day] || {}),
            [jam]: { ...current, [field]: value }
          }
        }
      };
    });
  };

  const toggleAllSlotsForDay = (tingkat, day) => {
    const maxH = maxHoursByTingkat[tingkat] || 0;
    const existing = slotsByTingkat[tingkat]?.[day] || [];
    const allChecked = existing.length === maxH && maxH > 0;
    setSlotsByTingkat(prev => ({
      ...prev,
      [tingkat]: {
        ...(prev[tingkat] || {}),
        [day]: allChecked ? [] : Array.from({ length: maxH }, (_, i) => i + 1)
      }
    }));
  };

  const copySlotToAll = (src) => {
    const srcMax = maxHoursByTingkat[src] || 0;
    const srcSlots = slotsByTingkat[src] || {};
    setMaxHoursByTingkat({ X: srcMax, XI: srcMax, XII: srcMax });
    setSlotsByTingkat({
      X: { ...srcSlots },
      XI: { ...Object.fromEntries(Object.entries(srcSlots).map(([d, s]) => [d, [...s]])) },
      XII: { ...Object.fromEntries(Object.entries(srcSlots).map(([d, s]) => [d, [...s]])) }
    });
    setSlotTimesByTingkat(prev => {
      const srcTimes = prev[src] || {};
      return {
        X: JSON.parse(JSON.stringify(srcTimes)),
        XI: JSON.parse(JSON.stringify(srcTimes)),
        XII: JSON.parse(JSON.stringify(srcTimes))
      };
    });
  };

  const saveStep1 = async () => {
    setStep1Saving(true);
    // Normalize slotsByTingkat: only active days, and any active day a tingkat
    // never touched defaults to full slots (1..maxJam) so it is never silently empty.
    const cleanSts = {};
    TINGKAT_LIST.forEach(t => {
      cleanSts[t] = {};
      const maxH = maxHoursByTingkat[t] || 0;
      days.forEach(day => {
        const existing = slotsByTingkat[t]?.[day];
        cleanSts[t][day] = existing !== undefined
          ? existing
          : Array.from({ length: maxH }, (_, i) => i + 1);
      });
    });
    // Compute hoursByDay as max slot per day across all tingkat (backward compat)
    const newHbd = {};
    days.forEach(day => {
      let max = 0;
      TINGKAT_LIST.forEach(t => {
        const slots = cleanSts[t]?.[day] || [];
        const m = slots.length ? Math.max(...slots) : 0;
        if (m > max) max = m;
      });
      newHbd[day] = max;
    });
    setSlotsByTingkat(cleanSts);
    setHoursByDay(newHbd);
    const cleanSlotTimes = {};
    TINGKAT_LIST.forEach(t => {
      cleanSlotTimes[t] = {};
      days.forEach(day => {
        cleanSlotTimes[t][day] = {};
        (cleanSts[t]?.[day] || []).forEach(jam => {
          cleanSlotTimes[t][day][jam] = getSlotTime(slotTimesByTingkat, t, day, jam, startTimeByDay, slotDuration);
        });
      });
    });
    try {
      await api.put('/scheduler/config', { days, hoursByDay: newHbd, slotsByTingkat: cleanSts, slotDuration, startTimeByDay, slotTimesByTingkat: cleanSlotTimes });
      setStep(2);
    } finally { setStep1Saving(false); }
  };

  // ── Step 2 ───────────────────────────────────────────────────────────────

  const openSubjectModal = (classId) => {
    const current = classSubjectsLocal[classId] || {};
    setSubjectModal({ classId, phase: 'select', tempSelected: Object.keys(current).map(String), tempHours: { ...current } });
  };

  const toggleModalSubject = (sid) => {
    const s = String(sid);
    setSubjectModal(prev => ({
      ...prev,
      tempSelected: prev.tempSelected.includes(s) ? prev.tempSelected.filter(x => x !== s) : [...prev.tempSelected, s]
    }));
  };

  const advanceSubjectModal = () => {
    setSubjectModal(prev => {
      const hours = { ...prev.tempHours };
      prev.tempSelected.forEach(sid => { if (!hours[sid]) hours[sid] = 2; });
      return { ...prev, phase: 'hours', tempHours: hours };
    });
  };

  const saveSubjectModal = async () => {
    const { classId, tempSelected, tempHours } = subjectModal;
    const subjects = tempSelected.map(sid => ({ subjectId: sid, hoursPerWeek: Number(tempHours[sid] || 2) }));
    const newMap = {};
    subjects.forEach(s => { newMap[s.subjectId] = s.hoursPerWeek; });
    setClassSubjectsLocal(prev => ({ ...prev, [classId]: newMap }));
    setSubjectModal(null);
    await api.put(`/scheduler/class-subjects/${classId}`, { subjects });
  };

  const resetClassSubjects = async (classId, className) => {
    const ok = await showConfirm({
      title: 'Reset Mapel Kelas',
      message: `Hapus semua mapping mapel untuk kelas ${className}?`,
      confirmLabel: 'Ya, Hapus',
      danger: true,
    });
    if (!ok) return;
    setResettingClassId(String(classId));
    try {
      setClassSubjectsLocal(prev => ({ ...prev, [classId]: {} }));
      await api.put(`/scheduler/class-subjects/${classId}`, { subjects: [] });
    } finally {
      setResettingClassId('');
    }
  };

  const saveAllClassSubjects = async () => {
    const mappings = [];
    Object.entries(classSubjectsLocal).forEach(([classId, subs]) => {
      Object.entries(subs).forEach(([subjectId, hours]) => mappings.push({ classId, subjectId, hoursPerWeek: hours }));
    });
    await api.put('/scheduler/class-subjects-matrix', { mappings });
    setStep(3);
  };

  // ── Step 3 ───────────────────────────────────────────────────────────────

  const openTeacherModal = (teacherId) => {
    const subs = teacherSubjectsLocal[teacherId] || [];
    const limits = teacherLimitsLocal[teacherId] || {};
    setModalLevelFilters({});
    setTeacherModal({ teacherId, groups: buildSubjectGroups(subs), classGenderPref: limits.classGenderPref || 'both' });
  };

  const toggleClassGenderPref = (type) => {
    setTeacherModal(prev => {
      const current = prev.classGenderPref || 'both';
      let next;
      if (current === 'both') next = type === 'PA' ? 'PI' : 'PA';
      else if (current === type) next = 'both';
      else next = 'both';
      return { ...prev, classGenderPref: next };
    });
  };

  const toggleModalSubjectTeacher = (sid) => {
    setTeacherModal(prev => {
      const groups = new Map(prev.groups);
      if (groups.has(sid)) groups.delete(sid);
      else groups.set(sid, { tingkats: new Set(['']), classIds: new Set(), isLinear: false });
      return { ...prev, groups };
    });
  };

  const toggleModalTingkat = (sid, tingkat) => {
    setTeacherModal(prev => {
      const groups = new Map(prev.groups);
      const g = groups.get(sid);
      if (!g) return prev;
      const ts = new Set(g.tingkats);
      if (tingkat === '') { ts.clear(); ts.add(''); }
      else {
        ts.delete('');
        if (ts.has(tingkat)) ts.delete(tingkat); else ts.add(tingkat);
        if (ts.size === 0) ts.add('');
      }
      groups.set(sid, { ...g, tingkats: ts });
      return { ...prev, groups };
    });
  };

  const toggleModalClass = (sid, classId) => {
    setTeacherModal(prev => {
      const groups = new Map(prev.groups);
      const g = groups.get(sid);
      if (!g) return prev;
      const classIds = new Set(g.classIds || []);
      const normalized = String(classId);
      if (classIds.has(normalized)) classIds.delete(normalized);
      else classIds.add(normalized);
      groups.set(sid, { ...g, classIds });
      return { ...prev, groups };
    });
  };

  const toggleModalLinear = (sid) => {
    setTeacherModal(prev => {
      const groups = new Map(prev.groups);
      const g = groups.get(sid);
      if (g) groups.set(sid, { ...g, isLinear: !g.isLinear });
      return { ...prev, groups };
    });
  };

  const saveTeacherModal = async () => {
    const { teacherId, groups, classGenderPref } = teacherModal;
    const subjects = flattenSubjectGroups(groups);
    setTeacherSubjectsLocal(prev => ({ ...prev, [teacherId]: subjects }));
    setTeacherLimitsLocal(prev => ({
      ...prev,
      [teacherId]: { ...(prev[teacherId] || { maxWeek: '', maxDay: '', minLinier: '', availableSlots: [], availableDays: [] }), classGenderPref: classGenderPref || 'both' }
    }));
    setTeacherModalSaving(true);
    try {
      await api.put(`/scheduler/teacher-subjects/${teacherId}`, { subjects });
      await api.put(`/scheduler/teacher-limit/${teacherId}`, { classGenderPref: classGenderPref || 'both' });
      setTeacherModal(null);
    } finally { setTeacherModalSaving(false); }
  };

  // Select level in teacher modal → only filter which classes are shown, no auto-check
  const selectModalLevel = (sid, level) => {
    setModalLevelFilters(prev => ({ ...prev, [sid]: level }));
  };

  // Reset one teacher's subject mapping
  const resetTeacherSubjects = async (teacherId, teacherName) => {
    const ok = await showConfirm({
      title: 'Reset Mapel Guru',
      message: `Hapus semua mapping mapel untuk ${teacherName}?`,
      confirmLabel: 'Ya, Hapus',
      danger: true,
    });
    if (!ok) return;
    setResettingTeacherId(String(teacherId));
    try {
      await api.put(`/scheduler/teacher-subjects/${teacherId}`, { subjects: [] });
      setTeacherSubjectsLocal(prev => ({ ...prev, [teacherId]: [] }));
      toast.success('Berhasil direset', `Mapping mapel ${teacherName} dikosongkan.`);
    } finally {
      setResettingTeacherId('');
    }
  };

  // Reset ALL teacher subject mappings
  const resetAllTeacherSubjects = async () => {
    const ok = await showConfirm({
      title: 'Reset Semua Mapping Guru',
      message: 'Hapus SEMUA mapping mapel untuk semua guru? Tindakan ini tidak dapat dibatalkan.',
      confirmLabel: 'Ya, Hapus Semua',
      danger: true,
      icon: 'trash',
    });
    if (!ok) return;
    setResettingAllTeachers(true);
    try {
      await api.delete('/scheduler/teacher-subjects-all');
      setTeacherSubjectsLocal({});
      toast.success('Berhasil direset', 'Semua mapping mapel guru telah dikosongkan.');
    } finally {
      setResettingAllTeachers(false);
    }
  };

  // Reset ALL class-subject mappings (Step 2)
  const resetAllClassSubjects = async () => {
    const ok = await showConfirm({
      title: 'Reset Semua Mapping Kelas',
      message: 'Hapus SEMUA mapping mapel untuk semua kelas? Tindakan ini tidak dapat dibatalkan.',
      confirmLabel: 'Ya, Hapus Semua',
      danger: true,
      icon: 'trash',
    });
    if (!ok) return;
    try {
      await api.delete('/scheduler/class-subjects-all');
      setClassSubjectsLocal({});
      toast.success('Berhasil direset', 'Semua mapping mapel kelas telah dikosongkan.');
    } catch (e) { console.error(e); }
  };

  // ── Step 4 ───────────────────────────────────────────────────────────────

  const updateLimit = (teacherId, field, val) => {
    setTeacherLimitsLocal(prev => ({
      ...prev,
      [teacherId]: { ...(prev[teacherId] || { maxWeek: '', maxDay: '', minLinier: '', availableSlots: [], availableDays: [] }), [field]: val }
    }));
  };

  const toggleAvailableDay = (teacherId, day) => {
    setTeacherLimitsLocal(prev => {
      const cur = prev[teacherId] || { maxWeek: '', maxDay: '', minLinier: '', availableSlots: [], availableDays: [] };
      const ad = [...(cur.availableDays || [])];
      const idx = ad.indexOf(day);
      if (idx >= 0) ad.splice(idx, 1); else ad.push(day);
      return { ...prev, [teacherId]: { ...cur, availableDays: ad } };
    });
  };

  const setAllDays = (teacherId) => {
    setTeacherLimitsLocal(prev => ({
      ...prev,
      [teacherId]: { ...(prev[teacherId] || { maxWeek: '', maxDay: '', minLinier: '' }), availableDays: [...days] }
    }));
  };

  const toggleAvailableSlot = (teacherId, jam) => {
    setTeacherLimitsLocal(prev => {
      const cur = prev[teacherId] || { maxWeek: '', maxDay: '', minLinier: '', availableSlots: [], availableDays: [] };
      const slots = [...(cur.availableSlots || [])].map(Number);
      const idx = slots.indexOf(Number(jam));
      if (idx >= 0) slots.splice(idx, 1); else slots.push(Number(jam));
      return { ...prev, [teacherId]: { ...cur, availableSlots: slots.sort((a, b) => a - b) } };
    });
  };

  const setAllAvailableSlots = (teacherId) => {
    setTeacherLimitsLocal(prev => ({
      ...prev,
      [teacherId]: {
        ...(prev[teacherId] || { maxWeek: '', maxDay: '', minLinier: '', availableDays: [] }),
        availableSlots: Array.from({ length: globalMaxHours }, (_, i) => i + 1)
      }
    }));
  };

  const applyBulkLimits = () => {
    setTeacherLimitsLocal(prev => {
      const next = { ...prev };
      (meta?.teachers || []).forEach(t => {
        next[t.id] = {
          ...(prev[t.id] || { availableDays: [] }),
          ...(bulkMaxWeek !== '' ? { maxWeek: bulkMaxWeek } : {}),
          ...(bulkMaxDay !== '' ? { maxDay: bulkMaxDay } : {}),
          ...(bulkMinLinier !== '' ? { minLinier: bulkMinLinier } : {})
        };
      });
      return next;
    });
  };

  const saveAllLimits = async () => {
    const limits = Object.entries(teacherLimitsLocal).map(([teacherId, l]) => ({
      teacherId,
      maxWeek: l.maxWeek !== '' ? Number(l.maxWeek) : null,
      maxDay: l.maxDay !== '' ? Number(l.maxDay) : null,
      minLinier: l.minLinier !== '' ? Number(l.minLinier) : null,
      availableSlots: l.availableSlots?.length > 0 ? l.availableSlots.map(Number) : null,
      availableDays: l.availableDays?.length > 0 ? l.availableDays : null
    }));
    await api.put('/scheduler/teacher-limits-bulk', { limits });
    setStep(5);
  };

  // ── Excel Import ─────────────────────────────────────────────────────────

  const downloadExcelTemplate = () => {
    window.open(`${api.defaults.baseURL}/scheduler/excel-template`, '_blank');
  };

  const handleExcelFileSelect = async (file) => {
    if (!file) return;
    setImportModal({ phase: 'loading' });
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.post('/scheduler/import-excel', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setImportModal({ phase: 'preview', data: res.data });
    } catch (e) {
      setImportModal(null);
      toast.error('Gagal membaca file Excel.', e?.response?.data?.message || e.message);
    }
  };

  const applyImport = async () => {
    if (!importModal?.data) return;
    setImportModal(p => ({ ...p, phase: 'applying' }));
    try {
      await api.post('/scheduler/import-excel/apply', importModal.data);
      // Reload meta to get updated mappings
      const [metaRes, lockedRes] = await Promise.all([api.get('/scheduler/meta'), api.get('/scheduler/locked-slots')]);
      setMeta(metaRes.data);
      setLockedSlots(lockedRes.data || []);
      // Rebuild local state from new meta
      const csMap = {};
      (metaRes.data.classSubjects || []).forEach(r => {
        if (!csMap[r.class_id]) csMap[r.class_id] = {};
        csMap[r.class_id][r.subject_id] = r.hours_per_week;
      });
      setClassSubjectsLocal(csMap);
      const tsMap = {};
      (metaRes.data.teacherSubjects || []).forEach(r => {
        if (!tsMap[r.teacher_id]) tsMap[r.teacher_id] = [];
        tsMap[r.teacher_id].push({ subjectId: r.subject_id, tingkat: r.tingkat || '', classId: r.class_id ? String(r.class_id) : '', isLinear: r.is_linear });
      });
      setTeacherSubjectsLocal(tsMap);
      setImportModal(null);
      toast.success('Import berhasil!', `${importModal.data.classMappings?.length || 0} mapping kelas, ${importModal.data.teacherMappings?.length || 0} mapping guru.`);
    } catch (e) {
      setImportModal(p => ({ ...p, phase: 'preview' }));
      toast.error('Gagal apply import.', e?.response?.data?.message);
    }
  };

  // ── Step 5 — Manual Plot (Locked Slots) ─────────────────────────────────

  const savePlotCell = async () => {
    if (!plotEdit || !plotClass || !plotTeacher || !plotMapel) {
      toast.warn('Pilih guru dan mapel dulu.');
      return;
    }
    setLockSaving(true);
    try {
      await api.post('/scheduler/locked-slots', {
        teacher_id: Number(plotTeacher),
        subject_id: Number(plotMapel),
        class_ids: [Number(plotClass)],
        jam_kes: [Number(plotEdit.jam)],
        hari: plotEdit.hari,
      });
      toast.success(`Slot ${plotEdit.hari} jam ke-${plotEdit.jam} terkunci.`);
      setPlotEdit(null); setPlotTeacher(''); setPlotMapel('');
      loadLockedSlots();
    } finally { setLockSaving(false); }
  };

  const removeLockedCell = async (r) => {
    const ok = await showConfirm({
      title: 'Hapus Slot Terkunci',
      message: `Hapus ${r.teacher_name} — ${r.subject_name} (${r.hari} jam ke-${r.jam_ke})?`,
      confirmLabel: 'Ya, Hapus', danger: true
    });
    if (!ok) return;
    await deleteLockedSlot(r.id);
  };

  const deleteLockedSlot = async (id) => {
    await api.delete(`/scheduler/locked-slots/${id}`);
    setLockedSlots(prev => prev.filter(r => r.id !== id));
    toast.success('Slot terkunci dihapus.');
  };

  const clearAllLockedSlots = async () => {
    const ok = await showConfirm({ title: 'Hapus Semua Slot Terkunci', message: 'Hapus semua manual plot? Tindakan ini tidak dapat dibatalkan.', confirmLabel: 'Ya, Hapus Semua', danger: true });
    if (!ok) return;
    await api.delete('/scheduler/locked-slots/all');
    setLockedSlots([]);
    toast.success('Semua slot terkunci dihapus.');
  };

  // ── Step 6 ───────────────────────────────────────────────────────────────

  const doGenerate = async () => {
    setGenerating(true);
    setConflictAlert(null);
    try {
      const res = await api.post('/scheduler/generate', { days, hoursByDay, slotsByTingkat });
      setGenerated(res.data.generated || []);
      setFailed(res.data.failed || []);
      setCapacityWarnings(res.data.capacityWarnings || null);
      setLinearWarnings(res.data.linearWarnings || []);
      setPreviewTab('matrix');
      setSelectedClass('');
      setSelectedGuruPreview('');
    } finally { setGenerating(false); }
  };

  const handleRegenerate = async () => {
    if (generated?.length) {
      const ok = await showConfirm({
        title: 'Re-Generate Jadwal',
        message: 'Re Generate akan mengganti semua hasil preview dan edit manual yang belum difinalisasi. Lanjutkan?',
        confirmLabel: 'Ya, Generate Ulang',
        danger: true,
      });
      if (!ok) return;
    }
    setEditingCell(null);
    setEditTeacher('');
    setEditMapel('');
    await doGenerate();
  };

  const getTeacherEditSubjects = (teacherId) => {
    if (!teacherId) return [];
    const subs = teacherSubjectsLocal[String(teacherId)] || [];
    return [...new Set(subs.map(s => String(s.subjectId)))];
  };

  const startCellEdit = (hari, jamKe, kelas) => {
    if (editingCell) return;
    const row = generated.find(r => r.hari === hari && String(r.jamKe) === String(jamKe) && String(r.kelas) === String(kelas));
    setEditingCell({ hari, jamKe, kelas });
    setEditTeacher(row ? String(row.guruId) : '');
    setEditMapel(row ? String(row.mapelId) : '');
    setConflictAlert(null);
  };

  const applyCellEdit = () => {
    if (!editingCell) return;
    const { hari, jamKe, kelas } = editingCell;
    const idx = generated.findIndex(r => r.hari === hari && String(r.jamKe) === String(jamKe) && String(r.kelas) === String(kelas));
    if (!editTeacher) {
      setGenerated(prev => { const next = [...prev]; if (idx >= 0) next.splice(idx, 1); return next; });
      setEditingCell(null); setEditTeacher(''); setEditMapel(''); return;
    }
    const conflict = checkClientConflict(generated, hari, String(jamKe), String(kelas), editTeacher, idx);
    if (conflict) {
      const ct = meta?.teachers?.find(t => String(t.id) === editTeacher);
      const cc = meta?.classes?.find(c => String(c.id) === String(conflict.kelas));
      const cs = meta?.subjects?.find(s => String(s.id) === String(conflict.mapelId));
      setConflictAlert({ message: `BENTROK! ${ct?.name || editTeacher} sudah mengajar ${cs?.name || ''} di ${cc?.name || conflict.kelas} pada ${hari} jam ke-${jamKe}.` });
      return;
    }
    const existingRow = idx >= 0 ? generated[idx] : null;
    const useMapel = editMapel || existingRow?.mapelId || '';
    const newRow = { hari, jamKe: String(jamKe), kelas: String(kelas), mapelId: String(useMapel), guruId: editTeacher };
    setGenerated(prev => { const next = [...prev]; if (idx >= 0) next[idx] = newRow; else next.push(newRow); return next; });
    setConflictAlert(null); setEditingCell(null); setEditTeacher(''); setEditMapel('');
  };

  const cancelCellEdit = () => { setEditingCell(null); setEditTeacher(''); setEditMapel(''); setConflictAlert(null); };

  // Rekomendasi untuk slot kosong: mapel kelas ini yang jam/minggu-nya belum
  // terpenuhi di preview + guru pengampunya yang bebas di hari+jam tersebut
  // (tidak bentrok, sesuai hari tersedia, batas jam, dan preferensi PA/PI).
  const editRecs = useMemo(() => {
    if (!editingCell || !meta || !generated) return [];
    const { hari, jamKe, kelas } = editingCell;
    const hasRow = generated.some(r => r.hari === hari && String(r.jamKe) === String(jamKe) && String(r.kelas) === String(kelas));
    if (hasRow) return [];
    const cls = meta.classes?.find(c => String(c.id) === String(kelas));
    const tingkat = extractTingkat(cls?.name || '');
    const kelasG = getKelasGender(cls);
    const needs = classSubjectsLocal[kelas] || classSubjectsLocal[Number(kelas)] || {};
    const recs = [];
    for (const [sid, hours] of Object.entries(needs)) {
      const scheduled = generated.filter(r => String(r.kelas) === String(kelas) && String(r.mapelId) === String(sid)).length;
      const remaining = Number(hours) - scheduled;
      if (remaining <= 0) continue;
      for (const [tid, subs] of Object.entries(teacherSubjectsLocal)) {
        const mapped = (subs || []).some(s => String(s.subjectId) === String(sid) && (
          s.classId ? String(s.classId) === String(kelas) : (!s.tingkat || s.tingkat === tingkat)
        ));
        if (!mapped) continue;
        const lim = teacherLimitsLocal[tid] || {};
        if (lim.classGenderPref === 'PA' && kelasG === 'PI') continue;
        if (lim.classGenderPref === 'PI' && kelasG === 'PA') continue;
        if (lim.availableDays?.length && !lim.availableDays.includes(hari)) continue;
        if (lim.availableSlots?.length && !lim.availableSlots.includes(Number(jamKe))) continue;
        const sLim = subjectLimitsLocal[sid] || subjectLimitsLocal[String(sid)];
        if (sLim?.length && !sLim.includes(Number(jamKe))) continue;
        const busy = generated.some(r => String(r.guruId) === String(tid) && r.hari === hari && String(r.jamKe) === String(jamKe));
        if (busy) continue;
        const loadWeek = generated.filter(r => String(r.guruId) === String(tid)).length;
        if (lim.maxWeek !== '' && lim.maxWeek != null && loadWeek >= Number(lim.maxWeek)) continue;
        const loadDay = generated.filter(r => String(r.guruId) === String(tid) && r.hari === hari).length;
        if (lim.maxDay !== '' && lim.maxDay != null && loadDay >= Number(lim.maxDay)) continue;
        recs.push({
          subjectId: String(sid),
          teacherId: String(tid),
          subjectName: meta.subjects?.find(s => String(s.id) === String(sid))?.name || String(sid),
          teacherName: meta.teachers?.find(t => String(t.id) === String(tid))?.name || String(tid),
          remaining,
          teacherLoad: loadWeek
        });
      }
    }
    // Prioritas: kekurangan jam terbanyak dulu, lalu guru dengan beban paling ringan
    recs.sort((a, b) => b.remaining - a.remaining || a.teacherLoad - b.teacherLoad || a.subjectName.localeCompare(b.subjectName));
    return recs;
  }, [editingCell, generated, meta, classSubjectsLocal, teacherSubjectsLocal, teacherLimitsLocal]);

  const editCellIsEmpty = !!editingCell && !generated?.some(r =>
    r.hari === editingCell.hari && String(r.jamKe) === String(editingCell.jamKe) && String(r.kelas) === String(editingCell.kelas));

  // Satu klik pada rekomendasi → langsung isi slot dan tutup form edit
  const applyRecommendation = (rec) => {
    if (!editingCell) return;
    const { hari, jamKe, kelas } = editingCell;
    const conflict = checkClientConflict(generated, hari, String(jamKe), String(kelas), rec.teacherId, -1);
    if (conflict) {
      const cc = meta?.classes?.find(c => String(c.id) === String(conflict.kelas));
      setConflictAlert({ message: `BENTROK! ${rec.teacherName} sudah mengajar di ${cc?.name || conflict.kelas} pada ${hari} jam ke-${jamKe}.` });
      return;
    }
    setGenerated(prev => [...prev, { hari, jamKe: String(jamKe), kelas: String(kelas), mapelId: rec.subjectId, guruId: rec.teacherId }]);
    setConflictAlert(null); setEditingCell(null); setEditTeacher(''); setEditMapel('');
  };

  // ── Step 6 ───────────────────────────────────────────────────────────────

  const doFinalize = async () => {
    setFinalizing(true);
    try {
      await api.post('/scheduler/finalize', { rows: generated });
      setFinalized(true);
    } catch (e) {
      // error toast already shown by global api interceptor — nothing extra needed
    } finally { setFinalizing(false); }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return <div className="empty" style={{ marginTop: 80 }}>Memuat data...</div>;

  const STEPS = [
    { id: 1, label: 'Slot Jam' }, { id: 2, label: 'Kurikulum' },
    { id: 3, label: 'Guru & Mapel' }, { id: 4, label: 'Aturan Guru' },
    { id: 5, label: 'Plot Manual' }, { id: 6, label: 'Generate' }, { id: 7, label: 'Finalisasi' }
  ];

  // Total jam pelajaran yang gagal dijadwalkan (failed berisi grup per kelas+mapel)
  const totalFailedJam = failed.reduce((s, f) => s + (Number(f.jumlahJam) || 1), 0);

  const GenderBadge = ({ gender, long }) => {
    if (!gender) return null;
    const isL = gender === 'L';
    return (
      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: isL ? '#dbeafe' : '#fce7f3', color: isL ? '#1e40af' : '#9d174d' }}>
        {long ? (isL ? '♂ Mengajar kelas PA' : '♀ Mengajar kelas PI') : (isL ? 'PA' : 'PI')}
      </span>
    );
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>

      {/* Step indicator */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 32, overflowX: 'auto' }}>
        {STEPS.map((s, i) => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? '1 1 0' : undefined }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 68 }}>
              <div onClick={() => step > s.id && setStep(s.id)} style={{
                width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 14, cursor: step > s.id ? 'pointer' : 'default',
                background: step === s.id ? 'var(--primary-600)' : step > s.id ? 'var(--success-500)' : '#e2e8f0',
                color: step >= s.id ? '#fff' : '#94a3b8'
              }}>
                {step > s.id ? '✓' : s.id}
              </div>
              <span style={{ fontSize: 10, color: step === s.id ? 'var(--primary-700)' : '#64748b', marginTop: 4, textAlign: 'center', whiteSpace: 'nowrap' }}>{s.label}</span>
            </div>
            {i < STEPS.length - 1 && <div style={{ flex: 1, height: 2, background: step > s.id ? 'var(--success-400)' : '#e2e8f0', margin: '0 2px', marginBottom: 20 }} />}
          </div>
        ))}
      </div>

      {/* ─── STEP 1 ─── */}
      {step === 1 && (
        <div className="modern-table-card">
          <div className="modern-table-title">Step 1 — Konfigurasi Slot Jam</div>

          <div style={{ marginBottom: 20 }}>
            <div className="form-label" style={{ marginBottom: 8 }}>Hari Aktif</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {ALL_DAYS.map(d => {
                const active = days.includes(d);
                return (
                  <label key={d} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '6px 14px', borderRadius: 8, background: active ? 'var(--primary-50)' : '#f8fafc', border: `1.5px solid ${active ? 'var(--primary-400)' : '#e2e8f0'}`, fontWeight: active ? 600 : 400, color: active ? 'var(--primary-700)' : '#64748b' }}>
                    <input type="checkbox" checked={active} onChange={() => toggleActiveDay(d)} />
                    {d}
                  </label>
                );
              })}
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <div className="form-label" style={{ marginBottom: 10 }}>Slot Jam per Tingkat</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              {TINGKAT_LIST.map(t => (
                <button key={t} className={`btn sm${tingkatSlotTab === t ? '' : ' outline'}`} onClick={() => setTingkatSlotTab(t)}>
                  Tingkat {t}
                </button>
              ))}
              <button className="btn outline sm" style={{ marginLeft: 'auto' }} onClick={() => copySlotToAll(tingkatSlotTab)}>
                Salin {tingkatSlotTab} ke Semua
              </button>
            </div>

            {/* Max hours input per tingkat */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, padding: '10px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>Jumlah Jam Tingkat {tingkatSlotTab}:</span>
              <input type="number" min={0} max={12}
                value={maxHoursByTingkat[tingkatSlotTab] || ''}
                onChange={e => setMaxForTingkat(tingkatSlotTab, e.target.value)}
                style={{ width: 64, textAlign: 'center', border: '1.5px solid #cbd5e1', borderRadius: 6, padding: '5px 8px', fontSize: 14 }}
              />
              <span style={{ fontSize: 12, color: '#94a3b8' }}>jam/hari (maksimal)</span>
            </div>

            {/* Checkbox grid */}
            {maxHoursByTingkat[tingkatSlotTab] > 0 && days.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', fontSize: 13, minWidth: 400 }}>
                  <thead>
                    <tr>
                      <th style={{ padding: '7px 14px', textAlign: 'left', background: '#f1f5f9', border: '1px solid #e2e8f0', fontWeight: 600, color: '#475569', minWidth: 80 }}>Hari</th>
                      <th style={{ padding: '7px 10px', background: '#f1f5f9', border: '1px solid #e2e8f0', textAlign: 'center', minWidth: 80, color: '#475569', fontSize: 12 }}>Pilih Semua</th>
                      {Array.from({ length: maxHoursByTingkat[tingkatSlotTab] }, (_, i) => i + 1).map(jam => (
                        <th key={jam} style={{ padding: '7px 8px', background: '#f1f5f9', border: '1px solid #e2e8f0', textAlign: 'center', minWidth: 118, color: '#475569', fontSize: 12 }}>Jam {jam}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {days.map(day => {
                      const activeSlots = slotsByTingkat[tingkatSlotTab]?.[day] || [];
                      const maxH = maxHoursByTingkat[tingkatSlotTab] || 0;
                      const allChecked = activeSlots.length === maxH && maxH > 0;
                      return (
                        <tr key={day}>
                          <td style={{ padding: '7px 14px', fontWeight: 600, border: '1px solid #e2e8f0', background: '#fafafa', color: '#374151' }}>{day}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'center', border: '1px solid #e2e8f0', background: allChecked ? '#f0fdf4' : '#fff' }}>
                            <input type="checkbox" checked={allChecked} onChange={() => toggleAllSlotsForDay(tingkatSlotTab, day)} style={{ cursor: 'pointer', width: 15, height: 15 }} />
                          </td>
                          {Array.from({ length: maxH }, (_, i) => i + 1).map(jam => {
                            const active = activeSlots.includes(jam);
                            return (
                              <td key={jam} style={{ padding: 8, textAlign: 'center', border: '1px solid #e2e8f0', background: active ? '#eff6ff' : '#fff' }}>
                                <div style={{ display: 'grid', gap: 5, justifyItems: 'center' }}>
                                  <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#475569', fontWeight: 700 }}>
                                    <input type="checkbox" checked={active} onChange={() => toggleSlot(tingkatSlotTab, day, jam)} style={{ cursor: 'pointer', width: 15, height: 15 }} />
                                    Aktif
                                  </label>
                                  <div style={{ display: 'grid', gap: 4, opacity: active ? 1 : 0.45 }}>
                                    <input
                                      type="time"
                                      value={getSlotTime(slotTimesByTingkat, tingkatSlotTab, day, jam, startTimeByDay, slotDuration).start}
                                      onChange={e => updateSlotTime(tingkatSlotTab, day, jam, 'start', e.target.value)}
                                      disabled={!active}
                                      aria-label={`Jam mulai ${day} slot ${jam}`}
                                      style={{ width: 92, border: '1px solid #cbd5e1', borderRadius: 6, padding: '3px 5px', fontSize: 11 }}
                                    />
                                    <input
                                      type="time"
                                      value={getSlotTime(slotTimesByTingkat, tingkatSlotTab, day, jam, startTimeByDay, slotDuration).end}
                                      onChange={e => updateSlotTime(tingkatSlotTab, day, jam, 'end', e.target.value)}
                                      disabled={!active}
                                      aria-label={`Jam selesai ${day} slot ${jam}`}
                                      style={{ width: 92, border: '1px solid #cbd5e1', borderRadius: 6, padding: '3px 5px', fontSize: 11 }}
                                    />
                                  </div>
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {maxHoursByTingkat[tingkatSlotTab] === 0 && (
              <div style={{ color: '#94a3b8', fontSize: 13, padding: '10px 0' }}>Isi jumlah jam untuk menampilkan pilihan slot.</div>
            )}
          </div>

          {/* Total slot mingguan mengikuti centang — inilah kapasitas yang dipakai step berikutnya */}
          <div style={{ marginBottom: 20, padding: '12px 16px', borderRadius: 10, background: '#f0f9ff', border: '1.5px solid #7dd3fc' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0369a1', marginBottom: 6 }}>
              Total Slot Mingguan (hanya jam yang dicentang)
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {TINGKAT_LIST.map(t => (
                <div key={t} style={{ fontSize: 13, color: '#075985' }}>
                  Tingkat <b>{t}</b>: <b style={{ fontSize: 15 }}>{capacityByTingkat[t] || 0}</b> jam/minggu
                  <span style={{ color: '#0ea5e9', marginLeft: 4, fontSize: 12 }}>
                    ({days.map(d => (slotsByTingkat[t]?.[d] !== undefined ? slotsByTingkat[t][d].length : (maxHoursByTingkat[t] || 0))).join('+')})
                  </span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11.5, color: '#0284c7', marginTop: 6 }}>
              Angka ini menjadi kapasitas maksimal jam pelajaran per kelas di Step 2 dan perhitungan generate.
            </div>
          </div>

          <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="form-label" style={{ marginBottom: 0 }}>Durasi Slot</span>
            <input type="number" min={20} max={90} value={slotDuration} onChange={e => setSlotDuration(Number(e.target.value))}
              style={{ width: 72, border: '1.5px solid #cbd5e1', borderRadius: 6, padding: '5px 8px', textAlign: 'center' }} />
            <span style={{ color: '#64748b', fontSize: 13 }}>menit/slot</span>
          </div>

          <button className="btn" onClick={saveStep1} disabled={step1Saving}>
            {step1Saving ? 'Menyimpan...' : 'Simpan & Lanjut →'}
          </button>
        </div>
      )}

      {/* ─── STEP 2 ─── */}
      {step === 2 && (
        <div className="modern-table-card">
          <div className="modern-table-title">Step 2 — Mapping Mapel per Kelas</div>
          <div style={{ marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <input placeholder="Cari kelas..." value={classSearch} onChange={e => setClassSearch(e.target.value)}
              style={{ border: '1.5px solid #cbd5e1', borderRadius: 8, padding: '7px 14px', flex: 1, minWidth: 140 }} />
            <button className="btn sm outline" onClick={downloadExcelTemplate} title="Download template Excel (2 sheet)">
              ⬇ Template Excel
            </button>
            <label className="btn sm outline" style={{ cursor: 'pointer' }} title="Import dari Excel">
              ⬆ Import Excel
              <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={e => { handleExcelFileSelect(e.target.files[0]); e.target.value = ''; }} />
            </label>
            <button
              className="btn sm"
              style={{ background: '#fee2e2', color: '#dc2626', border: '1.5px solid #fca5a5' }}
              onClick={resetAllClassSubjects}
            >
              Reset Semua
            </button>
            <button className="btn outline sm" onClick={() => setStep(1)}>← Kembali</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ minWidth: 480 }}>
              <thead><tr><th>Kelas</th><th style={{ textAlign: 'center' }}>Tingkat</th><th style={{ textAlign: 'center' }}>Gender</th><th>Mapel</th><th style={{ textAlign: 'center' }}>Aksi</th></tr></thead>
              <tbody>
                {(meta?.classes || []).filter(c => !classSearch || c.name.toLowerCase().includes(classSearch.toLowerCase())).map(cls => {
                  const subs = classSubjectsLocal[cls.id] || {};
                  const subCount = Object.keys(subs).length;
                  const totalH = Object.values(subs).reduce((a, b) => a + Number(b), 0);
                  const tingkat = extractTingkat(cls.name);
                  const kelasGender = getKelasGender(cls);
                  return (
                    <tr key={cls.id}>
                      <td><span style={{ fontWeight: 600 }}>{cls.name}</span></td>
                      <td style={{ textAlign: 'center' }}>{tingkat && <span className="badge">{tingkat}</span>}</td>
                      <td style={{ textAlign: 'center' }}>
                        {kelasGender === 'PA'
                          ? <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: '#dbeafe', color: '#1e40af' }}>PA</span>
                          : kelasGender === 'PI'
                          ? <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: '#fce7f3', color: '#9d174d' }}>PI</span>
                          : <span style={{ fontSize: 11, color: '#94a3b8' }}>—</span>}
                      </td>
                      <td style={{ fontSize: 13 }}>
                        {subCount > 0 ? (() => {
                          const cap = capacityByTingkat[tingkat] || 0;
                          const over = totalH > cap;
                          return (
                            <span>
                              {subCount} mapel · <b style={{ color: over ? '#dc2626' : '#15803d' }}>{totalH}</b>
                              <span style={{ color: '#94a3b8' }}> / {cap} slot</span>
                              {over && (
                                <span style={{ display: 'block', fontSize: 11, color: '#dc2626', fontWeight: 600 }}>
                                  ⚠ melebihi kapasitas slot tingkat {tingkat || '—'} ({cap} jam) — kurangi jam mapel atau tambah slot di Step 1
                                </span>
                              )}
                            </span>
                          );
                        })() : <span style={{ color: '#94a3b8' }}>Belum diatur</span>}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                          <button className="btn sm" onClick={() => openSubjectModal(cls.id)}>Setting</button>
                          <button
                            className="btn sm outline"
                            onClick={() => resetClassSubjects(cls.id, cls.name)}
                            disabled={subCount === 0 || resettingClassId === String(cls.id)}
                          >
                            {resettingClassId === String(cls.id) ? 'Reset...' : 'Reset Mapel'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 18 }}>
            <button className="btn success" onClick={saveAllClassSubjects}>Simpan & Lanjut →</button>
          </div>

          {subjectModal && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
              <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 460, maxHeight: '80vh', overflowY: 'auto' }}>
                {(() => {
                  const cls = meta.classes?.find(c => String(c.id) === String(subjectModal.classId));
                  const gender = extractClassGender(cls?.name || '');
                  return (
                    <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
                      <strong style={{ fontSize: 16, flex: 1 }}>{cls?.name}</strong>
                      {gender && <GenderBadge gender={gender} />}
                    </div>
                  );
                })()}
                {subjectModal.phase === 'select' && (<>
                  <div style={{ fontSize: 13, color: '#64748b', marginBottom: 10 }}>Pilih mapel yang diajarkan:</div>
                  <div style={{ display: 'grid', gap: 7, maxHeight: 320, overflowY: 'auto' }}>
                    {(meta?.subjects || []).map(s => {
                      const checked = subjectModal.tempSelected.includes(String(s.id));
                      return (
                        <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, border: `1.5px solid ${checked ? 'var(--primary-400)' : '#e2e8f0'}`, background: checked ? 'var(--primary-50)' : '#fafafa', cursor: 'pointer' }}>
                          <input type="checkbox" checked={checked} onChange={() => toggleModalSubject(s.id)} />
                          <span style={{ fontWeight: checked ? 600 : 400 }}>{s.name}</span>
                        </label>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                    <button className="btn sm" onClick={advanceSubjectModal} disabled={!subjectModal.tempSelected.length}>Lanjut →</button>
                    <button className="btn outline sm" onClick={() => setSubjectModal(null)}>Batal</button>
                  </div>
                </>)}
                {subjectModal.phase === 'hours' && (<>
                  <div style={{ fontSize: 13, color: '#64748b', marginBottom: 10 }}>Atur jam per minggu:</div>
                  <div style={{ display: 'grid', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
                    {subjectModal.tempSelected.map(sid => {
                      const s = meta.subjects?.find(x => String(x.id) === sid);
                      return (
                        <div key={sid} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                          <span style={{ flex: 1, fontWeight: 500 }}>{s?.name || sid}</span>
                          <input type="number" min={1} max={20}
                            value={subjectModal.tempHours[sid] ?? 2}
                            onChange={e => setSubjectModal(prev => ({ ...prev, tempHours: { ...prev.tempHours, [sid]: Number(e.target.value) } }))}
                            style={{ width: 58, textAlign: 'center', border: '1.5px solid #cbd5e1', borderRadius: 6, padding: '4px' }}
                          />
                          <span style={{ fontSize: 12, color: '#94a3b8' }}>jam</span>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                    <button className="btn success sm" onClick={saveSubjectModal}>Simpan</button>
                    <button className="btn outline sm" onClick={() => setSubjectModal(p => ({ ...p, phase: 'select' }))}>← Kembali</button>
                  </div>
                </>)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── STEP 3 ─── */}
      {step === 3 && (
        <div className="modern-table-card">
          <div className="modern-table-title">Step 3 — Mapping Guru & Mapel</div>
          <div style={{ marginBottom: 14, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input placeholder="Cari guru..." value={teacherSearch} onChange={e => setTeacherSearch(e.target.value)}
              style={{ border: '1.5px solid #cbd5e1', borderRadius: 8, padding: '7px 14px', flex: 1, minWidth: 150 }} />
            {['', 'L', 'P'].map(g => (
              <button key={g} className={`btn sm${genderFilter === g ? '' : ' outline'}`} onClick={() => setGenderFilter(g)}>
                {g === '' ? 'Semua' : g === 'L' ? '♂ PA' : '♀ PI'}
              </button>
            ))}
            <button className="btn sm outline" onClick={downloadExcelTemplate} title="Download template Excel">
              ⬇ Template Excel
            </button>
            <label className="btn sm outline" style={{ cursor: 'pointer' }} title="Import dari Excel">
              ⬆ Import Excel
              <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={e => { handleExcelFileSelect(e.target.files[0]); e.target.value = ''; }} />
            </label>
            <button
              className="btn sm"
              style={{ background: '#fee2e2', color: '#dc2626', border: '1.5px solid #fca5a5' }}
              onClick={resetAllTeacherSubjects}
              disabled={resettingAllTeachers}
            >
              {resettingAllTeachers ? 'Mereset...' : 'Reset Semua'}
            </button>
            <button className="btn outline sm" onClick={() => setStep(2)}>← Kembali</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ minWidth: 500 }}>
              <thead><tr><th>Guru</th><th style={{ textAlign: 'center' }}>Gender</th><th style={{ textAlign: 'center' }}>Kelas Ajar</th><th>Mapel & Kelas</th><th style={{ textAlign: 'center' }}>Aksi</th></tr></thead>
              <tbody>
                {(meta?.teachers || []).filter(t => {
                  if (genderFilter && t.gender !== genderFilter) return false;
                  if (teacherSearch && !t.name.toLowerCase().includes(teacherSearch.toLowerCase())) return false;
                  return true;
                }).map(t => {
                  const subs = teacherSubjectsLocal[t.id] || [];
                  const subCount = new Set(subs.map(s => s.subjectId)).size;
                  const classCount = new Set(subs.map(s => s.classId).filter(Boolean)).size;
                  const pref = teacherLimitsLocal[t.id]?.classGenderPref || 'both';
                  const isResetting = resettingTeacherId === String(t.id);
                  return (
                    <tr key={t.id}>
                      <td style={{ fontWeight: 500 }}>{t.name}</td>
                      <td style={{ textAlign: 'center' }}>{t.gender ? <GenderBadge gender={t.gender} /> : <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>}</td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                          {(pref === 'PA' || pref === 'both') && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 8, background: '#dbeafe', color: '#1e40af' }}>PA</span>}
                          {(pref === 'PI' || pref === 'both') && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 8, background: '#fce7f3', color: '#9d174d' }}>PI</span>}
                        </div>
                      </td>
                      <td style={{ fontSize: 13 }}>
                        {subCount > 0
                          ? <span>{subCount} mapel{classCount > 0 ? ` · ${classCount} kelas` : ''}</span>
                          : <span style={{ color: '#94a3b8' }}>Belum diatur</span>}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', gap: 6, justifyContent: 'center' }}>
                          <button className="btn sm" onClick={() => openTeacherModal(t.id)}>Setting</button>
                          <button
                            className="btn sm outline"
                            style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                            disabled={subCount === 0 || isResetting}
                            onClick={() => resetTeacherSubjects(t.id, t.name)}
                          >
                            {isResetting ? '...' : 'Reset'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 18 }}>
            <button className="btn success" onClick={() => setStep(4)}>Lanjut →</button>
          </div>

          {teacherModal && (() => {
            const teacher = meta.teachers?.find(t => String(t.id) === String(teacherModal.teacherId));
            return (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 12 }}>
                <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 'min(900px, 96vw)', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
                  {/* Header */}
                  <div style={{ padding: '18px 24px 14px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', marginBottom: 3 }}>Setting Mapel Guru</div>
                      <strong style={{ fontSize: 17 }}>{teacher?.name}</strong>
                    </div>
                    {teacher?.gender && <GenderBadge gender={teacher.gender} long />}
                    <button onClick={() => setTeacherModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#94a3b8', padding: '0 4px', lineHeight: 1 }}>✕</button>
                  </div>

                  {/* PA/PI preference */}
                  <div style={{ padding: '12px 24px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', flexShrink: 0 }}>
                    <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, marginBottom: 8, textTransform: 'uppercase' }}>Preferensi Kelas Yang Diampu</div>
                    <div style={{ display: 'flex', gap: 12 }}>
                      {[{ key: 'PA', label: '♂ Kelas PA (Putra)', bg: '#dbeafe', color: '#1e40af' }, { key: 'PI', label: '♀ Kelas PI (Putri)', bg: '#fce7f3', color: '#9d174d' }].map(opt => {
                        const pref = teacherModal.classGenderPref || 'both';
                        const checked = pref === 'both' || pref === opt.key;
                        return (
                          <label key={opt.key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '6px 14px', borderRadius: 8, background: checked ? opt.bg : '#fff', border: `1.5px solid ${checked ? opt.color : '#e2e8f0'}` }}>
                            <input type="checkbox" checked={checked} onChange={() => toggleClassGenderPref(opt.key)} />
                            <span style={{ fontWeight: 600, fontSize: 13, color: checked ? opt.color : '#64748b' }}>{opt.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Subjects list */}
                  <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
                      Centang mapel yang diampu, pilih kelas per tingkat, beri ⭐ untuk mapel linier (jam berurutan).
                      {(() => {
                        const pref = teacherModal.classGenderPref || 'both';
                        if (pref === 'PA') return <span style={{ marginLeft: 8, fontWeight: 600, color: '#1e40af' }}>· Menampilkan kelas PA saja</span>;
                        if (pref === 'PI') return <span style={{ marginLeft: 8, fontWeight: 600, color: '#9d174d' }}>· Menampilkan kelas PI saja</span>;
                        return null;
                      })()}
                    </div>
                    <div style={{ display: 'grid', gap: 10 }}>
                      {(meta?.subjects || []).map(s => {
                        const sid = String(s.id);
                        const inMap = teacherModal.groups.has(sid);
                        const g = teacherModal.groups.get(sid);
                        const levelFilter = modalLevelFilters[sid] || '';
                        const checkedClassIds = g?.classIds || new Set();
                        const pref = teacherModal.classGenderPref || 'both';
                        const allClasses = (meta?.classes || []).filter(cls => {
                          // Filter by gender preference
                          if (pref === 'PA') return getKelasGender(cls) === 'PA' || getKelasGender(cls) === '';
                          if (pref === 'PI') return getKelasGender(cls) === 'PI' || getKelasGender(cls) === '';
                          return true; // 'both' → tampilkan semua
                        });
                        const filteredClasses = levelFilter
                          ? allClasses.filter(cls => extractTingkat(cls.name) === levelFilter)
                          : allClasses;
                        const allFilteredChecked = filteredClasses.length > 0 && filteredClasses.every(cls => checkedClassIds.has(String(cls.id)));

                        return (
                          <div key={sid} style={{ borderRadius: 10, border: `1.5px solid ${inMap ? '#6366f1' : '#e2e8f0'}`, background: inMap ? '#f5f3ff' : '#fafafa' }}>
                            {/* Subject header */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px' }}>
                              <input type="checkbox" checked={inMap} onChange={() => toggleModalSubjectTeacher(sid)}
                                style={{ width: 16, height: 16, cursor: 'pointer' }} />
                              <span style={{ flex: 1, fontWeight: inMap ? 700 : 500, fontSize: 14 }}>{s.name}</span>
                              {inMap && (
                                <button title={g.isLinear ? 'Linier (aktif)' : 'Tandai linier'} onClick={() => toggleModalLinear(sid)}
                                  style={{ background: g.isLinear ? '#fef9c3' : 'none', border: g.isLinear ? '1.5px solid #fbbf24' : 'none', borderRadius: 6, cursor: 'pointer', fontSize: 16, padding: '2px 8px', opacity: g.isLinear ? 1 : 0.35 }}>
                                  ⭐ Linier
                                </button>
                              )}
                            </div>

                            {/* Class selector (only when checked) */}
                            {inMap && (
                              <div style={{ padding: '0 16px 14px', borderTop: '1px solid #e0e7ff' }}>
                                {/* Level tabs */}
                                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Tampilkan:</span>
                                  {[{ val: '', label: 'Semua Kelas' }, ...TINGKAT_LIST.map(t => ({ val: t, label: `Kelas ${t}` }))].map(opt => (
                                    <button key={opt.val}
                                      className={`btn sm${levelFilter === opt.val ? '' : ' outline'}`}
                                      style={{ fontSize: 11, padding: '3px 10px' }}
                                      onClick={() => selectModalLevel(sid, opt.val)}>
                                      {opt.label}
                                    </button>
                                  ))}
                                  {/* Centang semua yang tampil */}
                                  {filteredClasses.length > 0 && (
                                    <button
                                      className="btn sm outline"
                                      style={{ fontSize: 11, padding: '3px 10px', marginLeft: 'auto', color: allFilteredChecked ? '#dc2626' : '#16a34a', borderColor: allFilteredChecked ? '#fca5a5' : '#86efac' }}
                                      onClick={() => {
                                        setTeacherModal(prev => {
                                          const groups = new Map(prev.groups);
                                          const group = groups.get(sid);
                                          if (!group) return prev;
                                          const classIds = new Set(group.classIds || []);
                                          if (allFilteredChecked) {
                                            filteredClasses.forEach(cls => classIds.delete(String(cls.id)));
                                          } else {
                                            filteredClasses.forEach(cls => classIds.add(String(cls.id)));
                                          }
                                          groups.set(sid, { ...group, classIds });
                                          return { ...prev, groups };
                                        });
                                      }}
                                    >
                                      {allFilteredChecked ? '✗ Hapus semua tampil' : '✓ Centang semua tampil'}
                                    </button>
                                  )}
                                </div>

                                {/* Class grid */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 6 }}>
                                  {filteredClasses.map(cls => {
                                    const checked = checkedClassIds.has(String(cls.id));
                                    const tingkat = extractTingkat(cls.name);
                                    const kelasGender = getKelasGender(cls);
                                    return (
                                      <label key={cls.id} style={{
                                        display: 'flex', alignItems: 'center', gap: 7, padding: '6px 10px',
                                        borderRadius: 7, cursor: 'pointer',
                                        background: checked ? '#eff6ff' : '#fff',
                                        border: `1.5px solid ${checked ? '#93c5fd' : '#e2e8f0'}`,
                                        fontSize: 12, fontWeight: checked ? 600 : 400
                                      }}>
                                        <input type="checkbox" checked={checked} onChange={() => toggleModalClass(sid, cls.id)}
                                          style={{ width: 14, height: 14, cursor: 'pointer', flexShrink: 0 }} />
                                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cls.name}</span>
                                        {tingkat && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 4, background: '#e0f2fe', color: '#0369a1', flexShrink: 0 }}>{tingkat}</span>}
                                        {kelasGender === 'PA' && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 4, background: '#dbeafe', color: '#1e40af', flexShrink: 0 }}>PA</span>}
                                        {kelasGender === 'PI' && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 4, background: '#fce7f3', color: '#9d174d', flexShrink: 0 }}>PI</span>}
                                      </label>
                                    );
                                  })}
                                </div>
                                {filteredClasses.length === 0 && (
                                  <div style={{ fontSize: 12, color: '#94a3b8', padding: '8px 0' }}>
                                    Tidak ada kelas {pref !== 'both' ? `(${pref}) ` : ''}untuk level ini.
                                  </div>
                                )}
                                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
                                  {checkedClassIds.size} kelas dipilih total
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Footer */}
                  <div style={{ padding: '14px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 10, flexShrink: 0, background: '#f8fafc', borderRadius: '0 0 16px 16px' }}>
                    <button className="btn success" onClick={saveTeacherModal} disabled={teacherModalSaving}>
                      {teacherModalSaving ? 'Menyimpan...' : 'Simpan Mapping'}
                    </button>
                    <button className="btn outline" onClick={() => setTeacherModal(null)}>Batal</button>
                    <div style={{ marginLeft: 'auto', fontSize: 12, color: '#94a3b8', alignSelf: 'center' }}>
                      {teacherModal.groups.size} mapel dipilih
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ─── STEP 4 ─── */}
      {step === 4 && (
        <div className="modern-table-card">
          <div className="modern-table-title">Step 4 — Aturan & Batasan Guru</div>
          <div style={{ padding: 14, borderRadius: 10, background: '#f1f5f9', marginBottom: 18, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {[['Max Jam/Minggu', bulkMaxWeek, setBulkMaxWeek], ['Max Jam/Hari', bulkMaxDay, setBulkMaxDay], ['Min Jam Linier', bulkMinLinier, setBulkMinLinier]].map(([label, val, set]) => (
              <div key={label}>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{label}</div>
                <input type="number" min={0} value={val} onChange={e => set(e.target.value)} placeholder="—"
                  style={{ width: 72, border: '1.5px solid #cbd5e1', borderRadius: 6, padding: '5px 8px', textAlign: 'center' }} />
              </div>
            ))}
            <button className="btn outline sm" onClick={applyBulkLimits}>Terapkan ke Semua</button>
          </div>
          <input placeholder="Cari guru..." value={limitSearch} onChange={e => setLimitSearch(e.target.value)}
            style={{ border: '1.5px solid #cbd5e1', borderRadius: 8, padding: '7px 14px', width: '100%', marginBottom: 12 }} />
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ minWidth: 720 }}>
              <thead><tr><th>Guru</th><th style={{ textAlign: 'center' }}>Max/Minggu</th><th style={{ textAlign: 'center' }}>Max/Hari</th><th style={{ textAlign: 'center' }}>Min Linier</th><th>Jam Tersedia</th><th>Hari Tersedia</th></tr></thead>
              <tbody>
                {(meta?.teachers || []).filter(t => !limitSearch || t.name.toLowerCase().includes(limitSearch.toLowerCase())).map(t => {
                  const lim = teacherLimitsLocal[t.id] || { maxWeek: '', maxDay: '', minLinier: '', availableSlots: [], availableDays: [] };
                  return (
                    <tr key={t.id}>
                      <td style={{ fontWeight: 500, fontSize: 13 }}>{t.name}</td>
                      {['maxWeek', 'maxDay', 'minLinier'].map(field => (
                        <td key={field} style={{ textAlign: 'center' }}>
                          <input type="number" min={0} value={lim[field] ?? ''} onChange={e => updateLimit(t.id, field, e.target.value)}
                            style={{ width: 62, textAlign: 'center', border: '1.5px solid #cbd5e1', borderRadius: 6, padding: '4px' }} />
                        </td>
                      ))}
                      <td>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center', minWidth: 220 }}>
                          {Array.from({ length: globalMaxHours }, (_, i) => i + 1).map(jam => (
                            <label key={jam} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
                              <input type="checkbox" checked={(lim.availableSlots || []).map(Number).includes(jam)} onChange={() => toggleAvailableSlot(t.id, jam)} />
                              {jam}
                            </label>
                          ))}
                          <button className="btn sm outline" style={{ fontSize: 10, padding: '2px 7px' }} onClick={() => setAllAvailableSlots(t.id)}>Semua</button>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                          {days.map(day => (
                            <label key={day} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
                              <input type="checkbox" checked={(lim.availableDays || []).includes(day)} onChange={() => toggleAvailableDay(t.id, day)} />
                              {day.slice(0, 3)}
                            </label>
                          ))}
                          <button className="btn sm outline" style={{ fontSize: 10, padding: '2px 7px' }} onClick={() => setAllDays(t.id)}>Semua</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
            <button className="btn success" onClick={saveAllLimits}>Simpan & Lanjut →</button>
            <button className="btn outline" onClick={() => setStep(3)}>← Kembali</button>
          </div>
        </div>
      )}

      {/* ─── STEP 5 — Manual Plot ─── */}
      {step === 5 && (
        <div className="modern-table-card">
          <div className="modern-table-title">Step 5 — Manual Plot (Slot Terkunci)</div>
          <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
            Pilih kelas, lalu klik langsung sel pada matriks untuk mengunci guru + mapel di slot tersebut.
            Slot terkunci <strong>tidak akan berubah</strong> saat generate jadwal otomatis.
            Guru yang sama boleh dikunci di jam yang sama pada beberapa kelas (multi-kelas).
          </p>

          {/* Matriks plot per kelas */}
          <div style={{ marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={plotClass}
              onChange={e => { setPlotClass(e.target.value); setPlotEdit(null); setPlotTeacher(''); setPlotMapel(''); }}
              style={{ border: '1.5px solid #cbd5e1', borderRadius: 8, padding: '7px 14px', minWidth: 200 }}>
              <option value="">— Pilih Kelas —</option>
              {(meta?.classes || []).map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
            </select>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>
              Klik sel kosong untuk mengunci slot · klik sel terisi 🔒 untuk menghapus
            </span>
          </div>

          {plotClass && (() => {
            const cls = meta.classes?.find(c => String(c.id) === plotClass);
            const plotTingkat = extractTingkat(cls?.name || '');
            const maxH = Math.max(0, ...days.map(d => {
              const arr = slotsByTingkat[plotTingkat]?.[d];
              return arr?.length ? Math.max(...arr) : Number(hoursByDay[d] || 0);
            }));
            const eligibleTeachers = (meta?.teachers || []).filter(t => {
              const subs = teacherSubjectsLocal[t.id] || teacherSubjectsLocal[String(t.id)] || [];
              return subs.some(s => s.classId ? String(s.classId) === plotClass : (!s.tingkat || s.tingkat === plotTingkat));
            });
            const mapelOptions = plotTeacher
              ? [...new Set((teacherSubjectsLocal[plotTeacher] || [])
                  .filter(s => s.classId ? String(s.classId) === plotClass : (!s.tingkat || s.tingkat === plotTingkat))
                  .map(s => String(s.subjectId)))]
              : [];
            const tLim = teacherLimitsLocal[plotTeacher] || {};
            const warns = [];
            if (plotEdit && plotTeacher) {
              if (tLim.availableSlots?.length && !tLim.availableSlots.map(Number).includes(Number(plotEdit.jam))) {
                warns.push(`Jam ke-${plotEdit.jam} tidak termasuk jam tersedia guru di Step 4.`);
              }
              if (tLim.availableDays?.length && !tLim.availableDays.includes(plotEdit.hari)) {
                warns.push(`Hari ${plotEdit.hari} di luar hari tersedia guru (${tLim.availableDays.join(', ')}).`);
              }
              const multi = lockedSlots.filter(r => String(r.teacher_id) === plotTeacher && r.hari === plotEdit.hari && String(r.jam_ke) === String(plotEdit.jam) && String(r.class_id) !== plotClass);
              if (multi.length) {
                warns.push(`Guru sudah terkunci di ${multi.map(m => m.class_name).join(', ')} pada jam yang sama (multi-kelas diperbolehkan).`);
              }
            }
            return (
              <div style={{ marginBottom: 20 }}>
                {plotEdit && (
                  <div style={{ padding: '12px 16px', borderRadius: 10, background: '#f5f3ff', border: '1.5px solid #a5b4fc', marginBottom: 12 }}>
                    <div style={{ fontSize: 13, color: '#4338ca', marginBottom: 8, fontWeight: 700 }}>
                      🔒 Kunci Slot — {cls?.name} · {plotEdit.hari} Jam ke-{plotEdit.jam}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <span style={{ fontSize: 11, color: '#64748b' }}>Guru (yang mengampu kelas ini)</span>
                        <select value={plotTeacher} onChange={e => {
                          setPlotTeacher(e.target.value);
                          setPlotMapel('');
                        }} style={{ border: '1.5px solid #a5b4fc', borderRadius: 6, padding: '6px 8px', minWidth: 220 }}>
                          <option value="">— pilih guru —</option>
                          {eligibleTeachers.map(t => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
                        </select>
                      </div>
                      {plotTeacher && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          <span style={{ fontSize: 11, color: '#64748b' }}>Mapel</span>
                          <select value={plotMapel} onChange={e => setPlotMapel(e.target.value)}
                            style={{ border: '1.5px solid #a5b4fc', borderRadius: 6, padding: '6px 8px', minWidth: 180 }}>
                            <option value="">— pilih mapel —</option>
                            {mapelOptions.map(sid => {
                              const s = meta.subjects?.find(x => String(x.id) === sid);
                              return <option key={sid} value={sid}>{s?.name || sid}</option>;
                            })}
                          </select>
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn sm success" onClick={savePlotCell} disabled={lockSaving || !plotTeacher || !plotMapel}>
                          {lockSaving ? 'Menyimpan...' : 'Kunci Slot'}
                        </button>
                        <button className="btn sm outline" onClick={() => { setPlotEdit(null); setPlotTeacher(''); setPlotMapel(''); }}>Batal</button>
                      </div>
                    </div>
                    {eligibleTeachers.length === 0 && (
                      <div style={{ fontSize: 12, color: '#f59e0b', marginTop: 8 }}>
                        Belum ada guru yang di-mapping untuk kelas ini — atur di Step 3.
                      </div>
                    )}
                    {warns.map((w, i) => (
                      <div key={i} style={{ fontSize: 12, color: '#b45309', marginTop: 6 }}>⚠ {w}</div>
                    ))}
                  </div>
                )}

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ borderCollapse: 'collapse', minWidth: 560 }}>
                    <thead>
                      <tr>
                        <th style={{ padding: '8px 10px', background: '#f1f5f9', border: '1px solid #e2e8f0', textAlign: 'center', fontSize: 12, width: 44 }}>Jam</th>
                        {days.map(d => <th key={d} style={{ padding: '8px 10px', background: '#f1f5f9', border: '1px solid #e2e8f0', textAlign: 'center', fontSize: 13, minWidth: 110 }}>{d}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: maxH }, (_, i) => i + 1).map(jam => (
                        <tr key={jam}>
                          <td style={{ padding: '5px', textAlign: 'center', fontWeight: 700, fontSize: 13, color: 'var(--primary-700)', background: '#f8fafc', border: '1px solid #e2e8f0' }}>{jam}</td>
                          {days.map(hari => {
                            const activeCell = (slotsByTingkat[plotTingkat]?.[hari]
                              || Array.from({ length: Number(hoursByDay[hari] || 0) }, (_, i) => i + 1)).includes(jam);
                            if (!activeCell) return <td key={hari} style={{ border: '1px solid #e2e8f0', background: '#f1f5f9' }} />;
                            const locked = lockedSlots.find(r => String(r.class_id) === plotClass && r.hari === hari && String(r.jam_ke) === String(jam));
                            const isEditing = plotEdit?.hari === hari && String(plotEdit.jam) === String(jam);
                            return (
                              <td key={hari}
                                style={{ padding: '4px', border: `1px solid ${isEditing ? '#6366f1' : '#e2e8f0'}`, background: isEditing ? '#eef2ff' : '#fff', cursor: 'pointer', verticalAlign: 'middle' }}
                                onClick={() => {
                                  if (locked) { removeLockedCell(locked); return; }
                                  setPlotEdit({ hari, jam });
                                  setPlotTeacher(''); setPlotMapel('');
                                }}
                                title={locked ? 'Klik untuk menghapus slot terkunci ini' : 'Klik untuk mengunci slot ini'}>
                                {locked ? (
                                  <div style={{ borderRadius: 7, padding: '5px 8px', background: '#ede9fe', color: '#4c1d95', minHeight: 42, fontSize: 12, border: '1px solid #c4b5fd' }}>
                                    <div style={{ fontWeight: 700, lineHeight: 1.3 }}>🔒 {locked.teacher_name}</div>
                                    <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>{locked.subject_name}</div>
                                  </div>
                                ) : (
                                  <div style={{ height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1', fontSize: 16 }}>+</div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}

          {/* Daftar locked slots */}
          <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>
              {lockedSlots.length} slot terkunci
              {lockedSlotsLoading && <span style={{ color: '#94a3b8', marginLeft: 8 }}>Memuat...</span>}
            </div>
            {lockedSlots.length > 0 && (
              <button className="btn sm" style={{ background: '#fee2e2', color: '#dc2626', border: '1.5px solid #fca5a5' }} onClick={clearAllLockedSlots}>
                Hapus Semua
              </button>
            )}
          </div>

          {lockedSlots.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Guru</th><th>Mapel</th><th>Kelas</th><th style={{ textAlign: 'center' }}>Hari</th>
                    <th style={{ textAlign: 'center' }}>Jam</th><th style={{ textAlign: 'center' }}>Multi-Kelas</th>
                    <th style={{ textAlign: 'center' }}>Hapus</th>
                  </tr>
                </thead>
                <tbody>
                  {lockedSlots.map(r => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 500 }}>{r.teacher_name}</td>
                      <td>{r.subject_name}</td>
                      <td>{r.class_name}</td>
                      <td style={{ textAlign: 'center' }}>{r.hari}</td>
                      <td style={{ textAlign: 'center' }}>Jam {r.jam_ke}</td>
                      <td style={{ textAlign: 'center' }}>
                        {r.allow_multi_class
                          ? <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: '#dcfce7', color: '#15803d' }}>Ya</span>
                          : <span style={{ fontSize: 11, color: '#94a3b8' }}>Tidak</span>}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button className="btn sm outline" style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                          onClick={() => deleteLockedSlot(r.id)}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8', fontSize: 14 }}>
              Belum ada slot terkunci. Tambahkan di atas jika diperlukan.
            </div>
          )}

          <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
            <button className="btn success" onClick={() => setStep(6)}>Lanjut ke Generate →</button>
            <button className="btn outline sm" onClick={() => setStep(4)}>← Kembali</button>
          </div>
        </div>
      )}

      {/* ─── STEP 6 — Generate ─── */}
      {step === 6 && (
        <div className="modern-table-card">
          <div className="modern-table-title">Step 6 — Generate & Preview Jadwal</div>

          {!generated && !generating && (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <p style={{ color: '#64748b', marginBottom: 20 }}>Klik Generate untuk membuat jadwal otomatis berdasarkan konfigurasi yang telah diatur.</p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button className="btn" onClick={handleRegenerate}>Generate Jadwal</button>
                <button className="btn outline" onClick={() => setStep(4)}>← Kembali</button>
              </div>
            </div>
          )}

          {generating && (
            <div style={{ textAlign: 'center', padding: '48px 0', color: '#64748b' }}>
              <div style={{ fontSize: 36, marginBottom: 14 }}>⏳</div>
              Sedang generate jadwal... (estimasi 15-30 detik, mengoptimalkan agar semua slot terisi)
            </div>
          )}

          {generated && (<>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
              {[
                { label: 'Total Slot', val: generated.length, ok: true },
                { label: 'Jam Belum Terjadwal', val: totalFailedJam, ok: totalFailedJam === 0 },
                { label: 'Guru Terlibat', val: new Set(generated.map(r => r.guruId)).size, ok: true },
                { label: 'Warning Linier', val: linearWarnings.length, ok: linearWarnings.length === 0 }
              ].map(s => (
                <div key={s.label} style={{ padding: '12px 18px', borderRadius: 10, background: s.ok ? '#f0fdf4' : '#fff1f2', border: `1.5px solid ${s.ok ? '#86efac' : '#fca5a5'}`, minWidth: 120, textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: s.ok ? '#15803d' : '#dc2626' }}>{s.val}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{s.label}</div>
                </div>
              ))}
            </div>

            {(capacityWarnings?.classes?.length > 0 || capacityWarnings?.subjects?.length > 0 || capacityWarnings?.teachers?.length > 0) && (
              <div style={{ marginBottom: 16, padding: 14, borderRadius: 10, background: '#fef2f2', border: '1.5px solid #fca5a5' }}>
                <div style={{ fontWeight: 800, color: '#b91c1c', marginBottom: 8 }}>
                  🚨 Kapasitas tidak mencukupi — jadwal tidak mungkin terisi penuh dengan konfigurasi saat ini
                </div>
                <div style={{ maxHeight: 260, overflowY: 'auto', display: 'grid', gap: 10 }}>
                  {capacityWarnings.classes?.length > 0 && (
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#991b1b', marginBottom: 4 }}>
                        Slot kelas kurang — tambah hari aktif / jam per hari di Step 1:
                      </div>
                      {capacityWarnings.classes.map(w => (
                        <div key={w.classId} style={{ fontSize: 12.5, color: '#7f1d1d', lineHeight: 1.6 }}>
                          • Kelas <b>{w.className}</b>: kurikulum butuh <b>{w.required} jam/minggu</b>, slot aktif hanya <b>{w.capacity}</b> → kekurangan <b>{w.shortfall} jam</b>
                        </div>
                      ))}
                    </div>
                  )}
                  {capacityWarnings.subjects?.length > 0 && (
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#991b1b', marginBottom: 4 }}>
                        Guru pengampu kurang — tambah guru untuk mapel ini di Step 3:
                      </div>
                      {capacityWarnings.subjects.map(w => (
                        <div key={w.subjectId} style={{ fontSize: 12.5, color: '#7f1d1d', lineHeight: 1.6 }}>
                          • <b>{w.subjectName}</b>: butuh <b>{w.required} jam</b> di {w.classCount} kelas, {w.teacherNames?.length
                            ? <>kapasitas {w.teacherNames.length} guru pengampu ({w.teacherNames.join(', ')}) maksimal <b>{w.totalCap} jam</b></>
                            : <b>belum ada guru pengampu</b>} → kekurangan <b>{w.required - (w.totalCap || 0)} jam</b>
                        </div>
                      ))}
                    </div>
                  )}
                  {capacityWarnings.teachers?.length > 0 && (
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#991b1b', marginBottom: 4 }}>
                        Guru kelebihan beban — beban wajib melebihi kapasitas jamnya (tambah guru pengampu di Step 3 atau tambah hari tersedia di Step 4):
                      </div>
                      {capacityWarnings.teachers.map(w => (
                        <div key={w.teacherId} style={{ fontSize: 12.5, color: '#7f1d1d', lineHeight: 1.6 }}>
                          • <b>{w.teacherName}</b>: satu-satunya pengampu untuk <b>{w.required} jam</b>, kapasitas maksimal <b>{w.capacity} jam</b>
                          {w.availableDays ? ` (hari tersedia: ${w.availableDays.join(', ')})` : ''} → kekurangan <b>{w.required - w.capacity} jam</b>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {conflictAlert && (
              <div style={{ padding: '12px 16px', borderRadius: 10, background: '#fef2f2', border: '1.5px solid #fca5a5', color: '#991b1b', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
                🚫 {conflictAlert.message}
                <button onClick={() => setConflictAlert(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#991b1b' }}>✕</button>
              </div>
            )}

            <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e2e8f0', marginBottom: 20 }}>
              {[{ key: 'matrix', label: '📋 Per Kelas' }, { key: 'perguru', label: '👤 Per Guru' }, { key: 'guru', label: '📊 Ringkasan' }].map(tab => (
                <button key={tab.key} onClick={() => setPreviewTab(tab.key)} style={{
                  padding: '8px 18px', border: 'none', background: 'none', cursor: 'pointer',
                  fontWeight: previewTab === tab.key ? 700 : 400,
                  color: previewTab === tab.key ? 'var(--primary-700)' : '#64748b',
                  borderBottom: previewTab === tab.key ? '3px solid var(--primary-600)' : '3px solid transparent',
                  marginBottom: -2
                }}>{tab.label}</button>
              ))}
              <div style={{ flex: 1 }} />
              <button
                className="btn sm outline"
                onClick={handleRegenerate}
                disabled={generating}
                style={{ marginBottom: 4, whiteSpace: 'nowrap' }}
              >
                {generating ? 'Generate...' : 'Re Generate Semua Jadwal'}
              </button>
            </div>

            {/* Per Kelas */}
            {previewTab === 'matrix' && (
              <div>
                {editingCell && (
                  <div style={{ padding: '10px 16px', borderRadius: 10, background: '#eff6ff', border: '1.5px solid #93c5fd', marginBottom: 12 }}>
                    <div style={{ fontSize: 13, color: '#1e40af', marginBottom: 8, fontWeight: 600 }}>
                      Edit {editingCell.hari} Jam {editingCell.jamKe} — {meta.classes?.find(c => String(c.id) === String(editingCell.kelas))?.name}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <span style={{ fontSize: 11, color: '#64748b' }}>Guru</span>
                        <select value={editTeacher} onChange={e => {
                          const nv = e.target.value;
                          setEditTeacher(nv);
                          if (nv) {
                            const subs = getTeacherEditSubjects(nv);
                            if (!subs.includes(editMapel)) setEditMapel(subs[0] || '');
                          } else { setEditMapel(''); }
                        }} style={{ border: '1.5px solid #93c5fd', borderRadius: 6, padding: '5px 8px', minWidth: 200 }}>
                          <option value="">— kosongkan slot —</option>
                          {(meta.teachers || []).map(t => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
                        </select>
                      </div>
                      {editTeacher && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          <span style={{ fontSize: 11, color: '#64748b' }}>Mapel</span>
                          <select value={editMapel} onChange={e => setEditMapel(e.target.value)}
                            style={{ border: '1.5px solid #93c5fd', borderRadius: 6, padding: '5px 8px', minWidth: 160 }}>
                            <option value="">— pilih mapel —</option>
                            {getTeacherEditSubjects(editTeacher).map(sid => {
                              const s = meta.subjects?.find(x => String(x.id) === sid);
                              return <option key={sid} value={sid}>{s?.name || sid}</option>;
                            })}
                          </select>
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 6, alignSelf: 'flex-end', paddingBottom: 1 }}>
                        <button className="btn sm" onClick={applyCellEdit}>Terapkan</button>
                        <button className="btn sm outline" onClick={cancelCellEdit}>Batal</button>
                      </div>
                    </div>

                    {editCellIsEmpty && editRecs.length > 0 && (
                      <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed #93c5fd' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#1e40af', marginBottom: 6 }}>
                          💡 Rekomendasi untuk slot ini — mapel yang jamnya belum terpenuhi &amp; guru yang bebas ({editRecs.length}). Klik untuk langsung mengisi:
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 150, overflowY: 'auto' }}>
                          {editRecs.map((rec, i) => (
                            <button key={`${rec.subjectId}-${rec.teacherId}`}
                              onClick={() => applyRecommendation(rec)}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px',
                                borderRadius: 20, cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
                                background: i === 0 ? '#dcfce7' : '#f0fdf4',
                                border: `1.5px solid ${i === 0 ? '#22c55e' : '#86efac'}`,
                                color: '#166534', textAlign: 'left'
                              }}>
                              {rec.subjectName} — {rec.teacherName}
                              <span style={{ fontWeight: 400, color: '#15803d', opacity: .85 }}>(kurang {rec.remaining} jam)</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {editCellIsEmpty && editRecs.length === 0 && (
                      <div style={{ marginTop: 10, fontSize: 12, color: '#64748b' }}>
                        Tidak ada rekomendasi untuk slot ini — semua mapel kelas ini sudah terpenuhi jamnya, atau tidak ada guru pengampu yang bebas pada {editingCell.hari} jam ke-{editingCell.jamKe}.
                      </div>
                    )}
                  </div>
                )}
                <div style={{ marginBottom: 12 }}>
                  <select value={selectedClass} onChange={e => { setSelectedClass(e.target.value); setEditingCell(null); }}
                    style={{ border: '1.5px solid #cbd5e1', borderRadius: 8, padding: '7px 14px', minWidth: 200 }}>
                    <option value="">— Pilih Kelas —</option>
                    {(meta?.classes || []).map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                  </select>
                </div>

                {selectedClass && (() => {
                  const cls = meta.classes?.find(c => String(c.id) === selectedClass);
                  const classTingkat = extractTingkat(cls?.name || '');
                  return (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ borderCollapse: 'collapse', minWidth: 560 }}>
                        <thead>
                          <tr>
                            <th style={{ padding: '8px 10px', background: '#f1f5f9', border: '1px solid #e2e8f0', textAlign: 'center', fontSize: 12, width: 44 }}>Jam</th>
                            {days.map(d => <th key={d} style={{ padding: '8px 10px', background: '#f1f5f9', border: '1px solid #e2e8f0', textAlign: 'center', fontSize: 13, minWidth: 110 }}>{d}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {Array.from({ length: globalMaxHours }, (_, i) => i + 1).map(jam => (
                            <tr key={jam}>
                              <td style={{ padding: '5px', textAlign: 'center', fontWeight: 700, fontSize: 13, color: 'var(--primary-700)', background: '#f8fafc', border: '1px solid #e2e8f0' }}>{jam}</td>
                              {days.map(hari => {
                                const activeSlotsForCell = slotsByTingkat[classTingkat]?.[hari]
                                  || Array.from({ length: Number(hoursByDay[hari] || 0) }, (_, i) => i + 1);
                                if (!activeSlotsForCell.includes(jam)) return <td key={hari} style={{ border: '1px solid #e2e8f0', background: '#f1f5f9' }} />;
                                const row = generated.find(r => r.hari === hari && String(r.jamKe) === String(jam) && String(r.kelas) === selectedClass);
                                const isEditing = editingCell?.hari === hari && String(editingCell.jamKe) === String(jam) && String(editingCell.kelas) === selectedClass;
                                const teacher = row ? meta.teachers?.find(t => String(t.id) === String(row.guruId)) : null;
                                const subj = row ? meta.subjects?.find(s => String(s.id) === String(row.mapelId)) : null;
                                const color = row ? (guruMapelColorMap[`${row.guruId}-${row.mapelId}`] || { bg: '#f0fdf4', text: '#15803d' }) : null;
                                return (
                                  <td key={hari} style={{ padding: '4px', border: `1px solid ${isEditing ? 'var(--primary-400)' : '#e2e8f0'}`, background: isEditing ? '#eff6ff' : '#fff', cursor: 'pointer', verticalAlign: 'middle' }}
                                    onClick={() => startCellEdit(hari, jam, selectedClass)}>
                                    {row ? (
                                      <div style={{ borderRadius: 7, padding: '5px 8px', background: color.bg, color: color.text, minHeight: 42, fontSize: 12 }}>
                                        <div style={{ fontWeight: 700, lineHeight: 1.3 }}>{teacher?.name || row.guruId}</div>
                                        <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>{subj?.name || row.mapelId}</div>
                                      </div>
                                    ) : (
                                      <div style={{ height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1', fontSize: 16 }}>+</div>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}

                {failed.length > 0 && (
                  <div style={{ marginTop: 18, padding: 14, borderRadius: 10, background: '#fff7ed', border: '1.5px solid #fdba74' }}>
                    <div style={{ fontWeight: 700, color: '#c2410c', marginBottom: 8 }}>
                      ⚠️ {totalFailedJam} Jam Pelajaran Belum Terjadwal ({failed.length} kombinasi kelas–mapel)
                    </div>
                    <div style={{ maxHeight: 340, overflowY: 'auto', display: 'grid', gap: 10 }}>
                      {failed.map((f, i) => {
                        const kelasName = f.kelasName || meta.classes?.find(c => String(c.id) === String(f.kelas))?.name || f.kelas;
                        const mapelName = f.mapelName || meta.subjects?.find(s => String(s.id) === String(f.mapelId))?.name || f.mapelId;
                        return (
                          <div key={i} style={{ fontSize: 12.5, color: '#92400e', borderLeft: '3px solid #fdba74', paddingLeft: 10, lineHeight: 1.55 }}>
                            <div style={{ fontWeight: 700 }}>
                              {kelasName} — {mapelName}{f.jumlahJam ? ` (${f.jumlahJam} jam belum terjadwal)` : ''}
                            </div>
                            <div>{f.reason}</div>
                            {(f.guruDetail || []).map((d, j) => (
                              <div key={j} style={{ paddingLeft: 12 }}>– {d}</div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Per Guru (matrix) */}
            {previewTab === 'perguru' && (
              <div>
                <div style={{ marginBottom: 14 }}>
                  <select value={selectedGuruPreview} onChange={e => setSelectedGuruPreview(e.target.value)}
                    style={{ border: '1.5px solid #cbd5e1', borderRadius: 8, padding: '7px 14px', minWidth: 260 }}>
                    <option value="">— Pilih Guru —</option>
                    {guruSummary.map(g => <option key={g.guruId} value={String(g.guruId)}>{g.teacher?.name || g.guruId}</option>)}
                  </select>
                </div>

                {selectedGuruPreview && (() => {
                  const guruRows = generated.filter(r => String(r.guruId) === String(selectedGuruPreview));
                  const teacher = meta.teachers?.find(t => String(t.id) === String(selectedGuruPreview));
                  const guruMapelIds = [...new Set(guruRows.map(r => r.mapelId))].sort();
                  const mapelColors = {};
                  guruMapelIds.forEach((mid, idx) => { mapelColors[mid] = CELL_COLORS[idx % CELL_COLORS.length]; });

                  return (
                    <div>
                      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: 15 }}>{teacher?.name}</strong>
                        {teacher?.gender && <GenderBadge gender={teacher.gender} />}
                        <span style={{ fontSize: 13, color: '#64748b' }}>{guruRows.length} jam/minggu</span>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginLeft: 'auto' }}>
                          {guruMapelIds.map(mid => {
                            const s = meta.subjects?.find(x => String(x.id) === String(mid));
                            const c = mapelColors[mid];
                            return <span key={mid} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 8, background: c.bg, color: c.text, fontWeight: 600 }}>{s?.name || mid}</span>;
                          })}
                        </div>
                      </div>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ borderCollapse: 'collapse', minWidth: 560 }}>
                          <thead>
                            <tr>
                              <th style={{ padding: '8px 10px', background: '#f1f5f9', border: '1px solid #e2e8f0', textAlign: 'center', fontSize: 12, width: 44 }}>Jam</th>
                              {days.map(d => <th key={d} style={{ padding: '8px 10px', background: '#f1f5f9', border: '1px solid #e2e8f0', textAlign: 'center', fontSize: 13, minWidth: 120 }}>{d}</th>)}
                            </tr>
                          </thead>
                          <tbody>
                            {Array.from({ length: globalMaxHours }, (_, i) => i + 1).map(jam => (
                              <tr key={jam}>
                                <td style={{ padding: '5px', textAlign: 'center', fontWeight: 700, fontSize: 13, color: 'var(--primary-700)', background: '#f8fafc', border: '1px solid #e2e8f0' }}>{jam}</td>
                                {days.map(hari => {
                                  const row = guruRows.find(r => r.hari === hari && String(r.jamKe) === String(jam));
                                  const cls = row ? meta.classes?.find(c => String(c.id) === String(row.kelas)) : null;
                                  const subj = row ? meta.subjects?.find(s => String(s.id) === String(row.mapelId)) : null;
                                  const color = row ? (mapelColors[row.mapelId] || { bg: '#f1f5f9', text: '#475569' }) : null;
                                  return (
                                    <td key={hari} style={{ padding: '4px', border: '1px solid #e2e8f0', background: '#fff', verticalAlign: 'middle' }}>
                                      {row ? (
                                        <div style={{ borderRadius: 7, padding: '5px 8px', background: color.bg, color: color.text, minHeight: 42, fontSize: 12 }}>
                                          <div style={{ fontWeight: 700, lineHeight: 1.3 }}>{cls?.name || row.kelas}</div>
                                          <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>{subj?.name || row.mapelId}</div>
                                        </div>
                                      ) : (
                                        <div style={{ height: 42 }} />
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Ringkasan */}
            {previewTab === 'guru' && (
              <div style={{ overflowX: 'auto' }}>
                {linearWarnings.length > 0 && (
                  <div style={{ padding: '10px 16px', borderRadius: 10, background: '#fff7ed', border: '1.5px solid #fdba74', marginBottom: 12 }}>
                    <strong style={{ color: '#c2410c', display: 'block', marginBottom: 6 }}>⚠️ Peringatan Jam Linier</strong>
                    {linearWarnings.map(w => (
                      <div key={w.teacherId} style={{ fontSize: 12, color: '#92400e' }}>• {w.teacherName}: diperlukan {w.required} jam linier, terjadwal {w.actual}</div>
                    ))}
                  </div>
                )}
                <table className="table" style={{ minWidth: 520 }}>
                  <thead><tr><th>Guru</th><th style={{ textAlign: 'center' }}>Total Jam</th><th>Mapel</th><th>Kelas</th></tr></thead>
                  <tbody>
                    {guruSummary.map(g => (
                      <tr key={g.guruId}>
                        <td style={{ fontWeight: 500 }}>{g.teacher?.name || g.guruId}</td>
                        <td style={{ textAlign: 'center' }}><span className="badge">{g.totalJam}</span></td>
                        <td style={{ fontSize: 12 }}>{[...g.mapels].join(', ')}</td>
                        <td style={{ fontSize: 12 }}>{[...g.kelas].join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ marginTop: 24, display: 'flex', gap: 10 }}>
              <button className="btn success" onClick={() => setStep(7)}>Lanjut ke Finalisasi →</button>
              <button className="btn outline" onClick={() => setStep(5)}>← Kembali</button>
            </div>
          </>)}
        </div>
      )}

      {/* ─── STEP 7 ─── */}
      {step === 7 && (
        <div className="modern-table-card">
          <div className="modern-table-title">Step 7 — Finalisasi Jadwal</div>
          {!finalized ? (<>
            <div style={{ padding: '16px 20px', borderRadius: 12, background: '#fff1f2', border: '1.5px solid #fca5a5', marginBottom: 20 }}>
              <strong style={{ color: '#991b1b', display: 'block', marginBottom: 6 }}>⚠️ Perhatian</strong>
              <p style={{ color: '#7f1d1d', margin: 0, fontSize: 14 }}>
                Jadwal yang ada saat ini akan <strong>dihapus seluruhnya</strong> dan diganti dengan hasil generate baru. Tindakan ini tidak dapat dibatalkan.
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px,1fr))', gap: 12, marginBottom: 24 }}>
              {[
                { label: 'Total Slot Jadwal', val: generated?.length || 0 },
                { label: 'Guru Terlibat', val: generated ? new Set(generated.map(r => r.guruId)).size : 0 },
                { label: 'Kelas Terlibat', val: generated ? new Set(generated.map(r => r.kelas)).size : 0 },
                { label: 'Jam Belum Terisi', val: totalFailedJam }
              ].map(s => (
                <div key={s.label} style={{ padding: '14px 16px', borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--primary-700)' }}>{s.val}</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{s.label}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn danger" onClick={doFinalize} disabled={finalizing || !generated?.length}>
                {finalizing ? 'Memproses...' : '✓ Konfirmasi & Simpan Jadwal'}
              </button>
              <button className="btn outline" onClick={() => setStep(6)}>← Kembali ke Preview</button>
            </div>
          </>) : (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <div style={{ fontSize: 52, marginBottom: 16 }}>🎉</div>
              <h2 style={{ color: '#15803d', marginBottom: 8 }}>Jadwal Berhasil Disimpan!</h2>
              <p style={{ color: '#64748b', marginBottom: 24 }}>{generated?.length} slot jadwal telah berhasil dibuat.</p>
              <button className="btn success" onClick={() => navigate('/penjadwalan')}>Lihat Jadwal →</button>
            </div>
          )}
        </div>
      )}
      {/* ─── Excel Import Modal ─── */}
      {importModal && importModal.phase !== 'loading' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 740, maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '18px 24px 14px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 10 }}>
              <strong style={{ flex: 1, fontSize: 16 }}>Preview Import Excel</strong>
              <button onClick={() => setImportModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#94a3b8' }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
              {importModal.data?.errors?.length > 0 && (
                <div style={{ background: '#fff1f2', border: '1.5px solid #fca5a5', borderRadius: 10, padding: '12px 16px', marginBottom: 14 }}>
                  <div style={{ fontWeight: 700, color: '#991b1b', marginBottom: 6 }}>⚠️ {importModal.data.errors.length} data tidak dikenali</div>
                  {importModal.data.errors.map((e, i) => <div key={i} style={{ fontSize: 12, color: '#7f1d1d' }}>{e}</div>)}
                </div>
              )}
              {/* Class mappings preview */}
              {importModal.data?.classMappings?.length > 0 && (
                <div style={{ marginBottom: 18 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#1e40af', marginBottom: 8 }}>
                    📚 Mapping Mapel per Kelas — {importModal.data.classMappings.length} entri
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="table" style={{ fontSize: 12 }}>
                      <thead><tr><th>Kelas</th><th>Mapel</th><th style={{ textAlign: 'center' }}>Jam/Minggu</th></tr></thead>
                      <tbody>
                        {importModal.data.classMappings.slice(0, 30).map((m, i) => (
                          <tr key={i}><td>{m.className}</td><td>{m.subjectName}</td><td style={{ textAlign: 'center' }}>{m.hoursPerWeek}</td></tr>
                        ))}
                        {importModal.data.classMappings.length > 30 && <tr><td colSpan={3} style={{ textAlign: 'center', color: '#94a3b8' }}>...dan {importModal.data.classMappings.length - 30} lainnya</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {/* Teacher mappings preview */}
              {importModal.data?.teacherMappings?.length > 0 && (
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#15803d', marginBottom: 8 }}>
                    👨‍🏫 Mapping Guru & Mapel — {importModal.data.teacherMappings.length} entri
                  </div>
                  <table className="table" style={{ fontSize: 12 }}>
                    <thead><tr><th>Guru</th><th>Mapel</th><th>Kelas</th></tr></thead>
                    <tbody>
                      {importModal.data.teacherMappings.slice(0, 30).map((m, i) => (
                        <tr key={i}>
                          <td>{m.teacherName}</td><td>{m.subjectName}</td>
                          <td>{m.classes?.length ? m.classes.map(c => c.name).join(', ') : <em style={{ color: '#94a3b8' }}>Semua tingkat</em>}</td>
                        </tr>
                      ))}
                      {importModal.data.teacherMappings.length > 30 && <tr><td colSpan={3} style={{ textAlign: 'center', color: '#94a3b8' }}>...dan {importModal.data.teacherMappings.length - 30} lainnya</td></tr>}
                    </tbody>
                  </table>
                </div>
              )}
              {!importModal.data?.classMappings?.length && !importModal.data?.teacherMappings?.length && (
                <div style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8' }}>Tidak ada data yang berhasil diparsing dari file ini.</div>
              )}
            </div>
            <div style={{ padding: '14px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 10, background: '#f8fafc', borderRadius: '0 0 16px 16px' }}>
              <button className="btn success" onClick={applyImport} disabled={importModal.phase === 'applying' || (!importModal.data?.classMappings?.length && !importModal.data?.teacherMappings?.length)}>
                {importModal.phase === 'applying' ? 'Menyimpan...' : 'Terapkan Import'}
              </button>
              <button className="btn outline" onClick={() => setImportModal(null)}>Batal</button>
            </div>
          </div>
        </div>
      )}
      {importModal?.phase === 'loading' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: '32px 48px', textAlign: 'center', boxShadow: '0 20px 40px rgba(0,0,0,.15)' }}>
            <div style={{ fontSize: 13, color: '#64748b' }}>Membaca file Excel...</div>
          </div>
        </div>
      )}
    </div>
  );
}
