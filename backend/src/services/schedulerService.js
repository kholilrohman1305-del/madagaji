const pool = require('../db');
const masterPool = pool.master;
const { randomBytes } = require('crypto');
const {
  getTeachers,
  getSubjects,
  getClasses,
  getTeacherSubjects,
  getClassSubjects,
  getTeacherLimits,
  getSubjectLimits
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
      classGenderPref: r.class_gender_pref || 'both',
      // Jam tersedia guru (centang). null = semua jam. maxSlot legacy fallback.
      availableSlots: Array.isArray(r.available_slots) ? new Set(r.available_slots.map(Number)) : null,
      maxSlot: r.max_slot ?? null
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

// Jam ke-h termasuk jam tersedia guru? (null = semua jam; maxSlot = legacy)
function slotAllowed(limits, h) {
  if (!limits) return true;
  if (limits.availableSlots) return limits.availableSlots.has(Number(h));
  return limits.maxSlot == null || Number(h) <= Number(limits.maxSlot);
}

// Batasan per mapel. subjectSlots: Map(String(id) -> { slots: Set|null, days: Set|null })
function subjectSlotAllowed(subjectSlots, subjectId, h) {
  const lim = subjectSlots?.get(String(subjectId));
  return !lim?.slots || lim.slots.has(Number(h));
}

function subjectDayAllowed(subjectSlots, subjectId, day) {
  const lim = subjectSlots?.get(String(subjectId));
  return !lim?.days || lim.days.has(day);
}

// classKelasType: 'PA', 'PI', or 'PA_PI' (no restriction)
function canTeachKelas(teacherClassGenderPref, classKelasType) {
  if (!classKelasType || classKelasType === 'PA_PI') return true;
  if (classKelasType === 'PA') return teacherClassGenderPref === 'PA' || teacherClassGenderPref === 'both';
  if (classKelasType === 'PI') return teacherClassGenderPref === 'PI' || teacherClassGenderPref === 'both';
  return true;
}

function greedyPass(lessons, teachers, days, slotsByTingkat, hoursByDayByTingkat, hoursByDay, teacherSubjects, teacherLimits, initSchedule = [], initTeacherBusy = new Set(), initClassBusy = new Set(), subjectSlots = new Map()) {
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
            if (!subjectDayAllowed(subjectSlots, subjectId, day)) continue;
            if (limits.availableDays && !limits.availableDays.has(day)) continue;
            const wl = teacherLoadWeek.get(teacher.id) || 0;
            if (limits.maxWeek != null && wl + 2 > limits.maxWeek) continue;
            const dayKey = `${teacher.id}-${day}`;
            const dl = teacherLoadDay.get(dayKey) || 0;
            if (limits.maxDay != null && dl + 2 > limits.maxDay) continue;

            const slots = getActiveSlots(day, classTingkat, slotsByTingkat, hoursByDayByTingkat, hoursByDay)
              .filter(h => slotAllowed(limits, h) && subjectSlotAllowed(subjectSlots, subjectId, h));
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
          if (!subjectDayAllowed(subjectSlots, subjectId, day)) continue;
          if (limits.availableDays && !limits.availableDays.has(day)) continue;
          const wl = teacherLoadWeek.get(teacher.id) || 0;
          if (limits.maxWeek != null && wl >= limits.maxWeek) continue;
          const dayKey = `${teacher.id}-${day}`;
          const dl = teacherLoadDay.get(dayKey) || 0;
          if (limits.maxDay != null && dl >= limits.maxDay) continue;

          const slots = getActiveSlots(day, classTingkat, slotsByTingkat, hoursByDayByTingkat, hoursByDay);
          for (const h of slots) {
            if (!slotAllowed(limits, h)) continue;
            if (!subjectSlotAllowed(subjectSlots, subjectId, h)) continue;
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

function swapRepair(schedule, unassigned, teachers, days, slotsByTingkat, hoursByDayByTingkat, hoursByDay, teacherSubjects, teacherLimits, subjectSlots = new Map()) {
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
            if (!subjectDayAllowed(subjectSlots, subjectId, day)) continue;
            if (limits.availableDays && !limits.availableDays.has(day)) continue;
            const dl = teacherLoadDay.get(`${teacher.id}-${day}`) || 0;
            if (limits.maxDay != null && dl + 2 > limits.maxDay) continue;
            const slots = getActiveSlots(day, classTingkat, slotsByTingkat, hoursByDayByTingkat, hoursByDay);
            const free = slots.filter(h =>
              slotAllowed(limits, h) &&
              subjectSlotAllowed(subjectSlots, subjectId, h) &&
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
      if (!subjectDayAllowed(subjectSlots, subjectId, day)) continue;

      for (const teacher of shuffle(viable)) {
        if (fixed) break;
        const tKey = `${teacher.id}-${day}-${hour}`;
        const limits = teacherLimits.get(teacher.id) || {};

        if (!teacherBusy.has(tKey)) {
          if (!slotAllowed(limits, hour)) continue;
          if (!subjectSlotAllowed(subjectSlots, subjectId, hour)) continue;
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
            if (!subjectDayAllowed(subjectSlots, conflict.mapelId, d2)) continue;
            if (limits.availableDays && !limits.availableDays.has(d2)) continue;
            const h2slots = getActiveSlots(d2, conflictTingkat || classTingkat, slotsByTingkat, hoursByDayByTingkat, hoursByDay);
            for (const h2 of h2slots) {
              if (!slotAllowed(limits, h2)) continue;
              if (!subjectSlotAllowed(subjectSlots, conflict.mapelId, h2)) continue;
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

// Ejection repair: place leftover lessons by RELOCATING existing non-locked
// rows that block the needed slots. Greedy/swapRepair only fill empty slots;
// this pass opens slots by moving blockers elsewhere (depth-1 ejection with
// rollback), which resolves "teacher busy at every free class slot" and
// "teacher's days don't intersect free class slots" dead-ends.
function ejectionRepair(schedule, unassigned, teachers, days, slotsByTingkat, hoursByDayByTingkat, hoursByDay, teacherSubjects, teacherLimits, classNameMap, loosePairs = false, evictDepth = 0, deadline = Infinity, allowSplit = false, subjectSlots = new Map()) {
  if (unassigned.length === 0) return { schedule, remaining: [] };

  const classAt = new Map();      // `${kelas}-${hari}-${jam}` -> schedule index
  const teacherCount = new Map(); // `${guru}-${hari}-${jam}` -> count (multi-class locked > 1)
  const teacherAt = new Map();    // `${guru}-${hari}-${jam}` -> schedule index (any one)
  const loadWeek = new Map();
  const loadDay = new Map();
  schedule.forEach((r, i) => {
    classAt.set(`${r.kelas}-${r.hari}-${r.jamKe}`, i);
    const tk = `${r.guruId}-${r.hari}-${r.jamKe}`;
    teacherCount.set(tk, (teacherCount.get(tk) || 0) + 1);
    teacherAt.set(tk, i);
    loadWeek.set(String(r.guruId), (loadWeek.get(String(r.guruId)) || 0) + 1);
    loadDay.set(`${r.guruId}-${r.hari}`, (loadDay.get(`${r.guruId}-${r.hari}`) || 0) + 1);
  });

  const tingkatOfClass = (kelasId) => extractTingkat(classNameMap.get(Number(kelasId)) || '');

  const moveRow = (idx, d2, h2) => {
    const r = schedule[idx];
    classAt.delete(`${r.kelas}-${r.hari}-${r.jamKe}`);
    const oldTK = `${r.guruId}-${r.hari}-${r.jamKe}`;
    const c = teacherCount.get(oldTK) || 1;
    if (c <= 1) { teacherCount.delete(oldTK); teacherAt.delete(oldTK); }
    else teacherCount.set(oldTK, c - 1);
    loadDay.set(`${r.guruId}-${r.hari}`, Math.max(0, (loadDay.get(`${r.guruId}-${r.hari}`) || 1) - 1));
    schedule[idx] = { ...r, hari: d2, jamKe: String(h2) };
    classAt.set(`${r.kelas}-${d2}-${h2}`, idx);
    const nTK = `${r.guruId}-${d2}-${h2}`;
    teacherCount.set(nTK, (teacherCount.get(nTK) || 0) + 1);
    teacherAt.set(nTK, idx);
    loadDay.set(`${r.guruId}-${d2}`, (loadDay.get(`${r.guruId}-${d2}`) || 0) + 1);
  };

  // Move blocker at `idx` to another valid slot. A blocker that is part of a
  // same-day 2-hour block is moved TOGETHER with its sibling so pairs are
  // never torn into lone 1-hour slots. With depth > 0, occupied targets can
  // be opened by recursively relocating their occupants (ejection chain) —
  // needed when every class is packed and depth-1 moves have nowhere to go.
  // Appends performed moves to movesOut; caller rolls back via undoMoves.
  const tryRelocate = (idx, forbiddenClass, forbiddenTeacher, depth, movesOut) => {
    if (Date.now() > deadline) return false;
    const r = schedule[idx];
    if (r.locked) return false;
    const limits = teacherLimits.get(Number(r.guruId)) || {};
    const tkt = tingkatOfClass(r.kelas);

    // Same-day siblings of the same class+subject (the other half of a block).
    // allowSplit (pass pamungkas): blocker boleh dipindah sendirian meski
    // memecah blok — sesuai aturan "1 jam pun boleh asal semua slot terisi".
    let group = [idx];
    if (!allowSplit) {
      const siblings = [];
      for (let j = 0; j < schedule.length; j++) {
        if (j === idx) continue;
        const s = schedule[j];
        if (String(s.kelas) === String(r.kelas) && String(s.mapelId) === String(r.mapelId) && s.hari === r.hari) {
          siblings.push(j);
        }
      }
      if (siblings.length > 1) return false; // 3+ same-day: don't touch
      group = siblings.length === 1 ? [idx, siblings[0]] : [idx];
      if (group.some(g => schedule[g].locked)) return false;
      if (group.length === 2 && String(schedule[group[1]].guruId) !== String(r.guruId)) return false;
    }
    const need = group.length;

    for (const d2 of shuffle([...days])) {
      if (!subjectDayAllowed(subjectSlots, r.mapelId, d2)) continue;
      if (limits.availableDays && !limits.availableDays.has(d2)) continue;
      if (d2 !== r.hari && limits.maxDay != null && (loadDay.get(`${r.guruId}-${d2}`) || 0) + need > limits.maxDay) continue;
      const slots = getActiveSlots(d2, tkt, slotsByTingkat, hoursByDayByTingkat, hoursByDay)
        .filter(h => slotAllowed(limits, h) && subjectSlotAllowed(subjectSlots, r.mapelId, h));

      const targets = [];
      if (need === 2) {
        for (let k = 0; k + 1 < slots.length; k++) {
          if (slots[k + 1] === slots[k] + 1) targets.push([slots[k], slots[k + 1]]);
        }
        if (loosePairs) {
          // Fallback: any 2 slots on the same day (consolidatePairs tidies later)
          const loose = [];
          for (let a = 0; a < slots.length; a++) {
            for (let b = a + 1; b < slots.length; b++) {
              if (slots[b] !== slots[a] + 1) loose.push([slots[a], slots[b]]);
            }
          }
          targets.push(...shuffle(loose).slice(0, 10));
        }
      } else {
        slots.forEach(h => targets.push([h]));
      }

      for (const tgt of shuffle(targets)) {
        if (Date.now() > deadline) return false;
        // Gather occupants; without depth they make the target unusable
        const evict = new Set();
        let bad = false;
        for (const h of tgt) {
          const ck = `${r.kelas}-${d2}-${h}`;
          const tk2 = `${r.guruId}-${d2}-${h}`;
          if (forbiddenClass.has(ck) || forbiddenTeacher.has(tk2)) { bad = true; break; }
          const ci = classAt.get(ck);
          if (ci !== undefined) {
            if (depth <= 0 || schedule[ci].locked || group.includes(ci)) { bad = true; break; }
            evict.add(ci);
          }
          if ((teacherCount.get(tk2) || 0) > 0) {
            const ti = teacherAt.get(tk2);
            if (depth <= 0 || ti === undefined || schedule[ti].locked ||
                (teacherCount.get(tk2) || 0) > 1 || group.includes(ti)) { bad = true; break; }
            evict.add(ti);
          }
        }
        if (bad) continue;

        const movesLocal = [];
        if (evict.size > 0) {
          const fc2 = new Set([...forbiddenClass, ...tgt.map(h => `${r.kelas}-${d2}-${h}`)]);
          const ft2 = new Set([...forbiddenTeacher, ...tgt.map(h => `${r.guruId}-${d2}-${h}`)]);
          let ok = true;
          for (const e of evict) {
            const cur = schedule[e];
            const stillBlocking = cur.hari === d2 && tgt.includes(Number(cur.jamKe)) &&
              (String(cur.kelas) === String(r.kelas) || String(cur.guruId) === String(r.guruId));
            if (!stillBlocking) continue; // moved along with an earlier eviction group
            if (!tryRelocate(e, fc2, ft2, depth - 1, movesLocal)) { ok = false; break; }
          }
          if (ok) {
            ok = tgt.every(h =>
              !classAt.has(`${r.kelas}-${d2}-${h}`) &&
              (teacherCount.get(`${r.guruId}-${d2}-${h}`) || 0) === 0);
          }
          if (!ok) { undoMoves(movesLocal); continue; }
        }

        group.forEach((gIdx, i2) => {
          movesLocal.push({ idx: gIdx, from: { hari: schedule[gIdx].hari, jamKe: schedule[gIdx].jamKe } });
          moveRow(gIdx, d2, tgt[i2]);
        });
        movesOut.push(...movesLocal);
        return true;
      }
    }
    return false;
  };

  const undoMoves = (moves) => {
    for (let i = moves.length - 1; i >= 0; i--) {
      moveRow(moves[i].idx, moves[i].from.hari, Number(moves[i].from.jamKe));
    }
  };

  const remaining = [];
  // Shuffle dulu agar tiap percobaan memproses urutan berbeda (lesson di
  // ujung antrian tidak kelaparan waktu saat deadline ketat), lalu pairs first
  const ordered = shuffle([...unassigned]).sort((a, b) => (b.slotCount || 1) - (a.slotCount || 1));

  for (const lesson of ordered) {
    if (Date.now() > deadline) { remaining.push(lesson); continue; }
    const { classId, classTingkat, classKelasType, subjectId } = lesson;
    const need = lesson.slotCount === 2 ? 2 : 1;
    const candidates = shuffle(teachers.filter(t => {
      if (!canTeachSubject(teacherSubjects, t.id, subjectId, classTingkat, classId)) return false;
      const pref = (teacherLimits.get(t.id) || {}).classGenderPref || 'both';
      return canTeachKelas(pref, classKelasType);
    }));
    let fixed = false;

    for (const teacher of candidates) {
      if (fixed) break;
      const limits = teacherLimits.get(teacher.id) || {};
      const tid = String(teacher.id);
      const wl = loadWeek.get(tid) || 0;
      if (limits.maxWeek != null && wl + need > limits.maxWeek) continue;

      for (const day of shuffle([...days])) {
        if (fixed) break;
        if (!subjectDayAllowed(subjectSlots, subjectId, day)) continue;
        if (limits.availableDays && !limits.availableDays.has(day)) continue;
        const dl = loadDay.get(`${tid}-${day}`) || 0;
        if (limits.maxDay != null && dl + need > limits.maxDay) continue;

        const slots = getActiveSlots(day, classTingkat, slotsByTingkat, hoursByDayByTingkat, hoursByDay)
          .filter(h => slotAllowed(limits, h) && subjectSlotAllowed(subjectSlots, subjectId, h));
        const positions = [];
        if (need === 2) {
          for (let k = 0; k + 1 < slots.length; k++) {
            if (slots[k + 1] === slots[k] + 1) positions.push([slots[k], slots[k + 1]]);
          }
          if (loosePairs) {
            const loose = [];
            for (let a = 0; a < slots.length; a++) {
              for (let b = a + 1; b < slots.length; b++) {
                if (slots[b] !== slots[a] + 1) loose.push([slots[a], slots[b]]);
              }
            }
            positions.push(...shuffle(loose).slice(0, 10));
          }
        } else {
          slots.forEach(h => positions.push([h]));
        }

        for (const pos of shuffle(positions)) {
          if (Date.now() > deadline) break;
          // Blockers = rows of THIS class at pos + rows of THIS teacher at pos
          // (in other classes). All must be non-locked and relocatable.
          const blockerSet = new Set();
          let hasLocked = false;
          for (const h of pos) {
            const ci = classAt.get(`${classId}-${day}-${h}`);
            if (ci !== undefined) {
              if (schedule[ci].locked) { hasLocked = true; break; }
              blockerSet.add(ci);
            }
            const tk = `${tid}-${day}-${h}`;
            if ((teacherCount.get(tk) || 0) > 0) {
              const ti = teacherAt.get(tk);
              if (ti === undefined || schedule[ti].locked || (teacherCount.get(tk) || 0) > 1) { hasLocked = true; break; }
              blockerSet.add(ti);
            }
          }
          if (hasLocked) continue;
          const blockers = [...blockerSet];

          const forbiddenClass = new Set(pos.map(h => `${classId}-${day}-${h}`));
          const forbiddenTeacher = new Set(pos.map(h => `${tid}-${day}-${h}`));
          const moves = [];
          let ok = true;
          for (const bIdx of blockers) {
            // A previous group-move may have already relocated this blocker
            const cur = schedule[bIdx];
            const stillBlocking = cur.hari === day && pos.includes(Number(cur.jamKe)) &&
              (String(cur.kelas) === String(classId) || String(cur.guruId) === tid);
            if (!stillBlocking) continue;
            if (!tryRelocate(bIdx, forbiddenClass, forbiddenTeacher, evictDepth, moves)) { ok = false; break; }
          }
          // Safety: position must now be completely free
          if (ok) {
            ok = pos.every(h =>
              !classAt.has(`${classId}-${day}-${h}`) &&
              (teacherCount.get(`${tid}-${day}-${h}`) || 0) === 0);
          }
          if (!ok) { undoMoves(moves); continue; }

          for (const h of pos) {
            schedule.push({ hari: day, jamKe: String(h), kelas: String(classId), mapelId: String(subjectId), guruId: tid });
            classAt.set(`${classId}-${day}-${h}`, schedule.length - 1);
            const tk = `${tid}-${day}-${h}`;
            teacherCount.set(tk, (teacherCount.get(tk) || 0) + 1);
          }
          loadWeek.set(tid, wl + need);
          loadDay.set(`${tid}-${day}`, dl + need);
          fixed = true;
          break;
        }
      }
    }
    if (!fixed) remaining.push(lesson);
  }

  return { schedule, remaining };
}

// Cycle-swap repair: gerakan TUKAR (bukan relokasi ke slot kosong).
// Kasus: lesson (kelas C, guru T) butuh slot t1 (C kosong di t1) tapi T sedang
// mengajar kelas D di t1. Solusi: tukar jam dua pelajaran DI DALAM kelas D —
// pelajaran T (di t1) bertukar dengan pelajaran guru lain T2 (di t2, dengan
// T bebas di t2 dan T2 bebas di t1). Okupansi kelas D tidak berubah, tapi
// T menjadi bebas di t1 → lesson bisa masuk. Tidak butuh slot kosong,
// sehingga menembus kebuntuan saat semua guru jenuh. Hanya slot tunggal
// (dipanggil pada fase akhir setelah pasangan dipecah).
function cycleSwapRepair(schedule, unassigned, teachers, days, slotsByTingkat, hoursByDayByTingkat, hoursByDay, teacherSubjects, teacherLimits, classNameMap, subjectSlots, deadline = Infinity) {
  if (unassigned.length === 0) return { schedule, remaining: [] };

  const classAt = new Map();
  const teacherCount = new Map();
  const teacherAt = new Map();
  const loadWeek = new Map();
  const loadDay = new Map();
  const classRows = new Map(); // kelas -> [indices]
  schedule.forEach((r, i) => {
    classAt.set(`${r.kelas}-${r.hari}-${r.jamKe}`, i);
    const tk = `${r.guruId}-${r.hari}-${r.jamKe}`;
    teacherCount.set(tk, (teacherCount.get(tk) || 0) + 1);
    teacherAt.set(tk, i);
    loadWeek.set(String(r.guruId), (loadWeek.get(String(r.guruId)) || 0) + 1);
    loadDay.set(`${r.guruId}-${r.hari}`, (loadDay.get(`${r.guruId}-${r.hari}`) || 0) + 1);
    if (!classRows.has(String(r.kelas))) classRows.set(String(r.kelas), []);
    classRows.get(String(r.kelas)).push(i);
  });

  const tingkatOfClass = (kelasId) => extractTingkat(classNameMap.get(Number(kelasId)) || '');

  const setRowTime = (idx, d2, h2) => {
    const r = schedule[idx];
    classAt.delete(`${r.kelas}-${r.hari}-${r.jamKe}`);
    const oldTK = `${r.guruId}-${r.hari}-${r.jamKe}`;
    const c = teacherCount.get(oldTK) || 1;
    if (c <= 1) { teacherCount.delete(oldTK); teacherAt.delete(oldTK); }
    else teacherCount.set(oldTK, c - 1);
    loadDay.set(`${r.guruId}-${r.hari}`, Math.max(0, (loadDay.get(`${r.guruId}-${r.hari}`) || 1) - 1));
    schedule[idx] = { ...r, hari: d2, jamKe: String(h2) };
    classAt.set(`${r.kelas}-${d2}-${h2}`, idx);
    const nTK = `${r.guruId}-${d2}-${h2}`;
    teacherCount.set(nTK, (teacherCount.get(nTK) || 0) + 1);
    teacherAt.set(nTK, idx);
    loadDay.set(`${r.guruId}-${d2}`, (loadDay.get(`${r.guruId}-${d2}`) || 0) + 1);
  };

  // Boleh-tidaknya sebuah row dipindah ke (day, hour): guru & mapel row itu
  const rowFitsAt = (row, day, hour, ignoreTeacherBusy) => {
    const lim = teacherLimits.get(Number(row.guruId)) || {};
    if (lim.availableDays && !lim.availableDays.has(day)) return false;
    if (!slotAllowed(lim, hour)) return false;
    if (!subjectDayAllowed(subjectSlots, row.mapelId, day)) return false;
    if (!subjectSlotAllowed(subjectSlots, row.mapelId, hour)) return false;
    if (!ignoreTeacherBusy && (teacherCount.get(`${row.guruId}-${day}-${hour}`) || 0) > 0) return false;
    if (day !== row.hari && lim.maxDay != null && (loadDay.get(`${row.guruId}-${day}`) || 0) >= lim.maxDay) return false;
    return true;
  };

  const remaining = [];
  for (const lesson of unassigned) {
    if (Date.now() > deadline) { remaining.push(lesson); continue; }
    if (lesson.slotCount === 2) { remaining.push(lesson); continue; }
    const { classId, classTingkat, classKelasType, subjectId } = lesson;
    const candidates = shuffle(teachers.filter(t => {
      if (!canTeachSubject(teacherSubjects, t.id, subjectId, classTingkat, classId)) return false;
      const pref = (teacherLimits.get(t.id) || {}).classGenderPref || 'both';
      return canTeachKelas(pref, classKelasType);
    }));
    let fixed = false;

    for (const teacher of candidates) {
      if (fixed) break;
      const tid = String(teacher.id);
      const limits = teacherLimits.get(teacher.id) || {};
      if (limits.maxWeek != null && (loadWeek.get(tid) || 0) + 1 > limits.maxWeek) continue;

      for (const day of shuffle([...days])) {
        if (fixed) break;
        if (!subjectDayAllowed(subjectSlots, subjectId, day)) continue;
        if (limits.availableDays && !limits.availableDays.has(day)) continue;
        if (limits.maxDay != null && (loadDay.get(`${tid}-${day}`) || 0) + 1 > limits.maxDay) continue;

        const slots = getActiveSlots(day, classTingkat, slotsByTingkat, hoursByDayByTingkat, hoursByDay)
          .filter(h => slotAllowed(limits, h) && subjectSlotAllowed(subjectSlots, subjectId, h));
        for (const t1 of shuffle([...slots])) {
          if (fixed) break;
          if (classAt.has(`${classId}-${day}-${t1}`)) continue; // slot kelas harus kosong
          const tk1 = `${tid}-${day}-${t1}`;
          const busyCount = teacherCount.get(tk1) || 0;

          if (busyCount === 0) {
            // langsung isi (jarang sampai sini, ejection biasanya sudah)
            schedule.push({ hari: day, jamKe: String(t1), kelas: String(classId), mapelId: String(subjectId), guruId: tid });
            const ni = schedule.length - 1;
            classAt.set(`${classId}-${day}-${t1}`, ni);
            teacherCount.set(tk1, 1); teacherAt.set(tk1, ni);
            loadWeek.set(tid, (loadWeek.get(tid) || 0) + 1);
            loadDay.set(`${tid}-${day}`, (loadDay.get(`${tid}-${day}`) || 0) + 1);
            if (!classRows.has(String(classId))) classRows.set(String(classId), []);
            classRows.get(String(classId)).push(ni);
            fixed = true;
            break;
          }
          if (busyCount > 1) continue; // multi-kelas locked
          const rIdx = teacherAt.get(tk1);
          if (rIdx === undefined || schedule[rIdx].locked) continue;
          const R = schedule[rIdx]; // pelajaran T di kelas D pada t1

          // Gerakan 1 — SUBSTITUSI GURU: alihkan pelajaran R ke guru lain
          // yang juga mengampu mapel itu di kelas D dan bebas di t1.
          // T langsung bebas tanpa memindah slot apa pun.
          const dTingkat = tingkatOfClass(R.kelas);
          const subs = shuffle(teachers.filter(t3 => {
            if (String(t3.id) === tid || String(t3.id) === String(R.guruId)) return false;
            return canTeachSubject(teacherSubjects, t3.id, R.mapelId, dTingkat, R.kelas);
          }));
          // Blok mapel yang sama satu hari (pasangan) disubstitusi UTUH
          const subGroup = [rIdx];
          for (const gi of (classRows.get(String(R.kelas)) || [])) {
            if (gi === rIdx) continue;
            const g = schedule[gi];
            if (String(g.mapelId) === String(R.mapelId) && g.hari === day && String(g.guruId) === String(R.guruId) && !g.locked) {
              subGroup.push(gi);
            }
          }
          for (const t3 of subs) {
            const l3 = teacherLimits.get(t3.id) || {};
            const t3id = String(t3.id);
            const fits = subGroup.every(gi => {
              const h = Number(schedule[gi].jamKe);
              if ((teacherCount.get(`${t3id}-${day}-${h}`) || 0) > 0) return false;
              if (!slotAllowed(l3, h)) return false;
              return true;
            });
            if (!fits) continue;
            if (l3.availableDays && !l3.availableDays.has(day)) continue;
            if (l3.maxWeek != null && (loadWeek.get(t3id) || 0) + subGroup.length > l3.maxWeek) continue;
            if (l3.maxDay != null && (loadDay.get(`${t3id}-${day}`) || 0) + subGroup.length > l3.maxDay) continue;
            // ganti guru seluruh blok: T → t3
            for (const gi of subGroup) {
              const g = schedule[gi];
              const oldK = `${g.guruId}-${day}-${g.jamKe}`;
              teacherCount.delete(oldK); teacherAt.delete(oldK);
              loadWeek.set(String(g.guruId), Math.max(0, (loadWeek.get(String(g.guruId)) || 1) - 1));
              loadDay.set(`${g.guruId}-${day}`, Math.max(0, (loadDay.get(`${g.guruId}-${day}`) || 1) - 1));
              schedule[gi] = { ...g, guruId: t3id };
              const k3 = `${t3id}-${day}-${g.jamKe}`;
              teacherCount.set(k3, 1); teacherAt.set(k3, gi);
              loadWeek.set(t3id, (loadWeek.get(t3id) || 0) + 1);
              loadDay.set(`${t3id}-${day}`, (loadDay.get(`${t3id}-${day}`) || 0) + 1);
            }
            // tempatkan lesson dengan T di t1
            schedule.push({ hari: day, jamKe: String(t1), kelas: String(classId), mapelId: String(subjectId), guruId: tid });
            const ni2 = schedule.length - 1;
            classAt.set(`${classId}-${day}-${t1}`, ni2);
            teacherCount.set(tk1, 1); teacherAt.set(tk1, ni2);
            loadWeek.set(tid, (loadWeek.get(tid) || 0) + 1);
            loadDay.set(`${tid}-${day}`, (loadDay.get(`${tid}-${day}`) || 0) + 1);
            if (!classRows.has(String(classId))) classRows.set(String(classId), []);
            classRows.get(String(classId)).push(ni2);
            fixed = true;
            break;
          }
          if (fixed) break;

          // Gerakan 2 — TUKAR SIKLIK: cari partner tukar di kelas D: R2 (guru
          // lain) yang jamnya bisa ditempati R, dan R2 bisa menempati t1
          for (const r2Idx of shuffle([...(classRows.get(String(R.kelas)) || [])])) {
            if (r2Idx === rIdx) continue;
            const R2 = schedule[r2Idx];
            if (R2.locked) continue;
            if (String(R2.guruId) === tid) continue; // harus guru berbeda agar t1 benar-benar bebas
            const d2 = R2.hari, h2 = Number(R2.jamKe);
            // R pindah ke (d2,h2): guru T bebas di sana + semua batasan
            if (!rowFitsAt(R, d2, h2, false)) continue;
            // R2 pindah ke (day,t1): guru R2 bebas di t1 + batasan (abaikan
            // okupansi T di t1 karena T akan pindah)
            const lim2 = teacherLimits.get(Number(R2.guruId)) || {};
            if (lim2.availableDays && !lim2.availableDays.has(day)) continue;
            if (!slotAllowed(lim2, t1)) continue;
            if (!subjectDayAllowed(subjectSlots, R2.mapelId, day)) continue;
            if (!subjectSlotAllowed(subjectSlots, R2.mapelId, t1)) continue;
            if ((teacherCount.get(`${R2.guruId}-${day}-${t1}`) || 0) > 0) continue;
            if (day !== d2 && lim2.maxDay != null && (loadDay.get(`${R2.guruId}-${day}`) || 0) >= lim2.maxDay) continue;

            // Lakukan tukar: keluarkan R dulu (bebaskan t1), pindah R2 ke t1, R ke t2
            setRowTime(rIdx, d2, h2 + 10000); // parkir sementara di key unik palsu
            setRowTime(r2Idx, day, t1);
            setRowTime(rIdx, d2, h2);
            // Tempatkan lesson di t1
            schedule.push({ hari: day, jamKe: String(t1), kelas: String(classId), mapelId: String(subjectId), guruId: tid });
            const ni = schedule.length - 1;
            classAt.set(`${classId}-${day}-${t1}`, ni);
            const ntk = `${tid}-${day}-${t1}`;
            teacherCount.set(ntk, (teacherCount.get(ntk) || 0) + 1);
            teacherAt.set(ntk, ni);
            loadWeek.set(tid, (loadWeek.get(tid) || 0) + 1);
            loadDay.set(`${tid}-${day}`, (loadDay.get(`${tid}-${day}`) || 0) + 1);
            if (!classRows.has(String(classId))) classRows.set(String(classId), []);
            classRows.get(String(classId)).push(ni);
            fixed = true;
            break;
          }
        }
      }
    }
    if (!fixed) remaining.push(lesson);
  }
  return { schedule, remaining };
}

// Post-process: for each (class, subject) group of 2 slots, ensure they're on the same day
// and consecutive. Works cross-day: moves slots between days if needed.
function consolidatePairs(schedule, classNameMap, slotsByTingkat, hoursByDayByTingkat, hoursByDay, teacherLimits = new Map(), subjectSlots = new Map()) {
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
        if (!slotAllowed(teacherLimits.get(Number(movable.guruId)), targetJam)) return false;
        if (!subjectSlotAllowed(subjectSlots, schedule[movable.idx].mapelId, targetJam)) return false;
        if (!subjectDayAllowed(subjectSlots, schedule[movable.idx].mapelId, targetHari)) return false;
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
  const subjectLimitsRaw = await getSubjectLimits();

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
  // Batasan per mapel: jam tersedia (slots) dan hari tersedia (days).
  // Kosong/null = tanpa pembatasan.
  const subjectSlots = new Map(subjectLimitsRaw
    .filter(r => (Array.isArray(r.available_slots) && r.available_slots.length > 0) ||
                 (Array.isArray(r.available_days) && r.available_days.length > 0))
    .map(r => [String(r.subject_id), {
      slots: Array.isArray(r.available_slots) && r.available_slots.length > 0
        ? new Set(r.available_slots.map(Number)) : null,
      days: Array.isArray(r.available_days) && r.available_days.length > 0
        ? new Set(r.available_days) : null
    }]));
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

  // Budget waktu total. Pipeline penuh (restart + repair dalam) DIULANG dari
  // awal selama budget tersisa dan belum 100% terisi — tiap ulangan memulai
  // dari susunan greedy acak berbeda, sehingga peluang menemukan susunan
  // yang 100% terisi bertambah di tiap putaran. Berhenti seketika saat 0.
  const TOTAL_BUDGET_MS = Number(process.env.SCHEDULER_BUDGET_MS || 40000);
  const start = Date.now();
  const totalDeadline = start + TOTAL_BUDGET_MS;
  let globalSchedule = [];
  let globalUnassigned = [...allLessons];

  // Lesson difficulty: fewest valid teachers first, then most-restricted
  // teacher availability (guru dengan hari tersedia sedikit dijadwalkan
  // duluan sebelum slot di hari-harinya habis dipakai pelajaran lain)
  const lessonKeys = new Map(allLessons.map(l => {
    const cands = teachers.filter(t => {
      if (!canTeachSubject(teacherSubjects, t.id, l.subjectId, l.classTingkat, l.classId)) return false;
      const pref = (teacherLimits.get(t.id) || {}).classGenderPref || 'both';
      return canTeachKelas(pref, l.classKelasType);
    });
    const minDays = cands.length
      ? Math.min(...cands.map(t => (teacherLimits.get(t.id) || {}).availableDays?.size ?? days.length))
      : 0;
    return [l, cands.length * 100 + minDays];
  }));

  // Skor kualitas: prioritas utama jumlah jam gagal, lalu blok mapel yang
  // terpecah 1-jam (untuk kebutuhan genap), lalu pasangan sehari yang tidak
  // berurutan. Dipakai memilih hasil terbaik antar-restart — karena banyak
  // restart mencapai 0 gagal, pemenangnya adalah susunan yang paling rapi.
  const hoursNeeded = new Map(classSubjectsRaw.map(cs => [`${cs.class_id}|${cs.subject_id}`, cs.hours_per_week || 2]));
  const qualityScore = (sched, unassignedLen) => {
    const byGroup = new Map();
    for (const r of sched) {
      const k = `${r.kelas}|${r.mapelId}|${r.hari}`;
      if (!byGroup.has(k)) byGroup.set(k, []);
      byGroup.get(k).push(Number(r.jamKe));
    }
    let lonely = 0, noncons = 0;
    for (const [k, jams] of byGroup) {
      const csKey = k.slice(0, k.lastIndexOf('|'));
      const need = hoursNeeded.get(csKey) || 2;
      if (need % 2 === 0 && jams.length % 2 === 1) lonely++;
      jams.sort((a, b) => a - b);
      for (let j = 0; j + 1 < jams.length; j += 2) {
        if (jams[j + 1] !== jams[j] + 1) noncons++;
      }
    }
    return unassignedLen * 100000 + lonely * 100 + noncons;
  };

  let globalScore = Infinity;
  let outerRound = 0;
  // Selama belum 0 gagal: terus berputar sampai budget penuh. Setelah 0
  // tercapai: lanjutkan sebentar (jendela poles) untuk mencari susunan
  // dengan blok paling rapi, lalu berhenti.
  const polishDeadline = start + Math.min(15000, TOTAL_BUDGET_MS);
  while (Date.now() < totalDeadline &&
         (globalUnassigned.length > 0 || (Date.now() < polishDeadline && globalScore > 0))) {
  outerRound++;
  let bestSchedule = [];
  let bestUnassigned = [...allLessons];
  let bestScore = Infinity;
  const restartDeadline = Math.min(Date.now() + 4000, totalDeadline);

  for (let run = 0; run < 12; run++) {
    if (Date.now() > restartDeadline) break;

    const sorted = shuffle([...allLessons]).sort((a, b) => lessonKeys.get(a) - lessonKeys.get(b));

    // Full pipeline per restart: greedy → swap repair → ejection rounds →
    // loose-pair ejection. Keep the best complete result across restarts.
    let { schedule, unassigned } = greedyPass(
      sorted, teachers, days,
      slotsByTingkat, hoursByDayByTingkat, hoursByDay,
      teacherSubjects, teacherLimits,
      lockedSchedule, initTeacherBusy, initClassBusy, subjectSlots
    );

    if (unassigned.length > 0) {
      const repaired = swapRepair(
        schedule, unassigned, teachers, days,
        slotsByTingkat, hoursByDayByTingkat, hoursByDay,
        teacherSubjects, teacherLimits, subjectSlots
      );
      const nonLockedRepaired = repaired.schedule.filter(r => !r.locked);
      schedule = [...lockedSchedule, ...nonLockedRepaired];
      unassigned = repaired.remaining;
    }

    const deadline = restartDeadline;
    // Ejection: relocate blocking rows (whole 2-hour blocks) to open slots
    for (let round = 0; round < 4 && unassigned.length > 0; round++) {
      const before = unassigned.length;
      const ej = ejectionRepair(
        schedule, unassigned, teachers, days,
        slotsByTingkat, hoursByDayByTingkat, hoursByDay,
        teacherSubjects, teacherLimits, classNameMap, false, 0, deadline, false, subjectSlots
      );
      schedule = ej.schedule;
      unassigned = ej.remaining;
      if (unassigned.length >= before) break;
    }
    // Pairs may take any 2 same-day slots (still never split across days);
    // consolidatePairs merges them afterwards when possible.
    if (unassigned.length > 0) {
      const ej2 = ejectionRepair(
        schedule, unassigned, teachers, days,
        slotsByTingkat, hoursByDayByTingkat, hoursByDay,
        teacherSubjects, teacherLimits, classNameMap, true, 0, deadline, false, subjectSlots
      );
      schedule = ej2.schedule;
      unassigned = ej2.remaining;
    }
    // Blok utuh dengan ejection depth-1 dulu (tanpa memecah apa pun)
    if (unassigned.length > 0) {
      const ej25 = ejectionRepair(
        schedule, unassigned, teachers, days,
        slotsByTingkat, hoursByDayByTingkat, hoursByDay,
        teacherSubjects, teacherLimits, classNameMap, true, 1, deadline, false, subjectSlots
      );
      schedule = ej25.schedule;
      unassigned = ej25.remaining;
    }
    // Last resort in-run: sisa pasangan yang benar-benar buntu dipecah jadi
    // slot 1-jam dan diisikan via ejection depth-1 (blok lain tetap utuh).
    if (unassigned.length > 0) {
      const singles = [];
      for (const l of unassigned) {
        if (l.slotCount === 2) singles.push({ ...l, slotCount: 1 }, { ...l, slotCount: 1 });
        else singles.push(l);
      }
      const ej3 = ejectionRepair(
        schedule, singles, teachers, days,
        slotsByTingkat, hoursByDayByTingkat, hoursByDay,
        teacherSubjects, teacherLimits, classNameMap, true, 1, deadline, false, subjectSlots
      );
      schedule = ej3.schedule;
      unassigned = ej3.remaining;
    }

    const runScore = qualityScore(schedule, unassigned.length);
    if (runScore < bestScore) {
      bestScore = runScore;
      bestSchedule = schedule;
      bestUnassigned = unassigned;
    }
    if (bestUnassigned.length === 0 && bestScore < 100) break; // 0 gagal & sangat rapi
  }

  // Deep ejection chains (depth 1 lalu 2) pada HASIL TERBAIK saja: geser A
  // yang menggeser B untuk membuka slot ketika semua kelas sudah padat.
  // Dijalankan sekali dengan budget waktu tambahan, coba blok utuh dulu,
  // baru pecahan 1-jam sebagai pilihan paling akhir.
  // Dua fase pendalaman. Fase A: depth-2 diulang acak (murah, banyak
  // percobaan — tiap shuffle membuka jalur rantai berbeda). Fase B: sisa
  // waktu untuk depth-3 (mahal tapi menjangkau rantai panjang saat semua
  // guru jenuh dan lubang tersisa sedikit).
  const runDeepPhase = (phaseDeadline, depth) => {
    const dbgStart = bestUnassigned.length;
    let dbgIter = 0;
    while (bestUnassigned.length > 0 && Date.now() < phaseDeadline) {
      dbgIter++;
      const rPair = ejectionRepair(
        bestSchedule, bestUnassigned, teachers, days,
        slotsByTingkat, hoursByDayByTingkat, hoursByDay,
        teacherSubjects, teacherLimits, classNameMap, true, depth, phaseDeadline, false, subjectSlots
      );
      bestSchedule = rPair.schedule;
      bestUnassigned = rPair.remaining;
      if (bestUnassigned.length === 0 || Date.now() > phaseDeadline) break;
      const singles = [];
      for (const l of bestUnassigned) {
        if (l.slotCount === 2) singles.push({ ...l, slotCount: 1 }, { ...l, slotCount: 1 });
        else singles.push(l);
      }
      const rSingle = ejectionRepair(
        bestSchedule, singles, teachers, days,
        slotsByTingkat, hoursByDayByTingkat, hoursByDay,
        teacherSubjects, teacherLimits, classNameMap, true, depth, phaseDeadline, true, subjectSlots
      );
      bestSchedule = rSingle.schedule;
      bestUnassigned = rSingle.remaining;
      // Gerakan tukar siklik — menembus kebuntuan tanpa butuh slot kosong
      if (bestUnassigned.length > 0 && Date.now() < phaseDeadline) {
        const singles2 = [];
        for (const l of bestUnassigned) {
          if (l.slotCount === 2) singles2.push({ ...l, slotCount: 1 }, { ...l, slotCount: 1 });
          else singles2.push(l);
        }
        const rc = cycleSwapRepair(
          bestSchedule, singles2, teachers, days,
          slotsByTingkat, hoursByDayByTingkat, hoursByDay,
          teacherSubjects, teacherLimits, classNameMap, subjectSlots, phaseDeadline
        );
        bestSchedule = rc.schedule;
        bestUnassigned = rc.remaining;
      }
    }
    if (process.env.SCHED_DEBUG) {
      console.log(`[putaran ${outerRound} deep d${depth}] iter=${dbgIter} sisa ${dbgStart} -> ${bestUnassigned.length}`);
    }
  };
  // Eskalasi murah-dulu: depth-1 menyapu semua kemenangan mudah dengan cepat
  // (banyak percobaan urutan acak), baru sisa yang bandel diserang depth-2/3.
  runDeepPhase(Math.min(Date.now() + 3000, totalDeadline), 1);
  if (bestUnassigned.length > 0) runDeepPhase(Math.min(Date.now() + 3000, totalDeadline), 2);
  if (bestUnassigned.length > 0) runDeepPhase(Math.min(Date.now() + 2000, totalDeadline), 3);

  const roundScore = qualityScore(bestSchedule, bestUnassigned.length);
  if (roundScore < globalScore) {
    globalScore = roundScore;
    globalSchedule = bestSchedule;
    globalUnassigned = bestUnassigned;
  }
  if (process.env.SCHED_DEBUG) {
    console.log(`[putaran ${outerRound}] gagal=${bestUnassigned.length} skor=${roundScore} | global gagal=${globalUnassigned.length} skor=${globalScore}`);
  }
  } // end outer while
  let bestSchedule = globalSchedule;
  let bestUnassigned = globalUnassigned;

  // Post-process: consolidate same-subject slots per class to same day + consecutive.
  // Run twice: first pass moves cross-day slots together; second pass cleans up any remaining gaps.
  bestSchedule = consolidatePairs(bestSchedule, classNameMap, slotsByTingkat, hoursByDayByTingkat, hoursByDay, teacherLimits, subjectSlots);
  bestSchedule = consolidatePairs(bestSchedule, classNameMap, slotsByTingkat, hoursByDayByTingkat, hoursByDay, teacherLimits, subjectSlots);

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
      const dayMax = dayCapMax.get(day) || 0;
      let d = dayMax;
      if (limits?.availableSlots) {
        d = Math.min(d, [...limits.availableSlots].filter(h => h >= 1 && h <= dayMax).length);
      } else if (limits?.maxSlot != null) {
        d = Math.min(d, limits.maxSlot);
      }
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

  // Per-teacher overload: total hours from class+subject combos where this
  // teacher is the ONLY eligible candidate, vs their weekly capacity.
  // (Catches e.g. guru tersedia 2 hari = 16 slot tapi beban wajib 17 jam.)
  // Demand dihitung dari allLessons (sudah dikurangi slot terkunci), dan
  // kapasitas dikurangi waktu yang sudah terpakai kunci manual — kunci
  // multi-kelas (1 waktu guru untuk 2+ kelas) tidak lagi memicu alarm palsu.
  const exclusiveDemand = new Map();
  for (const l of allLessons) {
    const cands = teachers.filter(t => {
      if (!canTeachSubject(teacherSubjects, t.id, l.subjectId, l.classTingkat, l.classId)) return false;
      const pref = (teacherLimits.get(t.id) || {}).classGenderPref || 'both';
      return canTeachKelas(pref, l.classKelasType);
    });
    if (cands.length === 1) {
      const id = cands[0].id;
      exclusiveDemand.set(id, (exclusiveDemand.get(id) || 0) + (l.slotCount === 2 ? 2 : 1));
    }
  }
  const lockedTimesByTeacher = new Map();
  for (const r of lockedRows) {
    if (!lockedTimesByTeacher.has(r.teacher_id)) lockedTimesByTeacher.set(r.teacher_id, new Set());
    lockedTimesByTeacher.get(r.teacher_id).add(`${r.hari}|${r.jam_ke}`);
  }
  capacityWarnings.teachers = [];
  for (const [tid, req] of exclusiveDemand) {
    const capT = teacherWeekCap(teacherLimits.get(tid)) - (lockedTimesByTeacher.get(tid)?.size || 0);
    if (req > capT) {
      const t = teachers.find(x => x.id === tid);
      const lim = teacherLimits.get(tid) || {};
      capacityWarnings.teachers.push({
        teacherId: tid,
        teacherName: t?.name || String(tid),
        required: req,
        capacity: capT,
        availableDays: lim.availableDays ? [...lim.availableDays] : null
      });
    }
  }
  capacityWarnings.teachers.sort((a, b) => (b.required - b.capacity) - (a.required - a.capacity));

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
      const allFreeSlots = [];
      for (const day of days) {
        for (const h of getActiveSlots(day, g.classTingkat, slotsByTingkat, hoursByDayByTingkat, hoursByDay)) {
          if (!classBusyFinal.has(`${g.classId}-${day}-${h}`)) allFreeSlots.push({ day, hour: h });
        }
      }
      const freeSlots = allFreeSlots.filter(s =>
        subjectSlotAllowed(subjectSlots, g.subjectId, s.hour) &&
        subjectDayAllowed(subjectSlots, g.subjectId, s.day));
      if (allFreeSlots.length === 0) {
        reason = `Semua ${capacity} slot aktif kelas ${kelasName} sudah terisi, sedangkan total kebutuhan kurikulum kelas ini ${required} jam/minggu. Tambah hari aktif / jam per hari di Step 1, atau kurangi jam mapel di Step 2.`;
      } else if (freeSlots.length === 0) {
        const sLim = subjectSlots.get(String(g.subjectId));
        const parts = [];
        if (sLim?.slots) parts.push(`jam ke-${[...sLim.slots].sort((a, b) => a - b).join(', ')}`);
        if (sLim?.days) parts.push(`hari ${[...sLim.days].join(', ')}`);
        reason = `Mapel ${mapelName} dibatasi hanya boleh di ${parts.join(' dan ')} (Step 4), dan semua slot tersebut di kelas ${kelasName} sudah terisi mapel lain.`;
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
          const slotOk = availFree.filter(s => slotAllowed(limits, s.hour));
          if (slotOk.length === 0) {
            const jamGuru = limits.availableSlots
              ? [...limits.availableSlots].sort((a, b) => a - b).join(', ')
              : `1-${limits.maxSlot}`;
            return `${t.name} — jam tersedia guru (jam ke-${jamGuru}) tidak beririsan dengan slot kosong kelas ${kelasName}`;
          }
          const open = slotOk.filter(s =>
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
