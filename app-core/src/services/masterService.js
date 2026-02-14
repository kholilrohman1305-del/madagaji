const { db2 } = require('../db');

async function getTeachers() {
  const [rows] = await db2.query(
    'SELECT id, name, classification, tmt FROM teachers WHERE is_active=1 ORDER BY name'
  );
  return rows;
}

async function getClasses() {
  const [rows] = await db2.query('SELECT id, name FROM classes ORDER BY name');
  return rows;
}

async function getSubjects() {
  const [rows] = await db2.query(
    'SELECT id, code, name FROM subjects WHERE is_active=1 ORDER BY name'
  );
  return rows;
}

module.exports = { getTeachers, getClasses, getSubjects };
