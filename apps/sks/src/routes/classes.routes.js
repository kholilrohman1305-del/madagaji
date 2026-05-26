const express = require('express');
const db = require('../../db');
const bcrypt = require('bcryptjs');
const { isSuperAdmin, getSessionBranchId, resolveBranchId, ensureBranchForAdmin } = require('../utils/branchScope');
const { queryPdmada, isPdmadaConfigured } = require('../utils/pdmadaDb');

const { validate, isNonEmptyString } = require('../middlewares/validate');

const router = express.Router();
let ensuredWaliSchema = false;
let classReadIndexesEnsured = false;
let classReadIndexesEnsuringPromise = null;
let classFinanceSummaryEnsured = false;
const CLASSES_CACHE_TTL_MS = 120000;
const classesCache = new Map();

async function ensureWaliSchema(connLike = db) {
    if (ensuredWaliSchema) return;
    const [roleRows] = await connLike.query(
        `SELECT COLUMN_TYPE AS column_type
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'admins'
           AND COLUMN_NAME = 'role'
         LIMIT 1`
    );
    const roleType = String(roleRows[0]?.column_type || '').toLowerCase();
    if (!roleType.includes("'wali_kelas'") || !roleType.includes("'guru'")) {
        await connLike.query("ALTER TABLE admins MODIFY COLUMN role ENUM('super_admin','admin','wali_kelas','guru') NOT NULL DEFAULT 'super_admin'");
    }

    const ensureColumn = async (columnName, alterSql) => {
        const [rows] = await connLike.query(
            `SELECT COUNT(*) AS cnt
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'admins'
               AND COLUMN_NAME = ?`,
            [columnName]
        );
        if (Number(rows[0]?.cnt || 0) === 0) await connLike.query(alterSql);
    };

    await ensureColumn('homeroom_class', 'ALTER TABLE admins ADD COLUMN homeroom_class VARCHAR(50) NULL AFTER branch_id');
    await ensureColumn('pdmada_teacher_id', 'ALTER TABLE admins ADD COLUMN pdmada_teacher_id BIGINT NULL AFTER homeroom_class');
    ensuredWaliSchema = true;
}

