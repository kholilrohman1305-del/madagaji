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

mountCrud('/incoming-letters', 'incoming_letters', ['letter_number', 'letter_date', 'received_date', 'sender', 'subject', 'content', 'priority', 'status', 'file_url', 'received_by'], 'id DESC');
mountCrud('/outgoing-letters', 'outgoing_letters', ['letter_number', 'letter_date', 'recipient', 'subject', 'content', 'status', 'file_url', 'created_by', 'approved_by'], 'id DESC');
mountCrud('/letter-templates', 'letter_templates', ['name', 'category', 'content', 'variables', 'is_active'], 'id DESC');
mountCrud('/letter-dispositions', 'letter_dispositions', ['letter_id', 'from_user_id', 'to_user_id', 'instruction', 'status'], 'id DESC');
mountCrud('/inventory-items', 'inventory_items', ['code', 'name', 'category', 'description', 'quantity', 'unit', 'condition', 'location', 'purchase_date', 'purchase_price', 'photo_url'], 'id DESC');
mountCrud('/item-loans', 'item_loans', ['item_id', 'borrower_id', 'loan_date', 'return_due_date', 'actual_return_date', 'quantity', 'status', 'purpose', 'notes', 'approved_by'], 'id DESC');

module.exports = router;
