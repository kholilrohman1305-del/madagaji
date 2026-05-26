const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../../db');
const { isSuperAdmin } = require('../utils/branchScope');

const router = express.Router();

function denyIfNotSuper(req, res) {
    if (!isSuperAdmin(req)) {
        res.status(403).json({ success: false, message: 'Hanya super admin yang boleh mengubah pengaturan pusat.' });
        return true;
    }
    return false;
}

async function ensureAcademicTables() {
    await db.query(`
        CREATE TABLE IF NOT EXISTS school_years (
            id INT NOT NULL AUTO_INCREMENT,
            name VARCHAR(20) NOT NULL,
            is_active TINYINT(1) NOT NULL DEFAULT 0,
            created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uniq_school_year_name (name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS semesters (
            id INT NOT NULL AUTO_INCREMENT,
            name VARCHAR(20) NOT NULL,
            is_active TINYINT(1) NOT NULL DEFAULT 0,
            created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uniq_semester_name (name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
    await db.query("INSERT IGNORE INTO semesters (name, is_active) VALUES ('Ganjil', 0), ('Genap', 1)");
}

async function ensureBranchSchema() {
    await db.query(`
        CREATE TABLE IF NOT EXISTS branches (
            id INT NOT NULL AUTO_INCREMENT,
            kode_cabang VARCHAR(30) NOT NULL,
            nama_cabang VARCHAR(120) NOT NULL,
            alamat TEXT DEFAULT NULL,
            telepon VARCHAR(50) DEFAULT NULL,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uniq_branch_code (kode_cabang),
            UNIQUE KEY uniq_branch_name (nama_cabang)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
    await db.query("INSERT IGNORE INTO branches (id, kode_cabang, nama_cabang, is_active) VALUES (1, 'PUSAT', 'Kantor Pusat', 1)");
}

async function getActivePeriod() {
    await ensureAcademicTables();
    const [years] = await db.query('SELECT id, name, is_active FROM school_years ORDER BY id DESC');
    const [semesters] = await db.query('SELECT id, name, is_active FROM semesters ORDER BY id ASC');
    const activeSchoolYear = years.find((y) => Number(y.is_active) === 1) || null;
    const activeSemester = semesters.find((s) => Number(s.is_active) === 1) || null;
    return { years, semesters, activeSchoolYear, activeSemester };
}

router.get('/settings', async (req, res) => {
    try {
        const [pinCol] = await db.query(
            `SELECT COUNT(*) AS cnt
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'school_settings'
               AND COLUMN_NAME = 'payment_pin_hash'`
        );
        if (Number(pinCol[0]?.cnt || 0) === 0) {
            await db.query('ALTER TABLE school_settings ADD COLUMN payment_pin_hash VARCHAR(255) NULL AFTER logo_url');
        }
        const [rows] = await db.query('SELECT * FROM school_settings WHERE id = 1');
        const settings = rows.length > 0 ? rows[0] : { nama_sekolah: 'Sekolah Belum Disetting' };
        const role = String(req.session?.userRole || '');
        const branchId = Number(req.session?.branchId || 0);
        if (role === 'admin' && branchId > 0) {
            await ensureBranchSchema();
            const [branchRows] = await db.query(
                'SELECT id, kode_cabang, nama_cabang, alamat, telepon FROM branches WHERE id = ? LIMIT 1',
                [branchId]
            );
            if (branchRows.length) {
                settings.nama_sekolah = branchRows[0].nama_cabang || settings.nama_sekolah;
                settings.alamat_sekolah = branchRows[0].alamat || settings.alamat_sekolah;
                settings.telepon = branchRows[0].telepon || settings.telepon;
                settings.branch_id = branchRows[0].id;
                settings.kode_cabang = branchRows[0].kode_cabang || null;
            }
        }
        settings.payment_pin_configured = Boolean(settings.payment_pin_hash);
        delete settings.payment_pin_hash;
        const period = await getActivePeriod();
        settings.active_school_year = period.activeSchoolYear ? period.activeSchoolYear.name : null;
        settings.active_semester = period.activeSemester ? period.activeSemester.name : null;
        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/settings/payment-pin', async (req, res) => {
    try {
        if (denyIfNotSuper(req, res)) return;
        const pin = String(req.body?.pin || '').trim();
        if (!/^\d{6}$/.test(pin)) {
            return res.status(400).json({ success: false, message: 'PIN harus 6 digit angka.' });
        }

        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(pin, salt);

        await db.query(
            `INSERT INTO school_settings (id, payment_pin_hash)
             VALUES (1, ?)
             ON DUPLICATE KEY UPDATE payment_pin_hash = VALUES(payment_pin_hash)`,
            [hash]
        );

        res.json({ success: true, message: 'PIN transaksi berhasil disimpan.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.put('/settings', async (req, res) => {
    try {
        const role = String(req.session?.userRole || '');
        const branchId = Number(req.session?.branchId || 0);
        const { nama, alamat, telepon, email, website, footer } = req.body;
        if (role === 'admin' && branchId > 0) {
            await ensureBranchSchema();
            const namaCabang = String(nama || '').trim();
            if (!namaCabang) return res.status(400).json({ success: false, message: 'Nama cabang wajib diisi.' });
            await db.query(
                'UPDATE branches SET nama_cabang = ?, alamat = ?, telepon = ? WHERE id = ?',
                [namaCabang, String(alamat || '').trim() || null, String(telepon || '').trim() || null, branchId]
            );
            return res.json({ success: true, message: 'Profil sekolah cabang berhasil disimpan.' });
        }
        if (denyIfNotSuper(req, res)) return;
        const sql = `
            INSERT INTO school_settings (id, nama_sekolah, alamat_sekolah, telepon, email, website, footer_kwitansi) 
            VALUES (1, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
            nama_sekolah=?, alamat_sekolah=?, telepon=?, email=?, website=?, footer_kwitansi=?
        `;
        await db.query(sql, [nama, alamat, telepon, email, website, footer, nama, alamat, telepon, email, website, footer]);
        res.json({ success: true, message: 'Pengaturan sekolah berhasil disimpan.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/academic-years', async (req, res) => {
    try {
        if (denyIfNotSuper(req, res)) return;
        const { years, semesters, activeSchoolYear, activeSemester } = await getActivePeriod();
        res.json({ years, semesters, activeSchoolYear, activeSemester });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/academic-years', async (req, res) => {
    try {
        if (denyIfNotSuper(req, res)) return;
        const name = String(req.body?.name || '').trim();
        if (!name) return res.status(400).json({ success: false, message: 'Nama tahun ajaran wajib diisi.' });
        await ensureAcademicTables();
        await db.query('INSERT INTO school_years (name, is_active) VALUES (?, 0)', [name]);
        res.json({ success: true, message: 'Tahun ajaran ditambahkan.' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ success: false, message: 'Tahun ajaran sudah ada.' });
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/academic-years/:id/activate', async (req, res) => {
    const conn = await db.getConnection();
    try {
        if (denyIfNotSuper(req, res)) return;
        await ensureAcademicTables();
        await conn.beginTransaction();
        await conn.query('UPDATE school_years SET is_active = 0');
        await conn.query('UPDATE school_years SET is_active = 1 WHERE id = ?', [req.params.id]);
        await conn.commit();
        res.json({ success: true, message: 'Tahun ajaran aktif diperbarui.' });
    } catch (err) {
        await conn.rollback();
        res.status(500).json({ success: false, message: err.message });
    } finally {
        conn.release();
    }
});

router.post('/semesters/:id/activate', async (req, res) => {
    const conn = await db.getConnection();
    try {
        if (denyIfNotSuper(req, res)) return;
        await ensureAcademicTables();
        await conn.beginTransaction();
        await conn.query('UPDATE semesters SET is_active = 0');
        await conn.query('UPDATE semesters SET is_active = 1 WHERE id = ?', [req.params.id]);
        await conn.commit();
        res.json({ success: true, message: 'Semester aktif diperbarui.' });
    } catch (err) {
        await conn.rollback();
        res.status(500).json({ success: false, message: err.message });
    } finally {
        conn.release();
    }
});

module.exports = router;
