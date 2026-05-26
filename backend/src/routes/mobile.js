const express = require('express');
const { authRequired } = require('../middleware/auth');
const pool = require('../db');

const router = express.Router();
const sks = pool.sks;

// ─── MadaGaji endpoints ───────────────────────────────────────────────────────

router.get('/profile', authRequired, (req, res) => {
  res.json({ success: true, user: req.user });
});

router.get('/dashboard', authRequired, async (req, res, next) => {
  try {
    const [[totalTeachers]] = await pool.query('SELECT COUNT(*) AS total FROM users WHERE role = "guru"');
    const [[totalUsers]] = await pool.query('SELECT COUNT(*) AS total FROM users');
    res.json({
      success: true,
      data: {
        totalTeachers: totalTeachers.total,
        totalUsers: totalUsers.total,
        loggedInAs: req.user.display_name || req.user.username,
        role: req.user.role
      }
    });
  } catch (e) {
    next(e);
  }
});

// ─── SKS endpoints ────────────────────────────────────────────────────────────

router.get('/sks/dashboard', authRequired, async (req, res, next) => {
  try {
    const [[stu]] = await sks.query(
      `SELECT COUNT(*) AS total FROM students WHERE LOWER(TRIM(COALESCE(status,'')))='aktif'`
    );
    const [[bill]] = await sks.query(
      `SELECT COALESCE(SUM(total),0) AS total_tagihan, COALESCE(SUM(GREATEST(0,sisa)),0) AS total_sisa FROM bills`
    );
    const [[pay]] = await sks.query(
      `SELECT COALESCE(SUM(jumlah_bayar),0) AS total_pemasukan FROM payments WHERE COALESCE(is_reversed,0)=0`
    );
    res.json({
      success: true,
      data: {
        totalSiswaAktif: Number(stu.total || 0),
        totalPemasukan: Number(pay.total_pemasukan || 0),
        totalTagihan: Number(bill.total_tagihan || 0),
        totalSisaTagihan: Number(bill.total_sisa || 0)
      }
    });
  } catch (e) {
    next(e);
  }
});

