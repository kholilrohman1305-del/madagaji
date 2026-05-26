const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const xlsx = require('xlsx');
const db = require('../../db');
const { isSuperAdmin, getSessionBranchId, resolveBranchId, ensureBranchForAdmin } = require('../utils/branchScope');

const { validate, isNonEmptyString } = require('../middlewares/validate');

const router = express.Router();
let hasTahunLulusCache = null;
let hasAsalSekolahCache = null;

function getWaliClass(req) {
    if (String(req.session?.userRole || '') !== 'wali_kelas') return null;
    const kelas = String(req.session?.homeroomClass || '').trim();
    return kelas || null;
}

function ensureNotSuperAdminReadOnly(req, res) {
    if (isSuperAdmin(req)) {
        res.status(403).json({ success: false, message: 'Super admin hanya dapat melihat data siswa.' });
        return false;
    }
    return true;
}

async function hasTahunLulusColumn(connLike = db) {
    if (hasTahunLulusCache !== null) return hasTahunLulusCache;
    try {
        const [rows] = await connLike.query(
            `SELECT COUNT(*) AS cnt
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'students'
               AND COLUMN_NAME = 'tahun_lulus'`
        );
        hasTahunLulusCache = Number(rows[0]?.cnt || 0) > 0;
    } catch (_) {
        hasTahunLulusCache = false;
    }
    return hasTahunLulusCache;
}

async function hasAsalSekolahColumn(connLike = db) {
    if (hasAsalSekolahCache !== null) return hasAsalSekolahCache;
    try {
        const [rows] = await connLike.query(
            `SELECT COUNT(*) AS cnt
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'students'
               AND COLUMN_NAME = 'asal_sekolah'`
        );
        hasAsalSekolahCache = Number(rows[0]?.cnt || 0) > 0;
    } catch (_) {
        hasAsalSekolahCache = false;
    }
    return hasAsalSekolahCache;
}

async function ensureAsalSekolahColumn(connLike = db) {
    if (await hasAsalSekolahColumn(connLike)) return;
    await connLike.query("ALTER TABLE students ADD COLUMN asal_sekolah VARCHAR(150) NULL AFTER alamat");
    hasAsalSekolahCache = true;
}

async function ensureTahunLulusColumn(connLike = db) {
    if (await hasTahunLulusColumn(connLike)) return;
    await connLike.query("ALTER TABLE students ADD COLUMN tahun_lulus INT NULL AFTER tahun_masuk");
    hasTahunLulusCache = true;
}

// Hardening: limit upload size and only allow xlsx.
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname || '').toLowerCase();
        const okExt = ext === '.xlsx';
        const okMime =
            file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
            file.mimetype === 'application/octet-stream'; // some browsers
        if (!okExt || !okMime) return cb(new Error('Only .xlsx files are allowed'));
        cb(null, true);
    }
});

