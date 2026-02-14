const { db2 } = require('../db');

async function getTeacherMap() {
  const [rows] = await db2.query('SELECT id, name FROM teachers WHERE is_active=1');
  return new Map(rows.map(r => [String(r.id), r.name]));
}

async function getSubjectMap() {
  const [rows] = await db2.query('SELECT id, name FROM subjects WHERE is_active=1');
  return new Map(rows.map(r => [String(r.id), r.name]));
}

async function getClassMap() {
  const [rows] = await db2.query('SELECT id, name FROM classes');
  return new Map(rows.map(r => [String(r.id), r.name]));
}

module.exports = { getTeacherMap, getSubjectMap, getClassMap };