router.get('/sks/students', authRequired, async (req, res, next) => {
  try {
    const search = String(req.query.search || '').trim();
    const kelas = String(req.query.kelas || '').trim();
    const status = String(req.query.status || '').trim().toLowerCase();
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
    const offset = (page - 1) * limit;

    const where = ['1=1'];
    const params = [];
    if (search) {
      where.push('(LOWER(s.nama) LIKE ? OR LOWER(COALESCE(s.nis,"")) LIKE ? OR LOWER(COALESCE(s.kelas,"")) LIKE ?)');
      params.push(`%${search.toLowerCase()}%`, `%${search.toLowerCase()}%`, `%${search.toLowerCase()}%`);
    }
    if (kelas) { where.push('s.kelas = ?'); params.push(kelas); }
    if (status) { where.push('LOWER(TRIM(COALESCE(s.status,""))) = ?'); params.push(status); }

    const [rows] = await sks.query(
      `SELECT s.id AS student_id, s.nis, s.nama, s.kelas, s.status, s.tahun_masuk,
              COALESCE(SUM(b.total),0) AS total_tagihan,
              COALESCE(SUM(b.terbayar),0) AS total_terbayar,
              COALESCE(SUM(GREATEST(0,b.sisa)),0) AS total_sisa
       FROM students s
       LEFT JOIN bills b ON b.student_id = s.id
       WHERE ${where.join(' AND ')}
       GROUP BY s.id, s.nis, s.nama, s.kelas, s.status, s.tahun_masuk
       ORDER BY s.nama ASC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const [[{ total }]] = await sks.query(
      `SELECT COUNT(*) AS total FROM students s WHERE ${where.join(' AND ')}`,
      params
    );
    res.json({
      success: true,
      data: rows,
      meta: { page, limit, total: Number(total || 0), totalPages: Math.ceil(Number(total || 0) / limit) || 1 }
    });
  } catch (e) {
    next(e);
  }
});

router.get('/sks/students/:id', authRequired, async (req, res, next) => {
  try {
    const studentId = Number(req.params.id);
    if (!studentId) return res.status(400).json({ success: false, message: 'ID tidak valid.' });

    const [[student]] = await sks.query(
      'SELECT id, nis, nama, kelas, status, tahun_masuk FROM students WHERE id = ? LIMIT 1',
      [studentId]
    );
    if (!student) return res.status(404).json({ success: false, message: 'Siswa tidak ditemukan.' });

    const [bills] = await sks.query(
      `SELECT id, nama_tagihan, total, terbayar, GREATEST(0,sisa) AS sisa, tanggal_buat, status
       FROM bills WHERE student_id = ? ORDER BY id DESC`,
      [studentId]
    );
    const [payments] = await sks.query(
      `SELECT id, trans_id, tanggal, jumlah_bayar, penerima, keterangan, bill_id
       FROM payments WHERE student_id = ? AND COALESCE(is_reversed,0)=0
       ORDER BY tanggal DESC, id DESC LIMIT 50`,
      [studentId]
    );
    const [[totals]] = await sks.query(
      `SELECT COALESCE(SUM(total),0) AS total_tagihan,
              COALESCE(SUM(terbayar),0) AS total_terbayar,
              COALESCE(SUM(GREATEST(0,sisa)),0) AS total_sisa
       FROM bills WHERE student_id = ?`,
      [studentId]
    );
    res.json({
      success: true,
      data: {
        student,
        bills,
        payments,
        totals: {
          totalTagihan: Number(totals.total_tagihan || 0),
          totalTerbayar: Number(totals.total_terbayar || 0),
          totalSisa: Number(totals.total_sisa || 0)
        }
      }
    });
  } catch (e) {
    next(e);
  }
});

router.post('/sks/payments', authRequired, async (req, res, next) => {
  const conn = await sks.getConnection();
  try {
    const { student_id, bill_id, amount, tanggal, penerima, keterangan } = req.body || {};
    const studentId = Number(student_id || 0);
    const billId = Number(bill_id || 0);
    const payAmount = Number(amount || 0);
    const payDate = String(tanggal || '').trim();
    const payPenerima = String(penerima || '').trim();
    if (!studentId || payAmount <= 0 || !payDate || !payPenerima) {
      return res.status(400).json({ success: false, message: 'student_id, amount, tanggal, dan penerima wajib diisi.' });
    }

    await conn.beginTransaction();
    const [[student]] = await conn.query(
      'SELECT id, nama, kelas, class_id, branch_id FROM students WHERE id = ? LIMIT 1',
      [studentId]
    );
    if (!student) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Siswa tidak ditemukan.' });
    }

    if (billId > 0) {
      const [[bill]] = await conn.query(
        'SELECT id, total, GREATEST(0,sisa) AS sisa FROM bills WHERE id = ? AND student_id = ? LIMIT 1',
        [billId, studentId]
      );
      if (!bill) {
        await conn.rollback();
        return res.status(404).json({ success: false, message: 'Tagihan tidak ditemukan.' });
      }
      const sisa = Number(bill.sisa || 0);
      if (payAmount > sisa) {
        await conn.rollback();
        return res.status(400).json({ success: false, message: `Jumlah melebihi sisa tagihan (Rp ${sisa.toLocaleString('id-ID')}).` });
      }
      await conn.query(
        `UPDATE bills
         SET terbayar = LEAST(total, GREATEST(0, terbayar + ?)),
             sisa = GREATEST(0, total - LEAST(total, GREATEST(0, terbayar + ?))),
             status = CASE WHEN GREATEST(0, total - LEAST(total, GREATEST(0, terbayar + ?))) <= 0 THEN 'Lunas' ELSE 'Belum Lunas' END
         WHERE id = ?`,
        [payAmount, payAmount, payAmount, billId]
      );
    }

    const transId = `MTRX-${Date.now()}`;
    const [insertRes] = await conn.query(
      `INSERT INTO payments (trans_id, tanggal, kelas, nama, jumlah_bayar, penerima, keterangan, bill_id, student_id, class_id, branch_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [transId, payDate, student.kelas || '', student.nama, payAmount, payPenerima,
       String(keterangan || ''), billId > 0 ? billId : null, studentId,
       student.class_id || null, student.branch_id || 1]
    );

    await conn.commit();
    res.json({ success: true, data: { paymentId: insertRes.insertId, transId } });
  } catch (e) {
    try { await conn.rollback(); } catch (_) {}
    next(e);
  } finally {
    conn.release();
  }
});

module.exports = router;
