const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../../db');

const router = express.Router();

const columnCache = new Map();

function ok(res, data = {}, meta = undefined) {
    const payload = { success: true, data };
    if (meta !== undefined) payload.meta = meta;
    return res.json(payload);
}

function fail(res, status, code, message) {
    return res.status(status).json({ success: false, code, message });
}

function role(req) {
    return String(req?.session?.userRole || '');
}

function isAdmin(req) {
    return role(req) === 'admin';
}

function isSuperAdmin(req) {
    return role(req) === 'super_admin';
}

function isStudent(req) {
    return role(req) === 'siswa';
}

function branchId(req) {
    const n = Number(req?.session?.branchId || 0);
    return Number.isFinite(n) && n > 0 ? n : null;
}

function requireMobileAuth(req, res, next) {
    if (!req.session || !req.session.userRole || !req.session.userId) {
        return fail(res, 401, 'AUTH_REQUIRED', 'Unauthorized');
    }
    return next();
}

async function hasColumn(table, column) {
    const key = `${table}.${column}`;
    if (columnCache.has(key)) return columnCache.get(key);
    const [rows] = await db.query(
        `SELECT COUNT(*) AS cnt
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = ?
           AND COLUMN_NAME = ?`,
        [table, column]
    );
    const exists = Number(rows[0]?.cnt || 0) > 0;
    columnCache.set(key, exists);
    return exists;
}

async function ensureAdminRoleColumn() {
    if (!(await hasColumn('admins', 'role'))) {
        await db.query("ALTER TABLE admins ADD COLUMN role ENUM('super_admin','admin','wali_kelas','guru') NOT NULL DEFAULT 'super_admin' AFTER nama_lengkap");
        columnCache.set('admins.role', true);
    } else {
        await db.query("ALTER TABLE admins MODIFY COLUMN role ENUM('super_admin','admin','wali_kelas','guru') NOT NULL DEFAULT 'super_admin'");
    }
}

async function ensureAdminBranchColumn() {
    if (!(await hasColumn('admins', 'branch_id'))) {
        await db.query('ALTER TABLE admins ADD COLUMN branch_id INT NULL AFTER role');
        columnCache.set('admins.branch_id', true);
    }
}

async function ensureBranchPaymentPinColumn() {
    if (!(await hasColumn('branches', 'payment_pin_hash'))) {
        await db.query('ALTER TABLE branches ADD COLUMN payment_pin_hash VARCHAR(255) NULL AFTER telepon');
        columnCache.set('branches.payment_pin_hash', true);
    }
}

function scopedClause(req, alias = '') {
    const prefix = alias ? `${alias}.` : '';
    if (isAdmin(req)) {
        const bid = branchId(req);
        return {
            clause: ` AND ${prefix}branch_id = ?`,
            params: [bid]
        };
    }
    return { clause: '', params: [] };
}

async function verifyBranchAdminPin(req, pinInput) {
    if (!isAdmin(req)) return { ok: true };
    const pin = String(pinInput || '').trim();
    if (!/^\d{6}$/.test(pin)) return { ok: false, message: 'PIN harus 6 digit angka.' };
    await ensureBranchPaymentPinColumn();
    const bid = branchId(req);
    if (!bid) return { ok: false, message: 'Akun admin belum terhubung cabang.' };
    const [rows] = await db.query('SELECT payment_pin_hash FROM branches WHERE id = ? LIMIT 1', [bid]);
    const hash = rows[0]?.payment_pin_hash || null;
    if (!hash) return { ok: false, message: 'PIN transaksi belum diatur di profil cabang.' };
    const matched = await bcrypt.compare(pin, hash);
    if (!matched) return { ok: false, message: 'PIN transaksi tidak valid.' };
    req.session.pinVerifiedUntil = Date.now() + 5 * 60 * 1000;
    return { ok: true, pin_verified_until: req.session.pinVerifiedUntil };
}

