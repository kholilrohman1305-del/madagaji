const pool = require('../db/pool');

function toInt(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isNaN(num) ? null : num;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function average(items) {
  if (!items.length) return 0;
  return items.reduce((sum, val) => sum + Number(val || 0), 0) / items.length;
}

function normalizeWeights(academicWeight, achievementWeight) {
  const a = Number(academicWeight || 0);
  const b = Number(achievementWeight || 0);
  const sum = a + b;
  if (sum <= 0) return { academic: 0.8, achievement: 0.2 };
  return { academic: a / sum, achievement: b / sum };
}

function scoreLevel(levelName) {
  const level = String(levelName || '').toLowerCase();
  if (level.includes('internasional')) return 30;
  if (level.includes('nasional')) return 24;
  if (level.includes('provinsi')) return 18;
  if (level.includes('kabupaten') || level.includes('kota')) return 12;
  if (level.includes('kecamatan')) return 8;
  if (level.includes('sekolah') || level.includes('madrasah')) return 5;
  return 3;
}

function scoreRank(rankValue) {
  const rank = String(rankValue || '').toLowerCase();
  if (rank.includes('juara 1') || rank.includes('rank 1') || rank.includes('emas')) return 12;
  if (rank.includes('juara 2') || rank.includes('rank 2') || rank.includes('perak')) return 10;
  if (rank.includes('juara 3') || rank.includes('rank 3') || rank.includes('perunggu')) return 8;
  if (rank.includes('harapan') || rank.includes('finalis')) return 5;
  if (rank.includes('peserta')) return 2;
  return 4;
}

function isAchievementRelevantToSubject(achievement, subjectName) {
  const haystack = `${achievement.title || ''} ${achievement.achievement_type || ''} ${achievement.notes || ''}`.toLowerCase();
  const subject = String(subjectName || '').toLowerCase();
  if (!subject) return false;
  if (haystack.includes(subject)) return true;
  if (subject.includes('matematika') && (haystack.includes('math') || haystack.includes('matematika'))) return true;
  if (subject.includes('fisika') && haystack.includes('physics')) return true;
  if (subject.includes('kimia') && haystack.includes('chemistry')) return true;
  if (subject.includes('biologi') && haystack.includes('biology')) return true;
  return false;
}

function isAchievementRelevantToTarget(achievement, targetName) {
  const haystack = `${achievement.title || ''} ${achievement.achievement_type || ''} ${achievement.notes || ''}`.toLowerCase();
  const target = String(targetName || '').toLowerCase();
  if (!target) return false;
  return haystack.includes(target);
}

function toTinyInt(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value === true || String(value).toLowerCase() === 'true') return 1;
  if (value === false || String(value).toLowerCase() === 'false') return 0;
  const num = Number(value);
  if (Number.isNaN(num)) return null;
  return num > 0 ? 1 : 0;
}

function toDecimalOrZero(value) {
  const num = Number(value);
  if (Number.isNaN(num)) return 0;
  return clamp(num, 0, 100);
}

async function deriveModelFromFeedback(subjectId) {
  const [rows] = await pool.query(
    `SELECT academic_score, achievement_score, outcome_label
     FROM olympiad_recommendation_feedback
     WHERE subject_id = ?
       AND outcome_label IS NOT NULL`,
    [subjectId]
  );
  const samples = rows || [];
  if (samples.length < 20) return null;

  const positives = samples.filter((row) => Number(row.outcome_label) === 1);
  const negatives = samples.filter((row) => Number(row.outcome_label) === 0);
  if (!positives.length || !negatives.length) return null;

  let best = { weight: 0.8, separation: -9999 };
  for (let w = 0.5; w <= 0.95; w += 0.05) {
    const posMean = average(positives.map((row) => (w * Number(row.academic_score || 0)) + ((1 - w) * Number(row.achievement_score || 0))));
    const negMean = average(negatives.map((row) => (w * Number(row.academic_score || 0)) + ((1 - w) * Number(row.achievement_score || 0))));
    const separation = posMean - negMean;
    if (separation > best.separation) {
      best = { weight: Number(w.toFixed(2)), separation };
    }
  }

  return {
    kind: 'learned_feedback_v2',
    academic_weight: best.weight,
    achievement_weight: Number((1 - best.weight).toFixed(2)),
    sample_size: samples.length
  };
}