async function ensureClassFinanceSummaryTable() {
    if (classFinanceSummaryEnsured) return;
    await db.query(`
        CREATE TABLE IF NOT EXISTS class_finance_summary (
            branch_id INT NOT NULL,
            kelas VARCHAR(50) NOT NULL,
            jumlah_siswa INT NOT NULL DEFAULT 0,
            siswa_beasiswa INT NOT NULL DEFAULT 0,
            total_tagihan DECIMAL(18,2) NOT NULL DEFAULT 0,
            total_terbayar DECIMAL(18,2) NOT NULL DEFAULT 0,
            total_sisa DECIMAL(18,2) NOT NULL DEFAULT 0,
            siswa_lunas INT NOT NULL DEFAULT 0,
            siswa_belum_lunas INT NOT NULL DEFAULT 0,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (branch_id, kelas),
            INDEX idx_cfs_branch_kelas (branch_id, kelas),
            INDEX idx_cfs_updated_at (updated_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
    classFinanceSummaryEnsured = true;
}

function triggerClassReadIndexesEnsure() {
    if (classReadIndexesEnsured || classReadIndexesEnsuringPromise) return;
    classReadIndexesEnsuringPromise = (async () => {
        const defs = [
            ['admins', 'idx_admins_role_branch_homeroom', 'CREATE INDEX idx_admins_role_branch_homeroom ON admins(role, branch_id, homeroom_class)']
        ];
        for (const [tableName, indexName, ddl] of defs) {
            const [rows] = await db.query(
                `SELECT COUNT(*) AS cnt
                 FROM INFORMATION_SCHEMA.STATISTICS
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME = ?
                   AND INDEX_NAME = ?`,
                [tableName, indexName]
            );
            if (Number(rows[0]?.cnt || 0) === 0) {
                try {
                    await db.query(ddl);
                } catch (err) {
                    if (Number(err?.errno || 0) !== 1061) throw err;
                }
            }
        }
        classReadIndexesEnsured = true;
    })()
        .catch((err) => {
            console.warn('[classes/indexes] warning:', err?.message || err);
        })
        .finally(() => {
            classReadIndexesEnsuringPromise = null;
        });
}



function getClassesCacheKey(req, branchId) {
    return JSON.stringify({
        role: String(req.session?.userRole || ''),
        userId: Number(req.session?.adminId || 0),
        branchId: Number(branchId || 0)
    });
}

function getCachedClasses(cacheKey) {
    const entry = classesCache.get(cacheKey);
    if (!entry) return null;
    if (Date.now() - Number(entry.cachedAt || 0) > CLASSES_CACHE_TTL_MS) {
        classesCache.delete(cacheKey);
        return null;
    }
    return entry.payload || null;
}

function setCachedClasses(cacheKey, payload) {
    classesCache.set(cacheKey, { payload, cachedAt: Date.now() });
}

function invalidateClassesCache() {
    classesCache.clear();
}
function normalizeTeacherName(teacher) {
    return String(
        teacher?.name ||
        teacher?.nama ||
        teacher?.full_name ||
        ''
    ).trim();
}

function buildAutoCredential() {
    const partA = String(Math.floor(100000 + Math.random() * 900000)); // 6 digit
    const partB = String(Math.floor(1000 + Math.random() * 9000)); // 4 digit
    return `${partA}${partB}`;
}

function ensureNotSuperAdminReadOnly(req, res) {
    if (isSuperAdmin(req)) {
        res.status(403).json({ success: false, message: 'Super admin hanya dapat melihat data kelas.' });
        return false;
    }
    return true;
}

async function resolveTeacherIdentity({ teacherId, teacherNameRaw }) {
    let teacherName = String(teacherNameRaw || '').trim();
    let niy = null;
    const normalizedTeacherId = Number(teacherId || 0);

    if (normalizedTeacherId > 0 && isPdmadaConfigured()) {
        const [teacherRows] = await queryPdmada(
            `SELECT id, name, niy
             FROM teachers
             WHERE id = ?
             LIMIT 1`,
            [normalizedTeacherId]
        );
        if (teacherRows.length) {
            teacherName = normalizeTeacherName(teacherRows[0]);
            niy = String(teacherRows[0]?.niy || '').trim() || null;
        }
    }

    if (!teacherName) return null;
    return { teacherId: normalizedTeacherId > 0 ? normalizedTeacherId : null, teacherName, niy };
}

async function createTeacherAccount(conn, { branchId, teacherId, teacherName, role = 'guru' }) {
    const safeRole = role === 'wali_kelas' ? 'wali_kelas' : 'guru';
    const [dupTeacher] = await conn.query(
        `SELECT id FROM admins
         WHERE role IN ('wali_kelas','guru')
           AND branch_id = ?
           AND (
                (pdmada_teacher_id IS NOT NULL AND pdmada_teacher_id = ?)
                OR LOWER(TRIM(COALESCE(nama_lengkap, ''))) = LOWER(TRIM(?))
           )
         LIMIT 1`,
        [branchId, teacherId > 0 ? teacherId : null, teacherName]
    );
    if (dupTeacher.length) {
        return { ok: false, status: 400, message: 'Guru sudah terdaftar sebagai pengguna.' };
    }

    let credential = '';
    let insertedId = null;
    for (let i = 0; i < 12; i += 1) {
        credential = buildAutoCredential();
        const [exists] = await conn.query('SELECT id FROM admins WHERE username = ? LIMIT 1', [credential]);
        if (exists.length) continue;
        const passwordHash = await bcrypt.hash(credential, 10);
        const [result] = await conn.query(
            `INSERT INTO admins (username, password, nama_lengkap, role, branch_id, homeroom_class, pdmada_teacher_id)
             VALUES (?, ?, ?, ?, ?, NULL, ?)`,
            [credential, passwordHash, teacherName, safeRole, branchId, teacherId > 0 ? teacherId : null]
        );
        insertedId = Number(result.insertId || 0);
        break;
    }

    if (!insertedId) {
        return { ok: false, status: 500, message: 'Gagal membuat username otomatis. Coba lagi.' };
    }

    return { ok: true, id: insertedId, username: credential, password: credential };
}

router.post(
    '/classes',
    validate((req) => {
        const errors = [];
        if (!isNonEmptyString(req.body.nama_kelas)) errors.push('nama_kelas is required');
        return errors;
    }),
    async (req, res) => {
        try {
            if (!ensureNotSuperAdminReadOnly(req, res)) return;
            if (!ensureBranchForAdmin(req, res)) return;
            const branchId = resolveBranchId(req, ['branch_id']) || getSessionBranchId(req) || 1;
            await db.query('INSERT INTO classes (branch_id, nama_kelas) VALUES (?, ?)', [branchId, req.body.nama_kelas]);
            invalidateClassesCache();
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    }
);

router.get('/classes', async (req, res) => {
    try {
        if (!ensureBranchForAdmin(req, res)) return;
        await ensureWaliSchema(db);
        await ensureClassFinanceSummaryTable();
        triggerClassReadIndexesEnsure();
        const branchId = resolveBranchId(req, ['branch_id']) || getSessionBranchId(req);
        const cacheKey = getClassesCacheKey(req, branchId);
        const cached = getCachedClasses(cacheKey);
        if (cached) return res.json(cached);
        const where = isSuperAdmin(req) && !branchId ? '' : ' WHERE c.branch_id = ? ';
        const params = isSuperAdmin(req) && !branchId ? [] : [branchId];
        const [rows] = await db.query(
            `SELECT
                c.id,
                c.branch_id,
                c.nama_kelas,
                a.id AS wali_admin_id,
                a.nama_lengkap AS wali_nama,
                a.username AS wali_username,
                COALESCE(st.jumlah_siswa, 0) AS jumlahSiswa,
                COALESCE(st.siswa_lunas, 0) AS lunas,
                COALESCE(st.siswa_belum_lunas, 0) AS nunggak
             FROM classes c
             LEFT JOIN admins a
                    ON a.branch_id = c.branch_id
                   AND a.role = 'wali_kelas'
                   AND a.homeroom_class = c.nama_kelas
             LEFT JOIN class_finance_summary st
                    ON st.branch_id = c.branch_id
                   AND st.kelas = c.nama_kelas
             ${where}
             ORDER BY c.nama_kelas ASC`,
            params
        );
        const scopedRows = (!isSuperAdmin(req) && Number(branchId || 0) > 0)
            ? rows.filter((row) => Number(row?.branch_id || 0) === Number(branchId))
            : rows;
        const payload = { success: true, rows: scopedRows };
        setCachedClasses(cacheKey, payload);
        return res.json(payload);
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/classes/wali', async (req, res) => {
    try {
        if (!ensureBranchForAdmin(req, res)) return;
        await ensureWaliSchema(db);
        const branchId = resolveBranchId(req, ['branch_id']) || getSessionBranchId(req);
        const where = isSuperAdmin(req) && !branchId ? '' : ' AND branch_id = ?';
        const params = isSuperAdmin(req) && !branchId ? [] : [branchId];
        const [rows] = await db.query(
            `SELECT id, username, nama_lengkap, branch_id, homeroom_class, pdmada_teacher_id, created_at
             FROM admins
             WHERE role = 'wali_kelas' ${where}
             ORDER BY nama_lengkap ASC`,
            params
        );
        return res.json({ success: true, rows });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/classes/wali/teachers', async (req, res) => {
    try {
        if (!ensureBranchForAdmin(req, res)) return;
        if (!isPdmadaConfigured()) {
            return res.json({ success: true, rows: [] });
        }
        const [rows] = await queryPdmada(
            `SELECT id, name, niy
             FROM teachers
             WHERE COALESCE(name, '') <> ''
             ORDER BY name ASC
             LIMIT 1000`
        );
        return res.json({ success: true, rows });
    } catch (err) {
        return res.status(500).json({ success: false, message: `Gagal mengambil data guru PDMADA: ${err.message}` });
    }
});

router.post('/classes/wali', async (req, res) => {
    const conn = await db.getConnection();
    try {
        if (!ensureNotSuperAdminReadOnly(req, res)) return;
        if (!ensureBranchForAdmin(req, res)) return;
        await ensureWaliSchema(conn);
        const branchId = resolveBranchId(req, ['branch_id']) || getSessionBranchId(req) || 1;
        const teacherId = Number(req.body?.teacher_id || 0);
        const teacherNameRaw = String(req.body?.teacher_name || '');
        const teacherIdentity = await resolveTeacherIdentity({ teacherId, teacherNameRaw });
        if (!teacherIdentity) {
            return res.status(400).json({ success: false, message: 'Guru tidak valid. Pilih guru dari daftar PDMADA.' });
        }
        const created = await createTeacherAccount(conn, {
            branchId,
            teacherId: teacherIdentity.teacherId,
            teacherName: teacherIdentity.teacherName,
            role: 'wali_kelas'
        });
        if (!created.ok) {
            return res.status(created.status || 400).json({ success: false, message: created.message || 'Gagal membuat akun guru.' });
        }

        invalidateClassesCache();
        return res.json({
            success: true,
            message: 'Wali kelas berhasil ditambahkan.',
            data: {
                id: created.id,
                nama_lengkap: teacherIdentity.teacherName,
                username: created.username,
                password: created.password
            }
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    } finally {
        conn.release();
    }
});

router.get('/teachers/accounts', async (req, res) => {
    try {
        const role = String(req.session?.userRole || '');
        if (role !== 'admin' && role !== 'super_admin') {
            return res.status(403).json({ success: false, message: 'Akun ini tidak memiliki akses data guru.' });
        }
        if (!ensureBranchForAdmin(req, res)) return;
        await ensureWaliSchema(db);
        const branchId = resolveBranchId(req, ['branch_id']) || getSessionBranchId(req);
        const where = isSuperAdmin(req) && !branchId ? '' : ' AND branch_id = ?';
        const params = isSuperAdmin(req) && !branchId ? [] : [branchId];
        const [accountRows] = await db.query(
            `SELECT id, username, nama_lengkap, branch_id, homeroom_class, pdmada_teacher_id, created_at
             FROM admins
             WHERE role IN ('wali_kelas','guru') ${where}
             ORDER BY nama_lengkap ASC`,
            params
        );
        const accountsByTeacherId = new Map();
        const accountsByName = new Map();
        for (const row of accountRows) {
            const teacherId = Number(row?.pdmada_teacher_id || 0);
            const normalizedName = String(row?.nama_lengkap || '').trim().toLowerCase();
            if (teacherId > 0) accountsByTeacherId.set(teacherId, row);
            if (normalizedName) accountsByName.set(normalizedName, row);
        }

        let teachers = [];
        if (isPdmadaConfigured()) {
            const [teacherRows] = await queryPdmada(
                `SELECT id, name, niy
                 FROM teachers
                 WHERE COALESCE(name, '') <> ''
                 ORDER BY name ASC
                 LIMIT 5000`
            );
            teachers = Array.isArray(teacherRows) ? teacherRows : [];
        }

        const rows = [];
        const usedAccountIds = new Set();
        for (const teacher of teachers) {
            const teacherId = Number(teacher?.id || 0) || null;
            const teacherName = normalizeTeacherName(teacher);
            const niy = String(teacher?.niy || '').trim() || null;
            const matchedAccount = (teacherId && accountsByTeacherId.get(teacherId))
                || accountsByName.get(String(teacherName || '').toLowerCase())
                || null;
            if (matchedAccount?.id) usedAccountIds.add(Number(matchedAccount.id));
            rows.push({
                teacher_id: teacherId,
                teacher_name: teacherName,
                teacher_niy: niy,
                account_id: matchedAccount ? Number(matchedAccount.id || 0) : null,
                username: matchedAccount ? String(matchedAccount.username || '') : null,
                has_account: Boolean(matchedAccount),
                homeroom_class: matchedAccount ? (matchedAccount.homeroom_class || null) : null,
                created_at: matchedAccount ? (matchedAccount.created_at || null) : null
            });
        }

        for (const account of accountRows) {
            const accountId = Number(account?.id || 0);
            if (usedAccountIds.has(accountId)) continue;
            rows.push({
                teacher_id: Number(account?.pdmada_teacher_id || 0) || null,
                teacher_name: String(account?.nama_lengkap || '').trim(),
                teacher_niy: null,
                account_id: accountId,
                username: String(account?.username || ''),
                has_account: true,
                homeroom_class: account?.homeroom_class || null,
                created_at: account?.created_at || null
            });
        }

        return res.json({ success: true, rows });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/teachers/accounts', async (req, res) => {
    const conn = await db.getConnection();
    try {
        const role = String(req.session?.userRole || '');
        if (role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Hanya admin cabang yang dapat membuat akun guru.' });
        }
        if (!ensureNotSuperAdminReadOnly(req, res)) return;
        if (!ensureBranchForAdmin(req, res)) return;
        await ensureWaliSchema(conn);
        const branchId = resolveBranchId(req, ['branch_id']) || getSessionBranchId(req) || 1;
        const teacherId = Number(req.body?.teacher_id || 0);
        const teacherNameRaw = String(req.body?.teacher_name || '');
        const teacherIdentity = await resolveTeacherIdentity({ teacherId, teacherNameRaw });
        if (!teacherIdentity) {
            return res.status(400).json({ success: false, message: 'Guru tidak valid. Pilih dari daftar PDMADA.' });
        }
        const created = await createTeacherAccount(conn, {
            branchId,
            teacherId: teacherIdentity.teacherId,
            teacherName: teacherIdentity.teacherName,
            role: 'guru'
        });
        if (!created.ok) {
            return res.status(created.status || 400).json({ success: false, message: created.message || 'Gagal membuat akun guru.' });
        }
        invalidateClassesCache();
        return res.json({
            success: true,
            message: 'Akun guru berhasil dibuat.',
            data: {
                id: created.id,
                nama_lengkap: teacherIdentity.teacherName,
                username: created.username,
                password: created.password
            }
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    } finally {
        conn.release();
    }
});

router.put('/teachers/accounts/:id/reset-password', async (req, res) => {
    try {
        const role = String(req.session?.userRole || '');
        if (role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Hanya admin cabang yang dapat reset password guru.' });
        }
        if (!ensureNotSuperAdminReadOnly(req, res)) return;
        if (!ensureBranchForAdmin(req, res)) return;
        await ensureWaliSchema(db);
        const accountId = Number(req.params?.id || 0);
        const branchId = resolveBranchId(req, ['branch_id']) || getSessionBranchId(req) || 0;
        if (!Number.isFinite(accountId) || accountId <= 0) {
            return res.status(400).json({ success: false, message: 'ID akun tidak valid.' });
        }
        const where = isSuperAdmin(req) && !branchId ? '' : ' AND branch_id = ?';
        const params = isSuperAdmin(req) && !branchId ? [accountId] : [accountId, branchId];
        const [rows] = await db.query(
            `SELECT id, username
             FROM admins
             WHERE id = ?
               AND role IN ('wali_kelas','guru') ${where}
             LIMIT 1`,
            params
        );
        if (!rows.length) {
            return res.status(404).json({ success: false, message: 'Akun guru tidak ditemukan.' });
        }
        const newPassword = buildAutoCredential();
        const passwordHash = await bcrypt.hash(newPassword, 10);
        await db.query('UPDATE admins SET password = ? WHERE id = ?', [passwordHash, accountId]);
        return res.json({
            success: true,
            message: 'Password akun guru berhasil direset.',
            data: {
                id: accountId,
                username: String(rows[0].username || ''),
                password: newPassword
            }
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

router.put('/classes/:id/wali', async (req, res) => {
    const conn = await db.getConnection();
    try {
        if (!ensureNotSuperAdminReadOnly(req, res)) return;
        if (!ensureBranchForAdmin(req, res)) return;
        await ensureWaliSchema(conn);
        const classId = Number(req.params.id || 0);
        const waliAdminId = Number(req.body?.wali_admin_id || 0);
        if (!Number.isFinite(classId) || classId <= 0) {
            return res.status(400).json({ success: false, message: 'ID kelas tidak valid.' });
        }

        const branchId = resolveBranchId(req, ['branch_id']) || getSessionBranchId(req);
        const [classRows] = await conn.query(
            `SELECT id, branch_id, nama_kelas
             FROM classes
             WHERE id = ? ${isSuperAdmin(req) && !branchId ? '' : 'AND branch_id = ?'}
             LIMIT 1`,
            isSuperAdmin(req) && !branchId ? [classId] : [classId, branchId]
        );
        if (!classRows.length) {
            return res.status(404).json({ success: false, message: 'Kelas tidak ditemukan.' });
        }
        const kelas = classRows[0].nama_kelas;
        const targetBranchId = Number(classRows[0].branch_id || branchId || 0);

        await conn.beginTransaction();

        if (waliAdminId > 0) {
            const [waliRows] = await conn.query(
                `SELECT id
                 FROM admins
                 WHERE id = ?
                   AND role = 'wali_kelas'
                   AND branch_id = ?
                 LIMIT 1`,
                [waliAdminId, targetBranchId]
            );
            if (!waliRows.length) {
                await conn.rollback();
                return res.status(404).json({ success: false, message: 'Wali kelas tidak ditemukan.' });
            }
        }

        await conn.query(
            `UPDATE admins
             SET homeroom_class = NULL
             WHERE role = 'wali_kelas'
               AND branch_id = ?
               AND homeroom_class = ?`,
            [targetBranchId, kelas]
        );

        if (waliAdminId > 0) {
            await conn.query(
                `UPDATE admins
                 SET homeroom_class = ?
                 WHERE id = ?
                   AND role = 'wali_kelas'
                   AND branch_id = ?`,
                [kelas, waliAdminId, targetBranchId]
            );
        }

        await conn.commit();
        invalidateClassesCache();
        return res.json({ success: true, message: 'Wali kelas berhasil diatur.' });
    } catch (err) {
        try { await conn.rollback(); } catch (_) {}
        return res.status(500).json({ success: false, message: err.message });
    } finally {
        conn.release();
    }
});

router.put(
    '/classes/:id',
    validate((req) => {
        const errors = [];
        if (!isNonEmptyString(req.body.nama_kelas)) errors.push('nama_kelas is required');
        return errors;
    }),
    async (req, res) => {
        try {
            if (!ensureNotSuperAdminReadOnly(req, res)) return;
            if (!ensureBranchForAdmin(req, res)) return;
            const branchId = resolveBranchId(req, ['branch_id']) || getSessionBranchId(req);
            const where = isSuperAdmin(req) && !branchId ? 'id = ?' : 'id = ? AND branch_id = ?';
            const params = isSuperAdmin(req) && !branchId ? [req.params.id] : [req.params.id, branchId];
            await db.query(`UPDATE classes SET nama_kelas = ? WHERE ${where}`, [req.body.nama_kelas, ...params]);
            invalidateClassesCache();
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    }
);

router.delete('/classes/:id', async (req, res) => {
    try {
        if (!ensureNotSuperAdminReadOnly(req, res)) return;
        if (!ensureBranchForAdmin(req, res)) return;
        const branchId = resolveBranchId(req, ['branch_id']) || getSessionBranchId(req);
        const classWhere = isSuperAdmin(req) && !branchId ? 'id = ?' : 'id = ? AND branch_id = ?';
        const classParams = isSuperAdmin(req) && !branchId ? [req.params.id] : [req.params.id, branchId];
        const classId = req.params.id;
        const [clsRows] = await db.query(`SELECT id, branch_id, nama_kelas FROM classes WHERE ${classWhere} LIMIT 1`, classParams);
        if (!clsRows.length) {
            return res.status(404).json({ success: false, message: 'Kelas tidak ditemukan.' });
        }
        const kelasNama = clsRows[0].nama_kelas;
        const kelasBranchId = clsRows[0].branch_id;

        const [activeStudentsRows] = await db.query(
            `SELECT COUNT(*) AS total
             FROM students
             WHERE branch_id = ?
               AND (class_id = ? OR kelas = ?)
               AND LOWER(TRIM(COALESCE(status, ''))) = 'aktif'`,
            [kelasBranchId, classId, kelasNama]
        );
        const activeStudents = Number(activeStudentsRows[0]?.total || 0);

        const [activeBillsRows] = await db.query(
            `SELECT COUNT(*) AS total
             FROM bills
             WHERE branch_id = ?
               AND (class_id = ? OR kelas = ?)
               AND sisa > 0`,
            [kelasBranchId, classId, kelasNama]
        );
        const activeBills = Number(activeBillsRows[0]?.total || 0);

        if (activeStudents > 0 || activeBills > 0) {
            return res.status(400).json({
                success: false,
                message: `Kelas tidak bisa dihapus: masih dipakai ${activeStudents} siswa aktif dan ${activeBills} tagihan aktif.`
            });
        }

        await db.query(`DELETE FROM classes WHERE ${classWhere}`, classParams);
        invalidateClassesCache();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