router.post('/auth/login', async (req, res) => {
    try {
        const username = String(req.body?.username || '').trim();
        const password = String(req.body?.password || '');
        if (!username || !password) return fail(res, 400, 'VALIDATION_ERROR', 'username dan password wajib diisi.');

        await ensureAdminRoleColumn();
        await ensureAdminBranchColumn();
        await ensureBranchPaymentPinColumn();

        const [admins] = await db.query(
            `SELECT a.*, b.nama_cabang, b.is_active AS branch_is_active, b.payment_pin_hash
             FROM admins a
             LEFT JOIN branches b ON b.id = a.branch_id
             WHERE a.username = ?
             LIMIT 1`,
            [username]
        );
        if (admins.length) {
            const admin = admins[0];
            const okPwd = await bcrypt.compare(password, admin.password || '');
            if (!okPwd) return fail(res, 401, 'AUTH_INVALID', 'Username atau password salah.');

            const userRole = admin.role || 'super_admin';
            if (userRole === 'admin' && !admin.branch_id) {
                return fail(res, 403, 'FORBIDDEN_BRANCH_SCOPE', 'Akun admin belum terhubung ke cabang.');
            }
            if (userRole === 'admin' && Number(admin.branch_is_active) !== 1) {
                return fail(res, 403, 'FORBIDDEN_BRANCH_SCOPE', 'Cabang akun ini sedang nonaktif.');
            }

            return req.session.regenerate((err) => {
                if (err) return fail(res, 500, 'INTERNAL_ERROR', 'Login gagal.');
                req.session.adminId = admin.id;
                req.session.userId = admin.id;
                req.session.userRole = userRole;
                req.session.branchId = admin.branch_id || null;
                req.session.pinRequired = userRole === 'admin' ? Boolean(admin.payment_pin_hash) : false;
                req.session.pinVerifiedUntil = null;
                return ok(res, {
                    role: userRole,
                    user: {
                        id: admin.id,
                        username: admin.username,
                        nama_lengkap: admin.nama_lengkap || null,
                        branch_id: admin.branch_id || null,
                        branch_name: admin.nama_cabang || null
                    },
                    pin_required: req.session.pinRequired
                });
            });
        }

        const [students] = await db.query(
            `SELECT id, nis, username, password, nama, kelas, status, branch_id
             FROM students
             WHERE (username = ? OR nis = ?)
             LIMIT 1`,
            [username, username]
        );
        if (!students.length) return fail(res, 401, 'AUTH_INVALID', 'Username atau password salah.');
        const student = students[0];
        const okPwd = await bcrypt.compare(password, student.password || '');
        if (!okPwd) return fail(res, 401, 'AUTH_INVALID', 'Username atau password salah.');

        return req.session.regenerate((err) => {
            if (err) return fail(res, 500, 'INTERNAL_ERROR', 'Login gagal.');
            req.session.userId = student.id;
            req.session.userRole = 'siswa';
            req.session.studentId = student.id;
            req.session.branchId = student.branch_id || null;
            return ok(res, {
                role: 'siswa',
                user: {
                    id: student.id,
                    nis: student.nis,
                    username: student.username || null,
                    nama: student.nama,
                    kelas: student.kelas,
                    status: student.status
                },
                pin_required: false
            });
        });
    } catch (err) {
        return fail(res, 500, 'INTERNAL_ERROR', err.message);
    }
});

router.post('/auth/logout', async (req, res) => {
    if (!req.session) return ok(res, { logged_out: true });
    return req.session.destroy(() => ok(res, { logged_out: true }));
});

router.get('/auth/me', requireMobileAuth, async (req, res) => {
    try {
        if (isStudent(req)) {
            const [rows] = await db.query('SELECT id, nis, nama, kelas, status, branch_id FROM students WHERE id = ? LIMIT 1', [req.session.studentId]);
            if (!rows.length) return fail(res, 401, 'AUTH_INVALID', 'Session tidak valid.');
            return ok(res, {
                role: 'siswa',
                user: rows[0],
                pin_required: false
            });
        }

        const [rows] = await db.query(
            'SELECT id, username, nama_lengkap, role, branch_id, created_at FROM admins WHERE id = ? LIMIT 1',
            [req.session.adminId]
        );
        if (!rows.length) return fail(res, 401, 'AUTH_INVALID', 'Session tidak valid.');
        const r = rows[0];
        return ok(res, {
            role: r.role || req.session.userRole || 'admin',
            user: r,
            pin_required: Boolean(req.session.pinRequired),
            pin_verified_until: req.session.pinVerifiedUntil || null
        });
    } catch (err) {
        return fail(res, 500, 'INTERNAL_ERROR', err.message);
    }
});

