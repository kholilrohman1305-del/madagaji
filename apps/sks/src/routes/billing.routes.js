const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const xlsx = require('xlsx');
const db = require('../../db');
const { isSuperAdmin, getSessionBranchId, resolveBranchId, ensureBranchForAdmin } = require('../utils/branchScope');
const dashboardRoutes = require('./dashboard.routes');

const { validate, isNonEmptyString, isFiniteNumber, toNumber, isIsoDateYYYYMMDD } = require('../middlewares/validate');

const router = express.Router();
let hasTahunLulusCache = null;
let hasRecipientOperationalFlagCache = null;
let paymentSecurityEnsured = false;
let billAcademicColumnsEnsured = false;
let paymentRevisionSchemaEnsured = false;
const ARREARS_CACHE_TTL_MS = 45000;
const arrearsCache = new Map();
let billingPerfIndexesEnsured = false;
let billingPerfIndexesEnsuringPromise = null;
let studentFinanceSummaryEnsured = false;
let studentFinanceSummaryRefreshingPromise = null;
let studentFinanceSummaryLastRefreshedAt = 0;
const STUDENT_FINANCE_SUMMARY_REFRESH_MS = 120000;

const billingImportUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname || '').toLowerCase();
        const okExt = ext === '.xlsx';
        const okMime =
            file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
            file.mimetype === 'application/octet-stream';
        if (!okExt || !okMime) return cb(new Error('Only .xlsx files are allowed'));
        cb(null, true);
    }
});