async function resolveModel(subjectId, manualAcademicWeight, manualAchievementWeight) {
  const hasManual = manualAcademicWeight !== null || manualAchievementWeight !== null;
  if (hasManual) {
    const normalized = normalizeWeights(
      manualAcademicWeight === null ? 0.8 : manualAcademicWeight,
      manualAchievementWeight === null ? 0.2 : manualAchievementWeight
    );
    return {
      kind: 'manual_weighted_scoring_v2',
      academic_weight: Number(normalized.academic.toFixed(2)),
      achievement_weight: Number(normalized.achievement.toFixed(2)),
      sample_size: 0
    };
  }

  const learned = await deriveModelFromFeedback(subjectId);
  if (learned) return learned;

  return {
    kind: 'weighted_scoring_v1',
    academic_weight: 0.8,
    achievement_weight: 0.2,
    sample_size: 0
  };
}

async function recommendStudents(req, res) {
  try {
    const category = String(req.query.category || 'akademik').trim().toLowerCase() === 'non_akademik'
      ? 'non_akademik'
      : 'akademik';
    const subjectId = toInt(req.query.subject_id);
    const subjectQuery = String(req.query.subject_q || '').trim();
    const extracurricularName = String(req.query.extracurricular_name || '').trim();
    const limit = clamp(toInt(req.query.limit) || 10, 1, 50);
    const classId = toInt(req.query.class_id);
    const schoolYearId = toInt(req.query.school_year_id);
    const semesterId = toInt(req.query.semester_id);
    const manualAcademicWeight = req.query.academic_weight === undefined ? null : clamp(Number(req.query.academic_weight || 0), 0, 1);
    const manualAchievementWeight = req.query.achievement_weight === undefined ? null : clamp(Number(req.query.achievement_weight || 0), 0, 1);

    if (category === 'non_akademik') {
      const target = extracurricularName || subjectQuery;
      if (!target) {
        return res.status(400).json({ message: 'Pilih ekstrakurikuler untuk rekomendasi non akademik.' });
      }

      const whereParts = [
        "LOWER(COALESCE(NULLIF(s.student_status, ''), 'aktif')) = 'aktif'",
        'COALESCE(s.is_active, 1) = 1'
      ];
      const params = [];
      if (classId) {
        whereParts.push('s.class_id = ?');
        params.push(classId);
      }

      const periodParts = [];
      const periodParams = [];
      if (schoolYearId) {
        periodParts.push('rm2.school_year_id = ?');
        periodParams.push(schoolYearId);
      }
      if (semesterId) {
        periodParts.push('rm2.semester_id = ?');
        periodParams.push(semesterId);
      }
      const periodClause = periodParts.length ? `AND ${periodParts.join(' AND ')}` : '';

      const [studentsRows] = await pool.query(
        `SELECT
          s.id AS student_id,
          s.name AS student_name,
          s.nis_local,
          s.class_id,
          c.name AS class_name,
          COALESCE(rm.extracurricular_activity, '') AS extracurricular_activity
         FROM students s
         LEFT JOIN classes c ON c.id = s.class_id
         LEFT JOIN student_report_meta rm
           ON rm.id = (
             SELECT rm2.id
             FROM student_report_meta rm2
             WHERE rm2.student_id = s.id
             ${periodClause}
             ORDER BY rm2.id DESC
             LIMIT 1
           )
         WHERE ${whereParts.join(' AND ')}`,
        [...periodParams, ...params]
      );

      if (!studentsRows.length) {
        return res.json({
          category,
          target: { type: 'extracurricular', name: target },
          filters: { class_id: classId || null, school_year_id: schoolYearId || null, semester_id: semesterId || null },
          total_candidates: 0,
          items: []
        });
      }

      const studentIds = studentsRows.map((row) => Number(row.student_id));
      const [achievementRows] = await pool.query(
        `SELECT *
         FROM student_achievements
         WHERE student_id IN (${studentIds.map(() => '?').join(',')})
           AND COALESCE(is_active, 1) = 1
           AND COALESCE(achievement_category, 'akademik') = 'non_akademik'`,
        studentIds
      );

      const achievementsByStudent = new Map();
      (achievementRows || []).forEach((row) => {
        const sid = Number(row.student_id);
        if (!achievementsByStudent.has(sid)) achievementsByStudent.set(sid, []);
        achievementsByStudent.get(sid).push(row);
      });

      const ranked = studentsRows
        .map((student) => {
          const activity = String(student.extracurricular_activity || '');
          const activityLower = activity.toLowerCase();
          const targetLower = target.toLowerCase();

          let extracurricularScore = 0;
          if (activityLower && activityLower === targetLower) extracurricularScore = 100;
          else if (activityLower && activityLower.includes(targetLower)) extracurricularScore = 85;
          else if (activityLower) extracurricularScore = 35;

          const studentAchievements = achievementsByStudent.get(Number(student.student_id)) || [];
          let achievementPoints = 0;
          let relevantCount = 0;
          studentAchievements.forEach((achievement) => {
            achievementPoints += scoreLevel(achievement.level_name) + scoreRank(achievement.rank_value);
            if (isAchievementRelevantToTarget(achievement, target)) {
              relevantCount += 1;
              achievementPoints += 6;
            }
          });
          const achievementScore = clamp(achievementPoints, 0, 100);
          const recommendationScore = (extracurricularScore * 0.7) + (achievementScore * 0.3);

          return {
            student_id: Number(student.student_id),
            student_name: student.student_name,
            nis_local: student.nis_local,
            class_id: student.class_id,
            class_name: student.class_name || '-',
            extracurricular_activity: activity || '-',
            extracurricular_score: Number(extracurricularScore.toFixed(2)),
            achievements_total: studentAchievements.length,
            achievements_relevant: relevantCount,
            achievement_score: Number(achievementScore.toFixed(2)),
            recommendation_score: Number(recommendationScore.toFixed(2))
          };
        })
        .sort((a, b) => (
          b.recommendation_score - a.recommendation_score
          || b.extracurricular_score - a.extracurricular_score
          || b.achievements_relevant - a.achievements_relevant
          || String(a.student_name || '').localeCompare(String(b.student_name || ''), 'id')
        ));

      return res.json({
        category,
        target: { type: 'extracurricular', name: target },
        filters: {
          class_id: classId || null,
          school_year_id: schoolYearId || null,
          semester_id: semesterId || null
        },
        model: {
          kind: 'non_academic_weighted_v1',
          extracurricular_weight: 0.7,
          achievement_weight: 0.3
        },
        total_candidates: ranked.length,
        items: ranked.slice(0, limit)
      });
    }

    let subject = null;
    if (subjectId) {
      const [rows] = await pool.query('SELECT id, name FROM subjects WHERE id = ? LIMIT 1', [subjectId]);
      subject = rows[0] || null;
    } else if (subjectQuery) {
      const [rows] = await pool.query(
        `SELECT id, name
         FROM subjects
         WHERE LOWER(name) LIKE ?
         ORDER BY CASE WHEN LOWER(name) = LOWER(?) THEN 0 ELSE 1 END, name ASC
         LIMIT 1`,
        [`%${subjectQuery.toLowerCase()}%`, subjectQuery]
      );
      subject = rows[0] || null;
    }

    if (!subject) {
      return res.status(400).json({ message: 'Mapel tidak ditemukan. Isi subject_id atau subject_q yang valid.' });
    }
    const model = await resolveModel(subject.id, manualAcademicWeight, manualAchievementWeight);

    const scoreParams = [subject.id];
    const scoreWhere = [
      'ss.subject_id = ?',
      'ss.score_value IS NOT NULL',
      "LOWER(COALESCE(NULLIF(s.student_status, ''), 'aktif')) = 'aktif'",
      'COALESCE(s.is_active, 1) = 1'
    ];
    if (classId) {
      scoreWhere.push('s.class_id = ?');
      scoreParams.push(classId);
    }
    if (schoolYearId) {
      scoreWhere.push('ss.school_year_id = ?');
      scoreParams.push(schoolYearId);
    }
    if (semesterId) {
      scoreWhere.push('ss.semester_id = ?');
      scoreParams.push(semesterId);
    }

    const [scoreRows] = await pool.query(
      `SELECT
        ss.student_id,
        AVG(ss.score_value) AS avg_score,
        MAX(ss.score_value) AS best_score,
        COUNT(*) AS score_count
       FROM student_scores ss
       JOIN students s ON s.id = ss.student_id
       WHERE ${scoreWhere.join(' AND ')}
       GROUP BY ss.student_id`,
      scoreParams
    );

    if (!scoreRows.length) {
      return res.json({
        subject: { id: subject.id, name: subject.name },
        total_candidates: 0,
        items: []
      });
    }

    const studentIds = scoreRows.map((row) => row.student_id);
    const [studentRows, achievementRows] = await Promise.all([
      pool.query(
        `SELECT s.id, s.name, s.nis_local, s.class_id, c.name AS class_name
         FROM students s
         LEFT JOIN classes c ON c.id = s.class_id
         WHERE s.id IN (${studentIds.map(() => '?').join(',')})`,
        studentIds
      ),
      pool.query(
        `SELECT *
         FROM student_achievements
         WHERE student_id IN (${studentIds.map(() => '?').join(',')})
           AND COALESCE(is_active, 1) = 1`,
        studentIds
      )
    ]);

    const students = studentRows[0] || [];
    const achievements = achievementRows[0] || [];

    const studentMap = new Map();
    students.forEach((student) => studentMap.set(Number(student.id), student));

    const achievementsByStudent = new Map();
    achievements.forEach((row) => {
      const sid = Number(row.student_id);
      if (!achievementsByStudent.has(sid)) achievementsByStudent.set(sid, []);
      achievementsByStudent.get(sid).push(row);
    });

    const ranked = scoreRows
      .map((row) => {
        const sid = Number(row.student_id);
        const student = studentMap.get(sid);
        if (!student) return null;

        const avgScore = Number(row.avg_score || 0);
        const studentAchievements = achievementsByStudent.get(sid) || [];
        let achievementPoints = 0;
        let relevantCount = 0;

        studentAchievements.forEach((achievement) => {
          achievementPoints += scoreLevel(achievement.level_name) + scoreRank(achievement.rank_value);
          if (isAchievementRelevantToSubject(achievement, subject.name)) {
            relevantCount += 1;
            achievementPoints += 4;
          }
        });

        const academicScore = clamp(avgScore, 0, 100);
        const nonAcademicScore = clamp(achievementPoints, 0, 100);
        const finalScore = (academicScore * model.academic_weight) + (nonAcademicScore * model.achievement_weight);

        return {
          student_id: sid,
          student_name: student.name,
          nis_local: student.nis_local,
          class_id: student.class_id,
          class_name: student.class_name || '-',
          subject_id: subject.id,
          subject_name: subject.name,
          avg_subject_score: Number(academicScore.toFixed(2)),
          best_subject_score: Number(Number(row.best_score || 0).toFixed(2)),
          score_samples: Number(row.score_count || 0),
          achievements_total: studentAchievements.length,
          achievements_relevant: relevantCount,
          achievement_score: Number(nonAcademicScore.toFixed(2)),
          recommendation_score: Number(finalScore.toFixed(2))
        };
      })
      .filter(Boolean)
      .sort((a, b) => (
        b.recommendation_score - a.recommendation_score
        || b.avg_subject_score - a.avg_subject_score
        || b.achievements_relevant - a.achievements_relevant
        || String(a.student_name || '').localeCompare(String(b.student_name || ''), 'id')
      ));

    return res.json({
      category,
      subject: { id: subject.id, name: subject.name },
      target: { type: 'subject', name: subject.name, id: subject.id },
      filters: {
        class_id: classId || null,
        school_year_id: schoolYearId || null,
        semester_id: semesterId || null
      },
      model: {
        kind: model.kind,
        academic_weight: model.academic_weight,
        achievement_weight: model.achievement_weight,
        sample_size: model.sample_size
      },
      total_candidates: ranked.length,
      items: ranked.slice(0, limit)
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Gagal membuat rekomendasi siswa.' });
  }
}

async function getModelConfig(req, res) {
  try {
    const subjectId = toInt(req.query.subject_id);
    if (!subjectId) return res.status(400).json({ message: 'subject_id wajib diisi.' });
    const [subjectRows] = await pool.query('SELECT id, name FROM subjects WHERE id = ? LIMIT 1', [subjectId]);
    const subject = subjectRows[0];
    if (!subject) return res.status(404).json({ message: 'Mapel tidak ditemukan.' });

    const model = await resolveModel(subject.id, null, null);
    return res.json({
      subject,
      model
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Gagal memuat model rekomendasi.' });
  }
}

async function recordFeedback(req, res) {
  try {
    const payload = Array.isArray(req.body?.items) ? req.body.items : (req.body ? [req.body] : []);
    if (!payload.length) return res.status(400).json({ message: 'items tidak boleh kosong.' });

    const values = payload.map((item) => {
      const subjectId = toInt(item.subject_id);
      const studentId = toInt(item.student_id);
      if (!subjectId || !studentId) throw new Error('subject_id dan student_id wajib diisi.');
      return [
        subjectId,
        studentId,
        toInt(item.class_id),
        toInt(item.school_year_id),
        toInt(item.semester_id),
        toDecimalOrZero(item.academic_score),
        toDecimalOrZero(item.achievement_score),
        toDecimalOrZero(item.recommendation_score),
        toTinyInt(item.selected_by_school) || 0,
        toTinyInt(item.outcome_label),
        item.notes ? String(item.notes) : null
      ];
    });

    const placeholders = values.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
    const flatValues = values.flat();
    await pool.query(
      `INSERT INTO olympiad_recommendation_feedback
       (subject_id, student_id, class_id, school_year_id, semester_id, academic_score, achievement_score, recommendation_score, selected_by_school, outcome_label, notes)
       VALUES ${placeholders}`,
      flatValues
    );

    return res.json({ message: `${values.length} feedback rekomendasi tersimpan.`, total: values.length });
  } catch (err) {
    return res.status(400).json({ message: err.message || 'Gagal menyimpan feedback rekomendasi.' });
  }
}

module.exports = {
  recommendStudents,
  getModelConfig,
  recordFeedback
};
