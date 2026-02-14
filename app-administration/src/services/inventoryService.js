const { db1 } = require('../db');

async function listInventory({ keyword = '' } = {}) {
  const [rows] = await db1.query(
    `SELECT id, kode, nama, kategori, jumlah_total, jumlah_tersedia, kondisi, lokasi, created_at
     FROM inventaris
     WHERE (? = '' OR nama LIKE CONCAT('%', ?, '%') OR kategori LIKE CONCAT('%', ?, '%') OR kode LIKE CONCAT('%', ?, '%'))
     ORDER BY nama`,
    [keyword, keyword, keyword, keyword]
  );
  return rows;
}

async function createInventory(payload) {
  const {
    kode = null,
    nama,
    kategori = '',
    jumlah_total = 0,
    kondisi = 'baik',
    lokasi = ''
  } = payload || {};
  const total = Number(jumlah_total || 0);
  await db1.query(
    `INSERT INTO inventaris (kode, nama, kategori, jumlah_total, jumlah_tersedia, kondisi, lokasi)
     VALUES (?,?,?,?,?,?,?)`,
    [kode, nama, kategori, total, total, kondisi, lokasi]
  );
}

async function updateInventory(id, payload) {
  const {
    kode = null,
    nama,
    kategori = '',
    jumlah_total = 0,
    jumlah_tersedia = 0,
    kondisi = 'baik',
    lokasi = ''
  } = payload || {};
  await db1.query(
    `UPDATE inventaris
     SET kode=?, nama=?, kategori=?, jumlah_total=?, jumlah_tersedia=?, kondisi=?, lokasi=?
     WHERE id=?`,
    [kode, nama, kategori, Number(jumlah_total || 0), Number(jumlah_tersedia || 0), kondisi, lokasi, id]
  );
}

async function deleteInventory(id) {
  await db1.query('DELETE FROM inventaris WHERE id=?', [id]);
}

module.exports = { listInventory, createInventory, updateInventory, deleteInventory };