router.get('/auth/pin/status', requireMobileAuth, async (req, res) => {
    if (!isAdmin(req)) return fail(res, 403, 'FORBIDDEN_ROLE', 'Hanya admin cabang.');
    const verifiedUntil = Number(req.session.pinVerifiedUntil || 0);
    const now = Date.now();
    return ok(res, {
        required: Boolean(req.session.pinRequired),
        verified: verifiedUntil > now,
        pin_verified_until: verifiedUntil || null
    });
});

router.post('/auth/pin/verify', requireMobileAuth, async (req, res) => {
    try {
        if (!isAdmin(req)) return fail(res, 403, 'FORBIDDEN_ROLE', 'Hanya admin cabang.');
        const result = await verifyBranchAdminPin(req, req.body?.pin);
        if (!result.ok) return fail(res, 400, 'PIN_INVALID', result.message);
        return ok(res, { pin_verified_until: result.pin_verified_until });
    } catch (err) {
        return fail(res, 500, 'INTERNAL_ERROR', err.message);
    }
});

router.get('/dashboard', requireMobileAuth, async (req, res) => {
    try {
        if (isStudent(req)) {
            const sid = Number(req.session.studentId || 0);
            const [billRows] = await db.query(
                `SELECT COALESCE(SUM(total),0) AS total_tagihan,
                        COALESCE(SUM(GREATEST(0,sisa)),0) AS total_sisa
                 FROM bills WHERE student_id = ?`,
                [sid]
            );
            const hasIsReversed = await hasColumn('payments', 'is_reversed');
            const reversedWhere = hasIsReversed ? ' AND COALESCE(is_reversed,0)=0' : '';
            const [payRows] = await db.query(
                `SELECT COALESCE(SUM(jumlah_bayar),0) AS total_terbayar
                 FROM payments WHERE student_id = ?${reversedWhere}`,
                [sid]
            );
            return ok(res, {
                scope: 'student',
                total_tagihan: Number(billRows[0]?.total_tagihan || 0),
                total_terbayar: Number(payRows[0]?.total_terbayar || 0),
                total_sisa: Number(billRows[0]?.total_sisa || 0)
            });
        }

        const scope = scopedClause(req, 'b');
        const [bill] = await db.query(
            `SELECT COALESCE(SUM(b.total),0) AS total_tagihan,
                    COALESCE(SUM(GREATEST(0,b.sisa)),0) AS total_sisa
             FROM bills b
             WHERE 1=1 ${scope.clause}`,
            [...scope.params]
        );
        const payScope = scopedClause(req, 'p');
        const hasIsReversed = await hasColumn('payments', 'is_reversed');
        const reversedWhere = hasIsReversed ? ' AND COALESCE(p.is_reversed,0)=0' : '';
        const [pay] = await db.query(
            `SELECT COALESCE(SUM(p.jumlah_bayar),0) AS total_pemasukan
             FROM payments p
             WHERE 1=1 ${payScope.clause}${reversedWhere}`,
            [...payScope.params]
        );
        const studentScope = scopedClause(req, 's');
        const [stu] = await db.query(
            `SELECT COUNT(*) AS total_siswa_aktif
             FROM students s
             WHERE LOWER(TRIM(COALESCE(s.status,'')))='aktif' ${studentScope.clause}`,
            [...studentScope.params]
        );

        return ok(res, {
            scope: isSuperAdmin(req) ? 'global' : 'branch',
            total_siswa_aktif: Number(stu[0]?.total_siswa_aktif || 0),
            total_pemasukan: Number(pay[0]?.total_pemasukan || 0),
            total_tagihan: Number(bill[0]?.total_tagihan || 0),
            total_sisa_tagihan: Number(bill[0]?.total_sisa || 0)
        });
    } catch (err) {
        return fail(res, 500, 'INTERNAL_ERROR', err.message);
    }
});

