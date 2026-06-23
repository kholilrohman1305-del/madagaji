const pool = require('../db');
const masterDb = process.env.DB_MASTER_NAME || process.env.DB2_NAME || 'sekolah_master';
const { randomBytes } = require('crypto');
const {
  getTeachers,
  getSubjects,
  getClasses,
  getTeacherSubjects,
  getClassSubjects,
  getTeacherLimits
} = require('./scheduler/configService');

function createScheduleId() {
  const time = Date.now().toString(36).slice(-6).toUpperCase().padStart(6, '0');
  const rand = randomBytes(2).toString('hex').slice(0, 3).toUpperCase();
  return `J${time}${rand}`;
}

function isPrimaryDuplicateError(err) {
  if (!err || err.code !== 'ER_DUP_ENTRY') return false;
  return String(err.sqlMessage || '').includes("for key 'PRIMARY'") || String(err.sqlMessage || '').includes('PRIMARY');
}

function isScheduleConflictError(err) {
  if (!err || err.code !== 'ER_DUP_ENTRY') return false;
  const msg = String(err.sqlMessage || '');
  return msg.includes('uniq_jadwal_kelas') || (msg.includes('hari') && msg.includes('jam_ke') && msg.includes('kelas'));
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

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Returns array of active slot numbers for (day, tingkat).
// Prefers slotsByTingkat; falls back to hoursByDayByTingkat count; then hoursByDay count.
function getActiveSlots(day, classTingkat, slotsByTingkat, hoursByDayByTingkat, hoursByDay) {
  const forTingkat = slotsByTingkat?.[classTingkat];
  if (forTingkat && forTingkat[day] !== undefined) {
    return Array.isArray(forTingkat[day]) ? forTingkat[day] : [];
  }
  // Legacy fallback: use count from hoursByDayByTingkat or hoursByDay
  let n = 0;
  if (hoursByDayByTingkat?.[classTingkat]?.[day] != null) {
    n = Number(hoursByDayByTingkat[classTingkat][day]);
  } else {
    n = Number(hoursByDay?.[day] || 0);
  }
  return Array.from({ length: n }, (_, i) => i + 1);
}

function buildTeacherSubjectsMap(rows) {
  const map = new Map();
  rows.forEach(r => {
    if (!map.has(r.teacher_id)) map.set(r.teacher_id, []);
    map.get(r.teacher_id).push({
      subjectId: r.subject_id,
      tingkat: r.tingkat || '',
      classId: Number(r.class_id || 0),
      isLinear: r.is_linear === 1 || r.is_linear === true
    });
  });
  return map;
}

function buildTeacherLimitsMap(rows) {
  const map = new Map();
  rows.forEach(r => {
    map.set(r.teacher_id, {
      maxWeek: r.max_hours_per_week ?? null,
      maxDay: r.max_hours_per_day ?? null,
      minLinier: r.min_hours_linier ?? null,
      availableDays: Array.isArray(r.available_days) ? new Set(r.available_days) : null,
      classGenderPref: r.class_gender_pref || 'both'
    });
  });
  return map;
}

function canTeachSubject(teacherSubjectsMap, teacherId, subjectId, classTingkat, classId) {
  const subs = teacherSubjectsMap.get(teacherId) || [];
  return subs.some(s => {
    if (String(s.subjectId) !== String(subjectId)) return false;
    if (Number(s.classId || 0) > 0) return String(s.classId) === String(classId);
    return s.tingkat === '' || s.tingkat === classTingkat;
  });
}

function isLinearSubject(teacherSubjectsMap, teacherId, subjectId) {
  const subs = teacherSubjectsMap.get(teacherId) || [];
  const found = subs.find(s => s.subjectId === subjectId);
  return found ? found.isLinear : false;
}

// classKelasType: 'PA', 'PI', or 'PA_PI' (no restriction)
function canTeachKelas(teacherClassGenderPref, classKelasType) {
  if (!classKelasType || classKelasType === 'PA_PI') return true;
  if (classKelasType === 'PA') return teacherClassGenderPref === 'PA' || teacherClassGenderPref === 'both';
  if (classKelasType === 'PI') return teacherClassGenderPref === 'PI' || teacherClassGenderPref === 'both';
  return true;
}

function greedyPass(lessons, teachers, days, slotsByTingkat, hoursByDayByTingkat, hoursByDay, teacherSubjects, teacherLimits, initSchedule = [], initTeacherBusy = new Set(), initClassBusy = new Set()) {
  const teacherLoadWeek = new Map(teachers.map(t => [t.id, 0]));
  const teacherLoadDay = new Map();
  // Pre-populate busy sets from locked/initial schedule
  const teacherBusy = new Set(initTeacherBusy);
  const classBusy = new Set(initClassBusy);
  const schedule = [...initSchedule];
  // Pre-populate teacher load from initial schedule
  for (const r of initSchedule) {
    const tid = r.guruId;
    teacherLoadWeek.set(tid, (teacherLoadWeek.get(tid) || 0) + 1);
    teacherLoadDay.set(`${tid}-${r.hari}`, (teacherLoadDay.get(`${tid}-${r.hari}`) || 0) + 1);
  }
  const unassigned = [];

  for (const lesson of lessons) {
    const { classId, classTingkat, classKelasType, subjectId, slotCount } = lesson;

    const candidates = teachers.filter(t => {
      if (!canTeachSubject(teacherSubjects, t.id, subjectId, classTingkat, classId)) return false;
      const pref = (teacherLimits.get(t.id) || {}).classGenderPref || 'both';
      if (!canTeachKelas(pref, classKelasType)) return false;
      return true;
    });

    if (slotCount === 2) {
      // Try to place as 2 consecutive slots (back-to-back on same day)
      let placed = false;
      const shuffledCandidates = shuffle([...candidates]);

      outerPair:
      for (const teacher of shuffledCandidates) {
        const limits = teacherLimits.get(teacher.id) || {};
        const shuffledDays = shuffle([...days]);
        for (const day of shuffledDays) {
          if (limits.availableDays && !limits.availableDays.has(day)) continue;
          const wl = teacherLoadWeek.get(teacher.id) || 0;
          if (limits.maxWeek != null && wl + 2 > limits.maxWeek) continue;
          const dayKey = `${teacher.id}-${day}`;
          const dl = teacherLoadDay.get(dayKey) || 0;
          if (limits.maxDay != null && dl + 2 > limits.maxDay) continue;

          const slots = getActiveSlots(day, classTingkat, slotsByTingkat, hoursByDayByTingkat, hoursByDay);
          for (let k = 0; k < slots.length - 1; k++) {
            const h1 = slots[k], h2 = slots[k + 1];
            if (h2 !== h1 + 1) continue; // must be numerically consecutive
            if (classBusy.has(`${classId}-${day}-${h1}`) || classBusy.has(`${classId}-${day}-${h2}`)) continue;
            if (teacherBusy.has(`${teacher.id}-${day}-${h1}`) || teacherBusy.has(`${teacher.id}-${day}-${h2}`)) continue;

            schedule.push({ hari: day, jamKe: String(h1), kelas: String(classId), mapelId: String(subjectId), guruId: String(teacher.id) });
            schedule.push({ hari: day, jamKe: String(h2), kelas: String(classId), mapelId: String(subjectId), guruId: String(teacher.id) });
            teacherBusy.add(`${teacher.id}-${day}-${h1}`);
            teacherBusy.add(`${teacher.id}-${day}-${h2}`);
            classBusy.add(`${classId}-${day}-${h1}`);
            classBusy.add(`${classId}-${day}-${h2}`);
            teacherLoadWeek.set(teacher.id, wl + 2);
            teacherLoadDay.set(dayKey, dl + 2);
            placed = true;
            break outerPair;
          }
        }
      }

      // Priority 2: Any 2 free slots on the SAME day (non-consecutive OK; consolidatePairs will fix)
      if (!placed) {
        outerSameDay:
        for (const teacher of shuffledCandidates) {
          const limits = teacherLimits.get(teacher.id) || {};
          for (const day of shuffle([...days])) {
            if (limits.availableDays && !limits.availableDays.has(day)) continue;
            const wl = teacherLoadWeek.get(teacher.id) || 0;
            if (limits.maxWeek != null && wl + 2 > limits.maxWeek) continue;
            const dayKey = `${teacher.id}-${day}`;
            const dl = teacherLoadDay.get(dayKey) || 0;
            if (limits.maxDay != null && dl + 2 > limits.maxDay) continue;

            const slots = getActiveSlots(day, classTingkat, slotsByTingkat, hoursByDayByTingkat, hoursByDay);
            const freeSlots = slots.filter(h =>
              !classBusy.has(`${classId}-${day}-${h}`) &&
              !teacherBusy.has(`${teacher.id}-${day}-${h}`)
            );
            if (freeSlots.length < 2) continue;

            const h1 = freeSlots[0], h2 = freeSlots[1];
            schedule.push({ hari: day, jamKe: String(h1), kelas: String(classId), mapelId: String(subjectId), guruId: String(teacher.id) });
            schedule.push({ hari: day, jamKe: String(h2), kelas: String(classId), mapelId: String(subjectId), guruId: String(teacher.id) });
            teacherBusy.add(`${teacher.id}-${day}-${h1}`);
            teacherBusy.add(`${teacher.id}-${day}-${h2}`);
            classBusy.add(`${classId}-${day}-${h1}`);
            classBusy.add(`${classId}-${day}-${h2}`);
            teacherLoadWeek.set(teacher.id, wl + 2);
            teacherLoadDay.set(dayKey, dl + 2);
            placed = true;
            break outerSameDay;
          }
        }
      }

      if (!placed) {
        // Last resort: 2 independent singles
        unassigned.push({ ...lesson, slotCount: 1 });
        unassigned.push({ ...lesson, slotCount: 1 });
      }
    } else {
      // Single slot: teacher-first, prefer slots adjacent to same teacher+subject on same day
      let placed = false;
      const shuffledCandidates = shuffle([...candidates]).sort((a, b) =>
        (isLinearSubject(teacherSubjects, b.id, subjectId) ? 1 : 0) -
        (isLinearSubject(teacherSubjects, a.id, subjectId) ? 1 : 0)
      );

      for (const teacher of shuffledCandidates) {
        if (placed) break;
        const limits = teacherLimits.get(teacher.id) || {};

        const allSlots = [];
        for (const day of days) {
          if (limits.availableDays && !limits.availableDays.has(day)) continue;
          const wl = teacherLoadWeek.get(teacher.id) || 0;
          if (limits.maxWeek != null && wl >= limits.maxWeek) continue;
          const dayKey = `${teacher.id}-${day}`;
          const dl = teacherLoadDay.get(dayKey) || 0;
          if (limits.maxDay != null && dl >= limits.maxDay) continue;

          const slots = getActiveSlots(day, classTingkat, slotsByTingkat, hoursByDayByTingkat, hoursByDay);
          for (const h of slots) {
            if (classBusy.has(`${classId}-${day}-${h}`)) continue;
            if (teacherBusy.has(`${teacher.id}-${day}-${h}`)) continue;

            // Adjacency bonus: teacher has same subject on same day at adjacent slot
            let adj = 0;
            for (const r of schedule) {
              if (String(r.guruId) === String(teacher.id) && r.hari === day && String(r.mapelId) === String(subjectId)) {
                const dist = Math.abs(Number(r.jamKe) - h);
                if (dist === 1) { adj = 2; break; }
                if (dist === 2 && adj < 1) adj = 1;
              }
            }
            allSlots.push({ day, hour: h, adj, dayKey });
          }
        }

        if (allSlots.length > 0) {
          // Shuffle for randomness, then stable sort by adjacency bonus
          shuffle(allSlots);
          allSlots.sort((a, b) => b.adj - a.adj);
          const { day, hour, dayKey } = allSlots[0];
          const wl = teacherLoadWeek.get(teacher.id) || 0;
          schedule.push({ hari: day, jamKe: String(hour), kelas: String(classId), mapelId: String(subjectId), guruId: String(teacher.id) });
          teacherBusy.add(`${teacher.id}-${day}-${hour}`);
          classBusy.add(`${classId}-${day}-${hour}`);
          teacherLoadWeek.set(teacher.id, wl + 1);
          teacherLoadDay.set(dayKey, (teacherLoadDay.get(dayKey) || 0) + 1);
          placed = true;
        }
      }

      if (!placed) unassigned.push(lesson);
    }
  }

  return { schedule, unassigned };
}

function swapRepair(schedule, unassigned, teachers, days, slotsByTingkat, hoursByDayByTingkat, hoursByDay, teacherSubjects, teacherLimits) {
  if (unassigned.length === 0) return { schedule, remaining: [] };

  const teacherBusy = new Set(schedule.map(r => `${r.guruId}-${r.hari}-${r.jamKe}`));
  const classBusy = new Set(schedule.map(r => `${r.kelas}-${r.hari}-${r.jamKe}`));
  const teacherLoadWeek = new Map();
  const teacherLoadDay = new Map();
  for (const r of schedule) {
    teacherLoadWeek.set(r.guruId, (teacherLoadWeek.get(r.guruId) || 0) + 1);
    teacherLoadDay.set(`${r.guruId}-${r.hari}`, (teacherLoadDay.get(`${r.guruId}-${r.hari}`) || 0) + 1);
  }

  const remaining = [];

  for (const lesson of unassigned) {
    const { classId, classTingkat, classKelasType, subjectId } = lesson;
    let fixed = false;

    const freeClassSlots = [];
    for (const day of days) {
      const slots = getActiveSlots(day, classTingkat, slotsByTingkat, hoursByDayByTingkat, hoursByDay);
      for (const h of slots) {
        if (!classBusy.has(`${classId}-${day}-${h}`)) freeClassSlots.push({ day, hour: h });
      }
    }

    const viable = teachers.filter(t => {
      if (!canTeachSubject(teacherSubjects, t.id, subjectId, classTingkat, classId)) return false;
      const pref = (teacherLimits.get(t.id) || {}).classGenderPref || 'both';
      if (!canTeachKelas(pref, classKelasType)) return false;
      return true;
    });

    for (const { day, hour } of shuffle(freeClassSlots)) {
      if (fixed) break;

      for (const teacher of shuffle(viable)) {
        if (fixed) break;
        const tKey = `${teacher.id}-${day}-${hour}`;
        const limits = teacherLimits.get(teacher.id) || {};

        if (!teacherBusy.has(tKey)) {
          if (limits.availableDays && !limits.availableDays.has(day)) continue;
          const wl = teacherLoadWeek.get(String(teacher.id)) || 0;
          if (limits.maxWeek != null && wl >= limits.maxWeek) continue;
          const dl = teacherLoadDay.get(`${teacher.id}-${day}`) || 0;
          if (limits.maxDay != null && dl >= limits.maxDay) continue;

          schedule.push({ hari: day, jamKe: String(hour), kelas: String(classId), mapelId: String(subjectId), guruId: String(teacher.id) });
          teacherBusy.add(tKey);
          classBusy.add(`${classId}-${day}-${hour}`);
          teacherLoadWeek.set(String(teacher.id), wl + 1);
          teacherLoadDay.set(`${teacher.id}-${day}`, (teacherLoadDay.get(`${teacher.id}-${day}`) || 0) + 1);
          fixed = true;
        } else {
          const conflict = schedule.find(r => r.guruId === String(teacher.id) && r.hari === day && r.jamKe === String(hour));
          if (!conflict) continue;
          if (conflict.locked) continue; // Locked slots cannot be moved

          const conflictTingkat = extractTingkat(conflict.kelasName || '');
          const altSlots = [];
          for (const d2 of days) {
            if (limits.availableDays && !limits.availableDays.has(d2)) continue;
            const h2slots = getActiveSlots(d2, conflictTingkat || classTingkat, slotsByTingkat, hoursByDayByTingkat, hoursByDay);
            for (const h2 of h2slots) {
              if (d2 === day && h2 === hour) continue;
              if (classBusy.has(`${conflict.kelas}-${d2}-${h2}`)) continue;
              if (teacherBusy.has(`${teacher.id}-${d2}-${h2}`)) continue;
              const dl2 = teacherLoadDay.get(`${teacher.id}-${d2}`) || 0;
              if (limits.maxDay != null && dl2 >= limits.maxDay) continue;
              altSlots.push({ d2, h2 });
            }
          }
          if (altSlots.length === 0) continue;

          const alt = altSlots[Math.floor(Math.random() * altSlots.length)];
          const idx = schedule.indexOf(conflict);
          if (idx === -1) continue;

          teacherBusy.delete(tKey);
          classBusy.delete(`${conflict.kelas}-${day}-${hour}`);
          const oldDl = teacherLoadDay.get(`${teacher.id}-${day}`) || 1;
          teacherLoadDay.set(`${teacher.id}-${day}`, Math.max(0, oldDl - 1));

          schedule[idx] = { ...conflict, hari: alt.d2, jamKe: String(alt.h2) };
          teacherBusy.add(`${teacher.id}-${alt.d2}-${alt.h2}`);
          classBusy.add(`${conflict.kelas}-${alt.d2}-${alt.h2}`);
          teacherLoadDay.set(`${teacher.id}-${alt.d2}`, (teacherLoadDay.get(`${teacher.id}-${alt.d2}`) || 0) + 1);

          if (limits.availableDays && !limits.availableDays.has(day)) continue;
          schedule.push({ hari: day, jamKe: String(hour), kelas: String(classId), mapelId: String(subjectId), guruId: String(teacher.id) });
          teacherBusy.add(tKey);
          classBusy.add(`${classId}-${day}-${hour}`);
          const wl = teacherLoadWeek.get(String(teacher.id)) || 0;
          teacherLoadWeek.set(String(teacher.id), wl + 1);
          teacherLoadDay.set(`${teacher.id}-${day}`, (teacherLoadDay.get(`${teacher.id}-${day}`) || 0) + 1);
          fixed = true;
        }
      }
    }

    if (!fixed) remaining.push(lesson);
  }

  return { schedule, remaining };
}

// Post-process: for each (class, subject) group of 2 slots, ensure they're on the same day
// and consecutive. Works cross-day: moves slots between days if needed.
function consolidatePairs(schedule, classNameMap, slotsByTingkat, hoursByDayByTingkat, hoursByDay) {
  const classBusyMap = new Map();
  const teacherBusyMap = new Map();
  schedule.forEach((r, idx) => {
    classBusyMap.set(`${r.kelas}-${r.hari}-${r.jamKe}`, idx);
    teacherBusyMap.set(`${r.guruId}-${r.hari}-${r.jamKe}`, idx);
  });

  // Group by (class, subject) — all slots regardless of day
  const groups = new Map();
  schedule.forEach((r, idx) => {
    const key = `${r.kelas}|${r.mapelId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ idx, hari: r.hari, jamKe: Number(r.jamKe), guruId: r.guruId, kelas: r.kelas });
  });

  const dayOrder = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => {
      const da = dayOrder.indexOf(a.hari), db = dayOrder.indexOf(b.hari);
      return da !== db ? da - db : a.jamKe - b.jamKe;
    });

    // Process in pairs: (0,1), (2,3), ... — odd slots (e.g. 3 hrs/week single) are left alone
    for (let i = 0; i + 1 < group.length; i += 2) {
      const s0 = group[i];
      const s1 = group[i + 1];

      if (s0.hari === s1.hari && s1.jamKe === s0.jamKe + 1) continue; // already perfect

      const classTingkat = extractTingkat(classNameMap.get(Number(s0.kelas)) || '');

      const tryMove = (movable, targetHari, targetJam) => {
        if (movable.hari === targetHari && movable.jamKe === targetJam) return false;
        if (targetJam < 1) return false;
        const active = getActiveSlots(targetHari, classTingkat, slotsByTingkat, hoursByDayByTingkat, hoursByDay);
        if (!active.includes(targetJam)) return false;
        const newCK = `${movable.kelas}-${targetHari}-${targetJam}`;
        const newTK = `${movable.guruId}-${targetHari}-${targetJam}`;
        if (classBusyMap.has(newCK)) return false;
        if (teacherBusyMap.has(newTK)) return false;
        const oldCK = `${movable.kelas}-${movable.hari}-${movable.jamKe}`;
        const oldTK = `${movable.guruId}-${movable.hari}-${movable.jamKe}`;
        classBusyMap.delete(oldCK);
        teacherBusyMap.delete(oldTK);
        schedule[movable.idx] = { ...schedule[movable.idx], hari: targetHari, jamKe: String(targetJam) };
        classBusyMap.set(newCK, movable.idx);
        teacherBusyMap.set(newTK, movable.idx);
        return true;
      };

      // 4 attempts, prefer s1 moving to s0's day
      if (tryMove(s1, s0.hari, s0.jamKe + 1)) { group[i+1] = { ...s1, hari: s0.hari, jamKe: s0.jamKe + 1 }; continue; }
      if (tryMove(s1, s0.hari, s0.jamKe - 1)) { group[i+1] = { ...s1, hari: s0.hari, jamKe: s0.jamKe - 1 }; continue; }
      if (tryMove(s0, s1.hari, s1.jamKe - 1)) { group[i]   = { ...s0, hari: s1.hari, jamKe: s1.jamKe - 1 }; continue; }
      if (tryMove(s0, s1.hari, s1.jamKe + 1)) { group[i]   = { ...s0, hari: s1.hari, jamKe: s1.jamKe + 1 }; continue; }
      // No perfect move found; leave as-is (already on same day if Priority 2 succeeded in greedyPass)
    }
  }

  return schedule;
}

async function generateSchedule({ days, hoursByDay, slotsByTingkat, hoursByDayByTingkat }) {
  const teachers = await getTeachers();
  const classes = await getClasses();
  const teacherSubjectsRaw = await getTeacherSubjects();
  const classSubjectsRaw = await getClassSubjects();
  const teacherLimitsRaw = await getTeacherLimits();

  // Load locked slots — these are pre-placed before random scheduling
  const [lockedRows] = await pool.query(
    `SELECT ls.*, t.name AS teacher_name, s.name AS subject_name, c.name AS class_name
     FROM locked_slots ls
     JOIN ${masterDb}.teachers t ON t.id = ls.teacher_id
     JOIN ${masterDb}.subjects s ON s.id = ls.subject_id
     JOIN ${masterDb}.classes c ON c.id = ls.class_id`
  );

  const teacherSubjects = buildTeacherSubjectsMap(teacherSubjectsRaw);
  const teacherLimits = buildTeacherLimitsMap(teacherLimitsRaw);
  const classNameMap = new Map(classes.map(c => [c.id, c.name]));
  const subjectNameMap = new Map();
  teacherSubjectsRaw.forEach(r => { /* subjects built below */ });
  // Build subject name map from classSubjectsRaw + teacher subjects raw
  const subjectIds = new Set([...classSubjectsRaw.map(r => r.subject_id), ...teacherSubjectsRaw.map(r => r.subject_id)]);

  // Class kelas_type: 'PA', 'PI', or 'PA_PI' (no restriction)
  const classKelasTypeMap = new Map(classes.map(c => {
    const dbType = c.kelas_type || 'PA_PI';
    if (dbType !== 'PA_PI') return [c.id, dbType];
    const nameGender = extractClassGender(c.name || '');
    const fallback = nameGender === 'L' ? 'PA' : nameGender === 'P' ? 'PI' : 'PA_PI';
    return [c.id, fallback];
  }));

  // Pre-build locked schedule entries (these won't be randomized)
  // Key set for occupied class+hari+jam (for non-multi-class) and teacher+hari+jam
  const lockedClassSlots = new Set(); // `${classId}_${hari}_${jam_ke}` → occupied
  const lockedTeacherSlots = new Map(); // `${teacherId}_${hari}_${jam_ke}` → Set of classIds (allow_multi_class)
  const lockedSchedule = lockedRows.map(r => {
    lockedClassSlots.add(`${r.class_id}_${r.hari}_${r.jam_ke}`);
    const tk = `${r.teacher_id}_${r.hari}_${r.jam_ke}`;
    if (!lockedTeacherSlots.has(tk)) lockedTeacherSlots.set(tk, { classIds: new Set(), allowMulti: r.allow_multi_class === 1 });
    lockedTeacherSlots.get(tk).classIds.add(String(r.class_id));
    lockedTeacherSlots.get(tk).allowMulti = lockedTeacherSlots.get(tk).allowMulti || r.allow_multi_class === 1;
    return {
      hari: r.hari, jamKe: String(r.jam_ke), kelas: String(r.class_id),
      kelasName: r.class_name, mapelId: String(r.subject_id), mapelName: r.subject_name,
      guruId: String(r.teacher_id), guruName: r.teacher_name,
      locked: true, allowMultiClass: r.allow_multi_class === 1
    };
  });

  // Count locked slots per class+subject so we can reduce lesson count
  const lockedCounts = new Map(); // `${classId}_${subjectId}` → count
  for (const r of lockedRows) {
    const key = `${r.class_id}_${r.subject_id}`;
    lockedCounts.set(key, (lockedCounts.get(key) || 0) + 1);
  }

  // Build initial busy sets from locked schedule
  const initTeacherBusy = new Set();
  const initClassBusy = new Set();
  for (const r of lockedRows) {
    initClassBusy.add(`${r.class_id}-${r.hari}-${r.jam_ke}`);
    // Always mark teacher busy at locked slot — allow_multi_class only means
    // multiple *locked* classes at same slot, not free re-use by the generator.
    initTeacherBusy.add(`${r.teacher_id}-${r.hari}-${r.jam_ke}`);
  }

  // Build paired lessons: subjects with 2+ hours → pairs of 2 consecutive slots
  // Subtract hours already covered by locked slots
  const allLessons = [];
  for (const cs of classSubjectsRaw) {
    const className = classNameMap.get(cs.class_id) || '';
    const classTingkat = extractTingkat(className);
    const classKelasType = classKelasTypeMap.get(cs.class_id) || 'PA_PI';
    const locked = lockedCounts.get(`${cs.class_id}_${cs.subject_id}`) || 0;
    const needed = Math.max(0, (cs.hours_per_week || 2) - locked);
    const pairs = Math.floor(needed / 2);
    const singles = needed % 2;
    for (let i = 0; i < pairs; i++) {
      allLessons.push({ classId: cs.class_id, classTingkat, classKelasType, subjectId: cs.subject_id, slotCount: 2 });
    }
    for (let i = 0; i < singles; i++) {
      allLessons.push({ classId: cs.class_id, classTingkat, classKelasType, subjectId: cs.subject_id, slotCount: 1 });
    }
  }

  const RUNS = 5;
  const TIMEOUT_MS = 9000;
  const start = Date.now();
  let bestSchedule = [];
  let bestUnassigned = [...allLessons];

  for (let run = 0; run < RUNS; run++) {
    if (Date.now() - start > TIMEOUT_MS) break;

    // Sort hardest-first: fewest valid teachers for the lesson
    const sorted = shuffle([...allLessons]).sort((a, b) => {
      const countCandidates = (l) => teachers.filter(t => {
        if (!canTeachSubject(teacherSubjects, t.id, l.subjectId, l.classTingkat, l.classId)) return false;
        const pref = (teacherLimits.get(t.id) || {}).classGenderPref || 'both';
        if (!canTeachKelas(pref, l.classKelasType)) return false;
        return true;
      }).length;
      return countCandidates(a) - countCandidates(b);
    });

    const { schedule, unassigned } = greedyPass(
      sorted, teachers, days,
      slotsByTingkat, hoursByDayByTingkat, hoursByDay,
      teacherSubjects, teacherLimits,
      lockedSchedule, initTeacherBusy, initClassBusy
    );
    if (unassigned.length < bestUnassigned.length) {
      bestSchedule = schedule;
      bestUnassigned = unassigned;
    }
    if (bestUnassigned.length === 0) break;
  }

  if (bestUnassigned.length > 0) {
    const repaired = swapRepair(
      bestSchedule, bestUnassigned, teachers, days,
      slotsByTingkat, hoursByDayByTingkat, hoursByDay,
      teacherSubjects, teacherLimits
    );
    // Re-add locked schedule that swapRepair may have stripped
    const nonLockedRepaired = repaired.schedule.filter(r => !r.locked);
    bestSchedule = [...lockedSchedule, ...nonLockedRepaired];
    bestUnassigned = repaired.remaining;
  }

  // Post-process: consolidate same-subject slots per class to same day + consecutive.
  // Run twice: first pass moves cross-day slots together; second pass cleans up any remaining gaps.
  bestSchedule = consolidatePairs(bestSchedule, classNameMap, slotsByTingkat, hoursByDayByTingkat, hoursByDay);
  bestSchedule = consolidatePairs(bestSchedule, classNameMap, slotsByTingkat, hoursByDayByTingkat, hoursByDay);

  const linearWarnings = [];
  teacherLimits.forEach((limits, teacherId) => {
    if (!limits.minLinier) return;
    const linearSubIds = new Set(
      teacherSubjectsRaw.filter(r => String(r.teacher_id) === String(teacherId) && (r.is_linear === 1 || r.is_linear === true))
        .map(r => String(r.subject_id))
    );
    const count = bestSchedule.filter(r => r.guruId === String(teacherId) && linearSubIds.has(r.mapelId)).length;
    if (count < limits.minLinier) {
      const teacher = teachers.find(t => String(t.id) === String(teacherId));
      linearWarnings.push({ teacherId, teacherName: teacher?.name || teacherId, required: limits.minLinier, actual: count });
    }
  });

  const failed = bestUnassigned.map(l => ({
    hari: null, jamKe: null,
    kelas: String(l.classId),
    kelasName: classNameMap.get(l.classId) || String(l.classId),
    mapelId: String(l.subjectId),
    reason: teachers.filter(t => {
      if (!canTeachSubject(teacherSubjects, t.id, l.subjectId, l.classTingkat, l.classId)) return false;
      const pref = (teacherLimits.get(t.id) || {}).classGenderPref || 'both';
      if (!canTeachKelas(pref, l.classKelasType)) return false;
      return true;
    }).length === 0
      ? `Tidak ada guru untuk mapel ini di tingkat ${l.classTingkat || 'ini'}`
      : 'Slot tidak tersedia (bentrok jadwal atau batas jam tercapai)'
  }));

  const failedByClass = {};
  failed.forEach(f => { failedByClass[f.kelas] = (failedByClass[f.kelas] || 0) + 1; });

  return { schedule: bestSchedule, failed, failedByClass, linearWarnings };
}

async function applyGeneratedSchedule(rows) {
  if (!rows || rows.length === 0) return { success: false, message: 'Tidak ada jadwal di-generate.' };
  let inserted = false;
  let attempts = 0;
  while (!inserted && attempts < 3) {
    attempts++;
    const values = rows.map(r => [createScheduleId(), r.hari, r.jamKe, r.kelas, r.mapelId, r.guruId]);
    try {
      await pool.query('INSERT INTO jadwal (id, hari, jam_ke, kelas, mapel_id, guru_id) VALUES ?', [values]);
      inserted = true;
    } catch (e) {
      if (isPrimaryDuplicateError(e)) continue;
      if (isScheduleConflictError(e)) throw new Error('Jadwal bentrok.');
      throw e;
    }
  }
  if (!inserted) throw new Error('Gagal menyimpan hasil auto-jadwal.');
  return { success: true, message: `Jadwal berhasil di-generate: ${rows.length} slot.` };
}

async function finalizeSchedule(rows) {
  if (!rows || rows.length === 0) return { success: false, message: 'Tidak ada jadwal untuk difinalisasi.' };
  await pool.query('DELETE FROM jadwal');
  let inserted = false;
  let attempts = 0;
  while (!inserted && attempts < 3) {
    attempts++;
    const values = rows.map(r => [createScheduleId(), r.hari, r.jamKe, r.kelas, r.mapelId, r.guruId]);
    try {
      await pool.query('INSERT INTO jadwal (id, hari, jam_ke, kelas, mapel_id, guru_id) VALUES ?', [values]);
      inserted = true;
    } catch (e) {
      if (isPrimaryDuplicateError(e)) continue;
      throw e;
    }
  }
  if (!inserted) throw new Error('Gagal menyimpan jadwal yang difinalisasi.');
  return { success: true, message: `Jadwal berhasil difinalisasi: ${rows.length} slot.` };
}

function checkConflict(schedule, hari, jamKe, kelas, newGuruId, excludeIdx = -1) {
  for (let i = 0; i < schedule.length; i++) {
    if (i === excludeIdx) continue;
    const r = schedule[i];
    if (String(r.guruId) === String(newGuruId) &&
        r.hari === hari &&
        String(r.jamKe) === String(jamKe) &&
        String(r.kelas) !== String(kelas)) {
      return { conflictRow: r, message: `Guru sudah mengajar di kelas lain pada ${hari} jam ke-${jamKe}` };
    }
  }
  return null;
}

async function resetSchedule() {
  await pool.query('DELETE FROM jadwal');
  return { success: true, message: 'Jadwal berhasil direset.' };
}

module.exports = {
  generateSchedule,
  applyGeneratedSchedule,
  finalizeSchedule,
  checkConflict,
  resetSchedule,
  extractTingkat,
  extractClassGender
};
