const express = require('express');
const { db1 } = require('../db');

const router = express.Router();

function listRoute(table, orderBy = 'id DESC') {
  return async (req, res, next) => {
    try {
      const [rows] = await db1.query(`SELECT * FROM ${table} ORDER BY ${orderBy}`);
      res.json(rows);
    } catch (e) { next(e); }
  };
}

function createRoute(table, fields) {
  return async (req, res, next) => {
    try {
      const body = req.body || {};
      const cols = [];
      const vals = [];
      const params = [];
      for (const f of fields) {
        if (body[f] !== undefined) {
          cols.push(f);
          vals.push('?');
          params.push(body[f]);
        }
      }
      if (!cols.length) return res.status(400).json({ success: false, message: 'Payload kosong.' });
      const [r] = await db1.query(
        `INSERT INTO ${table} (${cols.join(',')}) VALUES (${vals.join(',')})`,
        params
      );
      res.json({ success: true, id: r.insertId });
    } catch (e) { next(e); }
  };
}

function updateRoute(table, fields) {
  return async (req, res, next) => {
    try {
      const body = req.body || {};
      const sets = [];
      const params = [];
      for (const f of fields) {
        if (body[f] !== undefined) {
          sets.push(`${f}=?`);
          params.push(body[f]);
        }
      }
      if (!sets.length) return res.status(400).json({ success: false, message: 'Tidak ada perubahan.' });
      params.push(req.params.id);
      await db1.query(`UPDATE ${table} SET ${sets.join(',')} WHERE id=?`, params);
      res.json({ success: true });
    } catch (e) { next(e); }
  };
}

function deleteRoute(table) {
  return async (req, res, next) => {
    try {
      await db1.query(`DELETE FROM ${table} WHERE id=?`, [req.params.id]);
      res.json({ success: true });
    } catch (e) { next(e); }
  };
}

function mountCrud(path, table, fields, orderBy) {
  router.get(path, listRoute(table, orderBy));
  router.post(path, createRoute(table, fields));
  router.put(`${path}/:id`, updateRoute(table, fields));
  router.delete(`${path}/:id`, deleteRoute(table));
}

mountCrud('/academic-years', 'academic_years', ['name', 'start_date', 'end_date', 'is_active'], 'id DESC');
mountCrud('/student-attendance', 'student_attendance', ['student_id', 'date', 'status', 'notes', 'recorded_by'], 'date DESC, id DESC');
mountCrud('/grades', 'grades', ['student_id', 'subject_id', 'academic_year_id', 'semester', 'uh1', 'uh2', 'uts', 'uas', 'final_grade', 'input_by'], 'id DESC');
mountCrud('/report-cards', 'report_cards', ['student_id', 'academic_year_id', 'semester', 'total_grade', 'rank_no', 'notes'], 'id DESC');
mountCrud('/staff-attendance', 'staff_attendance', ['user_id', 'date', 'check_in', 'check_out', 'status', 'notes'], 'date DESC, id DESC');
mountCrud('/leave-requests', 'leave_requests', ['user_id', 'leave_type', 'start_date', 'end_date', 'reason', 'status', 'approved_by'], 'id DESC');

module.exports = router;