router.get('/billing/students', requireMobileAuth, async (req, res) => {
    try {
        if (isStudent(req)) return fail(res, 403, 'FORBIDDEN_ROLE', 'Role siswa tidak memiliki akses.');
        const search = String(req.query.search || '').trim().toLowerCase();
        const kelas = String(req.query.kelas || '').trim();
        const status = String(req.query.status || '').trim().toLowerCase();
        const page = Math.max(1, Number(req.query.page || 1));
        const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
        const offset = (page - 1) * limit;

        const scope = scopedClause(req, 's');
        const where = [`1=1 ${scope.clause}`];
        const params = [...scope.params];
        if (search) {
            where.push('(LOWER(s.nama) LIKE ? OR LOWER(COALESCE(s.kelas, "")) LIKE ? OR LOWER(COALESCE(s.nis, "")) LIKE ?)');
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }
        if (kelas) {
            where.push('s.kelas = ?');
            params.push(kelas);
        }
        if (status) {
            where.push('LOWER(TRIM(COALESCE(s.status, ""))) = ?');
            params.push(status);
        }

        const [rows] = await db.query(
            `SELECT s.id AS student_id, s.nis, s.nama, s.kelas, s.status, s.tahun_masuk,
                    COALESCE(s.tahun_lulus, NULL) AS tahun_lulus,
                    COALESCE(SUM(b.total), 0) AS total_tagihan,
                    COALESCE(SUM(b.terbayar), 0) AS total_terbayar,
                    COALESCE(SUM(GREATEST(0,b.sisa)), 0) AS total_sisa
             FROM students s
             LEFT JOIN bills b ON b.student_id = s.id
             WHERE ${where.join(' AND ')}
             GROUP BY s.id, s.nis, s.nama, s.kelas, s.status, s.tahun_masuk, s.tahun_lulus
             ORDER BY s.nama ASC
             LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );
        const [countRows] = await db.query(
            `SELECT COUNT(*) AS total
             FROM students s
             WHERE ${where.join(' AND ')}`,
            [...params]
        );
        return ok(res, rows, { page, limit, total: Number(countRows[0]?.total || 0) });
    } catch (err) {
        return fail(res, 500, 'INTERNAL_ERROR', err.message);
    }
});

router.get('/billing/student/:studentId/summary', requireMobileAuth, async (req, res) => {
    try {
        const studentId = Number(req.params.studentId || 0);
        if (!studentId) return fail(res, 400, 'VALIDATION_ERROR', 'studentId tidak valid.');
        if (isStudent(req) && Number(req.session.studentId) !== studentId) {
            return fail(res, 403, 'FORBIDDEN_ROLE', 'Akses siswa hanya untuk akun sendiri.');
        }

        const scope = scopedClause(req, 's');
        const [students] = await db.query(
            `SELECT s.id, s.nis, s.nama, s.kelas, s.status, s.tahun_masuk, COALESCE(s.tahun_lulus,NULL) AS tahun_lulus, s.branch_id
             FROM students s
             WHERE s.id = ? ${scope.clause}
             LIMIT 1`,
            [studentId, ...scope.params]
        );
        if (!students.length) return fail(res, 404, 'NOT_FOUND', 'Siswa tidak ditemukan.');

        const billScope = scopedClause(req, 'b');
        const [bill] = await db.query(
            `SELECT COALESCE(SUM(total),0) AS total_tagihan,
                    COALESCE(SUM(terbayar),0) AS total_terbayar,
                    COALESCE(SUM(GREATEST(0,sisa)),0) AS total_sisa
             FROM bills b
             WHERE b.student_id = ? ${billScope.clause}`,
            [studentId, ...billScope.params]
        );
        return ok(res, {
            student: students[0],
            totals: {
                total_tagihan: Number(bill[0]?.total_tagihan || 0),
                total_terbayar: Number(bill[0]?.total_terbayar || 0),
                total_sisa: Number(bill[0]?.total_sisa || 0)
            }
        });
    } catch (err) {
        return fail(res, 500, 'INTERNAL_ERROR', err.message);
    }
});

router.get('/billing/student/:studentId/bills', requireMobileAuth, async (req, res) => {
    try {
        const studentId = Number(req.params.studentId || 0);
        if (!studentId) return fail(res, 400, 'VALIDATION_ERROR', 'studentId tidak valid.');
        if (isStudent(req) && Number(req.session.studentId) !== studentId) {
            return fail(res, 403, 'FORBIDDEN_ROLE', 'Akses siswa hanya untuk akun sendiri.');
        }
        const includeAll = String(req.query.include_all || '').toLowerCase() === '1' || String(req.query.include_all || '').toLowerCase() === 'true';
        const sisaFilter = includeAll ? '' : ' AND GREATEST(0, b.sisa) > 0';
        const scope = scopedClause(req, 'b');
        const hasSchoolYearName = await hasColumn('bills', 'school_year_name');
        const schoolYearSelect = hasSchoolYearName ? 'b.school_year_name' : "'-' AS school_year_name";
        const [rows] = await db.query(
            `SELECT b.id, b.nama_tagihan, b.total, b.terbayar, GREATEST(0, b.sisa) AS sisa, b.tanggal_buat,
                    ${schoolYearSelect},
                    CASE WHEN MONTH(b.tanggal_buat) BETWEEN 7 AND 12 THEN 'Ganjil' ELSE 'Genap' END AS semester
             FROM bills b
             WHERE b.student_id = ? ${scope.clause}${sisaFilter}
             ORDER BY b.id DESC`,
            [studentId, ...scope.params]
        );
        return ok(res, rows);
    } catch (err) {
        return fail(res, 500, 'INTERNAL_ERROR', err.message);
    }
});

router.get('/billing/student/:studentId/timeline', requireMobileAuth, async (req, res) => {
    try {
        const studentId = Number(req.params.studentId || 0);
        if (!studentId) return fail(res, 400, 'VALIDATION_ERROR', 'studentId tidak valid.');
        if (isStudent(req) && Number(req.session.studentId) !== studentId) {
            return fail(res, 403, 'FORBIDDEN_ROLE', 'Akses siswa hanya untuk akun sendiri.');
        }
        const branchClauseBills = scopedClause(req, 'b');
        const [bills] = await db.query(
            `SELECT b.id, b.nama_tagihan, b.total, GREATEST(0,b.sisa) AS sisa, b.tanggal_buat
             FROM bills b
             WHERE b.student_id = ? ${branchClauseBills.clause}
             ORDER BY b.tanggal_buat DESC, b.id DESC`,
            [studentId, ...branchClauseBills.params]
        );
        const hasIsReversed = await hasColumn('payments', 'is_reversed');
        const reversedWhere = hasIsReversed ? ' AND COALESCE(p.is_reversed,0)=0' : '';
        const branchClausePayments = scopedClause(req, 'p');
        const [payments] = await db.query(
            `SELECT p.id, p.trans_id, p.tanggal, p.jumlah_bayar, p.penerima, p.keterangan
             FROM payments p
             WHERE p.student_id = ? ${branchClausePayments.clause}${reversedWhere}
             ORDER BY p.tanggal DESC, p.id DESC`,
            [studentId, ...branchClausePayments.params]
        );

        const timeline = [];
        bills.forEach((b) => timeline.push({
            type: 'bill_created',
            date: b.tanggal_buat,
            title: `Tagihan ${b.nama_tagihan}`,
            description: `Nominal ${Number(b.total || 0).toLocaleString('id-ID')}, sisa ${Number(b.sisa || 0).toLocaleString('id-ID')}`
        }));
        payments.forEach((p) => timeline.push({
            type: 'payment',
            date: p.tanggal,
            title: `Pembayaran ${p.trans_id || ''}`.trim(),
            description: `${Number(p.jumlah_bayar || 0).toLocaleString('id-ID')} oleh ${p.penerima || 'Sistem'}`
        }));
        timeline.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
        return ok(res, timeline);
    } catch (err) {
        return fail(res, 500, 'INTERNAL_ERROR', err.message);
    }
});

router.get('/payments/history', requireMobileAuth, async (req, res) => {
    try {
        const page = Math.max(1, Number(req.query.page || 1));
        const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
        const offset = (page - 1) * limit;
        const dateFrom = String(req.query.date_from || '').trim();
        const dateTo = String(req.query.date_to || '').trim();
        const search = String(req.query.search || '').trim().toLowerCase();

        const hasIsReversed = await hasColumn('payments', 'is_reversed');
        const where = [];
        const params = [];
        if (isStudent(req)) {
            where.push('p.student_id = ?');
            params.push(Number(req.session.studentId));
        } else if (isAdmin(req)) {
            where.push('p.branch_id = ?');
            params.push(branchId(req));
        }
        if (hasIsReversed) where.push('COALESCE(p.is_reversed,0)=0');
        if (dateFrom) {
            where.push('DATE(p.tanggal) >= ?');
            params.push(dateFrom);
        }
        if (dateTo) {
            where.push('DATE(p.tanggal) <= ?');
            params.push(dateTo);
        }
        if (search) {
            where.push('(LOWER(p.nama) LIKE ? OR LOWER(p.trans_id) LIKE ?)');
            params.push(`%${search}%`, `%${search}%`);
        }

        const [rows] = await db.query(
            `SELECT p.id, p.trans_id, p.tanggal, p.kelas, p.nama, p.jumlah_bayar, p.penerima, p.keterangan, p.bill_id
             FROM payments p
             ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
             ORDER BY p.tanggal DESC, p.id DESC
             LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );
        const [countRows] = await db.query(
            `SELECT COUNT(*) AS total FROM payments p ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`,
            [...params]
        );
        return ok(res, rows, { page, limit, total: Number(countRows[0]?.total || 0) });
    } catch (err) {
        return fail(res, 500, 'INTERNAL_ERROR', err.message);
    }
});