function normalizeImportKey(raw) {
    return String(raw || '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function getImportCell(row, aliases = []) {
    if (!row || typeof row !== 'object') return '';
    const normalizedMap = new Map();
    Object.keys(row).forEach((key) => {
        normalizedMap.set(normalizeImportKey(key), row[key]);
    });
    for (const alias of aliases) {
        const val = normalizedMap.get(normalizeImportKey(alias));
        if (val !== undefined) return val;
    }
    return '';
}

function parseMoney(value) {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
    const raw = String(value).trim();
    if (!raw) return 0;
    const negative = raw.includes('-');
    const digits = raw.replace(/[^\d]/g, '');
    if (!digits) return 0;
    const amount = Number.parseInt(digits, 10);
    if (!Number.isFinite(amount)) return 0;
    return negative ? -amount : amount;
}

function parseImportDateToYmd(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number' && Number.isFinite(value)) {
        const parsed = xlsx.SSF.parse_date_code(value);
        if (!parsed || !parsed.y || !parsed.m || !parsed.d) return null;
        return `${String(parsed.y).padStart(4, '0')}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
    const raw = String(value).trim();
    if (!raw) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slash) {
        const d = Number(slash[1]);
        const m = Number(slash[2]);
        const y = Number(slash[3]);
        if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
            return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        }
    }
    return null;
}

function ensureNotSuperAdminReadOnly(req, res) {
    if (isSuperAdmin(req)) {
        res.status(403).json({ success: false, message: 'Super admin hanya dapat melihat data transaksi.' });
        return false;
    }
    return true;
}

function buildArrearsCacheKey(req, scope, params = {}) {
    return JSON.stringify({
        role: String(req.session?.userRole || ''),
        userId: Number(req.session?.adminId || 0),
        scopeBranch: Number(scope?.branchId || 0),
        search: String(params.search || ''),
        kelas: String(params.kelas || ''),
        status: String(params.status || ''),
        page: Number(params.page || 1),
        limit: Number(params.limit || 10)
    });
}

function getCachedArrears(cacheKey) {
    const entry = arrearsCache.get(cacheKey);
    if (!entry) return null;
    if (Date.now() - Number(entry.cachedAt || 0) > ARREARS_CACHE_TTL_MS) {
        arrearsCache.delete(cacheKey);
        return null;
    }
    return entry.payload || null;
}

function invalidateBillingReadModels() {
    arrearsCache.clear();
    triggerStudentFinanceSummaryRefresh(true);
    if (typeof dashboardRoutes.invalidateDashboardCaches === 'function') {
        dashboardRoutes.invalidateDashboardCaches();
    }
}

function triggerBillingPerfIndexesEnsure() {
    if (billingPerfIndexesEnsured || billingPerfIndexesEnsuringPromise) return;
    const defs = [
        ['bills', 'idx_bills_branch_student_kelas_sisa', 'CREATE INDEX idx_bills_branch_student_kelas_sisa ON bills(branch_id, student_id, kelas, sisa)'],
        ['bills', 'idx_bills_student_sisa', 'CREATE INDEX idx_bills_student_sisa ON bills(student_id, sisa)'],
        ['bills', 'idx_bills_sisa_student_branch', 'CREATE INDEX idx_bills_sisa_student_branch ON bills(sisa, student_id, branch_id)'],
        ['bills', 'idx_bills_branch_nama_kelas', 'CREATE INDEX idx_bills_branch_nama_kelas ON bills(branch_id, nama_siswa, kelas)'],
        ['students', 'idx_students_branch_kelas_status_nama', 'CREATE INDEX idx_students_branch_kelas_status_nama ON students(branch_id, kelas, status, nama)'],
        ['students', 'idx_students_branch_nama_kelas', 'CREATE INDEX idx_students_branch_nama_kelas ON students(branch_id, nama, kelas)']
    ];
    billingPerfIndexesEnsuringPromise = (async () => {
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
                    if (Number(err?.errno || 0) !== 1061) {
                        throw err;
                    }
                }
            }
        }
        billingPerfIndexesEnsured = true;
    })()
        .catch((err) => {
            console.warn('[ensureBillingPerfIndexes] warning:', err?.message || err);
        })
        .finally(() => {
            billingPerfIndexesEnsuringPromise = null;
        });
}

async function ensureStudentFinanceSummaryTable() {
    if (studentFinanceSummaryEnsured) return;
    await db.query(`
        CREATE TABLE IF NOT EXISTS student_finance_summary (
            student_id INT NOT NULL PRIMARY KEY,
            total_tagihan DECIMAL(18,2) NOT NULL DEFAULT 0,
            total_terbayar DECIMAL(18,2) NOT NULL DEFAULT 0,
            total_sisa DECIMAL(18,2) NOT NULL DEFAULT 0,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_sfs_total_sisa (total_sisa),
            INDEX idx_sfs_updated_at (updated_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
    studentFinanceSummaryEnsured = true;
}

async function refreshStudentFinanceSummary() {
    await ensureStudentFinanceSummaryTable();
    await db.query(
        `REPLACE INTO student_finance_summary (
            student_id,
            total_tagihan,
            total_terbayar,
            total_sisa
        )
        SELECT
            s.id AS student_id,
            COALESCE(sb.total_tagihan, 0) AS total_tagihan,
            COALESCE(sb.total_terbayar, 0) AS total_terbayar,
            COALESCE(sb.total_sisa, 0) AS total_sisa
        FROM students s
        LEFT JOIN (
            SELECT
                b.student_id,
                COALESCE(SUM(COALESCE(b.total, 0)), 0) AS total_tagihan,
                COALESCE(SUM(LEAST(COALESCE(b.total, 0), GREATEST(0, COALESCE(b.terbayar, 0)))), 0) AS total_terbayar,
                COALESCE(SUM(GREATEST(0, COALESCE(b.sisa, 0))), 0) AS total_sisa
            FROM bills b
            GROUP BY b.student_id
        ) sb ON sb.student_id = s.id`
    );
    await db.query(
        `DELETE sfs
         FROM student_finance_summary sfs
         LEFT JOIN students s ON s.id = sfs.student_id
         WHERE s.id IS NULL`
    );
    studentFinanceSummaryLastRefreshedAt = Date.now();
}

function triggerStudentFinanceSummaryRefresh(force = false) {
    if (!force && (Date.now() - studentFinanceSummaryLastRefreshedAt) < STUDENT_FINANCE_SUMMARY_REFRESH_MS) return;
    if (studentFinanceSummaryRefreshingPromise) return;
    studentFinanceSummaryRefreshingPromise = refreshStudentFinanceSummary()
        .catch((err) => {
            console.warn('[studentFinanceSummary] warning:', err?.message || err);
        })
        .finally(() => {
            studentFinanceSummaryRefreshingPromise = null;
        });
}

async function ensureStudentFinanceSummarySeeded() {
    await ensureStudentFinanceSummaryTable();
    const [rows] = await db.query('SELECT COUNT(*) AS total FROM student_finance_summary');
    if (Number(rows[0]?.total || 0) <= 0) {
        await refreshStudentFinanceSummary();
    } else {
        triggerStudentFinanceSummaryRefresh(false);
    }
}

async function hasTahunLulusColumn() {
    if (hasTahunLulusCache === true) return true;
    try {
        const [rows] = await db.query(
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

async function hasRecipientOperationalFlag() {
    if (hasRecipientOperationalFlagCache !== null) return hasRecipientOperationalFlagCache;
    try {
        const [rows] = await db.query(
            `SELECT COUNT(*) AS cnt
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'scholarship_recipients'
               AND COLUMN_NAME = 'is_operational_active'`
        );
        hasRecipientOperationalFlagCache = Number(rows[0]?.cnt || 0) > 0;
    } catch (_) {
        hasRecipientOperationalFlagCache = false;
    }
    return hasRecipientOperationalFlagCache;
}

async function ensurePaymentSecurityColumns(connLike = db) {
    if (paymentSecurityEnsured) return;
    const [settingsPinRows] = await connLike.query(
        `SELECT COUNT(*) AS cnt
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'school_settings'
           AND COLUMN_NAME = 'payment_pin_hash'`
    );
    if (Number(settingsPinRows[0]?.cnt || 0) === 0) {
        await connLike.query('ALTER TABLE school_settings ADD COLUMN payment_pin_hash VARCHAR(255) NULL AFTER logo_url');
    }
    const [branchPinRows] = await connLike.query(
        `SELECT COUNT(*) AS cnt
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'branches'
           AND COLUMN_NAME = 'payment_pin_hash'`
    );
    if (Number(branchPinRows[0]?.cnt || 0) === 0) {
        await connLike.query('ALTER TABLE branches ADD COLUMN payment_pin_hash VARCHAR(255) NULL AFTER telepon');
    }

    const [paymentsTokenRows] = await connLike.query(
        `SELECT COUNT(*) AS cnt
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'payments'
           AND COLUMN_NAME = 'qr_token'`
    );
    if (Number(paymentsTokenRows[0]?.cnt || 0) === 0) {
        await connLike.query('ALTER TABLE payments ADD COLUMN qr_token VARCHAR(64) NULL AFTER class_id');
    }

    const [paymentsPayloadRows] = await connLike.query(
        `SELECT COUNT(*) AS cnt
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'payments'
           AND COLUMN_NAME = 'qr_payload'`
    );
    if (Number(paymentsPayloadRows[0]?.cnt || 0) === 0) {
        await connLike.query('ALTER TABLE payments ADD COLUMN qr_payload TEXT NULL AFTER qr_token');
    }

    paymentSecurityEnsured = true;
}

async function ensureBillsAcademicColumns(connLike = db) {
    if (billAcademicColumnsEnsured) return;
    const [rows] = await connLike.query(
        `SELECT COUNT(*) AS cnt
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'bills'
           AND COLUMN_NAME = 'school_year_name'`
    );
    if (Number(rows[0]?.cnt || 0) === 0) {
        await connLike.query("ALTER TABLE bills ADD COLUMN school_year_name VARCHAR(20) NULL AFTER tanggal_buat");
    }
    const billSchemaAlters = [];
    const [baseRows] = await connLike.query(
        `SELECT COUNT(*) AS cnt
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'bills'
           AND COLUMN_NAME = 'base_total'`
    );
    if (Number(baseRows[0]?.cnt || 0) === 0) billSchemaAlters.push("ADD COLUMN base_total DECIMAL(15,2) NULL AFTER total");
    const [discountRows] = await connLike.query(
        `SELECT COUNT(*) AS cnt
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'bills'
           AND COLUMN_NAME = 'scholarship_discount'`
    );
    if (Number(discountRows[0]?.cnt || 0) === 0) billSchemaAlters.push("ADD COLUMN scholarship_discount DECIMAL(15,2) NOT NULL DEFAULT 0 AFTER base_total");
    const [netRows] = await connLike.query(
        `SELECT COUNT(*) AS cnt
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'bills'
           AND COLUMN_NAME = 'net_total'`
    );
    if (Number(netRows[0]?.cnt || 0) === 0) billSchemaAlters.push("ADD COLUMN net_total DECIMAL(15,2) NULL AFTER scholarship_discount");
    const [percentRows] = await connLike.query(
        `SELECT COUNT(*) AS cnt
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'bills'
           AND COLUMN_NAME = 'scholarship_percent_applied'`
    );
    if (Number(percentRows[0]?.cnt || 0) === 0) billSchemaAlters.push("ADD COLUMN scholarship_percent_applied DECIMAL(5,2) NOT NULL DEFAULT 0 AFTER net_total");
    if (billSchemaAlters.length) {
        await connLike.query(`ALTER TABLE bills ${billSchemaAlters.join(', ')}`);
    }
    await connLike.query(
        `UPDATE bills
         SET base_total = COALESCE(base_total, total),
             net_total = COALESCE(net_total, total - COALESCE(scholarship_discount, 0))
         WHERE base_total IS NULL OR net_total IS NULL`
    );
    billAcademicColumnsEnsured = true;
}

async function ensurePaymentRevisionSchema(connLike = db) {
    if (paymentRevisionSchemaEnsured) return;
    const alters = [];
    const [isReversedRows] = await connLike.query(
        `SELECT COUNT(*) AS cnt
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'payments'
           AND COLUMN_NAME = 'is_reversed'`
    );
    if (Number(isReversedRows[0]?.cnt || 0) === 0) alters.push("ADD COLUMN is_reversed TINYINT(1) NOT NULL DEFAULT 0");
    const [reversedAtRows] = await connLike.query(
        `SELECT COUNT(*) AS cnt
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'payments'
           AND COLUMN_NAME = 'reversed_at'`
    );
    if (Number(reversedAtRows[0]?.cnt || 0) === 0) alters.push("ADD COLUMN reversed_at DATETIME NULL");
    const [reversalReasonRows] = await connLike.query(
        `SELECT COUNT(*) AS cnt
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'payments'
           AND COLUMN_NAME = 'reversal_reason'`
    );
    if (Number(reversalReasonRows[0]?.cnt || 0) === 0) alters.push("ADD COLUMN reversal_reason TEXT NULL");
    const [revisedFromRows] = await connLike.query(
        `SELECT COUNT(*) AS cnt
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'payments'
           AND COLUMN_NAME = 'revised_from_payment_id'`
    );
    if (Number(revisedFromRows[0]?.cnt || 0) === 0) alters.push("ADD COLUMN revised_from_payment_id INT NULL");
    if (alters.length) await connLike.query(`ALTER TABLE payments ${alters.join(', ')}`);

    await connLike.query(`
        CREATE TABLE IF NOT EXISTS payment_revision_logs (
            id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            old_payment_id INT NOT NULL,
            new_payment_id INT NULL,
            branch_id INT NULL,
            reason TEXT NOT NULL,
            old_payload JSON NULL,
            new_payload JSON NULL,
            actor_user_id INT NULL,
            actor_role VARCHAR(30) NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_payment_revision_old (old_payment_id),
            INDEX idx_payment_revision_new (new_payment_id),
            INDEX idx_payment_revision_branch (branch_id),
            INDEX idx_payment_revision_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
    paymentRevisionSchemaEnsured = true;
}

async function getActiveSchoolYearName(connLike = db) {
    const [rows] = await connLike.query('SELECT name FROM school_years WHERE is_active = 1 ORDER BY id DESC LIMIT 1');
    return rows[0]?.name || null;
}

function generateQrPayload({ transId, tanggal, nama, kelas, jumlahBayar, billRowId }) {
    return `SKS|TRX:${transId}|DATE:${tanggal}|NAME:${nama}|CLASS:${kelas}|AMOUNT:${Number(jumlahBayar)}|BILL:${billRowId || '-'}`;
}

function getBranchScope(req, candidates = ['branch_id']) {
    const branchId = resolveBranchId(req, candidates) || getSessionBranchId(req);
    const scoped = !isSuperAdmin(req) || branchId;
    return {
        branchId,
        scoped,
        clause: scoped ? ' AND branch_id = ? ' : '',
        whereClause: scoped ? ' WHERE branch_id = ? ' : '',
        params: scoped ? [branchId] : []
    };
}

function getWaliClass(req) {
    if (String(req.session?.userRole || '') !== 'wali_kelas') return null;
    const kelas = String(req.session?.homeroomClass || '').trim();
    return kelas || null;
}

function ensureWaliClassMatch(req, kelasValue, res) {
    const waliClass = getWaliClass(req);
    if (!waliClass) return waliClass;
    const requested = String(kelasValue || '').trim();
    if (!requested || requested !== waliClass) {
        res.status(403).json({ success: false, message: 'Akses kelas tidak diizinkan untuk akun wali kelas.' });
        return null;
    }
    return waliClass;
}

async function getStudentPercentScholarshipMap(connLike, scope, studentIds = []) {
    const ids = Array.isArray(studentIds) ? studentIds.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0) : [];
    if (!ids.length) return new Map();
    const whereStudent = ` AND r.student_id IN (${ids.map(() => '?').join(',')})`;
    const [rows] = await connLike.query(
        `SELECT r.student_id, MAX(t.nominal_per_siswa) AS percent_value
         FROM scholarship_recipients r
         JOIN scholarship_types t ON r.type_id = t.id
         JOIN students s ON s.id = r.student_id
         WHERE t.jenis_nilai = 'persen'
           AND COALESCE(t.is_active, 1) = 1
           AND LOWER(TRIM(COALESCE(s.status, ''))) = 'aktif'
           AND (t.start_date IS NULL OR t.start_date <= CURRENT_DATE())
           AND (t.end_date IS NULL OR t.end_date >= CURRENT_DATE())
           ${scope.clause}
           ${whereStudent}
         GROUP BY r.student_id`,
        [...scope.params, ...ids]
    );
    const map = new Map();
    rows.forEach((row) => {
        const sid = Number(row.student_id);
        const pct = Math.max(0, Math.min(100, Number(row.percent_value || 0)));
        if (sid > 0 && pct > 0) map.set(sid, pct);
    });
    return map;
}

async function resolveTargetActiveStudents(connLike, scope, { targetClasses = [], targetStudentIds = [] } = {}) {
    const selectedClasses = Array.isArray(targetClasses) ? targetClasses.filter(Boolean) : [];
    const selectedStudentIds = Array.isArray(targetStudentIds)
        ? targetStudentIds.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0)
        : [];
    if (!selectedClasses.length && !selectedStudentIds.length) return [];

    if (selectedStudentIds.length > 0) {
        const [rows] = await connLike.query(
            `SELECT *
             FROM students
             WHERE id IN (?)
               AND LOWER(TRIM(COALESCE(status, ''))) = 'aktif'
               ${scope.clause}`,
            [selectedStudentIds, ...scope.params]
        );
        return rows;
    }
    const [rows] = await connLike.query(
        `SELECT *
         FROM students
         WHERE kelas IN (?)
           AND LOWER(TRIM(COALESCE(status, ''))) = 'aktif'
           ${scope.clause}`,
        [selectedClasses, ...scope.params]
    );
    return rows;
}

async function applyAutoPercentScholarshipPayment(connLike, student, billId, billAmount, billDate, scope, explicitPercent = null) {
    const studentId = Number(student?.id || 0);
    if (!studentId || !billId) return 0;
    let percent = Number(explicitPercent);
    if (!Number.isFinite(percent)) {
        const scholarshipMap = await getStudentPercentScholarshipMap(connLike, scope, [studentId]);
        percent = Number(scholarshipMap.get(studentId) || 0);
    }
    if (percent <= 0) return 0;

    const nominalTagihan = Number(billAmount || 0);
    const autoPaid = Math.min(nominalTagihan, nominalTagihan * (percent / 100));
    if (autoPaid <= 0) return 0;

    await connLike.query(
        `UPDATE bills
         SET terbayar = terbayar + ?,
             sisa = GREATEST(0, sisa - ?),
             status = CASE WHEN (sisa - ?) <= 0 THEN 'Lunas' ELSE status END
         WHERE id = ? ${scope.clause}`,
        [autoPaid, autoPaid, autoPaid, billId, ...scope.params]
    );

    const transId = `AUTO-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
    await connLike.query(
        `INSERT INTO payments (trans_id, tanggal, kelas, nama, jumlah_bayar, penerima, keterangan, bill_id, student_id, class_id, branch_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            transId,
            billDate,
            student.kelas,
            student.nama,
            autoPaid,
            'Sistem (Auto)',
            `Potongan Otomatis ${percent}%`,
            billId,
            studentId,
            student.class_id || null,
            student.branch_id || scope.branchId || 1
        ]
    );
    return autoPaid;
}

async function verifyPaymentPin(connLike, req, pinInput) {
    const pin = String(pinInput || '').trim();
    if (!/^\d{6}$/.test(pin)) {
        return { ok: false, message: 'PIN transaksi harus 6 digit angka.' };
    }

    await ensurePaymentSecurityColumns(connLike);
    const branchId = getSessionBranchId(req);
    const isBranch = !isSuperAdmin(req) && Number.isFinite(Number(branchId)) && Number(branchId) > 0;
    let hash = null;
    if (isBranch) {
        const [branchRows] = await connLike.query('SELECT payment_pin_hash FROM branches WHERE id = ? LIMIT 1', [branchId]);
        hash = branchRows[0]?.payment_pin_hash || null;
    } else {
        const [rows] = await connLike.query('SELECT payment_pin_hash FROM school_settings WHERE id = 1 LIMIT 1');
        hash = rows[0]?.payment_pin_hash || null;
    }
    if (!hash) {
        return { ok: false, message: `PIN transaksi belum diatur. Set PIN dulu di ${isBranch ? 'menu Profil' : 'pengaturan'}.` };
    }

    const matched = await bcrypt.compare(pin, hash);
    if (!matched) {
        return { ok: false, message: 'PIN transaksi tidak valid.' };
    }
    return { ok: true };
}

router.get('/arrears', async (req, res) => {
    try {
        if (!ensureBranchForAdmin(req, res)) return;
        triggerBillingPerfIndexesEnsure();
        await ensureStudentFinanceSummarySeeded();
        const hasOperationalFlag = await hasRecipientOperationalFlag();
        const recipientOperationalClause = hasOperationalFlag ? 'AND COALESCE(r.is_operational_active, 1) = 1' : '';
        const scope = getBranchScope(req, ['branch_id']);
        const waliClass = getWaliClass(req);
        const keywordRaw = String(req.query.search || '').trim();
        const classFilter = String(req.query.class || '').trim();
        const statusFilter = String(req.query.status || '').trim().toLowerCase();
        const page = Math.max(1, Number(req.query.page || 1));
        const limit = Math.min(100, Math.max(5, Number(req.query.limit || 10)));
        const offset = (page - 1) * limit;
        const cacheKey = buildArrearsCacheKey(req, scope, { search: keywordRaw, kelas: classFilter, status: statusFilter, page, limit });
        const cached = getCachedArrears(cacheKey);
        if (cached) {
            return res.json(cached);
        }
        const hasTahunLulus = await hasTahunLulusColumn();
        const where = [];
        const whereParams = [];

        if (scope.scoped) {
            where.push('s.branch_id = ?');
            whereParams.push(...scope.params);
        }
        if (waliClass) {
            where.push('s.kelas = ?');
            whereParams.push(waliClass);
        }
        if (classFilter) {
            where.push('s.kelas = ?');
            whereParams.push(classFilter);
        }
        if (statusFilter === 'aktif' || statusFilter === 'lulus') {
            where.push('LOWER(TRIM(COALESCE(s.status, ""))) = ?');
            whereParams.push(statusFilter);
        }
        if (keywordRaw) {
            where.push('(s.nama LIKE ? OR s.kelas LIKE ? OR COALESCE(s.nis, "") LIKE ?)');
            const keyword = `%${keywordRaw}%`;
            whereParams.push(keyword, keyword, keyword);
        }
        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

        const [countRows] = await db.query(
            `SELECT COUNT(*) AS total
             FROM students s
             ${whereSql}`,
            whereParams
        );
        const total = Number(countRows[0]?.total || 0);
        if (total <= 0) {
            const payload = {
                success: true,
                rows: [],
                pagination: { page, limit, total: 0, totalPages: 1 },
                summary: { total_siswa: 0, siswa_lunas: 0, siswa_tagihan: 0 }
            };
            arrearsCache.set(cacheKey, { payload, cachedAt: Date.now() });
            return res.json(payload);
        }

        const [studentPageRows] = await db.query(
            `SELECT
                s.id,
                s.branch_id,
                s.nama,
                s.kelas,
                s.status,
                s.tahun_masuk,
                ${hasTahunLulus ? 's.tahun_lulus' : 'NULL AS tahun_lulus'},
                COALESCE(sfs.total_tagihan, 0) AS totalTagihan,
                COALESCE(sfs.total_terbayar, 0) AS terbayar,
                COALESCE(sfs.total_sisa, 0) AS sisa
             FROM students s
             LEFT JOIN student_finance_summary sfs ON sfs.student_id = s.id
             ${whereSql}
             ORDER BY s.nama ASC
             LIMIT ? OFFSET ?`,
            [...whereParams, limit, offset]
        );

        const studentIds = studentPageRows.map((r) => Number(r.id || 0)).filter((v) => Number.isFinite(v) && v > 0);
        const beasiswaMap = new Map();

        if (studentIds.length > 0) {
            const [beasiswaRows] = await db.query(
                `SELECT
                    r.student_id,
                    GROUP_CONCAT(DISTINCT t.nama_beasiswa ORDER BY t.nama_beasiswa SEPARATOR ', ') AS nama_beasiswa
                 FROM scholarship_recipients r
                 JOIN scholarship_types t ON t.id = r.type_id
                 WHERE r.student_id IN (?) ${recipientOperationalClause}
                 GROUP BY r.student_id`,
                [studentIds]
            );
            beasiswaRows.forEach((r) => {
                beasiswaMap.set(Number(r.student_id || 0), String(r.nama_beasiswa || ''));
            });
        }

        const rows = studentPageRows.map((s) => {
            return {
                id: Number(s.id || 0),
                nama: s.nama,
                kelas: s.kelas,
                status: s.status,
                tahun_masuk: s.tahun_masuk,
                tahun_lulus: s.tahun_lulus || null,
                beasiswa: beasiswaMap.get(Number(s.id || 0)) || 'Non Beasiswa',
                totalTagihan: Number(s.totalTagihan || 0),
                terbayar: Number(s.terbayar || 0),
                sisa: Number(s.sisa || 0)
            };
        });

        const [summaryRows] = await db.query(
            `SELECT
                COUNT(*) AS total_siswa,
                SUM(CASE WHEN COALESCE(sfs.total_sisa, 0) <= 0 THEN 1 ELSE 0 END) AS siswa_lunas,
                SUM(CASE WHEN COALESCE(sfs.total_sisa, 0) > 0 THEN 1 ELSE 0 END) AS siswa_tagihan
             FROM students s
             LEFT JOIN student_finance_summary sfs ON sfs.student_id = s.id
             ${whereSql}`,
            whereParams
        );
        const payload = {
            success: true,
            rows,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.max(1, Math.ceil(total / limit))
            },
            summary: {
                total_siswa: Number(summaryRows[0]?.total_siswa || 0),
                siswa_lunas: Number(summaryRows[0]?.siswa_lunas || 0),
                siswa_tagihan: Number(summaryRows[0]?.siswa_tagihan || 0)
            }
        };
        arrearsCache.set(cacheKey, { payload, cachedAt: Date.now() });
        res.json(payload);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post(
    '/bills/generate-preview',
    validate((req) => {
        const errors = [];
        if (!isNonEmptyString(req.body.billName)) errors.push('billName is required');
        if (!isFiniteNumber(req.body.amount) || toNumber(req.body.amount) <= 0) errors.push('amount must be a positive number');
        const hasClasses = Array.isArray(req.body.targetClasses) && req.body.targetClasses.length > 0;
        const hasStudents = Array.isArray(req.body.targetStudentIds) && req.body.targetStudentIds.length > 0;
        if (!hasClasses && !hasStudents) errors.push('targetClasses or targetStudentIds must be non-empty');
        return errors;
    }),
    async (req, res) => {
        try {
            if (!ensureBranchForAdmin(req, res)) return;
            const scope = getBranchScope(req, ['branch_id']);
            await ensureBillsAcademicColumns(db);
            const { amount, targetClasses = [], targetStudentIds = [] } = req.body;
            const nominalDasar = Number(amount);
            const students = await resolveTargetActiveStudents(db, scope, { targetClasses, targetStudentIds });
            if (!students.length) {
                return res.status(400).json({ success: false, message: 'Tidak ada siswa aktif yang sesuai target.' });
            }
            const scholarshipMap = await getStudentPercentScholarshipMap(db, scope, students.map((s) => s.id));
            const detailRows = students.map((s) => {
                const percent = Number(scholarshipMap.get(Number(s.id)) || 0);
                const discount = Math.min(nominalDasar, nominalDasar * (percent / 100));
                const net = Math.max(0, nominalDasar - discount);
                return {
                    student_id: s.id,
                    nis: s.nis,
                    nama: s.nama,
                    kelas: s.kelas,
                    nominal_awal: nominalDasar,
                    scholarship_percent: percent,
                    scholarship_discount: discount,
                    nominal_akhir: net
                };
            });
            const summary = detailRows.reduce(
                (acc, row) => {
                    acc.totalStudents += 1;
                    acc.totalNominalAwal += Number(row.nominal_awal || 0);
                    acc.totalPotongan += Number(row.scholarship_discount || 0);
                    acc.totalNominalAkhir += Number(row.nominal_akhir || 0);
                    if (Number(row.scholarship_percent || 0) > 0) acc.siswaTerbeasiswa += 1;
                    return acc;
                },
                { totalStudents: 0, siswaTerbeasiswa: 0, totalNominalAwal: 0, totalPotongan: 0, totalNominalAkhir: 0 }
            );
            res.json({
                success: true,
                summary,
                previewRows: detailRows.slice(0, 100),
                previewLimited: detailRows.length > 100
            });
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    }
);

router.post(
    '/bills/generate',
    validate((req) => {
        const errors = [];
        if (!isNonEmptyString(req.body.billName)) errors.push('billName is required');
        if (!isFiniteNumber(req.body.amount) || toNumber(req.body.amount) <= 0) errors.push('amount must be a positive number');
        const hasClasses = Array.isArray(req.body.targetClasses) && req.body.targetClasses.length > 0;
        const hasStudents = Array.isArray(req.body.targetStudentIds) && req.body.targetStudentIds.length > 0;
        if (!hasClasses && !hasStudents) errors.push('targetClasses or targetStudentIds must be non-empty');
        return errors;
    }),
    async (req, res) => {
        const conn = await db.getConnection();
        try {
            if (!ensureNotSuperAdminReadOnly(req, res)) return;
            if (!ensureBranchForAdmin(req, res)) return;
            const scope = getBranchScope(req, ['branch_id']);
            await conn.beginTransaction();
            await ensureBillsAcademicColumns(conn);
            const { billName, amount, targetClasses = [], targetStudentIds = [], schoolYear } = req.body;
            const selectedClasses = Array.isArray(targetClasses) ? targetClasses.filter(Boolean) : [];
            const selectedStudentIds = Array.isArray(targetStudentIds)
                ? targetStudentIds.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0)
                : [];
            if (!selectedClasses.length && !selectedStudentIds.length) {
                await conn.rollback();
                return res.status(400).json({ success: false, message: 'Pilih minimal satu kelas atau siswa target.' });
            }
            const schoolYearName = String(schoolYear || '').trim() || (await getActiveSchoolYearName(conn)) || null;
            const students = await resolveTargetActiveStudents(conn, scope, {
                targetClasses: selectedClasses,
                targetStudentIds: selectedStudentIds
            });
            if (!students.length) {
                await conn.rollback();
                return res.status(400).json({ success: false, message: 'Tidak ada siswa aktif yang sesuai target.' });
            }

            const scholarshipMap = await getStudentPercentScholarshipMap(conn, scope, students.map((s) => s.id));

            let count = 0;
            let totalNominalAwal = 0;
            let totalPotongan = 0;
            let totalNominalAkhir = 0;
            const now = new Date();
            for (let s of students) {
                const billCode = `BILL-${Math.floor(100000 + Math.random() * 900000)}`;
                let nominalTagihan = Number(amount);
                const percent = Number(scholarshipMap.get(Number(s.id)) || 0);
                const scholarshipDiscount = Math.min(nominalTagihan, nominalTagihan * (percent / 100));
                const nominalAkhir = Math.max(0, nominalTagihan - scholarshipDiscount);
                const [billRes] = await conn.query(
                    `INSERT INTO bills (id_tagihan_code, nama_tagihan, kelas, nama_siswa, total, base_total, scholarship_discount, net_total, scholarship_percent_applied, terbayar, sisa, status, tanggal_buat, school_year_name, student_id, class_id)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        billCode,
                        billName,
                        s.kelas,
                        s.nama,
                        nominalTagihan,
                        nominalTagihan,
                        scholarshipDiscount,
                        nominalAkhir,
                        percent,
                        0,
                        nominalTagihan,
                        'Belum Lunas',
                        now,
                        schoolYearName,
                        s.id || null,
                        s.class_id || null
                    ]
                );
                await conn.query('UPDATE bills SET branch_id = ? WHERE id = ?', [s.branch_id || scope.branchId || 1, billRes.insertId]);

                if (percent > 0) {
                    await applyAutoPercentScholarshipPayment(conn, s, billRes.insertId, nominalTagihan, now, scope, percent);
                }
                totalNominalAwal += nominalTagihan;
                totalPotongan += scholarshipDiscount;
                totalNominalAkhir += nominalAkhir;
                count++;
            }
            await conn.commit();
            invalidateBillingReadModels();
            res.json({
                success: true,
                message: `Sukses generate tagihan untuk ${count} siswa (${schoolYearName || 'tanpa tahun ajaran'}).`,
                summary: { totalNominalAwal, totalPotongan, totalNominalAkhir }
            });
        } catch (err) {
            await conn.rollback();
            res.status(500).json({ success: false, message: err.message });
        } finally {
            conn.release();
        }
    }
);

router.post(
    '/bills/single',
    validate((req) => {
        const errors = [];
        if (!isNonEmptyString(req.body.billName)) errors.push('billName is required');
        if (!isFiniteNumber(req.body.amount) || toNumber(req.body.amount) <= 0) errors.push('amount must be a positive number');
        if (!isFiniteNumber(req.body.studentId) || toNumber(req.body.studentId) <= 0) errors.push('studentId must be a positive number');
        return errors;
    }),
    async (req, res) => {
        const conn = await db.getConnection();
        try {
            if (!ensureNotSuperAdminReadOnly(req, res)) return;
            if (!ensureBranchForAdmin(req, res)) return;
            const scope = getBranchScope(req, ['branch_id']);
            await conn.beginTransaction();
            await ensureBillsAcademicColumns(conn);
            const { billName, amount, studentId, schoolYear } = req.body;
            const [student] = await conn.query(`SELECT * FROM students WHERE id = ? ${scope.clause}`, [studentId, ...scope.params]);
            if (student.length === 0) {
                await conn.rollback();
                return res.status(404).json({ success: false, message: 'Siswa tidak ditemukan.' });
            }
            const s = student[0];
            const schoolYearName = String(schoolYear || '').trim() || (await getActiveSchoolYearName(conn)) || null;
            const billCode = `BILL-${Math.floor(100000 + Math.random() * 900000)}`;
            const now = new Date();
            const [billRes] = await conn.query(
                `INSERT INTO bills (id_tagihan_code, nama_tagihan, kelas, nama_siswa, total, base_total, scholarship_discount, net_total, scholarship_percent_applied, terbayar, sisa, status, tanggal_buat, school_year_name, student_id, class_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    billCode,
                    billName,
                    s.kelas,
                    s.nama,
                    amount,
                    amount,
                    0,
                    amount,
                    0,
                    0,
                    amount,
                    'Belum Lunas',
                    now,
                    schoolYearName,
                    s.id || null,
                    s.class_id || null
                ]
            );
            await conn.query('UPDATE bills SET branch_id = ? WHERE id = ?', [s.branch_id || scope.branchId || 1, billRes.insertId]);
            const appliedAuto = await applyAutoPercentScholarshipPayment(conn, s, billRes.insertId, amount, now, scope);
            if (Number(appliedAuto || 0) > 0) {
                const percentage = Math.max(0, Math.min(100, (Number(appliedAuto) / Number(amount || 1)) * 100));
                await conn.query(
                    `UPDATE bills
                     SET scholarship_discount = ?,
                         net_total = ?,
                         scholarship_percent_applied = ?
                     WHERE id = ? ${scope.clause}`,
                    [Number(appliedAuto), Math.max(0, Number(amount) - Number(appliedAuto)), percentage, billRes.insertId, ...scope.params]
                );
            }
            await conn.commit();
            invalidateBillingReadModels();
            res.json({ success: true, message: `Berhasil menambahkan tagihan untuk ${s.nama}.` });
        } catch (err) {
            try { await conn.rollback(); } catch (_) {}
            res.status(500).json({ success: false, message: err.message });
        } finally {
            conn.release();
        }
    }
);

router.delete('/bills/batch', async (req, res) => {
    try {
        if (!ensureNotSuperAdminReadOnly(req, res)) return;
        if (!ensureBranchForAdmin(req, res)) return;
        const scope = getBranchScope(req, ['branch_id']);
        const { nama, date, nominal } = req.query;
        const [check] = await db.query(
            `SELECT COUNT(id) as paid_count FROM bills WHERE nama_tagihan = ? AND tanggal_buat = ? AND total = ? AND terbayar > 0 ${scope.clause}`,
            [nama, date, nominal, ...scope.params]
        );
        if (check[0].paid_count > 0)
            return res.status(400).json({ success: false, message: `Gagal! Ada ${check[0].paid_count} siswa yang sudah membayar.` });
        const [result] = await db.query(
            `DELETE FROM bills WHERE nama_tagihan = ? AND tanggal_buat = ? AND total = ? AND terbayar = 0 ${scope.clause}`,
            [nama, date, nominal, ...scope.params]
        );
        if (Number(result?.affectedRows || 0) > 0) invalidateBillingReadModels();
        res.json({ success: true, message: `Sukses! ${result.affectedRows} tagihan dibatalkan.` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/student/details', async (req, res) => {
    try {
        if (!ensureBranchForAdmin(req, res)) return;
        const scope = getBranchScope(req, ['branch_id']);
        const { nama, kelas } = req.query;
        const studentIdQuery = Number(req.query.student_id || 0);
        if (getWaliClass(req) && !ensureWaliClassMatch(req, kelas, res)) return;
        const [student] = studentIdQuery > 0
            ? await db.query(`SELECT * FROM students WHERE id = ? ${scope.clause} LIMIT 1`, [studentIdQuery, ...scope.params])
            : await db.query(`SELECT * FROM students WHERE nama = ? AND kelas = ? ${scope.clause} LIMIT 1`, [nama, kelas, ...scope.params]);
        const studentId = student[0] ? student[0].id : null;

        const [payments] = studentId
            ? await db.query(
                `SELECT p.*, DATE_FORMAT(p.tanggal, '%Y-%m-%d') AS tanggal
                 FROM payments p
                 WHERE p.student_id = ? ${scope.clause}
                 ORDER BY p.tanggal DESC, p.id DESC`,
                [studentId, ...scope.params]
            )
            : await db.query(
                `SELECT p.*, DATE_FORMAT(p.tanggal, '%Y-%m-%d') AS tanggal
                 FROM payments p
                 WHERE p.nama = ? AND p.kelas = ? ${scope.clause}
                 ORDER BY p.tanggal DESC, p.id DESC`,
                [nama, kelas, ...scope.params]
            );
        const [beasiswas] = await db.query(
            `SELECT t.nama_beasiswa, r.tanggal_terima, r.id
             FROM scholarship_recipients r
             JOIN scholarship_types t ON r.type_id = t.id
             WHERE (r.student_id = ? OR (r.nama_siswa = ? AND r.kelas = ?)) ${scope.clause}
             ORDER BY r.tanggal_terima DESC, r.id DESC`,
            [studentId, nama, kelas, ...scope.params]
        );
        res.json({
            student: student[0] || {},
            payments: payments || [],
            beasiswas: beasiswas || [],
            beasiswa: (beasiswas && beasiswas[0]) ? beasiswas[0] : null
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/student/tunggakan_total', async (req, res) => {
    try {
        if (!ensureBranchForAdmin(req, res)) return;
        triggerBillingPerfIndexesEnsure();
        await ensureStudentFinanceSummarySeeded();
        const scope = getBranchScope(req, ['branch_id']);
        const { nama, kelas } = req.query;
        const studentIdQuery = Number(req.query.student_id || 0);
        if (getWaliClass(req) && !ensureWaliClassMatch(req, kelas, res)) return;
        const [student] = studentIdQuery > 0
            ? await db.query(`SELECT id FROM students WHERE id = ? ${scope.clause} LIMIT 1`, [studentIdQuery, ...scope.params])
            : await db.query(`SELECT id FROM students WHERE nama = ? AND kelas = ? ${scope.clause} LIMIT 1`, [nama, kelas, ...scope.params]);
        const studentId = student[0] ? student[0].id : null;
        const [rows] = studentId
            ? await db.query(
                `SELECT COALESCE(sfs.total_sisa, 0) AS totalSisa
                 FROM student_finance_summary sfs
                 WHERE sfs.student_id = ?
                 LIMIT 1`,
                [studentId]
            )
            : await db.query(`SELECT SUM(GREATEST(0, sisa)) as totalSisa FROM bills WHERE nama_siswa = ? AND kelas = ? ${scope.clause}`, [nama, kelas, ...scope.params]);
        res.json({ totalSisa: Number(rows[0]?.totalSisa || 0) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/bills/student', async (req, res) => {
    try {
        if (!ensureBranchForAdmin(req, res)) return;
        const scope = getBranchScope(req, ['branch_id']);
        const { nama, kelas } = req.query;
        const studentIdQuery = Number(req.query.student_id || 0);
        if (getWaliClass(req) && !ensureWaliClassMatch(req, kelas, res)) return;
        const includeAll = String(req.query.include_all || '').toLowerCase() === '1' || String(req.query.include_all || '').toLowerCase() === 'true';
        const sisaFilter = includeAll ? '' : ' AND sisa > 0';
        const [student] = studentIdQuery > 0
            ? await db.query(`SELECT id FROM students WHERE id = ? ${scope.clause} LIMIT 1`, [studentIdQuery, ...scope.params])
            : await db.query(`SELECT id FROM students WHERE nama = ? AND kelas = ? ${scope.clause} LIMIT 1`, [nama, kelas, ...scope.params]);
        const studentId = student[0] ? student[0].id : null;
        const [rows] = studentId
            ? await db.query(`SELECT id as rowId,
                                     nama_tagihan as namaTagihan,
                                     total as nominal,
                                     GREATEST(0, sisa) AS sisa,
                                     tanggal_buat AS tanggal_tagihan,
                                     school_year_name,
                                     CASE WHEN MONTH(tanggal_buat) BETWEEN 7 AND 12 THEN 'Ganjil' ELSE 'Genap' END AS semester
                              FROM bills
                              WHERE student_id = ? ${sisaFilter}` + scope.clause + ' ORDER BY id DESC', [
                  studentId,
                  ...scope.params
              ])
            : await db.query(`SELECT id as rowId,
                                     nama_tagihan as namaTagihan,
                                     total as nominal,
                                     GREATEST(0, sisa) AS sisa,
                                     tanggal_buat AS tanggal_tagihan,
                                     school_year_name,
                                     CASE WHEN MONTH(tanggal_buat) BETWEEN 7 AND 12 THEN 'Ganjil' ELSE 'Genap' END AS semester
                              FROM bills
                              WHERE nama_siswa = ? AND kelas = ? ${sisaFilter}` + scope.clause + ' ORDER BY id DESC', [
                  nama,
                  kelas,
                  ...scope.params
              ]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/payments/export', async (req, res) => {
    try {
        if (!ensureBranchForAdmin(req, res)) return;
        const scope = getBranchScope(req, ['branch_id']);
        const dateFrom = String(req.query.date_from || '').trim();
        const dateTo = String(req.query.date_to || '').trim();
        const keyword = String(req.query.search || '').trim().toLowerCase();
        const where = [];
        const params = [];
        if (scope.scoped) {
            where.push('p.branch_id = ?');
            params.push(...scope.params);
        }
        where.push('COALESCE(p.is_reversed, 0) = 0');
        if (dateFrom) {
            where.push('DATE(p.tanggal) >= ?');
            params.push(dateFrom);
        }
        if (dateTo) {
            where.push('DATE(p.tanggal) <= ?');
            params.push(dateTo);
        }
        if (keyword) {
            where.push('(LOWER(p.nama) LIKE ? OR LOWER(p.trans_id) LIKE ? OR LOWER(COALESCE(b.nama_tagihan, "")) LIKE ?)');
            params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
        }
        const [rows] = await db.query(
            `SELECT p.id, p.trans_id, p.tanggal, p.kelas, p.nama, p.jumlah_bayar, p.penerima, p.keterangan,
                    b.nama_tagihan AS tagihan,
                    p.branch_id
             FROM payments p
             LEFT JOIN bills b ON b.id = p.bill_id
             ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
             ORDER BY p.tanggal DESC, p.id DESC`,
            params
        );
        res.json({ success: true, rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post(
    '/payments',
    validate((req) => {
        const errors = [];
        const b = req.body || {};
        if (b.id) {
            if (!isFiniteNumber(b.id) || toNumber(b.id) <= 0) errors.push('id must be a positive number');
            if (b.tanggal && !isIsoDateYYYYMMDD(String(b.tanggal))) errors.push('tanggal must be YYYY-MM-DD');
            if (b.jumlahBayar && (!isFiniteNumber(b.jumlahBayar) || toNumber(b.jumlahBayar) <= 0)) errors.push('jumlahBayar must be a positive number');
            if (!/^\d{6}$/.test(String(b.pinTransaksi || ''))) errors.push('pinTransaksi must be 6 digits');
            return errors;
        }
        if (!isIsoDateYYYYMMDD(String(b.tanggal || ''))) errors.push('tanggal must be YYYY-MM-DD');
        if (!isNonEmptyString(b.kelas)) errors.push('kelas is required');
        if (!isNonEmptyString(b.nama)) errors.push('nama is required');
        if (!isFiniteNumber(b.jumlahBayar) || toNumber(b.jumlahBayar) <= 0) errors.push('jumlahBayar must be a positive number');
        if (!isNonEmptyString(b.penerima)) errors.push('penerima is required');
        if (!/^\d{6}$/.test(String(b.pinTransaksi || ''))) errors.push('pinTransaksi must be 6 digits');
        return errors;
    }),
    async (req, res) => {
        const conn = await db.getConnection();
        try {
            if (!ensureNotSuperAdminReadOnly(req, res)) return;
            if (!ensureBranchForAdmin(req, res)) return;
            const scope = getBranchScope(req, ['branch_id']);
            await conn.beginTransaction();
            const { id, tanggal, kelas, nama, jumlahBayar, penerima, keterangan, billRowId, pinTransaksi } = req.body;
            let createdPaymentId = null;
            let createdTransId = null;

            const pinCheck = await verifyPaymentPin(conn, req, pinTransaksi);
            if (!pinCheck.ok) {
                await conn.rollback();
                return res.status(400).json({ success: false, message: pinCheck.message });
            }

            if (id) {
                await conn.rollback();
                return res.status(400).json({ success: false, message: 'Edit transaksi gunakan endpoint revisi transaksi.' });
            } else {
                const transId = `TRX-${Date.now()}`;
                createdTransId = transId;
                const qrToken = `${Date.now()}${Math.floor(Math.random() * 1000000)}`;
                let studentId = null;
                let classId = null;

                if (billRowId) {
                    const [b] = await conn.query(`SELECT student_id, class_id, branch_id FROM bills WHERE id = ? ${scope.clause} LIMIT 1`, [billRowId, ...scope.params]);
                    if (b[0]) {
                        studentId = b[0].student_id || null;
                        classId = b[0].class_id || null;
                        scope.branchId = b[0].branch_id || scope.branchId || 1;
                    }
                }
                if (!studentId) {
                    const [s] = await conn.query(`SELECT id, class_id, branch_id FROM students WHERE nama = ? AND kelas = ? ${scope.clause} LIMIT 1`, [nama, kelas, ...scope.params]);
                    if (s[0]) {
                        studentId = s[0].id;
                        classId = s[0].class_id || classId;
                        scope.branchId = s[0].branch_id || scope.branchId || 1;
                    }
                }

                const qrPayload = generateQrPayload({ transId, tanggal, nama, kelas, jumlahBayar, billRowId });
                await ensurePaymentSecurityColumns(conn);

                const [insertRes] = await conn.query(
                    'INSERT INTO payments (trans_id, tanggal, kelas, nama, jumlah_bayar, penerima, keterangan, bill_id, student_id, class_id, branch_id, qr_token, qr_payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [transId, tanggal, kelas, nama, jumlahBayar, penerima, keterangan, billRowId || null, studentId, classId, scope.branchId || 1, qrToken, qrPayload]
                );
                createdPaymentId = insertRes?.insertId || null;
                if (billRowId) {
                    const [billRows] = await conn.query(
                        `SELECT id, total, GREATEST(0, sisa) AS sisa FROM bills WHERE id = ? ${scope.clause} LIMIT 1`,
                        [billRowId, ...scope.params]
                    );
                    const bill = billRows[0];
                    if (!bill) {
                        await conn.rollback();
                        return res.status(404).json({ success: false, message: 'Tagihan tidak ditemukan.' });
                    }
                    const payAmount = Number(jumlahBayar || 0);
                    const currentSisa = Number(bill.sisa || 0);
                    if (payAmount > currentSisa) {
                        await conn.rollback();
                        return res.status(400).json({
                            success: false,
                            message: `Jumlah bayar melebihi sisa tagihan. Sisa saat ini ${currentSisa.toLocaleString('id-ID')}.`
                        });
                    }
                    await conn.query(
                        `UPDATE bills
                         SET terbayar = LEAST(total, GREATEST(0, terbayar + ?)),
                             sisa = GREATEST(0, total - LEAST(total, GREATEST(0, terbayar + ?))),
                             status = CASE WHEN GREATEST(0, total - LEAST(total, GREATEST(0, terbayar + ?))) <= 0 THEN 'Lunas' ELSE 'Belum Lunas' END
                         WHERE id = ? ${scope.clause}`,
                        [payAmount, payAmount, payAmount, billRowId, ...scope.params]
                    );
                }
            }
            await conn.commit();
            invalidateBillingReadModels();
            res.json({
                success: true,
                paymentId: createdPaymentId,
                transId: createdTransId
            });
        } catch (err) {
            await conn.rollback();
            res.status(500).json({ success: false, message: err.message });
        } finally {
            conn.release();
        }
    }
);

router.post('/payments/:id/revise', async (req, res) => {
    const conn = await db.getConnection();
    try {
        if (!ensureNotSuperAdminReadOnly(req, res)) return;
        if (!ensureBranchForAdmin(req, res)) return;
        const scope = getBranchScope(req, ['branch_id']);
        const paymentId = Number(req.params.id);
        const { tanggal, kelas, nama, jumlahBayar, penerima, keterangan, billRowId, pinTransaksi, reason } = req.body || {};
        if (!Number.isFinite(paymentId) || paymentId <= 0) return res.status(400).json({ success: false, message: 'ID transaksi tidak valid.' });
        if (!isIsoDateYYYYMMDD(String(tanggal || ''))) return res.status(400).json({ success: false, message: 'Tanggal wajib format YYYY-MM-DD.' });
        if (!isFiniteNumber(jumlahBayar) || toNumber(jumlahBayar) <= 0) return res.status(400).json({ success: false, message: 'Jumlah bayar harus lebih dari 0.' });
        if (!isNonEmptyString(penerima)) return res.status(400).json({ success: false, message: 'Penerima wajib diisi.' });
        if (!isNonEmptyString(reason)) return res.status(400).json({ success: false, message: 'Alasan revisi wajib diisi.' });

        await conn.beginTransaction();
        await ensurePaymentRevisionSchema(conn);
        const pinCheck = await verifyPaymentPin(conn, req, pinTransaksi);
        if (!pinCheck.ok) {
            await conn.rollback();
            return res.status(400).json({ success: false, message: pinCheck.message });
        }
        const [oldRows] = await conn.query(
            `SELECT * FROM payments WHERE id = ? ${scope.clause} LIMIT 1`,
            [paymentId, ...scope.params]
        );
        const oldPayment = oldRows[0];
        if (!oldPayment) {
            await conn.rollback();
            return res.status(404).json({ success: false, message: 'Transaksi tidak ditemukan.' });
        }
        if (Number(oldPayment.is_reversed || 0) === 1) {
            await conn.rollback();
            return res.status(400).json({ success: false, message: 'Transaksi ini sudah pernah direvisi.' });
        }

        const oldBillId = oldPayment.bill_id ? Number(oldPayment.bill_id) : null;
        if (oldBillId) {
            await conn.query(
                `UPDATE bills
                 SET terbayar = GREATEST(0, terbayar - ?),
                     sisa = GREATEST(0, total - GREATEST(0, terbayar - ?)),
                     status = CASE WHEN GREATEST(0, total - GREATEST(0, terbayar - ?)) <= 0 THEN 'Lunas' ELSE 'Belum Lunas' END
                 WHERE id = ? ${scope.clause}`,
                [oldPayment.jumlah_bayar, oldPayment.jumlah_bayar, oldPayment.jumlah_bayar, oldBillId, ...scope.params]
            );
        }

        const targetBillId = billRowId ? Number(billRowId) : oldBillId;
        let targetStudentId = oldPayment.student_id || null;
        let targetClassId = oldPayment.class_id || null;
        let targetBranchId = oldPayment.branch_id || scope.branchId || 1;
        if (targetBillId) {
            const [billRows] = await conn.query(
                `SELECT id, student_id, class_id, branch_id FROM bills WHERE id = ? ${scope.clause} LIMIT 1`,
                [targetBillId, ...scope.params]
            );
            if (!billRows.length) {
                await conn.rollback();
                return res.status(400).json({ success: false, message: 'Tagihan tujuan tidak ditemukan.' });
            }
            targetStudentId = billRows[0].student_id || targetStudentId;
            targetClassId = billRows[0].class_id || targetClassId;
            targetBranchId = billRows[0].branch_id || targetBranchId;
        }

        await conn.query(
            `UPDATE payments
             SET is_reversed = 1,
                 reversed_at = NOW(),
                 reversal_reason = ?
             WHERE id = ? ${scope.clause}`,
            [String(reason).trim(), paymentId, ...scope.params]
        );

        const newTransId = `TRX-${Date.now()}`;
        const qrToken = `${Date.now()}${Math.floor(Math.random() * 1000000)}`;
        const qrPayload = generateQrPayload({ transId: newTransId, tanggal, nama, kelas, jumlahBayar, billRowId: targetBillId });
        const [insertRes] = await conn.query(
            `INSERT INTO payments
             (trans_id, tanggal, kelas, nama, jumlah_bayar, penerima, keterangan, bill_id, student_id, class_id, branch_id, qr_token, qr_payload, revised_from_payment_id, is_reversed)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
            [
                newTransId,
                tanggal,
                kelas || oldPayment.kelas,
                nama || oldPayment.nama,
                Number(jumlahBayar),
                penerima,
                (keterangan || oldPayment.keterangan || '') + ` | Revisi dari ${oldPayment.trans_id}`,
                targetBillId || null,
                targetStudentId,
                targetClassId,
                targetBranchId,
                qrToken,
                qrPayload,
                paymentId
            ]
        );
        if (targetBillId) {
            const [targetBillRows] = await conn.query(
                `SELECT id, GREATEST(0, sisa) AS sisa FROM bills WHERE id = ? ${scope.clause} LIMIT 1`,
                [targetBillId, ...scope.params]
            );
            if (!targetBillRows.length) {
                await conn.rollback();
                return res.status(404).json({ success: false, message: 'Tagihan tujuan tidak ditemukan.' });
            }
            const currentSisa = Number(targetBillRows[0].sisa || 0);
            if (Number(jumlahBayar) > currentSisa) {
                await conn.rollback();
                return res.status(400).json({
                    success: false,
                    message: `Jumlah bayar melebihi sisa tagihan. Sisa saat ini ${currentSisa.toLocaleString('id-ID')}.`
                });
            }
            await conn.query(
                `UPDATE bills
                 SET terbayar = LEAST(total, GREATEST(0, terbayar + ?)),
                     sisa = GREATEST(0, total - LEAST(total, GREATEST(0, terbayar + ?))),
                     status = CASE WHEN GREATEST(0, total - LEAST(total, GREATEST(0, terbayar + ?))) <= 0 THEN 'Lunas' ELSE 'Belum Lunas' END
                 WHERE id = ? ${scope.clause}`,
                [jumlahBayar, jumlahBayar, jumlahBayar, targetBillId, ...scope.params]
            );
        }

        await conn.query(
            `INSERT INTO payment_revision_logs
             (old_payment_id, new_payment_id, branch_id, reason, old_payload, new_payload, actor_user_id, actor_role)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                paymentId,
                insertRes.insertId,
                targetBranchId,
                String(reason).trim(),
                JSON.stringify(oldPayment),
                JSON.stringify({
                    tanggal,
                    kelas: kelas || oldPayment.kelas,
                    nama: nama || oldPayment.nama,
                    jumlah_bayar: Number(jumlahBayar),
                    penerima,
                    keterangan,
                    bill_id: targetBillId || null
                }),
                req.session?.userId || null,
                req.session?.userRole || null
            ]
        );

        await conn.commit();
        invalidateBillingReadModels();
        res.json({ success: true, message: 'Transaksi direvisi. Data lama dibalik dan dibuat ulang.', newPaymentId: insertRes.insertId });
    } catch (err) {
        await conn.rollback();
        res.status(500).json({ success: false, message: err.message });
    } finally {
        conn.release();
    }
});

router.delete('/payments/:id', async (req, res) => {
    const conn = await db.getConnection();
    try {
        if (!ensureNotSuperAdminReadOnly(req, res)) return;
        if (!ensureBranchForAdmin(req, res)) return;
        const scope = getBranchScope(req, ['branch_id']);
        await conn.beginTransaction();
        const paymentId = req.params.id;
        const [payData] = await conn.query(`SELECT * FROM payments WHERE id = ? ${scope.clause}`, [paymentId, ...scope.params]);
        if (payData.length === 0) {
            await conn.rollback();
            return res.status(404).json({ success: false });
        }
        const { jumlah_bayar, bill_id } = payData[0];
        if (bill_id) {
            await conn.query(
                `UPDATE bills
                 SET terbayar = GREATEST(0, terbayar - ?),
                     sisa = GREATEST(0, total - GREATEST(0, terbayar - ?)),
                     status = CASE WHEN GREATEST(0, total - GREATEST(0, terbayar - ?)) <= 0 THEN 'Lunas' ELSE 'Belum Lunas' END
                 WHERE id = ? ${scope.clause}`,
                [jumlah_bayar, jumlah_bayar, jumlah_bayar, bill_id, ...scope.params]
            );
        }
        await conn.query(`DELETE FROM payments WHERE id = ? ${scope.clause}`, [paymentId, ...scope.params]);
        await conn.commit();
        invalidateBillingReadModels();
        res.json({ success: true });
    } catch (err) {
        await conn.rollback();
        res.status(500).json({ success: false, message: err.message });
    } finally {
        conn.release();
    }
});

router.get('/payments/:id', async (req, res) => {
    try {
        if (!ensureBranchForAdmin(req, res)) return;
        const scope = getBranchScope(req, ['branch_id']);
        const [rows] = await db.query(
            `SELECT p.*, DATE_FORMAT(p.tanggal, '%Y-%m-%d') AS tanggal
             FROM payments p
             WHERE p.id = ? ${scope.clause}`,
            [req.params.id, ...scope.params]
        );
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'Data tidak ditemukan' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/bills/reconciliation', async (req, res) => {
    try {
        if (!ensureBranchForAdmin(req, res)) return;
        const scope = getBranchScope(req, ['branch_id']);
        const waliClass = getWaliClass(req);
        const scoped = scope.scoped;
        const paymentBranchClause = scoped ? ' AND p.branch_id = ? ' : '';
        const billBranchClause = scoped ? ' AND b.branch_id = ? ' : '';
        const paymentClassClause = waliClass ? ' AND p.kelas = ? ' : '';
        const billClassClause = waliClass ? ' AND b.kelas = ? ' : '';
        const paymentBranchParams = scoped ? [...scope.params] : [];
        const billBranchParams = scoped ? [...scope.params] : [];
        if (waliClass) {
            paymentBranchParams.push(waliClass);
            billBranchParams.push(waliClass);
        }
        const [paymentsWithoutBillRows] = await db.query(
            `SELECT COUNT(*) AS total
             FROM payments p
             WHERE (p.bill_id IS NULL OR p.bill_id = 0) ${paymentBranchClause}${paymentClassClause}`,
            paymentBranchParams
        );
        const [orphanPaymentsRows] = await db.query(
            `SELECT COUNT(*) AS total
             FROM payments p
             LEFT JOIN bills b ON b.id = p.bill_id
             WHERE p.bill_id IS NOT NULL
               AND p.bill_id <> 0
               AND b.id IS NULL
               ${paymentBranchClause}${paymentClassClause}`,
            paymentBranchParams
        );
        const [negativeBillsRows] = await db.query(
            `SELECT COUNT(*) AS total
             FROM bills b
             WHERE (b.total < 0 OR b.terbayar < 0 OR b.sisa < 0) ${billBranchClause}${billClassClause}`,
            billBranchParams
        );
        const [overpaidBillsRows] = await db.query(
            `SELECT COUNT(*) AS total
             FROM bills b
             WHERE b.terbayar > b.total ${billBranchClause}${billClassClause}`,
            billBranchParams
        );
        res.json({
            success: true,
            data: {
                paymentsWithoutBill: Number(paymentsWithoutBillRows[0]?.total || 0),
                orphanPayments: Number(orphanPaymentsRows[0]?.total || 0),
                negativeBills: Number(negativeBillsRows[0]?.total || 0),
                overpaidBills: Number(overpaidBillsRows[0]?.total || 0)
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/billing/import/template', async (req, res) => {
    try {
        if (!ensureBranchForAdmin(req, res)) return;
        const wb = xlsx.utils.book_new();
        const rows = [
            {
                NIS: '9000001',
                'Nama Peserta Didik': 'A. SYAHRUR ROJAB',
                KELAS: 'X.1',
                'Tahun Masuk': '2026',
                'Tagihan 1': 'SPP Maret 2026',
                'Nominal 1': 'Rp 1.200.000',
                'Tahun Ajaran 1': '2025/2026',
                'Pembayaran 1': 'Rp 500.000',
                'Tgl Pembayaran 1': '2026-03-01',
                'Pembayaran 2': 'Rp 400.000',
                'Tgl Pembayaran 2': '2026-03-10',
                'Pembayaran 3': 'Rp 300.000',
                'Tgl Pembayaran 3': '2026-03-20',
                'Pembayaran 4': '',
                'Tgl Pembayaran 4': '',
                'Tagihan 2': 'Daftar Ulang',
                'Nominal 2': 'Rp 400.000',
                'Tahun Ajaran 2': '2025/2026',
                'Pembayaran 5': 'Rp 200.000',
                'Tgl Pembayaran 5': '2026-03-06',
                'Pembayaran 6': '',
                'Tgl Pembayaran 6': '',
                'Pembayaran 7': '',
                'Tgl Pembayaran 7': '',
                'Pembayaran 8': '',
                'Tgl Pembayaran 8': '',
                'Tagihan 3': 'Seragam',
                'Nominal 3': 'Rp 350.000',
                'Tahun Ajaran 3': '2025/2026',
                'Pembayaran 9': '',
                'Tgl Pembayaran 9': '',
                'Pembayaran 10': '',
                'Tgl Pembayaran 10': '',
                'Pembayaran 11': '',
                'Tgl Pembayaran 11': '',
                'Pembayaran 12': '',
                'Tgl Pembayaran 12': '',
                'Tagihan 4': 'Praktikum',
                'Nominal 4': 'Rp 275.000',
                'Tahun Ajaran 4': '2025/2026',
                'Pembayaran 13': '',
                'Tgl Pembayaran 13': '',
                'Pembayaran 14': '',
                'Tgl Pembayaran 14': '',
                'Pembayaran 15': '',
                'Tgl Pembayaran 15': '',
                'Pembayaran 16': '',
                'Tgl Pembayaran 16': '',
                'Tagihan 5': 'Ekstrakurikuler',
                'Nominal 5': 'Rp 180.000',
                'Tahun Ajaran 5': '2025/2026',
                'Pembayaran 17': '',
                'Tgl Pembayaran 17': '',
                'Pembayaran 18': '',
                'Tgl Pembayaran 18': '',
                'Pembayaran 19': '',
                'Tgl Pembayaran 19': '',
                'Pembayaran 20': '',
                'Tgl Pembayaran 20': '',
                'Tagihan 6': 'Administrasi Tahunan',
                'Nominal 6': 'Rp 600.000',
                'Tahun Ajaran 6': '2025/2026',
                'Pembayaran 21': '',
                'Tgl Pembayaran 21': '',
                'Pembayaran 22': '',
                'Tgl Pembayaran 22': '',
                'Pembayaran 23': '',
                'Tgl Pembayaran 23': '',
                'Pembayaran 24': '',
                'Tgl Pembayaran 24': '',
                'Beasiswa 1': 'Beasiswa Prestasi',
                NominalB1: 'Rp 150.000',
                'Tanggal Beasiswa 1': '2026-03-01',
                'Beasiswa 2': '',
                NominalB2: '25%',
                'Tanggal Beasiswa 2': '',
                'Beasiswa 3': '',
                NominalB3: '',
                'Tanggal Beasiswa 3': '',
                'Beasiswa 4': '',
                NominalB4: '',
                'Tanggal Beasiswa 4': '',
                'Beasiswa 5': '',
                NominalB5: '',
                'Tanggal Beasiswa 5': '',
                'Tahun Ajaran': '2025/2026',
                Penerima: 'Import Excel',
                Keterangan: 'Import awal dari data lama'
            }
        ];
        const ws = xlsx.utils.json_to_sheet(rows);
        ws['!cols'] = Object.keys(rows[0] || {}).map((key) => {
            if (String(key).toLowerCase().includes('keterangan')) return { wch: 32 };
            if (String(key).toLowerCase().includes('nama peserta')) return { wch: 28 };
            return { wch: 16 };
        });
        xlsx.utils.book_append_sheet(wb, ws, 'Template Tagihan+Bayar');

        const noteRows = [
            { Field: 'NIS', Wajib: 'Disarankan', Keterangan: 'Gunakan NIS agar mapping siswa akurat. Jika kosong, sistem pakai Nama+Kelas.' },
            { Field: 'Nama Peserta Didik', Wajib: 'Ya', Keterangan: 'Harus sama dengan nama siswa di sistem jika NIS kosong.' },
            { Field: 'KELAS', Wajib: 'Ya', Keterangan: 'Contoh: X.1 / 10.1 / 11 IPA 2.' },
            { Field: 'Tahun Masuk', Wajib: 'Tidak', Keterangan: 'Format YYYY. Jika NIS sudah ada, nilai ini akan menimpa tahun_masuk siswa lama.' },
            { Field: 'Tagihan 1..6 + Nominal 1..6', Wajib: 'Tidak', Keterangan: 'Maksimal 6 tagihan per baris. Jika nominal kosong, sistem hitung dari total pembayaran tagihan terkait.' },
            { Field: 'Tahun Ajaran 1..6', Wajib: 'Tidak', Keterangan: 'Tahun ajaran per tagihan. Jika kosong, pakai kolom Tahun Ajaran umum / tahun ajaran aktif.' },
            { Field: 'Tanggal Tagihan 1..6', Wajib: 'Tidak', Keterangan: 'Opsional. Jika kosong, pakai tanggal pembayaran pertama di tagihan terkait atau hari ini.' },
            { Field: 'Beasiswa 1..5 + NominalB1..5', Wajib: 'Tidak', Keterangan: 'Maksimal 5 beasiswa per baris. NominalB bisa nominal (contoh: 150000) atau persen (contoh: 25%).' },
            { Field: 'Jenis Beasiswa 1..5', Wajib: 'Tidak', Keterangan: "Opsional: isi 'nominal' atau 'persen'. Jika kosong, sistem deteksi dari NominalB (ada % -> persen)." },
            { Field: 'Tanggal Beasiswa 1..5', Wajib: 'Tidak', Keterangan: 'Default: tanggal tagihan pertama atau hari ini.' },
            { Field: 'Auto Siswa/Kelas', Wajib: 'Info', Keterangan: 'Jika NIS + Nama + KELAS valid dan siswa belum ada, sistem akan membuat data siswa & kelas otomatis.' },
            { Field: 'Pembayaran 1..24', Wajib: 'Tidak', Keterangan: 'Pembayaran 1-4 untuk Tagihan 1, 5-8 Tagihan 2, 9-12 Tagihan 3, 13-16 Tagihan 4, 17-20 Tagihan 5, 21-24 Tagihan 6.' },
            { Field: 'Tgl Pembayaran 1..24', Wajib: 'Tidak', Keterangan: 'Format YYYY-MM-DD atau DD/MM/YYYY atau tanggal serial Excel.' },
            { Field: 'Tahun Ajaran', Wajib: 'Tidak', Keterangan: 'Default: tahun ajaran aktif di sistem.' }
        ];
        const wsNote = xlsx.utils.json_to_sheet(noteRows);
        wsNote['!cols'] = [{ wch: 22 }, { wch: 12 }, { wch: 95 }];
        xlsx.utils.book_append_sheet(wb, wsNote, 'Petunjuk');

        const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Disposition', 'attachment; filename="Template_Import_Tagihan_Pembayaran.xlsx"');
        res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/billing/import', billingImportUpload.single('file'), async (req, res) => {
    const conn = await db.getConnection();
    let txStarted = false;
    try {
        if (!ensureNotSuperAdminReadOnly(req, res)) return;
        if (!ensureBranchForAdmin(req, res)) return;
        const sessionBranchId = getSessionBranchId(req);
        const requestedBranchId = resolveBranchId(req, ['branch_id']);
        if (!sessionBranchId) {
            return res.status(400).json({ success: false, message: 'Branch akun admin tidak valid. Hubungi super admin.' });
        }
        if (requestedBranchId && Number(requestedBranchId) !== Number(sessionBranchId)) {
            return res.status(403).json({ success: false, message: 'Branch import tidak sesuai dengan akun yang sedang login.' });
        }
        const branchId = Number(sessionBranchId);
        const dryRun = ['1', 'true', 'yes'].includes(String(req.query?.dry_run || '').trim().toLowerCase());
        if (!req.file) return res.status(400).json({ success: false, message: 'File tidak ditemukan.' });

        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const rawData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { raw: true, defval: '' });
        if (!rawData.length) return res.status(400).json({ success: false, message: 'Sheet pertama kosong.' });

        if (!dryRun) {
            await conn.beginTransaction();
            txStarted = true;
            await ensureBillsAcademicColumns(conn);
            await ensurePaymentSecurityColumns(conn);
        }
        const activeSchoolYear = (await getActiveSchoolYearName(conn)) || null;
        const today = new Date().toISOString().slice(0, 10);

        let importedBills = 0;
        let importedPayments = 0;
        let importedScholarshipRecipients = 0;
        const errors = [];
        const clearedStudentIds = new Set();

        for (const [index, row] of rawData.entries()) {
            const rowNo = index + 2;
            const nis = String(getImportCell(row, ['NIS', 'NIS Siswa'])).trim();
            const nama = String(getImportCell(row, ['Nama Peserta Didik', 'Nama Siswa', 'Nama'])).trim();
            const kelas = String(getImportCell(row, ['KELAS', 'Kelas'])).trim();
            const tahunMasukRaw = String(getImportCell(row, ['Tahun Masuk', 'Tahun_Masuk', 'TahunMasuk'])).trim();
            const tahunMasuk = /^\d{4}$/.test(tahunMasukRaw) ? tahunMasukRaw : null;
            const schoolYearName = String(getImportCell(row, ['Tahun Ajaran', 'School Year'])).trim() || activeSchoolYear;
            const penerima = String(getImportCell(row, ['Penerima', 'Admin Keuangan'])).trim() || 'Import Excel';
            const keteranganUmum = String(getImportCell(row, ['Keterangan', 'Catatan'])).trim() || 'Import Excel histori pembayaran';

            if (!nama || !kelas) {
                errors.push(`Baris ${rowNo}: Nama Peserta Didik dan KELAS wajib diisi.`);
                continue;
            }

            let studentRow = null;
            if (nis) {
                const [rows] = await conn.query(
                    `SELECT id, nama, kelas, class_id, branch_id, status
                     FROM students
                     WHERE nis = ? AND branch_id = ?
                     LIMIT 1`,
                    [nis, branchId]
                );
                studentRow = rows[0] || null;
            } else {
                const [rows] = await conn.query(
                    `SELECT id, nama, kelas, class_id, branch_id, status
                     FROM students
                     WHERE branch_id = ?
                       AND LOWER(TRIM(nama)) = LOWER(TRIM(?))
                       AND LOWER(TRIM(kelas)) = LOWER(TRIM(?))
                     LIMIT 2`,
                    [branchId, nama, kelas]
                );
                if (rows.length > 1) {
                    errors.push(`Baris ${rowNo}: nama+kelas tidak unik. Isi kolom NIS untuk memastikan siswa.`);
                    continue;
                }
                studentRow = rows[0] || null;
            }

            if (!studentRow) {
                if (!nis) {
                    errors.push(`Baris ${rowNo}: siswa tidak ditemukan dan NIS kosong (${nama} / ${kelas}). Isi NIS agar bisa auto-create siswa.`);
                    continue;
                }
                if (dryRun) {
                    studentRow = {
                        id: 0,
                        nama,
                        kelas,
                        class_id: null,
                        branch_id: branchId,
                        status: 'Aktif'
                    };
                }
                if (!studentRow) {
                try {
                    if (!dryRun) {
                        await conn.query('INSERT IGNORE INTO classes (branch_id, nama_kelas) VALUES (?, ?)', [branchId, kelas]);
                        const [clsRows] = await conn.query(
                            'SELECT id FROM classes WHERE branch_id = ? AND nama_kelas = ? LIMIT 1',
                            [branchId, kelas]
                        );
                        const classId = Number(clsRows[0]?.id || 0) || null;
                        const salt = await bcrypt.genSalt(10);
                        const hashedPassword = await bcrypt.hash(String(nis), salt);
                        await conn.query(
                            `INSERT INTO students (
                                nis, username, password, kelas, class_id, branch_id,
                                tahun_masuk, status, nama, jenis_kelamin
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Aktif', ?, 'L')`,
                            [nis, nis, hashedPassword, kelas, classId, branchId, tahunMasuk || String(new Date().getFullYear()), nama]
                        );
                    }
                    const [createdRows] = await conn.query(
                        `SELECT id, nama, kelas, class_id, branch_id, status
                         FROM students
                         WHERE nis = ? AND branch_id = ?
                         LIMIT 1`,
                        [nis, branchId]
                    );
                    studentRow = createdRows[0] || null;
                    if (!studentRow) {
                        errors.push(`Baris ${rowNo}: gagal membuat siswa otomatis (${nis}).`);
                        continue;
                    }
                } catch (createErr) {
                    if (createErr?.code === 'ER_DUP_ENTRY') {
                        const [dupRows] = await conn.query(
                            `SELECT id, nama, kelas, class_id, branch_id, status
                             FROM students
                             WHERE nis = ? AND branch_id = ?
                             LIMIT 1`,
                            [nis, branchId]
                        );
                        studentRow = dupRows[0] || null;
                    }
                    if (!studentRow) {
                        errors.push(`Baris ${rowNo}: siswa tidak ditemukan dan auto-create gagal (${createErr?.message || 'unknown error'}).`);
                        continue;
                    }
                }
                }
            }

            if (!dryRun) {
                await conn.query('INSERT IGNORE INTO classes (branch_id, nama_kelas) VALUES (?, ?)', [branchId, kelas]);
                const [classRows] = await conn.query(
                    'SELECT id FROM classes WHERE branch_id = ? AND nama_kelas = ? LIMIT 1',
                    [branchId, kelas]
                );
                const normalizedClassId = Number(classRows[0]?.id || 0) || null;

                if (nis && studentRow?.id) {
                    if (!clearedStudentIds.has(Number(studentRow.id))) {
                        // Selalu bersihkan data finansial lama saat mode overwrite-by-NIS.
                        // Ini mencegah kasus data baris awal menjadi double (mis. submit/import ganda).
                        await conn.query('DELETE FROM scholarship_recipients WHERE student_id = ? AND branch_id = ?', [studentRow.id, branchId]);
                        await conn.query('DELETE FROM payments WHERE student_id = ? AND branch_id = ?', [studentRow.id, branchId]);
                        await conn.query('DELETE FROM bills WHERE student_id = ? AND branch_id = ?', [studentRow.id, branchId]);
                        await conn.query(
                            `UPDATE students
                             SET nama = ?, kelas = ?, class_id = ?, status = 'Aktif',
                                 tahun_masuk = COALESCE(?, tahun_masuk)
                             WHERE id = ? AND branch_id = ?`,
                            [nama, kelas, normalizedClassId, tahunMasuk, studentRow.id, branchId]
                        );
                        clearedStudentIds.add(Number(studentRow.id));
                    }
                    studentRow = {
                        ...studentRow,
                        nama,
                        kelas,
                        class_id: normalizedClassId,
                        status: 'Aktif'
                    };
                }
            }

            const legacySisa = Math.max(0, parseMoney(getImportCell(row, ['Kekurangan', 'Sisa', 'Kurang'])));
            const legacyBillName = String(getImportCell(row, ['Nama Tagihan', 'Tagihan'])).trim();
            const legacyTagihanDate = parseImportDateToYmd(getImportCell(row, ['Tanggal Tagihan', 'Tgl Tagihan']));

            const billInputs = [];
            for (let billIdx = 1; billIdx <= 6; billIdx++) {
                const rawName = String(getImportCell(row, [
                    `Tagihan ${billIdx}`,
                    `Nama Tagihan ${billIdx}`,
                    billIdx === 1 ? 'Nama Tagihan' : ''
                ])).trim();
                const nominal = Math.max(0, parseMoney(getImportCell(row, [`Nominal ${billIdx}`, `Total Tagihan ${billIdx}`])));
                const billSchoolYearName = String(getImportCell(row, [
                    `Tahun Ajaran ${billIdx}`,
                    `School Year ${billIdx}`,
                    `TA ${billIdx}`,
                    billIdx === 1 ? 'Tahun Ajaran' : ''
                ])).trim() || schoolYearName;
                const tagihanDate = parseImportDateToYmd(getImportCell(row, [
                    `Tanggal Tagihan ${billIdx}`,
                    `Tgl Tagihan ${billIdx}`,
                    billIdx === 1 ? 'Tanggal Tagihan' : ''
                ]));
                billInputs.push({
                    billIdx,
                    name: rawName || (billIdx === 1 ? (legacyBillName || 'Tagihan Import Excel') : ''),
                    nominal,
                    schoolYearName: billSchoolYearName,
                    tanggalBuat: tagihanDate || (billIdx === 1 ? legacyTagihanDate : null)
                });
            }

            const paymentInputs = [];
            for (let payIdx = 1; payIdx <= 24; payIdx++) {
                const amount = Math.max(0, parseMoney(getImportCell(row, [
                    `Pembayaran ${payIdx}`,
                    `Bayar ${payIdx}`,
                    payIdx <= 4 ? `Bayar ${payIdx}` : ''
                ])));
                const rawDate = getImportCell(row, [
                    `Tgl Pembayaran ${payIdx}`,
                    `Tanggal Pembayaran ${payIdx}`,
                    `Tgl Bayar ${payIdx}`,
                    `Tanggal Bayar ${payIdx}`,
                    payIdx <= 4 ? `Tgl Bayar ${payIdx}` : '',
                    payIdx <= 4 ? `Tanggal Bayar ${payIdx}` : ''
                ]);
                const date = parseImportDateToYmd(rawDate);
                const mappedBill = Math.min(6, Math.max(1, Math.ceil(payIdx / 4)));
                paymentInputs.push({ payIdx, billIdx: mappedBill, amount, rawDate, date });
            }

            const invalidDate = paymentInputs.find((p) => {
                const hasRaw = p.rawDate !== null && p.rawDate !== undefined && String(p.rawDate).trim() !== '';
                return Number(p.amount) > 0 && hasRaw && !p.date;
            });
            if (invalidDate) {
                errors.push(`Baris ${rowNo}: format tanggal pembayaran ${invalidDate.payIdx} tidak valid. Gunakan YYYY-MM-DD atau DD/MM/YYYY.`);
                continue;
            }

            // Validasi ketat agar jenis tagihan tidak terpecah-pecah saat import massal.
            const billValidationErrors = [];
            for (const b of billInputs) {
                const hasName = String(b.name || '').trim() !== '';
                const hasNominal = Number(b.nominal || 0) > 0;
                const hasPayment = paymentInputs.some((p) => p.billIdx === b.billIdx && Number(p.amount || 0) > 0);
                if (hasName && !hasNominal) {
                    billValidationErrors.push(`Tagihan ${b.billIdx} diisi tetapi Nominal ${b.billIdx} kosong/0`);
                }
                if (hasPayment && !hasName) {
                    billValidationErrors.push(`Pembayaran untuk Tagihan ${b.billIdx} ada, tetapi Nama Tagihan ${b.billIdx} kosong`);
                }
            }
            if (billValidationErrors.length) {
                errors.push(`Baris ${rowNo}: ${billValidationErrors.join('; ')}.`);
                continue;
            }

            const scholarshipsInput = [];
            for (let schIdx = 1; schIdx <= 5; schIdx++) {
                const name = String(getImportCell(row, [
                    `Beasiswa ${schIdx}`,
                    `Nama Beasiswa ${schIdx}`,
                    schIdx === 1 ? 'Beasiswa' : '',
                    schIdx === 1 ? 'Nama Beasiswa' : ''
                ])).trim();
                const rawNominalCell = getImportCell(row, [
                    `NominalB${schIdx}`,
                    `Nominal B${schIdx}`,
                    `Nominal Beasiswa ${schIdx}`,
                    schIdx === 1 ? 'Nominal Beasiswa' : ''
                ]);
                const nominal = Math.max(0, parseMoney(rawNominalCell));
                const jenisRaw = String(getImportCell(row, [
                    `Jenis Beasiswa ${schIdx}`,
                    `Tipe Beasiswa ${schIdx}`,
                    schIdx === 1 ? 'Jenis Beasiswa' : '',
                    schIdx === 1 ? 'Tipe Beasiswa' : ''
                ])).trim().toLowerCase();
                const rawNominalText = String(rawNominalCell ?? '').trim().toLowerCase();
                const isPercent = jenisRaw.includes('persen')
                    || jenisRaw.includes('percent')
                    || rawNominalText.includes('%');
                const receiptDate = parseImportDateToYmd(getImportCell(row, [
                    `Tanggal Beasiswa ${schIdx}`,
                    `Tgl Beasiswa ${schIdx}`,
                    schIdx === 1 ? 'Tanggal Beasiswa' : ''
                ]));
                if (name) scholarshipsInput.push({
                    name,
                    nominal,
                    jenisNilai: isPercent ? 'persen' : 'nominal',
                    receiptDate
                });
            }

            const effectiveBills = billInputs.map((b) => {
                const billPayments = paymentInputs
                    .filter((p) => p.billIdx === b.billIdx && Number(p.amount) > 0)
                    .map((p) => ({ payIdx: p.payIdx, amount: Number(p.amount), date: p.date || today }));
                const paidTotal = billPayments.reduce((acc, p) => acc + p.amount, 0);
                let nominal = Number(b.nominal || 0);
                if (nominal <= 0 && paidTotal > 0) nominal = paidTotal;
                if (b.billIdx === 1 && nominal <= 0 && legacySisa > 0) nominal = paidTotal + legacySisa;
                if (nominal <= 0) return null;
                const total = Math.max(nominal, paidTotal);
                const sisa = Math.max(0, total - paidTotal);
                const tanggalBuat = b.tanggalBuat || today;
                return {
                    billIdx: b.billIdx,
                    name: b.name || `Tagihan Import ${b.billIdx}`,
                    schoolYearName: b.schoolYearName || schoolYearName || null,
                    total,
                    terbayar: paidTotal,
                    sisa,
                    tanggalBuat,
                    payments: billPayments
                };
            }).filter(Boolean);

            if (!effectiveBills.length && !scholarshipsInput.length) {
                errors.push(`Baris ${rowNo}: tidak ada tagihan/beasiswa valid yang dapat diimport.`);
                continue;
            }

            if (dryRun) {
                importedBills += effectiveBills.length;
                importedPayments += effectiveBills.reduce((acc, b) => acc + b.payments.length, 0);
                importedPayments += scholarshipsInput.reduce((acc, s) => acc + (Number(s.nominal || 0) > 0 ? 1 : 0), 0);
                importedScholarshipRecipients += scholarshipsInput.length;
                continue;
            }

            let firstBillDate = today;
            for (const billData of effectiveBills) {
                const billCode = `IMP-BILL-${Date.now()}-${rowNo}-${billData.billIdx}`;
                firstBillDate = billData.tanggalBuat || firstBillDate;
                const [billRes] = await conn.query(
                    `INSERT INTO bills (
                        id_tagihan_code, nama_tagihan, kelas, nama_siswa,
                        total, base_total, scholarship_discount, net_total, scholarship_percent_applied,
                        terbayar, sisa, status, tanggal_buat, school_year_name,
                        student_id, class_id, branch_id
                    ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        billCode,
                        billData.name,
                        studentRow.kelas,
                        studentRow.nama,
                        billData.total,
                        billData.total,
                        billData.total,
                        billData.terbayar,
                        billData.sisa,
                        billData.sisa <= 0 ? 'Lunas' : 'Belum Lunas',
                        `${billData.tanggalBuat} 08:00:00`,
                        billData.schoolYearName || schoolYearName,
                        studentRow.id,
                        studentRow.class_id || null,
                        branchId
                    ]
                );
                const billId = Number(billRes.insertId);
                importedBills += 1;

                for (let pIdx = 0; pIdx < billData.payments.length; pIdx++) {
                    const p = billData.payments[pIdx];
                    await conn.query(
                        `INSERT INTO payments (
                            trans_id, tanggal, kelas, nama, jumlah_bayar,
                            penerima, keterangan, bill_id, student_id, class_id, branch_id
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            `IMP-PAY-${billId}-${p.payIdx}-${Date.now()}`,
                            p.date || today,
                            studentRow.kelas,
                            studentRow.nama,
                            p.amount,
                            penerima,
                            `${keteranganUmum} (tagihan ${billData.billIdx} cicilan ${pIdx + 1})`,
                            billId,
                            studentRow.id,
                            studentRow.class_id || null,
                            branchId
                        ]
                    );
                    importedPayments += 1;
                }
            }

            for (const scholarshipData of scholarshipsInput) {
                let typeId = null;
                const [typeRows] = await conn.query(
                    `SELECT id
                     FROM scholarship_types
                     WHERE LOWER(TRIM(nama_beasiswa)) = LOWER(TRIM(?))
                     LIMIT 1`,
                    [scholarshipData.name]
                );
                if (typeRows.length) {
                    typeId = Number(typeRows[0].id || 0) || null;
                } else {
                    const [newType] = await conn.query(
                        `INSERT INTO scholarship_types (nama_beasiswa, jenis_nilai, nominal_per_siswa, keterangan, is_active)
                         VALUES (?, ?, ?, 'Import master', 1)`,
                        [scholarshipData.name, scholarshipData.jenisNilai || 'nominal', Number(scholarshipData.nominal || 0)]
                    );
                    typeId = Number(newType.insertId || 0) || null;
                }
                if (!typeId) continue;

                const receiptDate = scholarshipData.receiptDate || firstBillDate || today;
                const periodDate = new Date(receiptDate);
                const periodMonth = Number.isFinite(periodDate.getMonth()) ? (periodDate.getMonth() + 1) : Number(new Date().getMonth() + 1);
                const periodYear = Number.isFinite(periodDate.getFullYear()) ? periodDate.getFullYear() : Number(new Date().getFullYear());
                const [existsRecipient] = await conn.query(
                    `SELECT id
                     FROM scholarship_recipients
                     WHERE type_id = ?
                       AND student_id = ?
                       AND period_month = ?
                       AND period_year = ?
                       AND branch_id = ?
                     LIMIT 1`,
                    [typeId, studentRow.id, periodMonth, periodYear, branchId]
                );
                if (!existsRecipient.length) {
                    let scholarshipPaymentId = null;
                    if (Number(scholarshipData.nominal || 0) > 0) {
                        const [payRes] = await conn.query(
                            `INSERT INTO payments (
                                trans_id, tanggal, kelas, nama, jumlah_bayar,
                                penerima, keterangan, bill_id, student_id, class_id, branch_id
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
                            [
                                `IMP-BEA-${Date.now()}-${rowNo}-${typeId}`,
                                receiptDate,
                                studentRow.kelas,
                                studentRow.nama,
                                Number(scholarshipData.nominal || 0),
                                'Sistem (Beasiswa)',
                                `Import master: ${scholarshipData.name}`,
                                studentRow.id,
                                studentRow.class_id || null,
                                branchId
                            ]
                        );
                        scholarshipPaymentId = Number(payRes.insertId || 0) || null;
                        importedPayments += 1;
                    }

                    await conn.query(
                        `INSERT INTO scholarship_recipients (
                            type_id, nama_siswa, kelas, nis, tanggal_terima,
                            period_month, period_year, is_operational_active, student_status_snapshot,
                            payment_id, student_id, class_id, branch_id
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
                        [
                            typeId,
                            studentRow.nama,
                            studentRow.kelas,
                            nis || null,
                            receiptDate,
                            periodMonth,
                            periodYear,
                            String(studentRow.status || 'Aktif'),
                            scholarshipPaymentId,
                            studentRow.id,
                            studentRow.class_id || null,
                            branchId
                        ]
                    );
                    importedScholarshipRecipients += 1;
                }
            }
        }

        if (!dryRun && errors.length > 0) {
            if (txStarted) {
                await conn.rollback();
                txStarted = false;
            }
            return res.status(400).json({
                success: false,
                message: `Import dibatalkan. Ditemukan ${errors.length} baris gagal, tidak ada data yang disimpan.`,
                summary: { importedBills: 0, importedPayments: 0, importedScholarshipRecipients: 0, failedRows: errors.length, dryRun },
                errors
            });
        }

        if (txStarted) {
            await conn.commit();
            invalidateBillingReadModels();
        }
        if (!dryRun && importedBills <= 0 && importedPayments <= 0 && errors.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Import selesai diproses, tetapi tidak ada data yang berhasil masuk.',
                summary: { importedBills, importedPayments, importedScholarshipRecipients, failedRows: errors.length, dryRun },
                errors
            });
        }
        res.json({
            success: true,
            message: dryRun
                ? `Preview selesai. ${importedBills} tagihan, ${importedPayments} pembayaran, ${importedScholarshipRecipients} data beasiswa siap di-import.`
                : `Import selesai. ${importedBills} tagihan, ${importedPayments} pembayaran, ${importedScholarshipRecipients} data beasiswa masuk.`,
            summary: { importedBills, importedPayments, importedScholarshipRecipients, failedRows: errors.length, dryRun },
            errors
        });
    } catch (err) {
        if (txStarted) await conn.rollback();
        res.status(500).json({ success: false, message: `Gagal import: ${err.message}` });
    } finally {
        conn.release();
    }
});

module.exports = router;
