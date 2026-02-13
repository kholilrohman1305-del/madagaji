const pool = require('../db');
const {
  getTeachers,
  getSubjects,
  getClasses,
  getTeacherSubjects,
  getClassSubjects,
  getTeacherLimits
} = require('./scheduler/configService');

const DAY_NAMES = ['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Ahad'];

// Build map of allowed subjects per class (from positive mapping)
function buildAllowedSubjectsByClass(classSubjects) {
  const map = new Map();
  classSubjects.forEach(cs => {
    if (!map.has(cs.class_id)) map.set(cs.class_id, new Set());
    map.get(cs.class_id).add(cs.subject_id);
  });
  return map;
}

// Build map of hours per week for each class-subject
function buildHoursPerWeekMap(classSubjects) {
  const map = new Map();
  classSubjects.forEach(cs => {
    map.set(`${cs.class_id}-${cs.subject_id}`, cs.hours_per_week || 2);
  });
  return map;
}

// Build teacher-subjects map with priority
function buildTeacherSubjectsMap(rows) {
  const map = new Map();
  rows.forEach(r => {
    if (!map.has(r.teacher_id)) map.set(r.teacher_id, []);
    map.get(r.teacher_id).push({ subjectId: r.subject_id, priority: r.priority || 1 });
  });
  // Sort by priority (lower = higher priority)
  map.forEach((subjects, teacherId) => {
    subjects.sort((a, b) => a.priority - b.priority);
  });
  return map;
}

// Check if subject is teacher's linear (priority 1) subject
function isLinearSubject(teacherSubjectsMap, teacherId, subjectId) {
  const subjects = teacherSubjectsMap.get(teacherId) || [];
  const found = subjects.find(s => s.subjectId === subjectId);
  return found && found.priority === 1;
}

