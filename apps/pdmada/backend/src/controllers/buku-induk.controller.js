const pool = require('../db/pool');

function toInt(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

async function list(req, res) {
  const classId = toInt(req.query.class_id);
  const schoolYearId = toInt(req.query.school_year_id);
  const status = String(req.query.status || '').trim().toLowerCase();
  const q = String(req.query.q || '').trim().toLowerCase();

  const rows = await queryBukuIndukRows({ classId, schoolYearId, status, q });
  res.json(rows);
}

async function queryBukuIndukRows({ classId, schoolYearId, status, q }) {
  const where = [];
  const params = [];

  if (classId) {
    where.push('s.class_id = ?');
    params.push(classId);
  }
  if (schoolYearId) {
    where.push('s.school_year_id = ?');
    params.push(schoolYearId);
  }
  if (status) {
    where.push('LOWER(COALESCE(s.student_status, \'\')) = ?');
    params.push(status);
  }
  if (q) {
    where.push('(LOWER(COALESCE(s.name, \'\')) LIKE ? OR LOWER(COALESCE(s.nis_local, \'\')) LIKE ? OR LOWER(COALESCE(s.nisn, \'\')) LIKE ? OR LOWER(COALESCE(s.nism, \'\')) LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }

  const sql = `
    SELECT
      s.id,
      s.nis_local,
      s.nisn,
      s.nism,
      s.name,
      s.gender,
      s.birth_date,
      s.entry_date,
      s.student_status,
      s.is_active,
      c.name AS class_name,
      sy.name AS school_year_name,
      sem.name AS semester_name,
      lh.start_date AS latest_history_date,
      lh.status AS latest_history_status,
      lh.notes AS latest_history_notes
    FROM students s
    LEFT JOIN classes c ON c.id = s.class_id
    LEFT JOIN school_years sy ON sy.id = s.school_year_id
    LEFT JOIN semesters sem ON sem.is_active = 1
    LEFT JOIN (
      SELECT h1.*
      FROM student_class_histories h1
      JOIN (
        SELECT student_id, MAX(id) AS last_id
        FROM student_class_histories
        GROUP BY student_id
      ) h2 ON h2.last_id = h1.id
    ) lh ON lh.student_id = s.id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY s.name ASC
  `;

  const [rows] = await pool.query(sql, params);
  return rows;
}

function toCsv(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (val) => {
    if (val === null || typeof val === 'undefined') return '';
    const str = String(val);
    if (str.includes('"') || str.includes(',') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(','));
  }
  return lines.join('\n');
}

async function exportCsv(req, res) {
  const classId = toInt(req.query.class_id);
  const schoolYearId = toInt(req.query.school_year_id);
  const status = String(req.query.status || '').trim().toLowerCase();
  const q = String(req.query.q || '').trim().toLowerCase();
  const rows = await queryBukuIndukRows({ classId, schoolYearId, status, q });
  const csv = toCsv(rows);

  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=buku-induk-${stamp}.csv`);
  return res.send(csv);
}

async function detail(req, res) {
  const studentId = toInt(req.params.studentId);
  if (!studentId) return res.status(400).json({ message: 'studentId tidak valid.' });

  const [students] = await pool.query(
    `SELECT
      s.*,
      c.name AS class_name,
      sy.name AS school_year_name
     FROM students s
     LEFT JOIN classes c ON c.id = s.class_id
     LEFT JOIN school_years sy ON sy.id = s.school_year_id
     WHERE s.id = ?
     LIMIT 1`,
    [studentId]
  );
  if (!students[0]) return res.status(404).json({ message: 'Siswa tidak ditemukan.' });

  const [histories] = await pool.query(
    `SELECT
      h.*,
      c.name AS class_name,
      sy.name AS school_year_name,
      sem.name AS semester_name,
      (
        SELECT cprev.name
        FROM student_class_histories hprev
        LEFT JOIN classes cprev ON cprev.id = hprev.class_id
        WHERE hprev.student_id = h.student_id
          AND (
            hprev.start_date < h.start_date
            OR (hprev.start_date = h.start_date AND hprev.id < h.id)
          )
        ORDER BY hprev.start_date DESC, hprev.id DESC
        LIMIT 1
      ) AS from_class_name
     FROM student_class_histories h
     LEFT JOIN classes c ON c.id = h.class_id
     LEFT JOIN school_years sy ON sy.id = h.school_year_id
     LEFT JOIN semesters sem ON sem.id = h.semester_id
     WHERE h.student_id = ?
     ORDER BY h.start_date DESC, h.id DESC`,
    [studentId]
  );

  const [mutations] = await pool.query(
    `SELECT
      m.*,
      cfrom.name AS from_class_name,
      cto.name AS to_class_name
     FROM student_mutations m
     LEFT JOIN classes cfrom ON cfrom.id = m.from_class_id
     LEFT JOIN classes cto ON cto.id = m.to_class_id
     WHERE m.student_id = ?
     ORDER BY m.mutation_date DESC, m.id DESC`,
    [studentId]
  );

  const [scores] = await pool.query(
    `SELECT
      ss.*,
      subj.name AS subject_name,
      sy.name AS school_year_name,
      sem.name AS semester_name
     FROM student_scores ss
     LEFT JOIN subjects subj ON subj.id = ss.subject_id
     LEFT JOIN school_years sy ON sy.id = ss.school_year_id
     LEFT JOIN semesters sem ON sem.id = ss.semester_id
     WHERE ss.student_id = ?
     ORDER BY sy.id DESC, sem.id DESC, subj.name ASC`,
    [studentId]
  );

  res.json({
    student: students[0],
    histories,
    mutations,
    scores
  });
}

module.exports = {
  list,
  detail,
  exportCsv
};
