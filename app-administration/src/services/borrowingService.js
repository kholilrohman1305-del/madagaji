const { db1 } = require('../db');

async function listBorrowings({ status = '' } = {}) {
  const [rows] = await db1.query(
    `SELECT p.id, p.inventaris_id, i.nama AS inventaris_nama, p.peminjam,
            p.tanggal_pinjam, p.tanggal_kembali_rencana, p.tanggal_kembali_real,
            p.jumlah, p.status, p.keterangan
     FROM peminjaman p
     JOIN inventaris i ON i.id = p.inventaris_id
     WHERE (? = '' OR p.status = ?)
     ORDER BY p.tanggal_pinjam DESC, p.id DESC`,
    [status, status]
  );
  return rows;
}

async function createBorrowing(payload) {
  const conn = await db1.getConnection();
  try {
    await conn.beginTransaction();
    const {
      inventaris_id,
      peminjam,
      tanggal_pinjam,
      tanggal_kembali_rencana = null,
      jumlah = 1,
      keterangan = ''
    } = payload || {};

    const qty = Number(jumlah || 1);
    const [invRows] = await conn.query(
      'SELECT id, jumlah_tersedia FROM inventaris WHERE id=? FOR UPDATE',
      [inventaris_id]
    );
    const inv = invRows[0];
    if (!inv) throw new Error('Data inventaris tidak ditemukan.');
    if (Number(inv.jumlah_tersedia || 0) < qty) {
      throw new Error('Stok inventaris tidak mencukupi.');
    }

    await conn.query(
      `INSERT INTO peminjaman
        (inventaris_id, peminjam, tanggal_pinjam, tanggal_kembali_rencana, jumlah, status, keterangan)
       VALUES (?,?,?,?,?,'dipinjam',?)`,
      [inventaris_id, peminjam, tanggal_pinjam, tanggal_kembali_rencana, qty, keterangan]
    );
    await conn.query(
      'UPDATE inventaris SET jumlah_tersedia = jumlah_tersedia - ? WHERE id=?',
      [qty, inventaris_id]
    );
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function markReturned(id, tanggalKembali, keterangan = '') {
  const conn = await db1.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      'SELECT id, inventaris_id, jumlah, status FROM peminjaman WHERE id=? FOR UPDATE',
      [id]
    );
    const row = rows[0];
    if (!row) throw new Error('Data peminjaman tidak ditemukan.');
    if (row.status === 'kembali') {
      await conn.commit();
      return;
    }
    await conn.query(
      `UPDATE peminjaman
       SET status='kembali', tanggal_kembali_real=?, keterangan=?
       WHERE id=?`,
      [tanggalKembali, keterangan, id]
    );
    await conn.query(
      'UPDATE inventaris SET jumlah_tersedia = jumlah_tersedia + ? WHERE id=?',
      [Number(row.jumlah || 0), row.inventaris_id]
    );
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

module.exports = { listBorrowings, createBorrowing, markReturned };