function buildTeacherLimitsMap(rows) {
  const map = new Map();
  rows.forEach(r => {
    map.set(r.teacher_id, {
      maxWeek: r.max_hours_per_week ?? null,
      maxDay: r.max_hours_per_day ?? null,
      minLinier: r.min_hours_linier ?? null
    });
  });
  return map;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function generateSchedule({ days, hoursByDay }) {
  const teachers = await getTeachers();
  const subjects = await getSubjects();
  const classes = await getClasses();
  const teacherSubjectsRaw = await getTeacherSubjects();
  const classSubjectsRaw = await getClassSubjects();
  const teacherLimitsRaw = await getTeacherLimits();

  const teacherSubjects = buildTeacherSubjectsMap(teacherSubjectsRaw);
  const allowedSubjectsByClass = buildAllowedSubjectsByClass(classSubjectsRaw);
  const hoursPerWeekMap = buildHoursPerWeekMap(classSubjectsRaw);
  const teacherLimits = buildTeacherLimitsMap(teacherLimitsRaw);

  const classIds = classes.map(c => c.id);

  const teacherLoadWeek = new Map();
  const teacherLoadDay = new Map();
  const teacherLinearLoad = new Map(); // Track linear subject hours
  const teacherBusy = new Set();
  const classBusy = new Set();
  const classSubjectUsed = new Map(); // Track how many hours each subject used per class

  teachers.forEach(t => {
    teacherLoadWeek.set(t.id, 0);
    teacherLinearLoad.set(t.id, 0);
  });

  const schedule = [];
  const failed = [];
  const failedByClass = new Map();

  for (const day of days) {
    const hours = hoursByDay[day] || 0;
    for (let hour = 1; hour <= hours; hour++) {
      classIds.forEach(cid => {
        const slotKeyClass = `${cid}-${day}-${hour}`;
        if (classBusy.has(slotKeyClass)) return;

        const allowedSubjects = Array.from(allowedSubjectsByClass.get(cid) || []);
        if (allowedSubjects.length === 0) {
          failed.push({ hari: day, jamKe: String(hour), kelas: String(cid), reason: 'Tidak ada mapel yang di-mapping ke kelas ini' });
          failedByClass.set(String(cid), (failedByClass.get(String(cid)) || 0) + 1);
          return;
        }

        // Prioritize subjects that haven't reached their weekly quota yet
        const subjectsWithQuota = allowedSubjects.map(subjectId => {
          const key = `${cid}-${subjectId}`;
          const targetHours = hoursPerWeekMap.get(key) || 2;
          const usedHours = classSubjectUsed.get(key) || 0;
          return { subjectId, remaining: targetHours - usedHours };
        }).filter(s => s.remaining > 0);

        shuffle(subjectsWithQuota);
        // Sort by remaining hours (more remaining = higher priority)
        subjectsWithQuota.sort((a, b) => b.remaining - a.remaining);

        let assigned = false;
        for (const { subjectId } of subjectsWithQuota) {
          // Find teachers who can teach this subject
          const candidateTeachers = teachers.filter(t => {
            const teacherSubs = teacherSubjects.get(t.id) || [];
            return teacherSubs.some(s => s.subjectId === subjectId);
          });
          shuffle(candidateTeachers);

          // Prioritize teachers who teach this as their linear subject
          candidateTeachers.sort((a, b) => {
            const aIsLinear = isLinearSubject(teacherSubjects, a.id, subjectId) ? 0 : 1;
            const bIsLinear = isLinearSubject(teacherSubjects, b.id, subjectId) ? 0 : 1;
            return aIsLinear - bIsLinear;
          });

          for (const teacher of candidateTeachers) {
            const tBusyKey = `${teacher.id}-${day}-${hour}`;
            if (teacherBusy.has(tBusyKey)) continue;

            const limits = teacherLimits.get(teacher.id) || {};
            const weekLoad = teacherLoadWeek.get(teacher.id) || 0;
            const dayKey = `${teacher.id}-${day}`;
            const dayLoad = teacherLoadDay.get(dayKey) || 0;

            if (limits.maxWeek != null && weekLoad >= limits.maxWeek) continue;
            if (limits.maxDay != null && dayLoad >= limits.maxDay) continue;

            schedule.push({
              hari: day,
              jamKe: String(hour),
              kelas: String(cid),
              mapelId: String(subjectId),
              guruId: String(teacher.id)
            });

            teacherBusy.add(tBusyKey);
            classBusy.add(slotKeyClass);
            teacherLoadWeek.set(teacher.id, weekLoad + 1);
            teacherLoadDay.set(dayKey, dayLoad + 1);

            // Track linear hours
            if (isLinearSubject(teacherSubjects, teacher.id, subjectId)) {
              teacherLinearLoad.set(teacher.id, (teacherLinearLoad.get(teacher.id) || 0) + 1);
            }

            // Track class-subject usage
            const csKey = `${cid}-${subjectId}`;
            classSubjectUsed.set(csKey, (classSubjectUsed.get(csKey) || 0) + 1);

            assigned = true;
            break;
          }
          if (assigned) break;
        }

        if (!assigned) {
          failed.push({ hari: day, jamKe: String(hour), kelas: String(cid) });
          failedByClass.set(String(cid), (failedByClass.get(String(cid)) || 0) + 1);
        }
      });
    }
  }

  // Check minimum linear hours warnings
  const linearWarnings = [];
  teacherLimits.forEach((limits, teacherId) => {
    if (limits.minLinier != null) {
      const actual = teacherLinearLoad.get(teacherId) || 0;
      if (actual < limits.minLinier) {
        const teacher = teachers.find(t => t.id === teacherId);
        linearWarnings.push({
          teacherId,
          teacherName: teacher?.name || teacherId,
          required: limits.minLinier,
          actual
        });
      }
    }
  });

  return {
    schedule,
    failed,
    failedByClass: Object.fromEntries(failedByClass),
    linearWarnings
  };
}

async function applyGeneratedSchedule(rows) {
  if (!rows || rows.length === 0) return { success: false, message: 'Tidak ada jadwal di-generate.' };

  const [last] = await pool.query('SELECT id FROM jadwal ORDER BY id DESC LIMIT 1');
  let lastIdNumber = parseInt(String(last[0]?.id || 'J000').substring(1)) || 0;

  const values = rows.map(r => {
    lastIdNumber += 1;
    const newId = `J${String(lastIdNumber).padStart(3, '0')}`;
    return [newId, r.hari, r.jamKe, r.kelas, r.mapelId, r.guruId];
  });

  await pool.query('INSERT INTO jadwal (id, hari, jam_ke, kelas, mapel_id, guru_id) VALUES ?', [values]);
  return { success: true, message: `Jadwal berhasil di-generate: ${rows.length} slot.` };
}

async function resetSchedule() {
  await pool.query('DELETE FROM jadwal');
  return { success: true, message: 'Jadwal berhasil direset.' };
}

module.exports = { generateSchedule, applyGeneratedSchedule, resetSchedule };