router.post('/payments', requireMobileAuth, async (req, res) => {
    const conn = await db.getConnection();
    try {
        if (!isAdmin(req)) return fail(res, 403, 'FORBIDDEN_ROLE', 'Hanya admin cabang yang dapat menambah pembayaran.');
        const { student_id, bill_id, amount, tanggal, penerima, keterangan, pin } = req.body || {};
        const studentId = Number(student_id || 0);
        const billId = Number(bill_id || 0);
        const payAmount = Number(amount || 0);
        const payDate = String(tanggal || '').trim();
        if (!studentId || payAmount <= 0 || !payDate || !penerima) {
            return fail(res, 400, 'VALIDATION_ERROR', 'student_id, amount, tanggal, penerima wajib valid.');
        }

        const pinCheck = await verifyBranchAdminPin(req, pin);
        if (!pinCheck.ok) return fail(res, 400, 'PIN_INVALID', pinCheck.message);

        await conn.beginTransaction();
        const bid = branchId(req);
        const [students] = await conn.query(
            'SELECT id, nama, kelas, class_id, branch_id FROM students WHERE id = ? AND branch_id = ? LIMIT 1',
            [studentId, bid]
        );
        if (!students.length) {
            await conn.rollback();
            return fail(res, 404, 'NOT_FOUND', 'Siswa tidak ditemukan pada cabang ini.');
        }
        const student = students[0];
        let targetBillId = billId > 0 ? billId : null;
        if (targetBillId) {
            const [bills] = await conn.query(
                'SELECT id, total, GREATEST(0,sisa) AS sisa FROM bills WHERE id = ? AND student_id = ? AND branch_id = ? LIMIT 1',
                [targetBillId, studentId, bid]
            );
            if (!bills.length) {
                await conn.rollback();
                return fail(res, 404, 'NOT_FOUND', 'Tagihan tidak ditemukan.');
            }
            const sisa = Number(bills[0].sisa || 0);
            if (payAmount > sisa) {
                await conn.rollback();
                return fail(res, 400, 'CONFLICT_DATA', `Jumlah bayar melebihi sisa tagihan (${sisa.toLocaleString('id-ID')}).`);
            }
            await conn.query(
                `UPDATE bills
                 SET terbayar = LEAST(total, GREATEST(0, terbayar + ?)),
                     sisa = GREATEST(0, total - LEAST(total, GREATEST(0, terbayar + ?))),
                     status = CASE WHEN GREATEST(0, total - LEAST(total, GREATEST(0, terbayar + ?))) <= 0 THEN 'Lunas' ELSE 'Belum Lunas' END
                 WHERE id = ? AND branch_id = ?`,
                [payAmount, payAmount, payAmount, targetBillId, bid]
            );
        }

        const transId = `MTRX-${Date.now()}`;
        const [insertRes] = await conn.query(
            `INSERT INTO payments
             (trans_id, tanggal, kelas, nama, jumlah_bayar, penerima, keterangan, bill_id, student_id, class_id, branch_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                transId,
                payDate,
                student.kelas || '',
                student.nama,
                payAmount,
                String(penerima),
                String(keterangan || ''),
                targetBillId,
                student.id,
                student.class_id || null,
                bid
            ]
        );

        await conn.commit();
        return ok(res, {
            payment_id: insertRes.insertId,
            trans_id: transId,
            pin_verified_until: pinCheck.pin_verified_until || null
        });
    } catch (err) {
        try { await conn.rollback(); } catch (_) {}
        return fail(res, 500, 'INTERNAL_ERROR', err.message);
    } finally {
        conn.release();
    }
});

module.exports = router;
