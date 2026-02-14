const express = require('express');
const { db1 } = require('../db');

const router = express.Router();

function mountCrud(path, table, fields, orderBy = 'id DESC') {
  router.get(path, async (req, res, next) => {
    try {
      const [rows] = await db1.query(`SELECT * FROM ${table} ORDER BY ${orderBy}`);
      res.json(rows);
    } catch (e) { next(e); }
  });

  router.post(path, async (req, res, next) => {
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
      const [r] = await db1.query(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${vals.join(',')})`, params);
      res.json({ success: true, id: r.insertId });
    } catch (e) { next(e); }
  });

  router.put(`${path}/:id`, async (req, res, next) => {
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
  });

  router.delete(`${path}/:id`, async (req, res, next) => {
    try {
      await db1.query(`DELETE FROM ${table} WHERE id=?`, [req.params.id]);
      res.json({ success: true });
    } catch (e) { next(e); }
  });
}

mountCrud('/fee-types', 'fee_types', ['name', 'description', 'amount', 'payment_type', 'is_active'], 'id DESC');
mountCrud('/student-payments', 'student_payments', ['student_id', 'fee_type_id', 'payment_date', 'amount', 'payment_method', 'receipt_number', 'notes', 'received_by'], 'payment_date DESC, id DESC');
mountCrud('/cash-transactions', 'cash_transactions', ['transaction_date', 'type', 'category', 'amount', 'description', 'reference_number', 'recorded_by'], 'transaction_date DESC, id DESC');
mountCrud('/journal-entries', 'journal_entries', ['entry_date', 'account_code', 'account_name', 'debit', 'credit', 'description', 'transaction_id'], 'entry_date DESC, id DESC');

module.exports = router;
