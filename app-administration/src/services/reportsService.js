const { db1 } = require('../db');

async function getSummary(startDate, endDate) {
  const rangeWhere = startDate && endDate ? 'WHERE tanggal BETWEEN ? AND ?' : '';
  const rangeParams = startDate && endDate ? [startDate, endDate] : [];

  const [letters] = await db1.query(
    `SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN jenis = 'masuk' THEN 1 ELSE 0 END) AS surat_masuk,
      SUM(CASE WHEN jenis = 'keluar' THEN 1 ELSE 0 END) AS surat_keluar
    FROM surat_masuk_keluar
    ${rangeWhere}`,
    rangeParams
  );

  const [inventory] = await db1.query(
    `SELECT
      COUNT(*) AS total_item,
      COALESCE(SUM(jumlah_total), 0) AS total_unit,
      COALESCE(SUM(jumlah_tersedia), 0) AS unit_tersedia
    FROM inventaris`
  );

  const [borrowing] = await db1.query(
    `SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'dipinjam' THEN 1 ELSE 0 END) AS sedang_dipinjam,
      SUM(CASE WHEN status = 'kembali' THEN 1 ELSE 0 END) AS sudah_kembali
    FROM peminjaman
    ${startDate && endDate ? 'WHERE tanggal_pinjam BETWEEN ? AND ?' : ''}`,
    rangeParams
  );

  return {
    letters: letters[0] || { total: 0, surat_masuk: 0, surat_keluar: 0 },
    inventory: inventory[0] || { total_item: 0, total_unit: 0, unit_tersedia: 0 },
    borrowing: borrowing[0] || { total: 0, sedang_dipinjam: 0, sudah_kembali: 0 }
  };
}

module.exports = { getSummary };
