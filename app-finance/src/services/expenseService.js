const { db1 } = require('../db');

function computeTotal(item) {
  const jumlah = Number(item.jumlah || 1);
  const nominal = Number(item.nominal || 0);
  return jumlah * nominal;
}

async function listExpenses(startDate, endDate) {
  const [rows] = await db1.query(
    `SELECT id, tanggal, kategori, jumlah, nominal, keterangan
     FROM pengeluaran_lain
     WHERE tanggal BETWEEN ? AND ?
     ORDER BY tanggal, id`,
    [startDate, endDate]
  );
  return rows.map(r => ({
    ...r,
    total: computeTotal(r)
  }));
}

async function createExpense({ tanggal, kategori, jumlah, nominal, keterangan }) {
  const conn = await db1.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT id FROM pengeluaran_lain ORDER BY id DESC LIMIT 1 FOR UPDATE');
    const last = rows[0]?.id || 'P000';
    const next = `P${String((parseInt(String(last).slice(1), 10) || 0) + 1).padStart(3, '0')}`;
    await conn.query(
      'INSERT INTO pengeluaran_lain (id, tanggal, kategori, penerima, jumlah, nominal, keterangan) VALUES (?,?,?,?,?,?,?)',
      [next, tanggal, kategori, '', Number(jumlah || 1), Number(nominal || 0), keterangan || '']
    );
    await conn.commit();
    return next;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function updateExpense(id, { tanggal, kategori, jumlah, nominal, keterangan }) {
  await db1.query(
    'UPDATE pengeluaran_lain SET tanggal=?, kategori=?, jumlah=?, nominal=?, keterangan=? WHERE id=?',
    [tanggal, kategori, Number(jumlah || 1), Number(nominal || 0), keterangan || '', id]
  );
}

async function deleteExpense(id) {
  await db1.query('DELETE FROM pengeluaran_lain WHERE id=?', [id]);
}

module.exports = {
  listExpenses,
  createExpense,
  updateExpense,
  deleteExpense
};
