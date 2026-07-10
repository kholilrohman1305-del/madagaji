const pool = require('../db');
const masterPool = pool.master;
const { randomBytes } = require('crypto');
const {
  getTeachers,
  getSubjects,
  getClasses,
  getTeacherSubjects,
  getClassSubjects,
  getTeacherLimits
} = require('./scheduler/configService');

function createBatchIds(count) {
  // Generate `count` unique 10-char IDs (J + 9 hex chars = 68B combinations).
  // Building a Set guarantees no duplicates within the batch.
  const ids = new Set();
  while (ids.size < count) {
    ids.add('J' + randomBytes(5).toString('hex').toUpperCase().slice(0, 9));
  }
  return [...ids];
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
  const found = subs.find(s => String(s.subjectId) === String(subjectId));
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
      // Pairs must stay as a 2-hour block on ONE day (never split into lone
      // 1-hour slots). Multiple pairs of the same class+subject prefer
      // different days (2+2 across 2 days beats 4 stacked on one day).
      let placed = false;
      const shuffledCandidates = shuffle([...candidates]);
      const usedDays = new Set(schedule
        .filter(r => String(r.kelas) === String(classId) && String(r.mapelId) === String(subjectId))
        .map(r => r.hari));

      // preferNewDay: skip days already holding this class+subject.
      // requireConsecutive: slots must be back-to-back; otherwise any 2 free
      // slots on the same day (consolidatePairs merges them afterwards).
      const tryPlacePair = (preferNewDay, requireConsecutive) => {
        for (const teacher of shuffledCandidates) {
          const limits = teacherLimits.get(teacher.id) || {};
          for (const day of shuffle([...days])) {
            if (preferNewDay && usedDays.has(day)) continue;
            if (limits.availableDays && !limits.availableDays.has(day)) continue;
            const wl = teacherLoadWeek.get(teacher.id) || 0;
            if (limits.maxWeek != null && wl + 2 > limits.maxWeek) continue;
            const dayKey = `${teacher.id}-${day}`;
            const dl = teacherLoadDay.get(dayKey) || 0;
            if (limits.maxDay != null && dl + 2 > limits.maxDay) continue;

            const slots = getActiveSlots(day, classTingkat, slotsByTingkat, hoursByDayByTingkat, hoursByDay);
            let pair = null;
            if (requireConsecutive) {
              for (let k = 0; k < slots.length - 1 && !pair; k++) {
                const h1 = slots[k], h2 = slots[k + 1];
                if (h2 !== h1 + 1) continue;
                if (classBusy.has(`${classId}-${day}-${h1}`) || classBusy.has(`${classId}-${day}-${h2}`)) continue;
                if (teacherBusy.has(`${teacher.id}-${day}-${h1}`) || teacherBusy.has(`${teacher.id}-${day}-${h2}`)) continue;
                pair = [h1, h2];
              }
            } else {
              const free = slots.filter(h =>
                !classBusy.has(`${classId}-${day}-${h}`) &&
                !teacherBusy.has(`${teacher.id}-${day}-${h}`));
              if (free.length >= 2) pair = [free[0], free[1]];
            }
            if (!pair) continue;

            for (const h of pair) {
              schedule.push({ hari: day, jamKe: String(h), kelas: String(classId), mapelId: String(subjectId), guruId: String(teacher.id) });
              teacherBusy.add(`${teacher.id}-${day}-${h}`);
              classBusy.add(`${classId}-${day}-${h}`);
            }
            teacherLoadWeek.set(teacher.id, wl + 2);
            teacherLoadDay.set(dayKey, dl + 2);
            return true;
          }
        }
        return false;
      };

      placed = tryPlacePair(true, true)   // hari baru + berurutan (ideal)
        || tryPlacePair(false, true)      // hari apa pun + berurutan
        || tryPlacePair(true, false)      // hari baru + 2 slot bebas sehari
        || tryPlacePair(false, false);    // hari apa pun + 2 slot bebas sehari

      // Never split a pair into singles — keep it whole so swapRepair/report
      // treats it as a 2-hour block.
      if (!placed) unassigned.push(lesson);
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

    // 2-hour block: place both slots on one day (consecutive first), never split
    if (lesson.slotCount === 2) {
      const viablePair = teachers.filter(t => {
        if (!canTeachSubject(teacherSubjects, t.id, subjectId, classTingkat, classId)) return false;
        const pref = (teacherLimits.get(t.id) || {}).classGenderPref || 'both';
        return canTeachKelas(pref, classKelasType);
      });
      pairSearch:
      for (const requireConsecutive of [true, false]) {
        for (const teacher of shuffle([...viablePair])) {
          const limits = teacherLimits.get(teacher.id) || {};
          const wl = teacherLoadWeek.get(String(teacher.id)) || 0;
          if (limits.maxWeek != null && wl + 2 > limits.maxWeek) continue;
          for (const day of shuffle([...days])) {
            if (limits.availableDays && !limits.availableDays.has(day)) continue;
            const dl = teacherLoadDay.get(`${teacher.id}-${day}`) || 0;
            if (limits.maxDay != null && dl + 2 > limits.maxDay) continue;
            const slots = getActiveSlots(day, classTingkat, slotsByTingkat, hoursByDayByTingkat, hoursByDay);
            const free = slots.filter(h =>
              !classBusy.has(`${classId}-${day}-${h}`) &&
              !teacherBusy.has(`${teacher.id}-${day}-${h}`));
            let pair = null;
            if (requireConsecutive) {
              for (let k = 0; k < free.length - 1 && !pair; k++) {
                if (free[k + 1] === free[k] + 1) pair = [free[k], free[k + 1]];
              }
            } else if (free.length >= 2) {
              pair = [free[0], free[1]];
            }
            if (!pair) continue;
            for (const h of pair) {
              schedule.push({ hari: day, jamKe: String(h), kelas: String(classId), mapelId: String(subjectId), guruId: String(teacher.id) });
              teacherBusy.add(`${teacher.id}-${day}-${h}`);
              classBusy.add(`${classId}-${day}-${h}`);
            }
            teacherLoadWeek.set(String(teacher.id), wl + 2);
            teacherLoadDay.set(`${teacher.id}-${day}`, dl + 2);
            fixed = true;
            break pairSearch;
          }
        }
      }
      if (!fixed) remaining.push(lesson);
      continue;
    }

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
  // Count how many schedule entries occupy each teacher slot — handles multi-class locked slots
  // where the same teacher is at the same time for 2+ different classes.
  const teacherBusyCount = new Map();

  schedule.forEach((r, idx) => {
    classBusyMap.set(`${r.kelas}-${r.hari}-${r.jamKe}`, idx);
    const tk = `${r.guruId}-${r.hari}-${r.jamKe}`;
    teacherBusyCount.set(tk, (teacherBusyCount.get(tk) || 0) + 1);
  });

  // Group by (class, subject) — all slots regardless of day
  const groups = new Map();
  schedule.forEach((r, idx) => {
    const key = `${r.kelas}|${r.mapelId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ idx, hari: r.hari, jamKe: Number(r.jamKe), guruId: r.guruId, kelas: r.kelas, isLocked: !!r.locked });
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
        if (movable.isLocked) return false; // locked slots must never be moved
        if (movable.hari === targetHari && movable.jamKe === targetJam) return false;
        if (targetJam < 1) return false;
        const active = getActiveSlots(targetHari, classTingkat, slotsByTingkat, hoursByDayByTingkat, hoursByDay);
        if (!active.includes(targetJam)) return false;
        const newCK = `${movable.kelas}-${targetHari}-${targetJam}`;
        const newTK = `${movable.guruId}-${targetHari}-${targetJam}`;
        if (classBusyMap.has(newCK)) return false;
        if ((teacherBusyCount.get(newTK) || 0) > 0) return false;
        const oldCK = `${movable.kelas}-${movable.hari}-${movable.jamKe}`;
        const oldTK = `${movable.guruId}-${movable.hari}-${movable.jamKe}`;
        classBusyMap.delete(oldCK);
        // Decrement count — only truly free when count reaches 0 (handles multi-class)
        const prevCount = teacherBusyCount.get(oldTK) || 1;
        if (prevCount <= 1) teacherBusyCount.delete(oldTK);
        else teacherBusyCount.set(oldTK, prevCount - 1);
        schedule[movable.idx] = { ...schedule[movable.idx], hari: targetHari, jamKe: String(targetJam) };
        classBusyMap.set(newCK, movable.idx);
        teacherBusyCount.set(newTK, (teacherBusyCount.get(newTK) || 0) + 1);
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

  // Load locked slots — separate queries to avoid cross-DB permission issues
  const [lockedRaw] = await pool.query(`SELECT * FROM locked_slots`);
  const [lkTeachers] = await masterPool.query(`SELECT id, name FROM teachers`);
  const [lkSubjects] = await masterPool.query(`SELECT id, name FROM subjects`);
  const [lkClasses]  = await masterPool.query(`SELECT id, name FROM classes`);
  const lkTeacherMap = new Map(lkTeachers.map(t => [t.id, t.name]));
  const lkSubjectMap = new Map(lkSubjects.map(s => [s.id, s.name]));
  const lkClassMap   = new Map(lkClasses.map(c => [c.id, c.name]));
  const lockedRows = lockedRaw.map(ls => ({
    ...ls,
    teacher_name: lkTeacherMap.get(ls.teacher_id) || String(ls.teacher_id),
    subject_name: lkSubjectMap.get(ls.subject_id) || String(ls.subject_id),
    class_name:   lkClassMap.get(ls.class_id)   || String(ls.class_id)
  }));

  const teacherSubjects = buildTeacherSubjectsMap(teacherSubjectsRaw);
  const teacherLimits = buildTeacherLimitsMap(teacherLimitsRaw);
  const classNameMap = new Map(classes.map(c => [c.id, c.name]));

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

  // ── Diagnostics: capacity analysis + detailed per-lesson failure reasons ──
  const TINGKATS = ['X', 'XI', 'XII'];
  const activeSlotCount = (tingkat) => days.reduce((sum, day) =>
    sum + getActiveSlots(day, tingkat, slotsByTingkat, hoursByDayByTingkat, hoursByDay).length, 0);

  // Max slots a teacher could possibly attend per day (across all tingkat)
  const dayCapMax = new Map();
  for (const day of days) {
    let m = getActiveSlots(day, '', slotsByTingkat, hoursByDayByTingkat, hoursByDay).length;
    for (const t of TINGKATS) {
      m = Math.max(m, getActiveSlots(day, t, slotsByTingkat, hoursByDayByTingkat, hoursByDay).length);
    }
    dayCapMax.set(day, m);
  }
  const teacherWeekCap = (limits) => {
    let cap = 0;
    for (const day of days) {
      if (limits?.availableDays && !limits.availableDays.has(day)) continue;
      let d = dayCapMax.get(day) || 0;
      if (limits?.maxDay != null) d = Math.min(d, limits.maxDay);
      cap += d;
    }
    if (limits?.maxWeek != null) cap = Math.min(cap, limits.maxWeek);
    return cap;
  };

  // Class capacity: total curriculum hours vs active slots per week
  const classDemand = new Map();
  for (const cs of classSubjectsRaw) {
    classDemand.set(cs.class_id, (classDemand.get(cs.class_id) || 0) + (cs.hours_per_week || 2));
  }
  const capacityWarnings = { classes: [], subjects: [] };
  for (const [classId, required] of classDemand) {
    const className = classNameMap.get(classId) || String(classId);
    const capacity = activeSlotCount(extractTingkat(className));
    if (required > capacity) {
      capacityWarnings.classes.push({ classId, className, required, capacity, shortfall: required - capacity });
    }
  }
  capacityWarnings.classes.sort((a, b) => String(a.className).localeCompare(String(b.className)));

  // Subject capacity: total demand across classes vs combined capacity of mapped teachers
  const subjectDemand = new Map();
  for (const cs of classSubjectsRaw) {
    if (!subjectDemand.has(cs.subject_id)) subjectDemand.set(cs.subject_id, { required: 0, classCount: 0 });
    const d = subjectDemand.get(cs.subject_id);
    d.required += cs.hours_per_week || 2;
    d.classCount += 1;
  }
  for (const [subjectId, d] of subjectDemand) {
    const cands = teachers.filter(t =>
      (teacherSubjects.get(t.id) || []).some(s => String(s.subjectId) === String(subjectId)));
    const totalCap = cands.reduce((sum, t) => sum + teacherWeekCap(teacherLimits.get(t.id)), 0);
    if (cands.length === 0 || totalCap < d.required) {
      capacityWarnings.subjects.push({
        subjectId,
        subjectName: lkSubjectMap.get(subjectId) || String(subjectId),
        required: d.required,
        classCount: d.classCount,
        teacherNames: cands.map(t => t.name),
        totalCap
      });
    }
  }
  capacityWarnings.subjects.sort((a, b) => (b.required - b.totalCap) - (a.required - a.totalCap));

  // Final occupancy state — used to explain exactly why each leftover lesson failed
  const teacherBusyFinal = new Set(bestSchedule.map(r => `${r.guruId}-${r.hari}-${r.jamKe}`));
  const classBusyFinal = new Set(bestSchedule.map(r => `${r.kelas}-${r.hari}-${r.jamKe}`));
  const loadWeekFinal = new Map();
  const loadDayFinal = new Map();
  for (const r of bestSchedule) {
    loadWeekFinal.set(String(r.guruId), (loadWeekFinal.get(String(r.guruId)) || 0) + 1);
    loadDayFinal.set(`${r.guruId}-${r.hari}`, (loadDayFinal.get(`${r.guruId}-${r.hari}`) || 0) + 1);
  }

  // Aggregate unassigned lessons per (class, subject)
  const failedGroups = new Map();
  for (const l of bestUnassigned) {
    const key = `${l.classId}|${l.subjectId}`;
    if (!failedGroups.has(key)) failedGroups.set(key, { ...l, count: 0 });
    failedGroups.get(key).count += l.slotCount === 2 ? 2 : 1;
  }

  const failed = [...failedGroups.values()].map(g => {
    const classIdNum = Number(g.classId);
    const kelasName = classNameMap.get(classIdNum) || String(g.classId);
    const mapelName = lkSubjectMap.get(Number(g.subjectId)) || String(g.subjectId);
    const required = classDemand.get(classIdNum) || 0;
    const capacity = activeSlotCount(g.classTingkat);

    const candidates = teachers.filter(t => {
      if (!canTeachSubject(teacherSubjects, t.id, g.subjectId, g.classTingkat, g.classId)) return false;
      const pref = (teacherLimits.get(t.id) || {}).classGenderPref || 'both';
      return canTeachKelas(pref, g.classKelasType);
    });

    let reason;
    let guruDetail = [];

    if (candidates.length === 0) {
      // Distinguish: blocked by PA/PI preference vs mapped elsewhere vs no teacher at all
      const mappedToClass = teachers.filter(t =>
        canTeachSubject(teacherSubjects, t.id, g.subjectId, g.classTingkat, g.classId));
      const subjectTeachers = teachers.filter(t =>
        (teacherSubjects.get(t.id) || []).some(s => String(s.subjectId) === String(g.subjectId)));
      if (mappedToClass.length > 0) {
        reason = `Guru ${mapelName} untuk kelas ${kelasName} terblokir preferensi jenis kelas (PA/PI):`;
        guruDetail = mappedToClass.map(t => {
          const pref = (teacherLimits.get(t.id) || {}).classGenderPref || 'both';
          return `${t.name} — preferensi kelas guru "${pref}", sedangkan ${kelasName} bertipe ${g.classKelasType}. Ubah di Step 3 atau Step 4.`;
        });
      } else if (subjectTeachers.length > 0) {
        reason = `Tidak ada guru ${mapelName} yang di-mapping untuk kelas ${kelasName}. Tambahkan mapping kelas ini di Step 3 (Guru & Mapel). Guru pengampu ${mapelName} saat ini:`;
        guruDetail = subjectTeachers.map(t => {
          const maps = (teacherSubjects.get(t.id) || []).filter(s => String(s.subjectId) === String(g.subjectId));
          const kelasList = [...new Set(maps.filter(m => Number(m.classId) > 0)
            .map(m => classNameMap.get(Number(m.classId)) || String(m.classId)))].sort();
          const tingkatList = [...new Set(maps.filter(m => !(Number(m.classId) > 0))
            .map(m => m.tingkat ? `tingkat ${m.tingkat}` : 'semua tingkat'))];
          const scope = [...tingkatList, ...(kelasList.length ? [`kelas ${kelasList.join(', ')}`] : [])].join('; ');
          return `${t.name} — hanya di-mapping untuk ${scope || 'lingkup tidak dikenal'}`;
        });
      } else {
        reason = `Belum ada satu pun guru yang di-mapping untuk mapel ${mapelName}. Tambahkan guru pengampu di Step 3 (Guru & Mapel).`;
      }
    } else {
      const freeSlots = [];
      for (const day of days) {
        for (const h of getActiveSlots(day, g.classTingkat, slotsByTingkat, hoursByDayByTingkat, hoursByDay)) {
          if (!classBusyFinal.has(`${g.classId}-${day}-${h}`)) freeSlots.push({ day, hour: h });
        }
      }
      if (freeSlots.length === 0) {
        reason = `Semua ${capacity} slot aktif kelas ${kelasName} sudah terisi, sedangkan total kebutuhan kurikulum kelas ini ${required} jam/minggu. Tambah hari aktif / jam per hari di Step 1, atau kurangi jam mapel di Step 2.`;
      } else {
        reason = `${g.count} jam ${mapelName} belum terjadwal. Kondisi tiap guru pengampu:`;
        guruDetail = candidates.map(t => {
          const limits = teacherLimits.get(t.id) || {};
          const tid = String(t.id);
          const load = loadWeekFinal.get(tid) || 0;
          if (limits.maxWeek != null && load >= limits.maxWeek) {
            return `${t.name} — batas ${limits.maxWeek} jam/minggu sudah penuh (terpakai ${load} jam)`;
          }
          const availFree = freeSlots.filter(s => !limits.availableDays || limits.availableDays.has(s.day));
          if (availFree.length === 0) {
            const hariGuru = limits.availableDays ? [...limits.availableDays].join(', ') : 'semua hari';
            return `${t.name} — hari tersedia guru (${hariGuru}) tidak beririsan dengan slot kosong kelas ${kelasName}`;
          }
          const open = availFree.filter(s =>
            !teacherBusyFinal.has(`${tid}-${s.day}-${s.hour}`) &&
            !(limits.maxDay != null && (loadDayFinal.get(`${tid}-${s.day}`) || 0) >= limits.maxDay));
          if (open.length === 0) {
            return `${t.name} — sudah mengajar di kelas lain pada semua slot kosong kelas ${kelasName} (beban saat ini ${load} jam/minggu)`;
          }
          return `${t.name} — masih bisa diisi manual di ${open.slice(0, 3).map(s => `${s.day} jam ke-${s.hour}`).join(', ')}${open.length > 3 ? ` (+${open.length - 3} slot lain)` : ''} — klik sel di tabel preview`;
        });
      }
    }

    return {
      hari: null, jamKe: null,
      kelas: String(g.classId), kelasName,
      mapelId: String(g.subjectId), mapelName,
      jumlahJam: g.count,
      reason, guruDetail
    };
  }).sort((a, b) =>
    String(a.kelasName).localeCompare(String(b.kelasName)) ||
    String(a.mapelName).localeCompare(String(b.mapelName)));

  const failedByClass = {};
  failed.forEach(f => { failedByClass[f.kelas] = (failedByClass[f.kelas] || 0) + f.jumlahJam; });
  const totalUnassigned = failed.reduce((s, f) => s + f.jumlahJam, 0);

  return { schedule: bestSchedule, failed, failedByClass, linearWarnings, capacityWarnings, totalUnassigned };
}

async function applyGeneratedSchedule(rows) {
  if (!rows || rows.length === 0) return { success: false, message: 'Tidak ada jadwal di-generate.' };
  const ids = createBatchIds(rows.length);
  const values = rows.map((r, i) => [ids[i], r.hari, r.jamKe, r.kelas, r.mapelId, r.guruId]);
  try {
    await pool.query('INSERT INTO jadwal (id, hari, jam_ke, kelas, mapel_id, guru_id) VALUES ?', [values]);
  } catch (e) {
    if (isScheduleConflictError(e)) throw new Error('Jadwal bentrok (kelas sudah terisi di jam yang sama).');
    throw e;
  }
  return { success: true, message: `Jadwal berhasil di-generate: ${rows.length} slot.` };
}

async function finalizeSchedule(rows) {
  if (!rows || rows.length === 0) return { success: false, message: 'Tidak ada jadwal untuk difinalisasi.' };

  // Deduplicate by (kelas, hari, jamKe): locked slots take priority over generated ones.
  // This handles edge cases where consolidatePairs places a generated slot at the same
  // position as a locked slot — the locked slot always wins.
  const slotMap = new Map();
  for (const r of rows) {
    const key = `${r.kelas}|${r.hari}|${r.jamKe}`;
    const existing = slotMap.get(key);
    if (!existing) {
      slotMap.set(key, r);
    } else if (r.locked && !existing.locked) {
      slotMap.set(key, r); // locked beats non-locked
    }
    // else: keep existing (locked already there, or both non-locked → keep first)
  }
  const deduped = [...slotMap.values()];

  await pool.query('DELETE FROM jadwal');
  const ids = createBatchIds(deduped.length);
  const values = deduped.map((r, i) => [ids[i], r.hari, r.jamKe, r.kelas, r.mapelId, r.guruId]);
  try {
    await pool.query('INSERT INTO jadwal (id, hari, jam_ke, kelas, mapel_id, guru_id) VALUES ?', [values]);
  } catch (e) {
    if (isScheduleConflictError(e)) throw new Error('Jadwal bentrok: ada kelas yang terjadwal 2x di slot yang sama.');
    throw new Error(`Gagal menyimpan jadwal: ${e.message}`);
  }
  return { success: true, message: `Jadwal berhasil difinalisasi: ${deduped.length} slot.` };
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
