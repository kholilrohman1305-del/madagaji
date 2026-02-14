const { db1 } = require('../db');

async function listLetters({ startDate = '', endDate = '', jenis = '' } = {}) {
  const where = [];
  const params = [];
  if (startDate && endDate) {
    where.push('tanggal BETWEEN ? AND ?');
    params.push(startDate, endDate);
  }
  if (jenis) {
    where.push('jenis = ?');
    params.push(jenis);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [rows] = await db1.query(
    `SELECT id, nomor_surat, tanggal, jenis, perihal, tujuan, keterangan, created_at
     FROM surat_masuk_keluar
     ${whereSql}
     ORDER BY tanggal DESC, id DESC`,
    params
  );
  return rows;
}

async function createLetter(payload) {
  const {
    nomor_surat = '',
    tanggal,
    jenis,
    perihal = '',
    tujuan = '',
    keterangan = ''
  } = payload || {};
  await db1.query(
    `INSERT INTO surat_masuk_keluar
      (nomor_surat, tanggal, jenis, perihal, tujuan, keterangan)
     VALUES (?,?,?,?,?,?)`,
    [nomor_surat, tanggal, jenis, perihal, tujuan, keterangan]
  );
}

async function updateLetter(id, payload) {
  const {
    nomor_surat = '',
    tanggal,
    jenis,
    perihal = '',
    tujuan = '',
    keterangan = ''
  } = payload || {};
  await db1.query(
    `UPDATE surat_masuk_keluar
     SET nomor_surat=?, tanggal=?, jenis=?, perihal=?, tujuan=?, keterangan=?
     WHERE id=?`,
    [nomor_surat, tanggal, jenis, perihal, tujuan, keterangan, id]
  );
}

async function deleteLetter(id) {
  await db1.query('DELETE FROM surat_masuk_keluar WHERE id=?', [id]);
}

module.exports = { listLetters, createLetter, updateLetter, deleteLetter };
