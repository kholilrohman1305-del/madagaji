const pool = require('../db/pool');
const { writeChange } = require('../services/change-log.service');

const entityTableMap = {
  students: 'students',
  teachers: 'teachers',
  subjects: 'subjects',
  classes: 'classes',
  schoolYears: 'school_years',
  semesters: 'semesters'
};

async function bulkAction(req, res) {
  const { entity } = req.params;
  const { action, ids } = req.body || {};
  const table = entityTableMap[entity];
  if (!table) return res.status(400).json({ message: 'Invalid entity' });
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: 'IDs required' });

  if (action === 'delete') {
    const [existing] = await pool.query(`SELECT * FROM ${table} WHERE id IN (?)`, [ids]);
    await pool.query(`DELETE FROM ${table} WHERE id IN (?)`, [ids]);
    for (const row of existing) {
      await writeChange({ table, recordId: row.id, operation: 'delete', data: row });
    }
    return res.json({ message: 'Deleted', count: ids.length });
  }

  if (action === 'activate') {
    if (table === 'school_years' || table === 'semesters') {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.query(`UPDATE ${table} SET is_active = 0`);
        await conn.query(`UPDATE ${table} SET is_active = 1 WHERE id IN (?)`, [ids]);
        const [rows] = await conn.query(`SELECT * FROM ${table}`);
        for (const row of rows) {
          await writeChange({ table, recordId: row.id, operation: 'update', data: row, conn });
        }
        await conn.commit();
      } catch (err) {
        await conn.rollback();
        return res.status(400).json({ message: err.message });
      } finally {
        conn.release();
      }
      return res.json({ message: 'Activated', count: ids.length });
    }
    await pool.query(`UPDATE ${table} SET is_active = 1 WHERE id IN (?)`, [ids]);
    const [rows] = await pool.query(`SELECT * FROM ${table} WHERE id IN (?)`, [ids]);
    for (const row of rows) {
      await writeChange({ table, recordId: row.id, operation: 'update', data: row });
    }
    return res.json({ message: 'Activated', count: ids.length });
  }

  if (action === 'deactivate') {
    await pool.query(`UPDATE ${table} SET is_active = 0 WHERE id IN (?)`, [ids]);
    const [rows] = await pool.query(`SELECT * FROM ${table} WHERE id IN (?)`, [ids]);
    for (const row of rows) {
      await writeChange({ table, recordId: row.id, operation: 'update', data: row });
    }
    return res.json({ message: 'Deactivated', count: ids.length });
  }

  return res.status(400).json({ message: 'Invalid action' });
}

module.exports = {
  bulkAction
};
