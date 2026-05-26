const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../../db');

const { validate, isNonEmptyString } = require('../middlewares/validate');
const { createRateLimiter } = require('../middlewares/rateLimit');
const { createDeviceSession, deactivateDeviceSession } = require('../utils/deviceSession');
const { writeAuditLog } = require('../utils/auditLog');

const router = express.Router();

const loginRateLimit = createRateLimiter({
    windowMs: 10 * 60 * 1000,
    max: 8,
    message: 'Terlalu banyak percobaan login. Coba lagi beberapa menit.'
});

async function tableColumnExists(tableName, columnName) {
    const [rows] = await db.query(
        `SELECT COUNT(*) AS cnt
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = ?
           AND COLUMN_NAME = ?`,
        [tableName, columnName]
    );
    return Number(rows[0]?.cnt || 0) > 0;
}

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

router.get('/me', async (req, res) => {
    try {
        if (!req.session || !req.session.userRole || !req.session.userId) return res.status(401).json({ success: false });
        if (req.session.userRole === 'super_admin') {
            await ensureAdminRoleColumn();
            await ensureAdminBranchColumn();
            const [rows] = await db.query('SELECT id, username, nama_lengkap, role, branch_id, created_at FROM admins WHERE id = ?', [req.session.adminId]);
            if (rows.length === 0) return res.status(401).json({ success: false });
            return res.json({
                success: true,
                role: 'super_admin',
                admin: rows[0],
                pin_required: false,
                pin_verified_until: null
            });
        }
        if (req.session.userRole === 'admin' || req.session.userRole === 'wali_kelas' || req.session.userRole === 'guru') {
            await ensureAdminRoleColumn();
            await ensureAdminBranchColumn();
            await ensureHomeroomClassColumn();
            const [rows] = await db.query('SELECT id, username, nama_lengkap, role, branch_id, homeroom_class, created_at FROM admins WHERE id = ?', [req.session.adminId]);
            if (rows.length === 0) return res.status(401).json({ success: false });
            return res.json({
                success: true,
                role: req.session.userRole,
                admin: rows[0],
                pin_required: Boolean(req.session.pinRequired),
                pin_verified_until: req.session.pinVerifiedUntil || null
            });
        }
        if (req.session.userRole === 'siswa') {
            const [rows] = await db.query('SELECT id, nis, nama, kelas, status FROM students WHERE id = ?', [req.session.userId]);
            if (rows.length === 0) return res.status(401).json({ success: false });
            return res.json({ success: true, role: 'siswa', student: rows[0] });
        }
        return res.status(401).json({ success: false });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/student/finance', async (req, res) => {
    try {
        if (!req.session || req.session.userRole !== 'siswa' || !req.session.studentId) {
            return res.status(401).json({ success: false, message: 'Unauthorized (student only)' });
        }

        const studentId = Number(req.session.studentId);
        const branchId = Number(req.session.branchId || 0);
        const branchClause = branchId > 0 ? ' AND branch_id = ? ' : '';
        const branchParams = branchId > 0 ? [branchId] : [];

        const hasTahunMasuk = await tableColumnExists('students', 'tahun_masuk');
        const hasTahunLulus = await tableColumnExists('students', 'tahun_lulus');
        const hasAsalSekolah = await tableColumnExists('students', 'asal_sekolah');
        const studentCols = [
            'id',
            'nis',
            'nama',
            'kelas',
            'status',
            hasTahunMasuk ? 'tahun_masuk' : 'NULL AS tahun_masuk',
            hasTahunLulus ? 'tahun_lulus' : 'NULL AS tahun_lulus',
            hasAsalSekolah ? 'asal_sekolah' : 'NULL AS asal_sekolah'
        ];
        const [studentRows] = await db.query(
            `SELECT ${studentCols.join(', ')}
             FROM students
             WHERE id = ? ${branchClause}
             LIMIT 1`,
            [studentId, ...branchParams]
        );
        if (!studentRows.length) {
            return res.status(404).json({ success: false, message: 'Data siswa tidak ditemukan.' });
        }
        const student = studentRows[0];

        const hasSchoolYearName = await tableColumnExists('bills', 'school_year_name');
        const billSchoolYearSelect = hasSchoolYearName ? "COALESCE(school_year_name, '-') AS school_year_name" : "'-' AS school_year_name";
        const [billRows] = await db.query(
            `SELECT id AS rowId,
                    nama_tagihan AS namaTagihan,
                    COALESCE(total, 0) AS nominal,
                    GREATEST(0, COALESCE(sisa, 0)) AS sisa,
                    ${billSchoolYearSelect},
                    CASE WHEN MONTH(tanggal_buat) BETWEEN 7 AND 12 THEN 'Ganjil' ELSE 'Genap' END AS semester,
                    tanggal_buat
             FROM bills
             WHERE student_id = ? ${branchClause}
             ORDER BY id DESC`,
            [studentId, ...branchParams]
        );

        const hasIsReversed = await tableColumnExists('payments', 'is_reversed');
        const reversedWhere = hasIsReversed ? ' AND COALESCE(is_reversed, 0) = 0 ' : '';
        const [paymentRows] = await db.query(
            `SELECT id,
                    trans_id,
                    tanggal,
                    nama,
                    kelas,
                    jumlah_bayar,
                    penerima,
                    keterangan,
                    bill_id
             FROM payments
             WHERE student_id = ? ${branchClause}
               ${reversedWhere}
             ORDER BY tanggal DESC, id DESC`,
            [studentId, ...branchParams]
        );

        const hasTipeNilai = await tableColumnExists('scholarship_types', 'tipe_nilai');
        const hasJenisNilai = await tableColumnExists('scholarship_types', 'jenis_nilai');
        const hasNilai = await tableColumnExists('scholarship_types', 'nilai');
        const hasNominalPerSiswa = await tableColumnExists('scholarship_types', 'nominal_per_siswa');
        const tipeNilaiSelect = hasTipeNilai
            ? 't.tipe_nilai AS tipe_nilai'
            : hasJenisNilai
                ? 't.jenis_nilai AS tipe_nilai'
                : 'NULL AS tipe_nilai';
        const nilaiSelect = hasNilai
            ? 't.nilai AS nilai'
            : hasNominalPerSiswa
                ? 't.nominal_per_siswa AS nilai'
                : 'NULL AS nilai';
        const [beasiswaRows] = await db.query(
            `SELECT t.nama_beasiswa, ${tipeNilaiSelect}, ${nilaiSelect}, r.tanggal_terima
             FROM scholarship_recipients r
             JOIN scholarship_types t ON t.id = r.type_id
             WHERE r.student_id = ? ${branchClause}
             ORDER BY r.tanggal_terima DESC
             LIMIT 1`,
            [studentId, ...branchParams]
        );

        const totals = {
            totalTagihan: billRows.reduce((sum, row) => sum + Number(row.nominal || 0), 0),
            totalSisa: billRows.reduce((sum, row) => sum + Number(row.sisa || 0), 0),
            totalTerbayar: paymentRows.reduce((sum, row) => sum + Number(row.jumlah_bayar || 0), 0)
        };

        return res.json({
            success: true,
            student,
            bills: billRows,
            payments: paymentRows,
            beasiswa: beasiswaRows[0] || null,
            totals
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

router.post(
    '/login',
    loginRateLimit,
    validate((req) => {
        const errors = [];
        if (!isNonEmptyString(req.body.username)) errors.push('username is required');
        if (!isNonEmptyString(req.body.password)) errors.push('password is required');
        return errors;
    }),
    async (req, res) => {
        try {
            const { username, password } = req.body;
            await ensureAdminRoleColumn();
            await ensureAdminBranchColumn();
            await ensureHomeroomClassColumn();
            await ensureBranchPaymentPinColumn();
            const [rows] = await db.query(
                `SELECT a.*, b.nama_cabang, b.is_active AS branch_is_active, b.payment_pin_hash
                 FROM admins a
                 LEFT JOIN branches b ON b.id = a.branch_id
                 WHERE a.username = ?
                 LIMIT 1`,
                [username]
            );
            if (rows.length > 0) {
                const admin = rows[0];
                const role = admin.role || 'super_admin';
                const ok = await bcrypt.compare(String(password), admin.password);
                if (!ok) {
                    await writeAuditLog({
                        actor_user_id: null,
                        actor_role: null,
                        actor_username: username,
                        branch_id: admin.branch_id || null,
                        action: 'LOGIN_FAILED',
                        entity_type: 'auth',
                        method: 'POST',
                        path: '/api/auth/login',
                        status_code: 401,
                        ip_address: req.ip || null,
                        user_agent: req.headers['user-agent'] || null,
                        detail: { reason: 'invalid_password' }
                    });
                    return res.status(401).json({ success: false, message: 'Username atau password salah.' });
                }
                if ((role === 'admin' || role === 'wali_kelas' || role === 'guru') && !admin.branch_id) {
                    return res.status(403).json({ success: false, message: 'Akun belum terhubung ke cabang.' });
                }
                if ((role === 'admin' || role === 'wali_kelas' || role === 'guru') && Number(admin.branch_is_active) !== 1) {
                    return res.status(403).json({ success: false, message: 'Cabang akun ini sedang nonaktif.' });
                }
                req.session.regenerate((err) => {
                    if (err) return res.status(500).json({ success: false, message: 'Login gagal. Coba lagi.' });
                    req.session.adminId = admin.id;
                    req.session.userId = admin.id;
                    req.session.userRole = role;
                    req.session.branchId = admin.branch_id || null;
                    req.session.adminUsername = admin.username;
                    req.session.homeroomClass = role === 'wali_kelas' ? String(admin.homeroom_class || '').trim() : null;
                    req.session.pinRequired = role === 'admin' ? Boolean(admin.payment_pin_hash) : false;
                    req.session.pinVerifiedUntil = null;
                    (async () => {
                        try {
                            const deviceSessionId = await createDeviceSession({
                                sessionId: req.sessionID || null,
                                userId: admin.id,
                                role,
                                username: admin.username,
                                branchId: admin.branch_id || null,
                                ipAddress: req.ip || null,
                                userAgent: req.headers['user-agent'] || null
                            });
                            req.session.deviceSessionId = deviceSessionId || null;
                            await writeAuditLog({
                                actor_user_id: admin.id,
                                actor_role: role,
                                actor_username: admin.username,
                                branch_id: admin.branch_id || null,
                                action: 'LOGIN_SUCCESS',
                                entity_type: 'auth',
                                entity_id: String(deviceSessionId || ''),
                                method: 'POST',
                                path: '/api/auth/login',
                                status_code: 200,
                                ip_address: req.ip || null,
                                user_agent: req.headers['user-agent'] || null
                            });
                        } catch (_) {}
                        return res.json({
                            success: true,
                            role,
                            admin: {
                                id: admin.id,
                                username: admin.username,
                                nama_lengkap: admin.nama_lengkap || null,
                                role,
                                branch_id: admin.branch_id || null,
                                homeroom_class: admin.homeroom_class || null,
                                created_at: admin.created_at
                            }
                        });
                    })();
                });
                return;
            }

            const [studentRows] = await db.query(
                `SELECT id, nis, username, password, nama, kelas, status, branch_id
                 FROM students
                 WHERE (username = ? OR nis = ?)
                 LIMIT 1`,
                [username, username]
            );
            if (studentRows.length === 0) return res.status(401).json({ success: false, message: 'Username atau password salah.' });

            const student = studentRows[0];
            if (!student.password) return res.status(401).json({ success: false, message: 'Username atau password salah.' });
            const okStudent = await bcrypt.compare(String(password), student.password || '');
            if (!okStudent) {
                await writeAuditLog({
                    actor_user_id: null,
                    actor_role: 'siswa',
                    actor_username: username,
                    branch_id: student.branch_id || null,
                    action: 'LOGIN_FAILED',
                    entity_type: 'auth',
                    method: 'POST',
                    path: '/api/auth/login',
                    status_code: 401,
                    ip_address: req.ip || null,
                    user_agent: req.headers['user-agent'] || null,
                    detail: { reason: 'invalid_password' }
                });
                return res.status(401).json({ success: false, message: 'Username atau password salah.' });
            }

            req.session.regenerate((err) => {
                if (err) return res.status(500).json({ success: false, message: 'Login gagal. Coba lagi.' });
                req.session.userId = student.id;
                req.session.userRole = 'siswa';
                req.session.studentId = student.id;
                req.session.branchId = student.branch_id || null;
                (async () => {
                    try {
                        const deviceSessionId = await createDeviceSession({
                            sessionId: req.sessionID || null,
                            userId: student.id,
                            role: 'siswa',
                            username: student.username || student.nis || null,
                            branchId: student.branch_id || null,
                            ipAddress: req.ip || null,
                            userAgent: req.headers['user-agent'] || null
                        });
                        req.session.deviceSessionId = deviceSessionId || null;
                        await writeAuditLog({
                            actor_user_id: student.id,
                            actor_role: 'siswa',
                            actor_username: student.username || student.nis || null,
                            branch_id: student.branch_id || null,
                            action: 'LOGIN_SUCCESS',
                            entity_type: 'auth',
                            entity_id: String(deviceSessionId || ''),
                            method: 'POST',
                            path: '/api/auth/login',
                            status_code: 200,
                            ip_address: req.ip || null,
                            user_agent: req.headers['user-agent'] || null
                        });
                    } catch (_) {}
                    return res.json({
                        success: true,
                        role: 'siswa',
                        student: { id: student.id, nis: student.nis, nama: student.nama, kelas: student.kelas, status: student.status }
                    });
                })();
            });
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    }
);

router.post('/logout', async (req, res) => {
    const sessionId = Number(req.session?.deviceSessionId || 0);
    const userId = Number(req.session?.userId || 0) || null;
    const userRole = String(req.session?.userRole || '') || null;
    const username = String(req.session?.adminUsername || '') || null;
    const bId = Number(req.session?.branchId || 0) || null;
    if (sessionId > 0) await deactivateDeviceSession(sessionId, 'manual_logout');
    await writeAuditLog({
        actor_user_id: userId,
        actor_role: userRole,
        actor_username: username,
        branch_id: bId,
        action: 'LOGOUT',
        entity_type: 'auth',
        entity_id: sessionId > 0 ? String(sessionId) : null,
        method: 'POST',
        path: '/api/auth/logout',
        status_code: 200,
        ip_address: req.ip || null,
        user_agent: req.headers['user-agent'] || null
    });
    if (!req.session) return res.json({ success: true });
    req.session.destroy(() => res.json({ success: true }));
});

router.get('/pin/status', async (req, res) => {
    try {
        if (!req.session || req.session.userRole !== 'admin' || !req.session.adminId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        const required = Boolean(req.session.pinRequired);
        const verifiedUntil = Number(req.session.pinVerifiedUntil || 0);
        const now = Date.now();
        return res.json({
            success: true,
            required,
            verified: required ? verifiedUntil > now : true,
            pin_verified_until: verifiedUntil || null
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/pin/verify', async (req, res) => {
    try {
        if (!req.session || req.session.userRole !== 'admin' || !req.session.adminId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        const required = Boolean(req.session.pinRequired);
        if (!required) {
            req.session.pinVerifiedUntil = Date.now() + (5 * 60 * 1000);
            return res.json({ success: true, message: 'PIN tidak diwajibkan untuk akun ini.' });
        }
        const pin = String(req.body?.pin || '').trim();
        if (!/^\d{6}$/.test(pin)) {
            return res.status(400).json({ success: false, message: 'PIN harus 6 digit angka.' });
        }

        await ensureBranchPaymentPinColumn();
        const branchId = Number(req.session.branchId || 0);
        if (branchId <= 0) return res.status(400).json({ success: false, message: 'Cabang akun tidak valid.' });

        const [rows] = await db.query('SELECT payment_pin_hash FROM branches WHERE id = ? LIMIT 1', [branchId]);
        const hash = rows[0]?.payment_pin_hash || null;
        if (!hash) return res.status(400).json({ success: false, message: 'PIN transaksi cabang belum diatur.' });

        const ok = await bcrypt.compare(pin, hash);
        if (!ok) return res.status(400).json({ success: false, message: 'PIN tidak valid.' });

        req.session.pinVerifiedUntil = Date.now() + (5 * 60 * 1000);
        return res.json({ success: true, pin_verified_until: req.session.pinVerifiedUntil });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