function normalizeKey(raw) {
    return String(raw || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}

function getRowValue(row, keyName) {
    if (!row || typeof row !== 'object') return '';
    const target = normalizeKey(keyName);
    const foundKey = Object.keys(row).find((k) => normalizeKey(k) === target);
    return foundKey ? row[foundKey] : '';
}

function toYmdDate(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number' && Number.isFinite(value)) {
        const parsed = xlsx.SSF.parse_date_code(value);
        if (!parsed || !parsed.y || !parsed.m || !parsed.d) return null;
        return `${String(parsed.y).padStart(4, '0')}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
    const raw = String(value).trim();
    if (!raw) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    return null;
}

router.get('/students', async (req, res) => {
    try {
        if (!ensureBranchForAdmin(req, res)) return;
        const branchId = resolveBranchId(req, ['branch_id']) || getSessionBranchId(req);
        const waliClass = getWaliClass(req);
        const whereBranch = isSuperAdmin(req) && !branchId ? '' : 'WHERE branch_id = ?';
        const whereClass = waliClass ? `${whereBranch ? ' AND ' : ' WHERE '} kelas = ?` : '';
        const where = `${whereBranch}${whereClass}`;
        const params = [];
        if (!(isSuperAdmin(req) && !branchId)) params.push(branchId);
        if (waliClass) params.push(waliClass);
        const [rows] = await db.query(
            `SELECT * FROM students ${where} ORDER BY FIELD(status, 'Aktif', 'Nonaktif', 'Lulus', 'Pindah', 'Keluar'), kelas ASC, nama ASC`,
            params
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/students/list', async (req, res) => {
    try {
        if (!ensureBranchForAdmin(req, res)) return;
        const branchId = resolveBranchId(req, ['branch_id']) || getSessionBranchId(req);
        const waliClass = getWaliClass(req);
        const hasAsalSekolah = await hasAsalSekolahColumn(db);
        const hasTahunLulus = await hasTahunLulusColumn(db);

        const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
        const reqLimit = String(req.query.limit || '').toLowerCase() === 'all'
            ? 100
            : (Number.parseInt(req.query.limit, 10) || 10);
        const limit = Math.min(100, Math.max(5, reqLimit));
        const offset = (page - 1) * limit;

        const search = String(req.query.search || '').trim();
        const kelas = String(req.query.kelas || '').trim();
        const status = String(req.query.status || '').trim();

        const where = [];
        const params = [];
        if (!(isSuperAdmin(req) && !branchId)) {
            where.push('s.branch_id = ?');
            params.push(branchId);
        }
        if (waliClass) {
            where.push('s.kelas = ?');
            params.push(waliClass);
        }
        if (kelas) {
            where.push('s.kelas = ?');
            params.push(kelas);
        }
        if (status) {
            where.push('LOWER(TRIM(COALESCE(s.status, ""))) = ?');
            params.push(status.toLowerCase());
        }
        if (search) {
            const like = `%${search}%`;
            const searchParts = ['s.nama LIKE ?', 'COALESCE(s.nis, "") LIKE ?'];
            const searchParams = [like, like];
            if (hasAsalSekolah) {
                searchParts.push('COALESCE(s.asal_sekolah, "") LIKE ?');
                searchParams.push(like);
            }
            where.push(`(${searchParts.join(' OR ')})`);
            params.push(...searchParams);
        }
        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

        const [countRows] = await db.query(
            `SELECT COUNT(*) AS total
             FROM students s
             ${whereSql}`,
            params
        );
        const total = Number(countRows[0]?.total || 0);

        const [rows] = await db.query(
            `SELECT
                s.id,
                s.nis,
                s.nisn,
                s.username,
                s.nama,
                s.kelas,
                s.class_id,
                s.branch_id,
                s.status,
                s.tahun_masuk,
                ${hasTahunLulus ? 's.tahun_lulus' : 'NULL AS tahun_lulus'},
                s.jenis_kelamin,
                s.tanggal_lahir,
                s.nama_wali,
                ${hasAsalSekolah ? 's.asal_sekolah' : 'NULL AS asal_sekolah'}
             FROM students s
             ${whereSql}
             ORDER BY
                FIELD(LOWER(TRIM(COALESCE(s.status, ''))), 'aktif', 'nonaktif', 'lulus', 'pindah', 'keluar'),
                s.kelas ASC,
                s.nama ASC
             LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );

        res.json({
            success: true,
            rows,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.max(1, Math.ceil(total / limit))
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/students/options', async (req, res) => {
    try {
        if (!ensureBranchForAdmin(req, res)) return;
        const branchId = resolveBranchId(req, ['branch_id']) || getSessionBranchId(req);
        const waliClass = getWaliClass(req);
        const limit = Math.min(100, Math.max(5, Number.parseInt(req.query.limit, 10) || 30));
        const search = String(req.query.search || '').trim();
        const status = String(req.query.status || 'Aktif').trim().toLowerCase();
        const kelas = String(req.query.kelas || '').trim();

        const where = [];
        const params = [];
        if (!(isSuperAdmin(req) && !branchId)) {
            where.push('s.branch_id = ?');
            params.push(branchId);
        }
        if (waliClass) {
            where.push('s.kelas = ?');
            params.push(waliClass);
        }
        if (kelas) {
            where.push('s.kelas = ?');
            params.push(kelas);
        }
        if (status) {
            where.push('LOWER(TRIM(COALESCE(s.status, ""))) = ?');
            params.push(status);
        }
        if (search) {
            const like = `%${search}%`;
            where.push('(s.nama LIKE ? OR COALESCE(s.nis, "") LIKE ?)');
            params.push(like, like);
        }

        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
        const [rows] = await db.query(
            `SELECT
                s.id,
                s.nis,
                s.nama,
                s.kelas,
                s.status,
                s.branch_id
             FROM students s
             ${whereSql}
             ORDER BY s.nama ASC
             LIMIT ?`,
            [...params, limit]
        );

        res.json({ success: true, rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post(
    '/students',
    validate((req) => {
        const errors = [];
        if (!isNonEmptyString(req.body.nis)) errors.push('nis is required');
        if (!isNonEmptyString(req.body.nama)) errors.push('nama is required');
        if (!isNonEmptyString(req.body.kelas)) errors.push('kelas is required');
        return errors;
    }),
    async (req, res) => {
        try {
            if (!ensureNotSuperAdminReadOnly(req, res)) return;
            if (!ensureBranchForAdmin(req, res)) return;
            const branchId = resolveBranchId(req, ['branch_id']) || getSessionBranchId(req) || 1;
            const {
                nis,
                nisn,
                nama,
                username,
                password,
                jenis_kelamin,
                tempat_lahir,
                tanggal_lahir,
                alamat,
                asal_sekolah,
                nama_wali,
                no_hp_wali,
                kelas,
                status,
                tahun_masuk,
                tahun_lulus
            } = req.body;
            await ensureAsalSekolahColumn(db);
            await ensureTahunLulusColumn(db);
            const plainPassword = password || nis;
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(String(plainPassword), salt);
            const finalUsername = username || nis;

            // Ensure class exists and get class_id
            await db.query('INSERT IGNORE INTO classes (branch_id, nama_kelas) VALUES (?, ?)', [branchId, kelas]);
            const [cls] = await db.query('SELECT id FROM classes WHERE branch_id = ? AND nama_kelas = ? LIMIT 1', [branchId, kelas]);
            const classId = cls[0] ? cls[0].id : null;

            const hasTahunLulus = await hasTahunLulusColumn(db);
            const hasAsalSekolah = await hasAsalSekolahColumn(db);
            const columns = [
                'nis',
                'nisn',
                'username',
                'password',
                'nama',
                'jenis_kelamin',
                'tempat_lahir',
                'tanggal_lahir',
                'alamat'
            ];
            const values = [
                nis,
                nisn || null,
                finalUsername,
                hashedPassword,
                nama,
                jenis_kelamin || 'L',
                tempat_lahir || null,
                tanggal_lahir || null,
                alamat || null
            ];
            if (hasAsalSekolah) {
                columns.push('asal_sekolah');
                values.push(asal_sekolah || null);
            }
            columns.push('nama_wali', 'no_hp_wali', 'kelas', 'status', 'tahun_masuk');
            values.push(nama_wali || null, no_hp_wali || null, kelas, status || 'Aktif', tahun_masuk || null);
            if (hasTahunLulus) {
                columns.push('tahun_lulus');
                values.push(status === 'Lulus' ? (tahun_lulus || new Date().getFullYear()) : (tahun_lulus || null));
            }
            columns.push('branch_id');
            values.push(branchId);

            const placeholders = columns.map(() => '?').join(', ');
            await db.query(`INSERT INTO students (${columns.join(', ')}) VALUES (${placeholders})`, values);

            // Backfill class_id for this student (if column exists)
            try {
                await db.query('UPDATE students SET class_id = ? WHERE nis = ? AND branch_id = ?', [classId, nis, branchId]);
            } catch (_) {
                // ignore if class_id column not present yet
            }
            res.json({ success: true, message: 'Siswa ditambahkan.' });
        } catch (e) {
            if (e.code === 'ER_DUP_ENTRY') return res.status(400).json({ success: false, message: 'NIS sudah terdaftar!' });
            res.status(500).json({ success: false, message: e.message });
        }
    }
);

router.put('/students/:id', async (req, res) => {
    const conn = await db.getConnection();
    try {
        if (!ensureNotSuperAdminReadOnly(req, res)) return;
        if (!ensureBranchForAdmin(req, res)) return;
        const branchId = resolveBranchId(req, ['branch_id']) || getSessionBranchId(req);
        await conn.beginTransaction();
        const studentId = req.params.id;
        const {
            nis,
            nisn,
            username,
            password,
            nama,
            jenis_kelamin,
            tempat_lahir,
            tanggal_lahir,
            alamat,
            asal_sekolah,
            nama_wali,
            no_hp_wali,
            kelas,
            status,
            tahun_masuk,
            tahun_lulus
        } = req.body;
        await ensureAsalSekolahColumn(conn);
        await ensureTahunLulusColumn(conn);

        const [oldData] = await conn.query(
            `SELECT * FROM students WHERE id = ? ${isSuperAdmin(req) && !branchId ? '' : 'AND branch_id = ?'}`,
            isSuperAdmin(req) && !branchId ? [studentId] : [studentId, branchId]
        );
        if (oldData.length === 0) {
            await conn.rollback();
            return res.status(404).json({ success: false });
        }
        const oldName = oldData[0].nama;
        const oldClass = oldData[0].kelas;

        const hasTahunLulus = await hasTahunLulusColumn(conn);
        const hasAsalSekolah = await hasAsalSekolahColumn(conn);
        const setParts = [
            'nis=?',
            'nisn=?',
            'username=?',
            'nama=?',
            'jenis_kelamin=?',
            'tempat_lahir=?',
            'tanggal_lahir=?',
            'alamat=?'
        ];
        const params = [
            nis,
            nisn,
            username || nis,
            nama,
            jenis_kelamin,
            tempat_lahir,
            tanggal_lahir,
            alamat
        ];
        if (hasAsalSekolah) {
            setParts.push('asal_sekolah=?');
            params.push(asal_sekolah || null);
        }
        setParts.push('nama_wali=?', 'no_hp_wali=?', 'kelas=?', 'status=?', 'tahun_masuk=?');
        params.push(nama_wali, no_hp_wali, kelas, status, tahun_masuk);
        if (hasTahunLulus) {
            setParts.push('tahun_lulus=?');
            params.push(status === 'Lulus' ? (tahun_lulus || oldData[0].tahun_lulus || new Date().getFullYear()) : null);
        }

        let passwordQuery = '';
        if (password && String(password).trim() !== '') {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(String(password), salt);
            passwordQuery = ', password=?';
            params.push(hashedPassword);
        }
        params.push(studentId);
        await conn.query(`UPDATE students SET ${setParts.join(', ')}${passwordQuery} WHERE id=?`, params);
        try {
            await conn.query(
                `UPDATE scholarship_recipients
                 SET is_operational_active = CASE WHEN LOWER(TRIM(COALESCE(?, ''))) = 'aktif' THEN 1 ELSE 0 END
                 WHERE student_id = ? AND branch_id = ?`,
                [status, studentId, oldData[0].branch_id]
            );
        } catch (_) {}

        // Sync related tables by student_id (safer than matching old name/class)
        if (oldName !== nama || oldClass !== kelas) {
            // ensure class exists + get class_id
            await conn.query('INSERT IGNORE INTO classes (branch_id, nama_kelas) VALUES (?, ?)', [oldData[0].branch_id, kelas]);
            const [cls] = await conn.query('SELECT id FROM classes WHERE branch_id = ? AND nama_kelas = ? LIMIT 1', [oldData[0].branch_id, kelas]);
            const classId = cls[0] ? cls[0].id : null;

            try {
                await conn.query('UPDATE students SET class_id = ? WHERE id = ?', [classId, studentId]);
            } catch (_) {}

            await conn.query('UPDATE bills SET nama_siswa = ?, kelas = ?, class_id = ? WHERE student_id = ? AND branch_id = ?', [nama, kelas, classId, studentId, oldData[0].branch_id]);
            await conn.query('UPDATE payments SET nama = ?, kelas = ?, class_id = ? WHERE student_id = ? AND branch_id = ?', [nama, kelas, classId, studentId, oldData[0].branch_id]);
            await conn.query('UPDATE scholarship_recipients SET nama_siswa = ?, kelas = ?, class_id = ? WHERE student_id = ? AND branch_id = ?', [
                nama,
                kelas,
                classId,
                studentId,
                oldData[0].branch_id
            ]);
        }

        await conn.commit();
        res.json({ success: true });
    } catch (e) {
        await conn.rollback();
        res.status(500).json({ success: false, message: e.message });
    } finally {
        conn.release();
    }
});

router.delete('/students/:id', async (req, res) => {
    try {
        if (!ensureNotSuperAdminReadOnly(req, res)) return;
        if (!ensureBranchForAdmin(req, res)) return;
        const branchId = resolveBranchId(req, ['branch_id']) || getSessionBranchId(req);
        const [studentRows] = await db.query(
            `SELECT id, branch_id FROM students WHERE id = ? ${isSuperAdmin(req) && !branchId ? '' : 'AND branch_id = ?'} LIMIT 1`,
            isSuperAdmin(req) && !branchId ? [req.params.id] : [req.params.id, branchId]
        );
        if (!studentRows.length) return res.status(404).json({ success: false, message: 'Siswa tidak ditemukan.' });

        const [billRows] = await db.query(
            `SELECT COALESCE(SUM(sisa), 0) AS total_sisa
             FROM bills
             WHERE branch_id = ?
               AND student_id = ?
               AND sisa > 0`,
            [studentRows[0].branch_id, req.params.id]
        );
        const totalSisa = Number(billRows[0]?.total_sisa || 0);
        if (totalSisa > 0) {
            return res.status(400).json({
                success: false,
                code: 'STUDENT_HAS_ARREARS',
                totalSisa,
                message: `Siswa tidak bisa dihapus karena masih memiliki tagihan sebesar Rp ${totalSisa.toLocaleString('id-ID')}.`
            });
        }

        await db.query(
            `DELETE FROM students WHERE id=? ${isSuperAdmin(req) && !branchId ? '' : 'AND branch_id = ?'}`,
            isSuperAdmin(req) && !branchId ? [req.params.id] : [req.params.id, branchId]
        );
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false });
    }
});

router.get('/students/:id/delete-preview', async (req, res) => {
    try {
        if (!ensureBranchForAdmin(req, res)) return;
        const branchId = resolveBranchId(req, ['branch_id']) || getSessionBranchId(req);
        const studentId = req.params.id;
        const [studentRows] = await db.query(
            `SELECT id, branch_id FROM students WHERE id = ? ${isSuperAdmin(req) && !branchId ? '' : 'AND branch_id = ?'} LIMIT 1`,
            isSuperAdmin(req) && !branchId ? [studentId] : [studentId, branchId]
        );
        if (!studentRows.length) return res.status(404).json({ success: false, message: 'Siswa tidak ditemukan.' });

        const [billRows] = await db.query(
            `SELECT COALESCE(SUM(sisa), 0) AS total_sisa
             FROM bills
             WHERE branch_id = ?
               AND student_id = ?
               AND sisa > 0`,
            [studentRows[0].branch_id, studentId]
        );
        const totalSisa = Number(billRows[0]?.total_sisa || 0);
        return res.json({ success: true, totalSisa, canDelete: totalSisa <= 0 });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

router.get('/students/:id/deactivate-preview', async (req, res) => {
    try {
        if (!ensureBranchForAdmin(req, res)) return;
        const branchId = resolveBranchId(req, ['branch_id']) || getSessionBranchId(req);
        const studentId = req.params.id;
        const [studentRows] = await db.query(
            `SELECT id, status, branch_id FROM students WHERE id = ? ${isSuperAdmin(req) && !branchId ? '' : 'AND branch_id = ?'} LIMIT 1`,
            isSuperAdmin(req) && !branchId ? [studentId] : [studentId, branchId]
        );
        if (!studentRows.length) return res.status(404).json({ success: false, message: 'Siswa tidak ditemukan.' });
        if (String(studentRows[0].status || '').toLowerCase() !== 'aktif') {
            return res.status(400).json({ success: false, message: 'Hanya siswa aktif yang bisa dinonaktifkan.' });
        }

        const [billRows] = await db.query(
            `SELECT COALESCE(SUM(sisa), 0) AS total_sisa
             FROM bills
             WHERE branch_id = ?
               AND student_id = ?
               AND sisa > 0`,
            [studentRows[0].branch_id, studentId]
        );

        res.json({ success: true, totalSisa: Number(billRows[0]?.total_sisa || 0) });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

router.post('/students/:id/deactivate', async (req, res) => {
    try {
        if (!ensureNotSuperAdminReadOnly(req, res)) return;
        if (!ensureBranchForAdmin(req, res)) return;
        const branchId = resolveBranchId(req, ['branch_id']) || getSessionBranchId(req);
        const [rows] = await db.query(
            `SELECT id, status FROM students WHERE id = ? ${isSuperAdmin(req) && !branchId ? '' : 'AND branch_id = ?'} LIMIT 1`,
            isSuperAdmin(req) && !branchId ? [req.params.id] : [req.params.id, branchId]
        );
        if (!rows.length) return res.status(404).json({ success: false, message: 'Siswa tidak ditemukan.' });
        if (String(rows[0].status || '').toLowerCase() !== 'aktif') {
            return res.status(400).json({ success: false, message: 'Hanya siswa aktif yang bisa dinonaktifkan.' });
        }
        const hasTahunLulus = await hasTahunLulusColumn(db);
        if (!hasTahunLulus) {
            await ensureTahunLulusColumn(db);
        }
        const finalHasTahunLulus = await hasTahunLulusColumn(db);
        if (finalHasTahunLulus) {
            await db.query(
                `UPDATE students SET status = ?, tahun_lulus = NULL WHERE id = ? ${isSuperAdmin(req) && !branchId ? '' : 'AND branch_id = ?'}`,
                isSuperAdmin(req) && !branchId ? ['Nonaktif', req.params.id] : ['Nonaktif', req.params.id, branchId]
            );
        } else {
            await db.query(
                `UPDATE students SET status = ? WHERE id = ? ${isSuperAdmin(req) && !branchId ? '' : 'AND branch_id = ?'}`,
                isSuperAdmin(req) && !branchId ? ['Nonaktif', req.params.id] : ['Nonaktif', req.params.id, branchId]
            );
        }
        try {
            await db.query(
                `UPDATE scholarship_recipients
                 SET is_operational_active = 0
                 WHERE student_id = ? ${isSuperAdmin(req) && !branchId ? '' : 'AND branch_id = ?'}`,
                isSuperAdmin(req) && !branchId ? [req.params.id] : [req.params.id, branchId]
            );
        } catch (_) {}
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

router.post('/students/:id/activate', async (req, res) => {
    try {
        if (!ensureNotSuperAdminReadOnly(req, res)) return;
        if (!ensureBranchForAdmin(req, res)) return;
        const branchId = resolveBranchId(req, ['branch_id']) || getSessionBranchId(req);
        const [rows] = await db.query(
            `SELECT id, status FROM students WHERE id = ? ${isSuperAdmin(req) && !branchId ? '' : 'AND branch_id = ?'} LIMIT 1`,
            isSuperAdmin(req) && !branchId ? [req.params.id] : [req.params.id, branchId]
        );
        if (!rows.length) return res.status(404).json({ success: false, message: 'Siswa tidak ditemukan.' });
        if (String(rows[0].status || '').toLowerCase() !== 'nonaktif') {
            return res.status(400).json({ success: false, message: 'Hanya siswa nonaktif yang bisa diaktifkan.' });
        }
        await db.query(
            `UPDATE students SET status = ? WHERE id = ? ${isSuperAdmin(req) && !branchId ? '' : 'AND branch_id = ?'}`,
            isSuperAdmin(req) && !branchId ? ['Aktif', req.params.id] : ['Aktif', req.params.id, branchId]
        );
        try {
            await db.query(
                `UPDATE scholarship_recipients
                 SET is_operational_active = 1
                 WHERE student_id = ? ${isSuperAdmin(req) && !branchId ? '' : 'AND branch_id = ?'}`,
                isSuperAdmin(req) && !branchId ? [req.params.id] : [req.params.id, branchId]
            );
        } catch (_) {}
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// Template Excel
router.get('/students/template', (req, res) => {
    try {
        const wb = xlsx.utils.book_new();
        const headers = [
            {
                NIS: '1001',
                NISN: '0012345678',
                'Nama Lengkap': 'Contoh Siswa',
                Kelas: '10 IPA',
                'Tahun Masuk': '2026',
                'Jenis Kelamin (L/P)': 'L',
                'Tempat Lahir': 'Jakarta',
                'Tanggal Lahir (YYYY-MM-DD)': '2010-01-01',
                Alamat: 'Jl. Contoh No. 1',
                'Asal Sekolah': 'SMPN 1 Jakarta',
                'Nama Wali': 'Bapak Contoh',
                'No HP Wali': '08123456789'
            }
        ];
        const ws = xlsx.utils.json_to_sheet(headers);
        ws['!cols'] = [{ wch: 10 }, { wch: 15 }, { wch: 30 }, { wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 15 }, { wch: 15 }, { wch: 30 }, { wch: 25 }, { wch: 20 }, { wch: 15 }];
        xlsx.utils.book_append_sheet(wb, ws, 'Template Siswa');
        const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Disposition', 'attachment; filename="Template_Import_Siswa.xlsx"');
        res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

router.post('/students/import', upload.single('file'), async (req, res) => {
    const conn = await db.getConnection();
    try {
        if (!ensureNotSuperAdminReadOnly(req, res)) return;
        if (!ensureBranchForAdmin(req, res)) return;
        const branchId = resolveBranchId(req, ['branch_id']) || getSessionBranchId(req) || 1;
        if (!req.file) return res.status(400).json({ success: false, message: 'File tidak ditemukan.' });
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const rawData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { raw: true, defval: '' });
        if (rawData.length === 0) return res.status(400).json({ success: false, message: 'File Excel kosong.' });

        await conn.beginTransaction();
        await ensureAsalSekolahColumn(conn);
        const hasAsalSekolah = await hasAsalSekolahColumn(conn);
        let successCount = 0;
        let errors = [];

        for (const [index, row] of rawData.entries()) {
            const nis = String(getRowValue(row, 'NIS') || '').trim();
            const nama = String(getRowValue(row, 'Nama Lengkap') || '').trim();
            const kelas = String(getRowValue(row, 'Kelas') || '').trim();
            const tahunMasuk = String(getRowValue(row, 'Tahun Masuk') || '').trim();
            const jenisKelaminRaw = String(getRowValue(row, 'Jenis Kelamin (L/P)') || 'L').trim().toUpperCase();
            const jenisKelamin = jenisKelaminRaw === 'P' ? 'P' : 'L';
            const tanggalLahir = toYmdDate(getRowValue(row, 'Tanggal Lahir (YYYY-MM-DD)'));
            const rawTanggalLahir = String(getRowValue(row, 'Tanggal Lahir (YYYY-MM-DD)') || '').trim();

            if (!nis || !nama || !kelas || !tahunMasuk) {
                errors.push(`Baris ${index + 2}: NIS/Nama/Kelas/Tahun Masuk wajib diisi.`);
                continue;
            }
            if (rawTanggalLahir && !tanggalLahir) {
                errors.push(`Baris ${index + 2}: format Tanggal Lahir harus YYYY-MM-DD atau tanggal Excel valid.`);
                continue;
            }

            const [exist] = await conn.query('SELECT id FROM students WHERE nis = ? AND branch_id = ?', [nis, branchId]);
            if (exist.length > 0) {
                errors.push(`Baris ${index + 2}: NIS ${nis} sudah ada.`);
                continue;
            }

            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(String(nis), salt);

            await conn.query('INSERT IGNORE INTO classes (branch_id, nama_kelas) VALUES (?, ?)', [branchId, kelas]);
            const [cls] = await conn.query('SELECT id FROM classes WHERE branch_id = ? AND nama_kelas = ? LIMIT 1', [branchId, kelas]);
            const classId = cls[0] ? cls[0].id : null;

            await conn.query(
                hasAsalSekolah
                    ? `INSERT INTO students (nis, nisn, username, password, nama, jenis_kelamin, tempat_lahir, tanggal_lahir, alamat, asal_sekolah, nama_wali, no_hp_wali, kelas, class_id, status, tahun_masuk, branch_id)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Aktif', ?, ?)`
                    : `INSERT INTO students (nis, nisn, username, password, nama, jenis_kelamin, tempat_lahir, tanggal_lahir, alamat, nama_wali, no_hp_wali, kelas, class_id, status, tahun_masuk, branch_id)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Aktif', ?, ?)`,
                hasAsalSekolah
                    ? [
                        nis,
                        String(getRowValue(row, 'NISN') || '').trim() || null,
                        String(nis),
                        hashedPassword,
                        nama,
                        jenisKelamin,
                        String(getRowValue(row, 'Tempat Lahir') || '').trim() || null,
                        tanggalLahir,
                        String(getRowValue(row, 'Alamat') || '').trim() || null,
                        String(getRowValue(row, 'Asal Sekolah') || '').trim() || null,
                        String(getRowValue(row, 'Nama Wali') || '').trim() || null,
                        String(getRowValue(row, 'No HP Wali') || '').trim() || null,
                        kelas,
                        classId,
                        String(tahunMasuk).trim(),
                        branchId
                    ]
                    : [
                        nis,
                        String(getRowValue(row, 'NISN') || '').trim() || null,
                        String(nis),
                        hashedPassword,
                        nama,
                        jenisKelamin,
                        String(getRowValue(row, 'Tempat Lahir') || '').trim() || null,
                        tanggalLahir,
                        String(getRowValue(row, 'Alamat') || '').trim() || null,
                        String(getRowValue(row, 'Nama Wali') || '').trim() || null,
                        String(getRowValue(row, 'No HP Wali') || '').trim() || null,
                        kelas,
                        classId,
                        String(tahunMasuk).trim(),
                        branchId
                    ]
            );
            successCount++;
        }
        await conn.commit();
        res.json({ success: true, message: `Sukses import ${successCount} siswa.`, errors });
    } catch (err) {
        await conn.rollback();
        res.status(500).json({ success: false, message: `Format Excel salah: ${err.message}` });
    } finally {
        conn.release();
    }
});

router.post('/students/promote', async (req, res) => {
    const conn = await db.getConnection();
    try {
        if (!ensureNotSuperAdminReadOnly(req, res)) return;
        if (!ensureBranchForAdmin(req, res)) return;
        const branchId = resolveBranchId(req, ['branch_id']) || getSessionBranchId(req);
        await conn.beginTransaction();
        await ensureTahunLulusColumn(conn);
        const { studentIds, targetClass, targetStatus, tahunLulus } = req.body;
        if (!studentIds || studentIds.length === 0) return res.status(400).json({ success: false, message: 'Pilih siswa.' });
        const normalizedStatus = targetClass === 'ALUMNI' ? 'Lulus' : (targetStatus || 'Aktif');
        const [students] = await conn.query(
            `SELECT id, nama, kelas, branch_id FROM students WHERE id IN (?) ${isSuperAdmin(req) && !branchId ? '' : 'AND branch_id = ?'}`,
            isSuperAdmin(req) && !branchId ? [studentIds] : [studentIds, branchId]
        );

        for (let s of students) {
            const finalClass = targetClass === 'ALUMNI' ? s.kelas : targetClass;
            const [targetClassRows] = await conn.query(
                'SELECT id FROM classes WHERE branch_id = ? AND nama_kelas = ? LIMIT 1',
                [s.branch_id, finalClass]
            );
            const finalClassId = Number(targetClassRows[0]?.id || 0) || null;
            const finalTahunLulus = normalizedStatus === 'Lulus'
                ? (parseInt(tahunLulus, 10) || new Date().getFullYear())
                : null;
            const hasTahunLulus = await hasTahunLulusColumn(conn);
            if (hasTahunLulus) {
                await conn.query(
                    'UPDATE students SET kelas = ?, class_id = ?, status = ?, tahun_lulus = ? WHERE id = ?',
                    [finalClass, finalClassId, normalizedStatus, finalTahunLulus, s.id]
                );
            } else {
                await conn.query(
                    'UPDATE students SET kelas = ?, class_id = ?, status = ? WHERE id = ?',
                    [finalClass, finalClassId, normalizedStatus, s.id]
                );
            }
            try {
                await conn.query(
                    `UPDATE scholarship_recipients
                     SET is_operational_active = CASE WHEN LOWER(TRIM(COALESCE(?, ''))) = 'aktif' THEN 1 ELSE 0 END
                     WHERE student_id = ? AND branch_id = ?`,
                    [normalizedStatus, s.id, s.branch_id]
                );
            } catch (_) {}
            if (s.kelas !== finalClass) {
                await conn.query(
                    'UPDATE bills SET kelas = ?, class_id = ? WHERE student_id = ? AND branch_id = ?',
                    [finalClass, finalClassId, s.id, s.branch_id]
                );
                await conn.query(
                    'UPDATE payments SET kelas = ?, class_id = ? WHERE student_id = ? AND branch_id = ?',
                    [finalClass, finalClassId, s.id, s.branch_id]
                );
                await conn.query(
                    'UPDATE scholarship_recipients SET kelas = ?, class_id = ? WHERE student_id = ? AND branch_id = ?',
                    [finalClass, finalClassId, s.id, s.branch_id]
                );
            }
        }
        await conn.commit();
        res.json({ success: true, message: `Berhasil memproses ${studentIds.length} siswa.` });
    } catch (err) {
        await conn.rollback();
        res.status(500).json({ success: false, message: err.message });
    } finally {
        conn.release();
    }
});

module.exports = router;
