const { db1, db2 } = require('../db');

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

async function getStudents() {
  const [rows] = await db1.query(
    'SELECT id, nisn, nis, full_name, class_id, status FROM students ORDER BY full_name'
  );
  return rows;
}

async function getEmployees() {
  const [rows] = await db1.query(
    'SELECT id, full_name, position, department, status FROM employees ORDER BY full_name'
  );
  return rows;
}

async function getAcademicYears() {
  const [rows] = await db1.query(
    'SELECT id, name, start_date, end_date, is_active FROM academic_years ORDER BY id DESC'
  );
  return rows;
}

module.exports = { getTeachers, getClasses, getSubjects, getStudents, getEmployees, getAcademicYears };
