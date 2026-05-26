const pool = require('../db/pool');

const entityTableMap = {
  students: 'students',
  teachers: 'teachers',
  subjects: 'subjects',
  classes: 'classes',
  school_years: 'school_years',
  schoolYears: 'school_years',
  semesters: 'semesters',
  change_log: 'change_log',
  changes: 'change_log',
  teacher_tasks: 'teacher_tasks'
  ,additional_tasks: 'additional_tasks'
};

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

async function listEntities(req, res) {
  res.json({
    entities: ['students', 'teachers', 'subjects', 'classes', 'school_years', 'semesters', 'teacher_tasks', 'additional_tasks', 'change_log'],
    note: 'Gunakan /api/export/:entity'
  });
}

async function exportEntity(req, res) {
  const { entity } = req.params;
  const table = entityTableMap[entity];
  if (!table) return res.status(400).json({ message: 'Invalid entity' });

  const { since, limit, offset, format } = req.query;
  const params = [];
  let query = `SELECT * FROM ${table}`;
  const where = [];

  if (since && table === 'change_log') {
    where.push('changed_at > ?');
    params.push(since);
  }
  if (where.length) {
    query += ` WHERE ${where.join(' AND ')}`;
  }
  query += ' ORDER BY id ASC';
  if (typeof limit !== 'undefined') {
    query += ' LIMIT ?';
    params.push(Number(limit) || 0);
    if (typeof offset !== 'undefined') {
      query += ' OFFSET ?';
      params.push(Number(offset) || 0);
    }
  }

  const [rows] = await pool.query(query, params);

  if (format === 'csv') {
    const csv = toCsv(rows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=${entity}.csv`);
    return res.send(csv);
  }

  res.json({
    entity,
    count: rows.length,
    data: rows
  });
}

module.exports = {
  listEntities,
  exportEntity
};
