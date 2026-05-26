const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../../db');
const { isSuperAdmin } = require('../utils/branchScope');

const { validate, isNonEmptyString } = require('../middlewares/validate');

const router = express.Router();

async function ensureAdminRoleColumn() {
    const [rows] = await db.query(
        `SELECT COUNT(*) AS cnt
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'admins'
           AND COLUMN_NAME = 'role'`
    );
    if (Number(rows[0]?.cnt || 0) === 0) {
        await db.query("ALTER TABLE admins ADD COLUMN role ENUM('super_admin','admin','wali_kelas','guru') NOT NULL DEFAULT 'super_admin' AFTER nama_lengkap");
    } else {
        await db.query("ALTER TABLE admins MODIFY COLUMN role ENUM('super_admin','admin','wali_kelas','guru') NOT NULL DEFAULT 'super_admin'");
    }
}

async function ensureAdminBranchColumn() {
    const [rows] = await db.query(
        `SELECT COUNT(*) AS cnt
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'admins'
           AND COLUMN_NAME = 'branch_id'`
    );
    if (Number(rows[0]?.cnt || 0) === 0) {
        await db.query('ALTER TABLE admins ADD COLUMN branch_id INT NULL AFTER role');
    }
}

async function ensureHomeroomClassColumn() {
    const [rows] = await db.query(
        `SELECT COUNT(*) AS cnt
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'admins'
           AND COLUMN_NAME = 'homeroom_class'`
    );
    if (Number(rows[0]?.cnt || 0) === 0) {
        await db.query('ALTER TABLE admins ADD COLUMN homeroom_class VARCHAR(50) NULL AFTER branch_id');
    }
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

async function ensureBranchPaymentPinColumn() {
    const [rows] = await db.query(
        `SELECT COUNT(*) AS cnt
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'branches'
           AND COLUMN_NAME = 'payment_pin_hash'`
    );
    if (Number(rows[0]?.cnt || 0) === 0) {
        await db.query('ALTER TABLE branches ADD COLUMN payment_pin_hash VARCHAR(255) NULL AFTER telepon');
    }
}

async function ensurePinChangeRequestSchema() {
    await db.query(`
        CREATE TABLE IF NOT EXISTS pin_change_requests (
            id BIGINT NOT NULL AUTO_INCREMENT,
            admin_id INT NOT NULL,
            branch_id INT NOT NULL,
            requested_pin_hash VARCHAR(255) NOT NULL,
            status ENUM('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
            requested_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
            reviewed_at TIMESTAMP NULL DEFAULT NULL,
            reviewed_by INT NULL,
            review_note VARCHAR(255) NULL,
            PRIMARY KEY (id),
            KEY idx_pin_req_status (status),
            KEY idx_pin_req_admin (admin_id),
            KEY idx_pin_req_branch (branch_id),
            KEY idx_pin_req_reviewed_by (reviewed_by)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
}

function denyIfNotSuper(req, res) {
    if (!isSuperAdmin(req)) {
        res.status(403).json({ success: false, message: 'Hanya super admin yang boleh mengelola cabang/admin.' });
        return true;
    }
    return false;
}

function isAdminSession(req) {
    const role = String(req.session?.userRole || '');
    return role === 'admin' || role === 'super_admin' || role === 'wali_kelas' || role === 'guru';
}

router.get('/users', async (req, res) => {
    try {
        if (denyIfNotSuper(req, res)) return;
        await ensureAdminRoleColumn();
        await ensureAdminBranchColumn();
        await ensureHomeroomClassColumn();
        await ensureBranchSchema();
        const [rows] = await db.query(`
            SELECT a.id, a.username, a.nama_lengkap, a.role, a.branch_id, a.homeroom_class, b.kode_cabang, b.nama_cabang, a.created_at
            FROM admins a
            LEFT JOIN branches b ON b.id = a.branch_id
            ORDER BY a.id ASC
        `);
        res.json({ success: true, users: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/branches', async (req, res) => {
    try {
        if (denyIfNotSuper(req, res)) return;
        await ensureBranchSchema();
        const [rows] = await db.query("SELECT id, kode_cabang, nama_cabang, alamat, telepon, is_active, created_at FROM branches WHERE id <> 1 ORDER BY id ASC");
        res.json({ success: true, branches: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/branches', async (req, res) => {
    try {
        if (denyIfNotSuper(req, res)) return;
        await ensureBranchSchema();
        const kode = String(req.body?.kode_cabang || '').trim() || `CBG-${Date.now()}`;
        const nama = String(req.body?.nama_cabang || '').trim();
        const alamat = req.body?.alamat || null;
        const telepon = req.body?.telepon || null;
        if (!nama) return res.status(400).json({ success: false, message: 'Nama cabang wajib diisi.' });

        const [result] = await db.query(
            'INSERT INTO branches (kode_cabang, nama_cabang, alamat, telepon, is_active) VALUES (?, ?, ?, ?, 1)',
            [kode, nama, alamat, telepon]
        );
        res.json({ success: true, id: result.insertId });
    } catch (err) {
        if (err && err.code === 'ER_DUP_ENTRY') return res.status(400).json({ success: false, message: 'Kode/nama cabang sudah dipakai.' });
        res.status(500).json({ success: false, message: err.message });
    }
});

router.put('/branches/:id', async (req, res) => {
    try {
        if (denyIfNotSuper(req, res)) return;
        await ensureBranchSchema();
        const id = req.params.id;
        const kode = String(req.body?.kode_cabang || '').trim();
        const nama = String(req.body?.nama_cabang || '').trim();
        const alamat = req.body?.alamat || null;
        const telepon = req.body?.telepon || null;
        const isActive = Number(req.body?.is_active) === 0 ? 0 : 1;
        if (!kode || !nama) return res.status(400).json({ success: false, message: 'Kode dan nama cabang wajib diisi.' });

        await db.query(
            'UPDATE branches SET kode_cabang = ?, nama_cabang = ?, alamat = ?, telepon = ?, is_active = ? WHERE id = ?',
            [kode, nama, alamat, telepon, isActive, id]
        );
        res.json({ success: true });
    } catch (err) {
        if (err && err.code === 'ER_DUP_ENTRY') return res.status(400).json({ success: false, message: 'Kode/nama cabang sudah dipakai.' });
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post(
    '/users',
    validate((req) => {
        const errors = [];
        if (!isNonEmptyString(req.body.username)) errors.push('username is required');
        if (!isNonEmptyString(req.body.password)) errors.push('password is required');
        return errors;
    }),
    async (req, res) => {
        try {
            if (denyIfNotSuper(req, res)) return;
            await ensureAdminRoleColumn();
            await ensureAdminBranchColumn();
            await ensureHomeroomClassColumn();
            await ensureBranchSchema();
            const { username, password, nama_lengkap, role, branch_name, branch_code, branch_address, branch_phone, branch_id } = req.body;
            const roleRaw = String(role || 'admin').toLowerCase();
            const targetRole = roleRaw === 'super_admin'
                ? 'super_admin'
                : (roleRaw === 'wali_kelas' ? 'wali_kelas' : (roleRaw === 'guru' ? 'guru' : 'admin'));
            const homeroomClass = String(req.body?.homeroom_class || '').trim() || null;

            const salt = await bcrypt.genSalt(10);
            const hashed = await bcrypt.hash(String(password), salt);
            let branchId = null;

            if (targetRole === 'admin' || targetRole === 'wali_kelas' || targetRole === 'guru') {
                const existingBranchId = Number(branch_id || 0);
                if (existingBranchId > 0) {
                    const [exists] = await db.query('SELECT id FROM branches WHERE id = ? LIMIT 1', [existingBranchId]);
                    if (!exists.length) return res.status(400).json({ success: false, message: 'Cabang tidak ditemukan.' });
                    branchId = existingBranchId;
                } else {
                    if (!String(branch_name || '').trim()) {
                        return res.status(400).json({ success: false, message: 'Nama cabang wajib diisi untuk role admin.' });
                    }
                    const generatedCode = String(branch_code || '').trim() || `CBG-${Date.now()}`;
                    const [branchResult] = await db.query(
                        'INSERT INTO branches (kode_cabang, nama_cabang, alamat, telepon, is_active) VALUES (?, ?, ?, ?, 1)',
                        [generatedCode, String(branch_name).trim(), branch_address || null, branch_phone || null]
                    );
                    branchId = branchResult.insertId;
                }
            }
            if (targetRole === 'wali_kelas' && !homeroomClass) {
                return res.status(400).json({ success: false, message: 'Kelas wali wajib diisi untuk role wali_kelas.' });
            }

            const [result] = await db.query('INSERT INTO admins (username, password, nama_lengkap, role, branch_id, homeroom_class) VALUES (?, ?, ?, ?, ?, ?)', [
                username,
                hashed,
                nama_lengkap || null,
                targetRole,
                branchId,
                targetRole === 'wali_kelas' ? homeroomClass : null
            ]);
            res.json({ success: true, id: result.insertId });
        } catch (err) {
            if (err && err.code === 'ER_DUP_ENTRY') return res.status(400).json({ success: false, message: 'Username sudah dipakai.' });
            res.status(500).json({ success: false, message: err.message });
        }
    }
);

router.post('/users/:id/assign-branch', async (req, res) => {
    try {
        if (denyIfNotSuper(req, res)) return;
        await ensureAdminRoleColumn();
        await ensureAdminBranchColumn();
        await ensureHomeroomClassColumn();
        await ensureBranchSchema();

        const userId = req.params.id;
        const roleRaw = String(req.body?.role || 'admin').toLowerCase();
        const role = roleRaw === 'super_admin'
            ? 'super_admin'
            : (roleRaw === 'wali_kelas' ? 'wali_kelas' : (roleRaw === 'guru' ? 'guru' : 'admin'));
        const branchId = Number(req.body?.branch_id || 0);
        const homeroomClass = String(req.body?.homeroom_class || '').trim() || null;

        if ((role === 'admin' || role === 'wali_kelas' || role === 'guru') && branchId <= 0) {
            return res.status(400).json({ success: false, message: 'Role ini wajib punya cabang.' });
        }
        if (role === 'admin' || role === 'wali_kelas' || role === 'guru') {
            const [branchRows] = await db.query('SELECT id FROM branches WHERE id = ? LIMIT 1', [branchId]);
            if (!branchRows.length) return res.status(400).json({ success: false, message: 'Cabang tidak ditemukan.' });
        }
        if (role === 'wali_kelas' && !homeroomClass) {
            return res.status(400).json({ success: false, message: 'Kelas wali wajib diisi untuk role wali_kelas.' });
        }

        await db.query(
            'UPDATE admins SET role = ?, branch_id = ?, homeroom_class = ? WHERE id = ?',
            [role, (role === 'admin' || role === 'wali_kelas' || role === 'guru') ? branchId : null, role === 'wali_kelas' ? homeroomClass : null, userId]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.put(
    '/users/:id',
    validate((req) => {
        const errors = [];
        if (!isNonEmptyString(req.body.username)) errors.push('username is required');
        return errors;
    }),
    async (req, res) => {
        try {
            if (denyIfNotSuper(req, res)) return;
            await ensureAdminRoleColumn();
            await ensureAdminBranchColumn();
            await ensureHomeroomClassColumn();
            const id = req.params.id;
            const { username, nama_lengkap, password } = req.body;

            if (password && String(password).trim() !== '') {
                const salt = await bcrypt.genSalt(10);
                const hashed = await bcrypt.hash(String(password), salt);
                await db.query('UPDATE admins SET username = ?, nama_lengkap = ?, password = ? WHERE id = ?', [
                    username,
                    nama_lengkap || null,
                    hashed,
                    id
                ]);
            } else {
                await db.query('UPDATE admins SET username = ?, nama_lengkap = ? WHERE id = ?', [username, nama_lengkap || null, id]);
            }

            res.json({ success: true });
        } catch (err) {
            if (err && err.code === 'ER_DUP_ENTRY') return res.status(400).json({ success: false, message: 'Username sudah dipakai.' });
            res.status(500).json({ success: false, message: err.message });
        }
    }
);

router.get('/profile/me', async (req, res) => {
    try {
        if (!isAdminSession(req) || !req.session?.adminId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        await ensureAdminRoleColumn();
        await ensureAdminBranchColumn();
        await ensureBranchSchema();
        await ensureBranchPaymentPinColumn();
        await ensurePinChangeRequestSchema();
        const [rows] = await db.query(
            `SELECT a.id, a.username, a.nama_lengkap, a.role, a.branch_id,
                    b.kode_cabang, b.nama_cabang, b.alamat, b.telepon, b.is_active,
                    b.payment_pin_hash
             FROM admins a
             LEFT JOIN branches b ON b.id = a.branch_id
             WHERE a.id = ?
             LIMIT 1`,
            [req.session.adminId]
        );
        if (!rows.length) return res.status(404).json({ success: false, message: 'Profil admin tidak ditemukan.' });
        const row = rows[0];
        let pendingPinChange = null;
        if (String(row.role || '') === 'admin' && Number(row.branch_id || 0) > 0) {
            const [pendingRows] = await db.query(
                `SELECT id, requested_at
                 FROM pin_change_requests
                 WHERE admin_id = ? AND branch_id = ? AND status = 'pending'
                 ORDER BY id DESC
                 LIMIT 1`,
                [row.id, row.branch_id]
            );
            pendingPinChange = pendingRows[0] || null;
        }
        return res.json({
            success: true,
            profile: {
                id: row.id,
                username: row.username,
                nama_lengkap: row.nama_lengkap,
                role: row.role,
                branch_id: row.branch_id,
                kode_cabang: row.kode_cabang || null,
                nama_cabang: row.nama_cabang || null,
                alamat: row.alamat || null,
                telepon: row.telepon || null,
                is_active: row.is_active,
                payment_pin_configured: Boolean(row.payment_pin_hash),
                pin_change_pending: Boolean(pendingPinChange),
                pin_change_requested_at: pendingPinChange?.requested_at || null
            }
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

router.put('/profile/account', async (req, res) => {
    try {
        if (!isAdminSession(req) || !req.session?.adminId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        const username = String(req.body?.username || '').trim();
        const namaLengkap = String(req.body?.nama_lengkap || '').trim();
        const currentPassword = String(req.body?.current_password || '');
        const newPassword = String(req.body?.new_password || '');
        if (!username) return res.status(400).json({ success: false, message: 'Username wajib diisi.' });
        if (newPassword && newPassword.length < 6) {
            return res.status(400).json({ success: false, message: 'Password baru minimal 6 karakter.' });
        }

        const [rows] = await db.query('SELECT id, password FROM admins WHERE id = ? LIMIT 1', [req.session.adminId]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'Akun admin tidak ditemukan.' });

        if (newPassword) {
            if (!currentPassword) {
                return res.status(400).json({ success: false, message: 'Password saat ini wajib diisi untuk ganti password.' });
            }
            const ok = await bcrypt.compare(currentPassword, rows[0].password || '');
            if (!ok) return res.status(400).json({ success: false, message: 'Password saat ini tidak valid.' });
            const salt = await bcrypt.genSalt(10);
            const hashed = await bcrypt.hash(newPassword, salt);
            await db.query('UPDATE admins SET username = ?, nama_lengkap = ?, password = ? WHERE id = ?', [
                username,
                namaLengkap || null,
                hashed,
                req.session.adminId
            ]);
        } else {
            await db.query('UPDATE admins SET username = ?, nama_lengkap = ? WHERE id = ?', [
                username,
                namaLengkap || null,
                req.session.adminId
            ]);
        }

        return res.json({ success: true, message: 'Profil akun berhasil diperbarui.' });
    } catch (err) {
        if (err && err.code === 'ER_DUP_ENTRY') return res.status(400).json({ success: false, message: 'Username sudah dipakai.' });
        return res.status(500).json({ success: false, message: err.message });
    }
});

router.put('/profile/branch', async (req, res) => {
    try {
        const role = String(req.session?.userRole || '');
        const branchId = Number(req.session?.branchId || 0);
        if (role !== 'admin' || branchId <= 0) {
            return res.status(403).json({ success: false, message: 'Hanya admin cabang yang boleh mengubah profil cabang.' });
        }
        await ensureBranchSchema();
        const namaCabang = String(req.body?.nama_cabang || '').trim();
        const alamat = String(req.body?.alamat || '').trim();
        const telepon = String(req.body?.telepon || '').trim();
        if (!namaCabang) return res.status(400).json({ success: false, message: 'Nama cabang wajib diisi.' });

        await db.query('UPDATE branches SET nama_cabang = ?, alamat = ?, telepon = ? WHERE id = ?', [
            namaCabang,
            alamat || null,
            telepon || null,
            branchId
        ]);
        return res.json({ success: true, message: 'Profil cabang berhasil diperbarui.' });
    } catch (err) {
        if (err && err.code === 'ER_DUP_ENTRY') return res.status(400).json({ success: false, message: 'Nama cabang sudah dipakai.' });
        return res.status(500).json({ success: false, message: err.message });
    }
});

router.put('/profile/payment-pin', async (req, res) => {
    try {
        const role = String(req.session?.userRole || '');
        const branchId = Number(req.session?.branchId || 0);
        if (role !== 'admin' || branchId <= 0) {
            return res.status(403).json({ success: false, message: 'Hanya admin cabang yang boleh mengatur PIN transaksi.' });
        }
        await ensureBranchSchema();
        await ensureBranchPaymentPinColumn();
        await ensurePinChangeRequestSchema();
        const pin = String(req.body?.pin || '').trim();
        const confirmPin = String(req.body?.confirm_pin || '').trim();
        const oldPin = String(req.body?.old_pin || '').trim();
        const currentPassword = String(req.body?.current_password || '');
        if (!/^\d{6}$/.test(pin)) {
            return res.status(400).json({ success: false, message: 'PIN harus 6 digit angka.' });
        }
        if (pin !== confirmPin) {
            return res.status(400).json({ success: false, message: 'Konfirmasi PIN tidak sama.' });
        }
        if (!currentPassword) {
            return res.status(400).json({ success: false, message: 'Password akun saat ini wajib diisi.' });
        }

        const [adminRows] = await db.query(
            'SELECT id, password FROM admins WHERE id = ? AND role = ? AND branch_id = ? LIMIT 1',
            [req.session.adminId, 'admin', branchId]
        );
        if (!adminRows.length) {
            return res.status(404).json({ success: false, message: 'Akun admin tidak ditemukan.' });
        }
        const passOk = await bcrypt.compare(currentPassword, adminRows[0].password || '');
        if (!passOk) {
            return res.status(400).json({ success: false, message: 'Password akun saat ini tidak valid.' });
        }

        const [branchRows] = await db.query('SELECT payment_pin_hash FROM branches WHERE id = ? LIMIT 1', [branchId]);
        const currentPinHash = branchRows[0]?.payment_pin_hash || null;
        if (currentPinHash) {
            if (!/^\d{6}$/.test(oldPin)) {
                return res.status(400).json({ success: false, message: 'PIN lama wajib diisi (6 digit).' });
            }
            const oldPinOk = await bcrypt.compare(oldPin, currentPinHash);
            if (!oldPinOk) {
                return res.status(400).json({ success: false, message: 'PIN lama tidak valid.' });
            }
        }

        const [pendingRows] = await db.query(
            `SELECT id
             FROM pin_change_requests
             WHERE admin_id = ? AND branch_id = ? AND status = 'pending'
             ORDER BY id DESC
             LIMIT 1`,
            [req.session.adminId, branchId]
        );
        if (pendingRows.length) {
            return res.status(400).json({
                success: false,
                message: 'Masih ada permintaan perubahan PIN yang menunggu approval super admin.'
            });
        }

        const salt = await bcrypt.genSalt(10);
        const newPinHash = await bcrypt.hash(pin, salt);
        await db.query(
            `INSERT INTO pin_change_requests
             (admin_id, branch_id, requested_pin_hash, status)
             VALUES (?, ?, ?, 'pending')`,
            [req.session.adminId, branchId, newPinHash]
        );
        return res.json({
            success: true,
            message: 'Permintaan perubahan PIN dikirim. Menunggu approval super admin.'
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/pin-change-requests', async (req, res) => {
    try {
        if (denyIfNotSuper(req, res)) return;
        await ensurePinChangeRequestSchema();
        const status = String(req.query?.status || 'pending').trim().toLowerCase();
        const allowed = new Set(['pending', 'approved', 'rejected', 'cancelled', 'all']);
        const target = allowed.has(status) ? status : 'pending';
        const where = target === 'all' ? '' : 'WHERE r.status = ?';
        const params = target === 'all' ? [] : [target];
        const [rows] = await db.query(
            `SELECT r.id, r.admin_id, r.branch_id, r.status, r.requested_at, r.reviewed_at, r.review_note,
                    a.username AS admin_username, a.nama_lengkap AS admin_name,
                    b.kode_cabang, b.nama_cabang,
                    rv.username AS reviewed_by_username, rv.nama_lengkap AS reviewed_by_name
             FROM pin_change_requests r
             JOIN admins a ON a.id = r.admin_id
             JOIN branches b ON b.id = r.branch_id
             LEFT JOIN admins rv ON rv.id = r.reviewed_by
             ${where}
             ORDER BY r.id DESC`,
            params
        );
        return res.json({ success: true, rows });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/pin-change-requests/:id/approve', async (req, res) => {
    const conn = await db.getConnection();
    try {
        if (denyIfNotSuper(req, res)) return;
        await ensurePinChangeRequestSchema();
        await ensureBranchPaymentPinColumn();
        const id = Number(req.params.id);
        if (!Number.isFinite(id) || id <= 0) {
            return res.status(400).json({ success: false, message: 'ID request tidak valid.' });
        }
        await conn.beginTransaction();
        const [reqRows] = await conn.query(
            `SELECT id, admin_id, branch_id, requested_pin_hash, status
             FROM pin_change_requests
             WHERE id = ?
             FOR UPDATE`,
            [id]
        );
        if (!reqRows.length) {
            await conn.rollback();
            return res.status(404).json({ success: false, message: 'Request tidak ditemukan.' });
        }
        const reqRow = reqRows[0];
        if (String(reqRow.status) !== 'pending') {
            await conn.rollback();
            return res.status(400).json({ success: false, message: 'Request sudah diproses.' });
        }
        await conn.query('UPDATE branches SET payment_pin_hash = ? WHERE id = ?', [reqRow.requested_pin_hash, reqRow.branch_id]);
        await conn.query(
            `UPDATE pin_change_requests
             SET status = 'approved',
                 reviewed_at = NOW(),
                 reviewed_by = ?,
                 review_note = ?
             WHERE id = ?`,
            [req.session.adminId || null, String(req.body?.note || '').trim() || null, id]
        );
        await conn.commit();
        return res.json({ success: true, message: 'Permintaan perubahan PIN disetujui.' });
    } catch (err) {
        try { await conn.rollback(); } catch (_) {}
        return res.status(500).json({ success: false, message: err.message });
    } finally {
        conn.release();
    }
});

router.post('/pin-change-requests/:id/reject', async (req, res) => {
    try {
        if (denyIfNotSuper(req, res)) return;
        await ensurePinChangeRequestSchema();
        const id = Number(req.params.id);
        if (!Number.isFinite(id) || id <= 0) {
            return res.status(400).json({ success: false, message: 'ID request tidak valid.' });
        }
        const [rows] = await db.query('SELECT id, status FROM pin_change_requests WHERE id = ? LIMIT 1', [id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'Request tidak ditemukan.' });
        if (String(rows[0].status) !== 'pending') return res.status(400).json({ success: false, message: 'Request sudah diproses.' });
        await db.query(
            `UPDATE pin_change_requests
             SET status = 'rejected',
                 reviewed_at = NOW(),
                 reviewed_by = ?,
                 review_note = ?
             WHERE id = ?`,
            [req.session.adminId || null, String(req.body?.note || '').trim() || null, id]
        );
        return res.json({ success: true, message: 'Permintaan perubahan PIN ditolak.' });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
