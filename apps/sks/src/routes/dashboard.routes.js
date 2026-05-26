const express = require('express');
const db = require('../../db');
const { isSuperAdmin, getSessionBranchId, resolveBranchId, ensureBranchForAdmin } = require('../utils/branchScope');

const router = express.Router();
let billsSchoolYearColumnExistsCache = null;
let otherIncomeTableEnsured = false;
let largeScaleIndexesEnsured = false;
let largeScaleIndexesEnsuringPromise = null;
let classFinanceSummaryEnsured = false;
let classFinanceSummaryRefreshingPromise = null;
let classFinanceSummaryLastRefreshedAt = 0;
const INITIAL_DATA_CACHE_TTL_MS = 120000;
const initialDataCache = new Map();
const REPORT_DETAIL_CACHE_TTL_MS = 120000;
const reportDetailCache = new Map();
const reportClassStudentsCache = new Map();
const CLASS_FINANCE_SUMMARY_REFRESH_MS = 120000;

async function columnExists(tableName, columnName) {
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

async function hasBillsSchoolYearColumn() {
    if (billsSchoolYearColumnExistsCache !== null) return billsSchoolYearColumnExistsCache;
    try {
        billsSchoolYearColumnExistsCache = await columnExists('bills', 'school_year_name');
    } catch (_) {
        billsSchoolYearColumnExistsCache = false;
    }
    return billsSchoolYearColumnExistsCache;
}

function getMonthYear(query = {}) {
    const now = new Date();
    const month = Math.max(1, Math.min(12, Number.parseInt(query.month, 10) || now.getMonth() + 1));
    const year = Number.parseInt(query.year, 10) || now.getFullYear();
    return { month, year };
}

function getPrevMonthYear(month, year) {
    if (month === 1) return { month: 12, year: year - 1 };
    return { month: month - 1, year };
}

function getMonthRange(query = {}) {
    const now = new Date();
    const normalize = (value, fallback) => {
        const raw = String(value || fallback || '').trim();
        const match = raw.match(/^(\d{4})-(\d{1,2})$/);
        if (!match) return fallback;
        const year = Number.parseInt(match[1], 10);
        const month = Math.max(1, Math.min(12, Number.parseInt(match[2], 10)));
        return { year, month, key: `${year}-${String(month).padStart(2, '0')}` };
    };
    const fallback = { year: now.getFullYear(), month: now.getMonth() + 1, key: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}` };
    let start = normalize(query.start, fallback);
    let end = normalize(query.end, fallback);
    if (!start) start = fallback;
    if (!end) end = fallback;
    if (start.key > end.key) [start, end] = [end, start];
    return { start, end };
}

function revenuePaymentCondition(alias = '') {
    const p = alias ? `${alias}.` : '';
    return `NOT (
        LOWER(TRIM(COALESCE(${p}penerima, ''))) IN ('sistem (beasiswa)', 'sistem (auto)')
        OR LOWER(COALESCE(${p}keterangan, '')) LIKE '%beasiswa%'
        OR LOWER(COALESCE(${p}keterangan, '')) LIKE 'potongan otomatis%'
    )`;
}

function getWaliClass(req) {
    if (String(req.session?.userRole || '') !== 'wali_kelas') return null;
    const kelas = String(req.session?.homeroomClass || '').trim();
    return kelas || null;
}

function operationalBranchFilter(alias = '') {
    const prefix = alias ? `${alias}.` : '';
    return `${prefix}id <> 1`;
}

function getInitialDataCacheKey(req, branchId, waliClass, includeFlags = {}) {
    const role = String(req.session?.userRole || '');
    return JSON.stringify({
        role,
        userId: Number(req.session?.adminId || 0),
        branchId: Number(branchId || 0),
        waliClass: String(waliClass || ''),
        includeRawStudents: Number(includeFlags.includeRawStudents ? 1 : 0),
        includeExistingBills: Number(includeFlags.includeExistingBills ? 1 : 0)
    });
}

function getCachedInitialData(cacheKey) {
    const entry = initialDataCache.get(cacheKey);
    if (!entry) return null;
    if (Date.now() - Number(entry.cachedAt || 0) > INITIAL_DATA_CACHE_TTL_MS) {
        initialDataCache.delete(cacheKey);
        return null;
    }
    return entry.payload || null;
}

function setCachedInitialData(cacheKey, payload) {
    initialDataCache.set(cacheKey, { payload, cachedAt: Date.now() });
}

function invalidateDashboardCaches() {
    initialDataCache.clear();
    reportDetailCache.clear();
    reportClassStudentsCache.clear();
}

function getScopedCachePayload(cacheMap, cacheKey, ttlMs) {
    const entry = cacheMap.get(cacheKey);
    if (!entry) return null;
    if (Date.now() - Number(entry.cachedAt || 0) > ttlMs) {
        cacheMap.delete(cacheKey);
        return null;
    }
    return entry.payload || null;
}

async function ensureOtherIncomeTable() {
    if (otherIncomeTableEnsured) return;
    await db.query(`
        CREATE TABLE IF NOT EXISTS other_incomes (
            id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            branch_id INT NOT NULL,
            tanggal DATE NOT NULL,
            sumber VARCHAR(80) NOT NULL,
            deskripsi VARCHAR(200) NOT NULL,
            nominal DECIMAL(15,2) NOT NULL,
            report_status VARCHAR(10) NOT NULL DEFAULT 'belum',
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            admin_keuangan_nama VARCHAR(120) NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_other_income_branch_date (branch_id, tanggal),
            INDEX idx_other_income_branch_active (branch_id, is_active)
        )
    `);
    otherIncomeTableEnsured = true;
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

async function refreshClassFinanceSummary() {
    await ensureClassFinanceSummaryTable();
    const hasRecipientOperationalFlag = await columnExists('scholarship_recipients', 'is_operational_active');
    const recipientOperationalWhere = hasRecipientOperationalFlag ? 'WHERE COALESCE(is_operational_active, 1) = 1' : '';
    await db.query('DELETE FROM class_finance_summary');
    await db.query(
        `INSERT INTO class_finance_summary (
            branch_id, kelas, jumlah_siswa, siswa_beasiswa,
            total_tagihan, total_terbayar, total_sisa,
            siswa_lunas, siswa_belum_lunas
        )
        SELECT
            s.branch_id,
            TRIM(COALESCE(s.kelas, '-')) COLLATE utf8mb4_0900_ai_ci AS kelas,
            COUNT(*) AS jumlah_siswa,
            SUM(CASE WHEN sch.student_id IS NOT NULL THEN 1 ELSE 0 END) AS siswa_beasiswa,
            COALESCE(SUM(COALESCE(sb.total_tagihan, 0)), 0) AS total_tagihan,
            COALESCE(SUM(COALESCE(sb.total_terbayar, 0)), 0) AS total_terbayar,
            COALESCE(SUM(COALESCE(sb.total_sisa, 0)), 0) AS total_sisa,
            SUM(CASE WHEN COALESCE(sb.total_sisa, 0) <= 0 THEN 1 ELSE 0 END) AS siswa_lunas,
            SUM(CASE WHEN COALESCE(sb.total_sisa, 0) > 0 THEN 1 ELSE 0 END) AS siswa_belum_lunas
        FROM students s
        LEFT JOIN (
            SELECT
                student_id,
                COALESCE(SUM(total), 0) AS total_tagihan,
                COALESCE(SUM(terbayar), 0) AS total_terbayar,
                COALESCE(SUM(GREATEST(0, sisa)), 0) AS total_sisa
            FROM bills
            GROUP BY student_id
        ) sb ON sb.student_id = s.id
        LEFT JOIN (
            SELECT DISTINCT student_id
            FROM scholarship_recipients
            ${recipientOperationalWhere}
        ) sch ON sch.student_id = s.id
        WHERE LOWER(TRIM(COALESCE(s.status, ''))) = 'aktif'
        GROUP BY s.branch_id, TRIM(COALESCE(s.kelas, '-')) COLLATE utf8mb4_0900_ai_ci`
    );
    classFinanceSummaryLastRefreshedAt = Date.now();
}

function triggerClassFinanceSummaryRefresh(force = false) {
    if (!force && (Date.now() - classFinanceSummaryLastRefreshedAt) < CLASS_FINANCE_SUMMARY_REFRESH_MS) return;
    if (classFinanceSummaryRefreshingPromise) return;
    classFinanceSummaryRefreshingPromise = refreshClassFinanceSummary()
        .catch((err) => {
            console.warn('[classFinanceSummary] warning:', err?.message || err);
        })
        .finally(() => {
            classFinanceSummaryRefreshingPromise = null;
        });
}

async function ensureClassFinanceSummarySeeded() {
    await ensureClassFinanceSummaryTable();
    if (classFinanceSummaryRefreshingPromise) {
        await classFinanceSummaryRefreshingPromise;
        return;
    }
    const [rows] = await db.query('SELECT COUNT(*) AS total FROM class_finance_summary');
    if (Number(rows[0]?.total || 0) <= 0) {
        classFinanceSummaryRefreshingPromise = refreshClassFinanceSummary()
            .catch((err) => {
                console.warn('[classFinanceSummary] warning:', err?.message || err);
            })
            .finally(() => {
                classFinanceSummaryRefreshingPromise = null;
            });
        await classFinanceSummaryRefreshingPromise;
    } else {
        triggerClassFinanceSummaryRefresh(false);
    }
}

function triggerLargeScaleIndexesEnsure() {
    if (largeScaleIndexesEnsured || largeScaleIndexesEnsuringPromise) return;
    const defs = [
        ['students', 'idx_students_status_branch_class_name', 'CREATE INDEX idx_students_status_branch_class_name ON students(status, branch_id, kelas, nama)'],
        ['students', 'idx_students_status_kelas_branch_name', 'CREATE INDEX idx_students_status_kelas_branch_name ON students(status, kelas, branch_id, nama)'],
        ['bills', 'idx_bills_student_branch_sisa', 'CREATE INDEX idx_bills_student_branch_sisa ON bills(student_id, branch_id, sisa)'],
        ['bills', 'idx_bills_student_date_id', 'CREATE INDEX idx_bills_student_date_id ON bills(student_id, tanggal_buat, id)'],
        ['bills', 'idx_bills_branch_kelas_sisa', 'CREATE INDEX idx_bills_branch_kelas_sisa ON bills(branch_id, kelas, sisa)'],
        ['bills', 'idx_bills_sisa_student_branch', 'CREATE INDEX idx_bills_sisa_student_branch ON bills(sisa, student_id, branch_id)'],
        ['scholarship_recipients', 'idx_sr_student_date', 'CREATE INDEX idx_sr_student_date ON scholarship_recipients(student_id, tanggal_terima, id)']
    ];
    largeScaleIndexesEnsuringPromise = (async () => {
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
        largeScaleIndexesEnsured = true;
    })()
        .catch((err) => {
            console.warn('[ensureLargeScaleIndexes] warning:', err?.message || err);
        })
        .finally(() => {
            largeScaleIndexesEnsuringPromise = null;
        });
}

// 1. INITIAL DATA & DASHBOARD (GLOBAL STATE)
router.get('/initial-data', async (req, res) => {
    try {
        if (!ensureBranchForAdmin(req, res)) return;
        await ensureOtherIncomeTable();
        triggerLargeScaleIndexesEnsure();
        await ensureClassFinanceSummarySeeded();
        const includeRawStudents = String(req.query.include_raw_students || '0') === '1';
        const includeExistingBills = String(req.query.include_existing_bills || '0') === '1';
        const branchId = resolveBranchId(req, ['branch_id']) || getSessionBranchId(req);
        const byBranch = !isSuperAdmin(req) || branchId ? ' WHERE branch_id = ? ' : '';
        const superOperationalStudentsClause = isSuperAdmin(req) && !branchId ? `${byBranch ? ' AND ' : ' WHERE '} branch_id IN (SELECT id FROM branches WHERE ${operationalBranchFilter()}) ` : '';
        const superOperationalPaymentsClause = isSuperAdmin(req) && !branchId ? `${byBranch ? ' AND ' : ' WHERE '} branch_id IN (SELECT id FROM branches WHERE ${operationalBranchFilter()}) ` : '';
        const superOperationalBillsClause = isSuperAdmin(req) && !branchId ? `${byBranch ? ' AND ' : ' WHERE '} branch_id IN (SELECT id FROM branches WHERE ${operationalBranchFilter()}) ` : '';
        const branchParams = byBranch ? [branchId] : [];
        const waliClass = getWaliClass(req);
        const studentsClassClause = waliClass ? `${(byBranch || superOperationalStudentsClause) ? ' AND ' : ' WHERE '} kelas = ? ` : '';
        const paymentClassClause = waliClass ? `${(byBranch || superOperationalPaymentsClause) ? ' AND ' : ' WHERE '} kelas = ? ` : '';
        const billsClassClause = waliClass ? `${(byBranch || superOperationalBillsClause) ? ' AND ' : ' WHERE '} kelas = ? ` : '';
        const studentParams = waliClass ? [...branchParams, waliClass] : [...branchParams];
        const paymentParams = waliClass ? [...branchParams, waliClass] : [...branchParams];
        const billsParams = waliClass ? [...branchParams, waliClass] : [...branchParams];
        const cacheKey = getInitialDataCacheKey(req, branchId, waliClass, { includeRawStudents, includeExistingBills });
        const cached = getCachedInitialData(cacheKey);
        if (cached) {
            return res.json(cached);
        }

        let schoolYears = [];
        let semesters = [];
        let activeSchoolYear = null;
        let activeSemester = null;
        try {
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
            const [yearsRows] = await db.query('SELECT id, name, is_active FROM school_years ORDER BY id DESC');
            const [semesterRows] = await db.query('SELECT id, name, is_active FROM semesters ORDER BY id ASC');
            schoolYears = yearsRows;
            semesters = semesterRows;
            activeSchoolYear = schoolYears.find((y) => Number(y.is_active) === 1) || null;
            activeSemester = semesters.find((s) => Number(s.is_active) === 1) || null;
        } catch (_) {}

        const studentsQueryPromise = includeRawStudents
            ? db.query(
                `SELECT
                    id, nis, username, nama, kelas, class_id, branch_id,
                    status, tahun_masuk, tahun_lulus, jenis_kelamin
                 FROM students
                 ${byBranch}${superOperationalStudentsClause}${studentsClassClause}
                 ORDER BY id DESC
                 LIMIT 5000`,
                studentParams
            )
            : Promise.resolve([[]]);
        const paymentsQueryPromise = db.query(
            `SELECT p.*, DATE_FORMAT(p.tanggal, '%Y-%m-%d') AS tanggal
             FROM payments p
             ${byBranch}${superOperationalPaymentsClause}${paymentClassClause}
             ORDER BY p.tanggal DESC, p.id DESC
             LIMIT 500`,
            paymentParams
        );
        const paymentAggPromise = db.query(
            `SELECT kelas, COALESCE(SUM(jumlah_bayar), 0) AS total
             FROM payments
             ${byBranch}${superOperationalPaymentsClause}${paymentClassClause}
             ${(byBranch || superOperationalPaymentsClause || paymentClassClause) ? 'AND' : 'WHERE'} ${revenuePaymentCondition()}
             GROUP BY kelas`,
            paymentParams
        );
        const paymentTotalPromise = db.query(
            `SELECT COALESCE(SUM(jumlah_bayar), 0) AS total_pemasukan
             FROM payments
             ${byBranch}${superOperationalPaymentsClause}${paymentClassClause}
             ${(byBranch || superOperationalPaymentsClause || paymentClassClause) ? 'AND' : 'WHERE'} ${revenuePaymentCondition()}`,
            paymentParams
        );
        const studentTotalsPromise = db.query(
            `SELECT
                COUNT(*) AS total_siswa,
                SUM(CASE WHEN LOWER(TRIM(COALESCE(status, ''))) = 'aktif' THEN 1 ELSE 0 END) AS total_siswa_aktif
             FROM students
             ${byBranch}${superOperationalStudentsClause}${studentsClassClause}`,
            studentParams
        );
        const { month: currentMonth, year: currentYear } = getMonthYear({});
        const { month: prevMonth, year: prevYear } = getPrevMonthYear(currentMonth, currentYear);
        const currentMonthPromise = db.query(
            `SELECT COALESCE(SUM(jumlah_bayar), 0) AS total
             FROM payments
             ${byBranch}${superOperationalPaymentsClause}${paymentClassClause}
             ${(byBranch || superOperationalPaymentsClause || paymentClassClause) ? 'AND' : 'WHERE'} ${revenuePaymentCondition()}
             AND MONTH(tanggal) = ? AND YEAR(tanggal) = ?`,
            [...paymentParams, currentMonth, currentYear]
        );
        const currentMonthOtherIncomePromise = db.query(
            `SELECT COALESCE(SUM(nominal), 0) AS total
             FROM other_incomes
             ${byBranch}${superOperationalPaymentsClause}
             ${(byBranch || superOperationalPaymentsClause) ? 'AND' : 'WHERE'} MONTH(tanggal) = ? AND YEAR(tanggal) = ?`,
            [...branchParams, currentMonth, currentYear]
        );
        const currentMonthExpensePromise = db.query(
            `SELECT COALESCE(SUM(nominal), 0) AS total
             FROM expenses
             ${byBranch}${superOperationalPaymentsClause}
             ${(byBranch || superOperationalPaymentsClause) ? 'AND' : 'WHERE'} MONTH(tanggal) = ? AND YEAR(tanggal) = ?`,
            [...branchParams, currentMonth, currentYear]
        );
        const prevMonthPromise = db.query(
            `SELECT COALESCE(SUM(jumlah_bayar), 0) AS total
             FROM payments
             ${byBranch}${superOperationalPaymentsClause}${paymentClassClause}
             ${(byBranch || superOperationalPaymentsClause || paymentClassClause) ? 'AND' : 'WHERE'} ${revenuePaymentCondition()}
             AND MONTH(tanggal) = ? AND YEAR(tanggal) = ?`,
            [...paymentParams, prevMonth, prevYear]
        );
        const monthArrearsPromise = db.query(
            `SELECT
                COALESCE(SUM(CASE WHEN sisa > 0 THEN sisa ELSE 0 END), 0) AS total_tunggakan_bulan,
                COALESCE(COUNT(CASE WHEN sisa > 0 THEN 1 END), 0) AS invoice_nunggak_bulan
             FROM bills
             ${byBranch}${superOperationalBillsClause}${billsClassClause}
             ${(byBranch || superOperationalBillsClause || billsClassClause) ? 'AND' : 'WHERE'} MONTH(tanggal_buat) = ? AND YEAR(tanggal_buat) = ?`,
            [...billsParams, currentMonth, currentYear]
        );
        const classesSuperOperationalClause = isSuperAdmin(req) && !branchId ? `${byBranch ? ' AND ' : ' WHERE '} branch_id IN (SELECT id FROM branches WHERE ${operationalBranchFilter()}) ` : '';
        const classesByWaliClause = waliClass ? `${(byBranch || classesSuperOperationalClause) ? ' AND ' : ' WHERE '} nama_kelas = ? ` : '';
        const classesParams = waliClass ? [...branchParams, waliClass] : [...branchParams];
        const classesDataPromise = db.query(
            `SELECT id, branch_id, nama_kelas
             FROM classes
             ${byBranch}${classesSuperOperationalClause}${classesByWaliClause}
             ORDER BY nama_kelas`,
            classesParams
        );
        const summaryByBranch = !isSuperAdmin(req) || branchId ? ' AND cs.branch_id = ? ' : '';
        const summaryByClass = waliClass ? ' AND cs.kelas = ? ' : '';
        const summarySuperOperational = isSuperAdmin(req) && !branchId ? ` AND cs.branch_id IN (SELECT id FROM branches WHERE ${operationalBranchFilter()}) ` : '';
        const classAggPromise = db.query(
            `SELECT
                cs.branch_id,
                cs.kelas,
                COALESCE(cs.jumlah_siswa, 0) AS jumlahSiswa,
                COALESCE(cs.siswa_lunas, 0) AS lunas,
                COALESCE(cs.siswa_belum_lunas, 0) AS nunggak
             FROM class_finance_summary cs
             WHERE 1=1
             ${summarySuperOperational}
             ${summaryByBranch}
             ${summaryByClass}`,
            [...branchParams, ...(waliClass ? [waliClass] : [])]
        );
        const existingBillsPromise = includeExistingBills
            ? (async () => {
                const withSchoolYear = await hasBillsSchoolYearColumn();
                return db.query(
                    `
                    SELECT 
                        MAX(branch_id) AS branch_id,
                        nama_tagihan, 
                        total as nominal, 
                        MAX(tanggal_buat) as tanggal_buat, 
                        ${withSchoolYear ? 'MAX(school_year_name)' : 'NULL'} as school_year_name,
                        COUNT(id) as jumlah_siswa, 
                        SUM(total) as total_potensi
                    FROM bills
                    ${byBranch}${superOperationalBillsClause}${billsClassClause}
                    GROUP BY nama_tagihan, total, tanggal_buat${withSchoolYear ? ', school_year_name' : ''}
                    ORDER BY MAX(id) DESC
                    LIMIT 500
                `,
                    billsParams
                );
            })()
            : Promise.resolve([[]]);

        const [
            [students],
            [payments],
            [paymentAggRows],
            [paymentTotalRows],
            [studentTotalsRows],
            [currentMonthRows],
            [currentMonthOtherIncomeRows],
            [currentMonthExpenseRows],
            [prevMonthRows],
            [monthArrearsRows],
            [classesData],
            [classAggRows],
            [existingBills]
        ] = await Promise.all([
            studentsQueryPromise,
            paymentsQueryPromise,
            paymentAggPromise,
            paymentTotalPromise,
            studentTotalsPromise,
            currentMonthPromise,
            currentMonthOtherIncomePromise,
            currentMonthExpensePromise,
            prevMonthPromise,
            monthArrearsPromise,
            classesDataPromise,
            classAggPromise,
            existingBillsPromise
        ]);
        const currentMonthTotal = Number(currentMonthRows[0]?.total || 0);
        const currentMonthOtherIncome = Number(currentMonthOtherIncomeRows[0]?.total || 0);
        const currentMonthExpense = Number(currentMonthExpenseRows[0]?.total || 0);
        const prevMonthTotal = Number(prevMonthRows[0]?.total || 0);
        const monthPotensiTunggakan = Number(monthArrearsRows[0]?.total_tunggakan_bulan || 0);
        const monthInvoiceNunggak = Number(monthArrearsRows[0]?.invoice_nunggak_bulan || 0);
        const momPemasukanPercent = prevMonthTotal > 0
            ? ((currentMonthTotal - prevMonthTotal) / prevMonthTotal) * 100
            : (currentMonthTotal > 0 ? 100 : 0);
        let branchSummary = [];
        if (isSuperAdmin(req)) {
            try {
                const [branchRows] = await db.query(
                    `SELECT
                        b.id,
                        b.nama_cabang,
                        b.kode_cabang,
                        b.is_active,
                        COALESCE(st.total_siswa_aktif, 0) AS total_siswa_aktif,
                        COALESCE(py.total_pemasukan, 0) AS total_pemasukan,
                        COALESCE(bl.total_tunggakan, 0) AS total_tunggakan
                     FROM branches b
                     LEFT JOIN (
                        SELECT branch_id,
                               SUM(CASE WHEN LOWER(TRIM(COALESCE(status, ''))) = 'aktif' THEN 1 ELSE 0 END) AS total_siswa_aktif
                        FROM students
                        GROUP BY branch_id
                     ) st ON st.branch_id = b.id
                     LEFT JOIN (
                        SELECT branch_id, SUM(jumlah_bayar) AS total_pemasukan
                        FROM payments
                        WHERE ${revenuePaymentCondition()}
                        GROUP BY branch_id
                     ) py ON py.branch_id = b.id
                     LEFT JOIN (
                         SELECT branch_id, SUM(sisa) AS total_tunggakan
                         FROM bills
                         WHERE sisa > 0
                         GROUP BY branch_id
                     ) bl ON bl.branch_id = b.id
                     WHERE ${operationalBranchFilter('b')}
                     ORDER BY total_pemasukan DESC, total_siswa_aktif DESC, b.nama_cabang ASC`
                );
                branchSummary = branchRows.map((row) => ({
                    id: row.id,
                    nama_cabang: row.nama_cabang,
                    kode_cabang: row.kode_cabang,
                    is_active: Number(row.is_active || 0),
                    total_siswa_aktif: Number(row.total_siswa_aktif || 0),
                    total_pemasukan: Number(row.total_pemasukan || 0),
                    total_tunggakan: Number(row.total_tunggakan || 0)
                }));
            } catch (_) {
                branchSummary = [];
            }
        }

        const classAggMap = new Map(
            (classAggRows || []).map((r) => [`${Number(r.branch_id || 0)}::${String(r.kelas || '')}`, r])
        );
        const classStats = classesData.map((c) => {
            const agg = classAggMap.get(`${Number(c.branch_id || 0)}::${String(c.nama_kelas || '')}`) || {};
            return {
                ...c,
                jumlahSiswa: Number(agg.jumlahSiswa || 0),
                lunas: Number(agg.lunas || 0),
                nunggak: Number(agg.nunggak || 0)
            };
        });

        const chartData = {};
        paymentAggRows.forEach((row) => {
            const key = row.kelas || 'Tanpa Kelas';
            chartData[key] = Number(row.total || 0);
        });

        const billStats = {
            totalKali: existingBills.length,
            totalNominal: existingBills.reduce((acc, curr) => acc + Number(curr.total_potensi), 0),
            totalSiswaTerkena: existingBills.reduce((acc, curr) => acc + Number(curr.jumlah_siswa), 0)
        };

        const scopedBranchId = !isSuperAdmin(req) ? Number(getSessionBranchId(req) || 0) : 0;
        const scopeByBranch = (rows) => {
            if (!Array.isArray(rows)) return [];
            if (!(scopedBranchId > 0)) return rows;
            return rows.filter((row) => Number(row?.branch_id || 0) === scopedBranchId);
        };

        const responsePayload = {
            payments: scopeByBranch(payments),
            classes: scopeByBranch(classStats),
            rawStudents: scopeByBranch(students),
            chartData,
            existingBills: scopedBranchId > 0
                ? (Array.isArray(existingBills)
                    ? existingBills.filter((row) => Number(row?.branch_id || scopedBranchId) === scopedBranchId)
                    : [])
                : existingBills,
            billStats,
            dashboardTotals: {
                totalPemasukan: Number(paymentTotalRows[0]?.total_pemasukan || 0),
                totalSiswa: Number(studentTotalsRows[0]?.total_siswa || 0),
                totalSiswaAktif: Number(studentTotalsRows[0]?.total_siswa_aktif || 0),
                monthPemasukan: currentMonthTotal,
                monthPemasukanLain: currentMonthOtherIncome,
                monthPengeluaran: currentMonthExpense,
                prevMonthPemasukan: prevMonthTotal,
                monthPotensiTunggakan,
                monthInvoiceNunggak,
                currentMonth,
                currentYear,
                momPemasukanPercent: Number(momPemasukanPercent.toFixed(2))
            },
            branchSummary: scopedBranchId > 0 ? [] : branchSummary,
            schoolYears,
            semesters,
            activeSchoolYear,
            activeSemester
        };
        setCachedInitialData(cacheKey, responsePayload);
        res.json(responsePayload);
    } catch (err) {
        console.error('[initial-data] error:', err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/branch-summary', async (req, res) => {
    try {
        if (!ensureBranchForAdmin(req, res)) return;
        if (!isSuperAdmin(req)) {
            return res.status(403).json({ success: false, message: 'Hanya super admin yang dapat mengakses ringkasan cabang.' });
        }

        const now = new Date();
        const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);
        const defaultTo = now;
        const dateFrom = String(req.query.date_from || '').trim() || defaultFrom.toISOString().slice(0, 10);
        const dateTo = String(req.query.date_to || '').trim() || defaultTo.toISOString().slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
            return res.status(400).json({ success: false, message: 'Format tanggal wajib YYYY-MM-DD.' });
        }

        const [rows] = await db.query(
            `SELECT
                b.id,
                b.nama_cabang,
                b.kode_cabang,
                b.is_active,
                COALESCE(st.total_siswa_aktif, 0) AS total_siswa_aktif,
                COALESCE(py.total_pemasukan, 0) AS total_pemasukan,
                COALESCE(py.total_transaksi, 0) AS total_transaksi,
                COALESCE(bl.total_tunggakan, 0) AS total_tunggakan
             FROM branches b
             LEFT JOIN (
                SELECT branch_id,
                       SUM(CASE WHEN LOWER(TRIM(COALESCE(status, ''))) = 'aktif' THEN 1 ELSE 0 END) AS total_siswa_aktif
                FROM students
                GROUP BY branch_id
             ) st ON st.branch_id = b.id
              LEFT JOIN (
                 SELECT branch_id,
                        SUM(jumlah_bayar) AS total_pemasukan,
                        COUNT(*) AS total_transaksi
                 FROM payments
                 WHERE ${revenuePaymentCondition()}
                  AND DATE(tanggal) BETWEEN ? AND ?
                 GROUP BY branch_id
              ) py ON py.branch_id = b.id
              LEFT JOIN (
                 SELECT branch_id,
                        SUM(sisa) AS total_tunggakan
                 FROM bills
                 WHERE sisa > 0
                  AND DATE(tanggal_buat) BETWEEN ? AND ?
                 GROUP BY branch_id
              ) bl ON bl.branch_id = b.id
              WHERE ${operationalBranchFilter('b')}
              ORDER BY total_pemasukan DESC, total_siswa_aktif DESC, b.nama_cabang ASC`,
            [dateFrom, dateTo, dateFrom, dateTo]
        );

        const data = rows.map((row) => ({
            id: row.id,
            nama_cabang: row.nama_cabang,
            kode_cabang: row.kode_cabang,
            is_active: Number(row.is_active || 0),
            total_siswa_aktif: Number(row.total_siswa_aktif || 0),
            total_pemasukan: Number(row.total_pemasukan || 0),
            total_transaksi: Number(row.total_transaksi || 0),
            total_tunggakan: Number(row.total_tunggakan || 0)
        }));

        const totals = data.reduce(
            (acc, item) => {
                acc.totalCabang += 1;
                acc.totalSiswaAktif += item.total_siswa_aktif;
                acc.totalPemasukan += item.total_pemasukan;
                acc.totalTunggakan += item.total_tunggakan;
                acc.totalTransaksi += item.total_transaksi;
                return acc;
            },
            { totalCabang: 0, totalSiswaAktif: 0, totalPemasukan: 0, totalTunggakan: 0, totalTransaksi: 0 }
        );

        res.json({
            success: true,
            period: { date_from: dateFrom, date_to: dateTo },
            rows: data,
            totals
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/monitoring-arrears', async (req, res) => {
    try {
        if (!ensureBranchForAdmin(req, res)) return;
        if (!isSuperAdmin(req)) {
            return res.status(403).json({ success: false, message: 'Hanya super admin yang dapat mengakses monitoring tunggakan.' });
        }
        const { month, year } = getMonthYear(req.query);
        const [rows] = await db.query(
            `SELECT
                b.id AS branch_id,
                b.nama_cabang,
                b.kode_cabang,
                COALESCE(SUM(CASE WHEN DATEDIFF(CURDATE(), DATE(bi.tanggal_buat)) BETWEEN 0 AND 30 THEN bi.sisa ELSE 0 END), 0) AS aging_0_30,
                COALESCE(SUM(CASE WHEN DATEDIFF(CURDATE(), DATE(bi.tanggal_buat)) BETWEEN 31 AND 60 THEN bi.sisa ELSE 0 END), 0) AS aging_31_60,
                COALESCE(SUM(CASE WHEN DATEDIFF(CURDATE(), DATE(bi.tanggal_buat)) > 60 THEN bi.sisa ELSE 0 END), 0) AS aging_over_60,
                COALESCE(SUM(bi.sisa), 0) AS total_tunggakan,
                COUNT(CASE WHEN bi.sisa > 0 THEN 1 END) AS total_invoice_nunggak
             FROM branches b
             LEFT JOIN bills bi ON bi.branch_id = b.id
                AND bi.sisa > 0
                AND MONTH(bi.tanggal_buat) = ?
                AND YEAR(bi.tanggal_buat) = ?
             WHERE ${operationalBranchFilter('b')}
             GROUP BY b.id, b.nama_cabang, b.kode_cabang
             ORDER BY total_tunggakan DESC, b.nama_cabang ASC`,
            [month, year]
        );

        const data = rows.map((r) => ({
            branch_id: r.branch_id,
            nama_cabang: r.nama_cabang,
            kode_cabang: r.kode_cabang,
            aging_0_30: Number(r.aging_0_30 || 0),
            aging_31_60: Number(r.aging_31_60 || 0),
            aging_over_60: Number(r.aging_over_60 || 0),
            total_tunggakan: Number(r.total_tunggakan || 0),
            total_invoice_nunggak: Number(r.total_invoice_nunggak || 0)
        }));

        const totals = data.reduce(
            (acc, item) => {
                acc.totalTunggakan += item.total_tunggakan;
                acc.aging0_30 += item.aging_0_30;
                acc.aging31_60 += item.aging_31_60;
                acc.agingOver60 += item.aging_over_60;
                acc.totalInvoiceNunggak += item.total_invoice_nunggak;
                return acc;
            },
            { totalTunggakan: 0, aging0_30: 0, aging31_60: 0, agingOver60: 0, totalInvoiceNunggak: 0 }
        );

        res.json({ success: true, month, year, rows: data, totals });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/executive-report', async (req, res) => {
    try {
        if (!ensureBranchForAdmin(req, res)) return;
        if (!isSuperAdmin(req)) {
            return res.status(403).json({ success: false, message: 'Hanya super admin yang dapat mengakses laporan eksekutif.' });
        }
        const { month, year } = getMonthYear(req.query);
        const [kpiRows] = await db.query(
            `SELECT
                (SELECT COUNT(*) FROM branches WHERE ${operationalBranchFilter()}) AS total_cabang,
                (SELECT COUNT(*) FROM students WHERE LOWER(TRIM(COALESCE(status, ''))) = 'aktif') AS total_siswa_aktif,
                COALESCE((SELECT SUM(jumlah_bayar) FROM payments WHERE ${revenuePaymentCondition()} AND MONTH(tanggal)=? AND YEAR(tanggal)=?), 0) AS total_pemasukan_bulan_ini,
                COALESCE((SELECT SUM(sisa) FROM bills WHERE sisa > 0 AND MONTH(tanggal_buat)=? AND YEAR(tanggal_buat)=?), 0) AS total_tunggakan_bulan_ini`,
            [month, year, month, year]
        );

        const [topPemasukan] = await db.query(
            `SELECT b.id, b.nama_cabang, b.kode_cabang, COALESCE(SUM(p.jumlah_bayar), 0) AS total_pemasukan
             FROM branches b
             LEFT JOIN payments p ON p.branch_id = b.id AND ${revenuePaymentCondition('p')} AND MONTH(p.tanggal)=? AND YEAR(p.tanggal)=?
             WHERE ${operationalBranchFilter('b')}
             GROUP BY b.id, b.nama_cabang, b.kode_cabang
             ORDER BY total_pemasukan DESC, b.nama_cabang ASC
             LIMIT 5`,
            [month, year]
        );
        const [topTunggakan] = await db.query(
            `SELECT b.id, b.nama_cabang, b.kode_cabang, COALESCE(SUM(bi.sisa), 0) AS total_tunggakan
             FROM branches b
             LEFT JOIN bills bi ON bi.branch_id = b.id AND bi.sisa > 0 AND MONTH(bi.tanggal_buat)=? AND YEAR(bi.tanggal_buat)=?
             WHERE ${operationalBranchFilter('b')}
             GROUP BY b.id, b.nama_cabang, b.kode_cabang
             ORDER BY total_tunggakan DESC, b.nama_cabang ASC
             LIMIT 5`,
            [month, year]
        );

        res.json({
            success: true,
            month,
            year,
            kpi: {
                totalCabang: Number(kpiRows[0]?.total_cabang || 0),
                totalSiswaAktif: Number(kpiRows[0]?.total_siswa_aktif || 0),
                totalPemasukan: Number(kpiRows[0]?.total_pemasukan_bulan_ini || 0),
                totalTunggakan: Number(kpiRows[0]?.total_tunggakan_bulan_ini || 0)
            },
            topPemasukan: topPemasukan.map((r) => ({ ...r, total_pemasukan: Number(r.total_pemasukan || 0) })),
            topTunggakan: topTunggakan.map((r) => ({ ...r, total_tunggakan: Number(r.total_tunggakan || 0) }))
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/report/monthly', async (req, res) => {
    try {
        if (!ensureBranchForAdmin(req, res)) return;
        await ensureOtherIncomeTable();
        const branchId = resolveBranchId(req, ['branch_id']) || getSessionBranchId(req);
        const waliClass = getWaliClass(req);
        const byBranch = !isSuperAdmin(req) || branchId ? ' AND branch_id = ? ' : '';
        const superOperationalPayments = isSuperAdmin(req) && !branchId ? ` AND branch_id IN (SELECT id FROM branches WHERE ${operationalBranchFilter()}) ` : '';
        const superOperationalBills = isSuperAdmin(req) && !branchId ? ` AND branch_id IN (SELECT id FROM branches WHERE ${operationalBranchFilter()}) ` : '';
        const superOperationalOtherIncomes = isSuperAdmin(req) && !branchId ? ` AND branch_id IN (SELECT id FROM branches WHERE ${operationalBranchFilter()}) ` : '';
        const branchParams = byBranch ? [branchId] : [];
        const byClassPayments = waliClass ? ' AND kelas = ? ' : '';
        const byClassBills = waliClass ? ' AND kelas = ? ' : '';
        const classParams = waliClass ? [waliClass] : [];
        const { start, end } = getMonthRange(req.query);
        const startDate = `${start.year}-${String(start.month).padStart(2, '0')}-01`;
        const endDate = `${end.year}-${String(end.month).padStart(2, '0')}-31`;

        const [pemasukanRows] = await db.query(
            `SELECT YEAR(tanggal) AS tahun, MONTH(tanggal) AS bulan, COALESCE(SUM(jumlah_bayar), 0) AS total
             FROM payments
             WHERE tanggal BETWEEN ? AND ?
               AND ${revenuePaymentCondition()}
                ${byBranch}
                ${superOperationalPayments}
                ${byClassPayments}
             GROUP BY YEAR(tanggal), MONTH(tanggal)
             ORDER BY YEAR(tanggal), MONTH(tanggal)`,
            [startDate, endDate, ...branchParams, ...classParams]
        );
        const [otherIncomeRows] = waliClass
            ? [[]]
            : await db.query(
                `SELECT YEAR(tanggal) AS tahun, MONTH(tanggal) AS bulan, COALESCE(SUM(nominal), 0) AS total
                 FROM other_incomes
                 WHERE tanggal BETWEEN ? AND ?
                    ${byBranch}
                    ${superOperationalOtherIncomes}
                 GROUP BY YEAR(tanggal), MONTH(tanggal)
                 ORDER BY YEAR(tanggal), MONTH(tanggal)`,
                [startDate, endDate, ...branchParams]
            );

        const [tunggakanRows] = await db.query(
            `SELECT YEAR(tanggal_buat) AS tahun, MONTH(tanggal_buat) AS bulan, COALESCE(SUM(CASE WHEN sisa > 0 THEN sisa ELSE 0 END), 0) AS total
             FROM bills
             WHERE tanggal_buat BETWEEN ? AND ?
                ${byBranch}
                ${superOperationalBills}
                ${byClassBills}
             GROUP BY YEAR(tanggal_buat), MONTH(tanggal_buat)
             ORDER BY YEAR(tanggal_buat), MONTH(tanggal_buat)`,
            [startDate, endDate, ...branchParams, ...classParams]
        );

        const pemasukanMap = new Map();
        pemasukanRows.forEach((row) => {
            const key = `${row.tahun}-${String(row.bulan).padStart(2, '0')}`;
            pemasukanMap.set(key, Number(row.total || 0));
        });
        (otherIncomeRows || []).forEach((row) => {
            const key = `${row.tahun}-${String(row.bulan).padStart(2, '0')}`;
            const prev = Number(pemasukanMap.get(key) || 0);
            pemasukanMap.set(key, prev + Number(row.total || 0));
        });
        const tunggakanMap = new Map();
        tunggakanRows.forEach((row) => {
            const key = `${row.tahun}-${String(row.bulan).padStart(2, '0')}`;
            tunggakanMap.set(key, Number(row.total || 0));
        });

        const labels = [];
        const pemasukan = [];
        const tunggakan = [];
        const dateCursor = new Date(start.year, start.month - 1, 1);
        const dateEnd = new Date(end.year, end.month - 1, 1);
        while (dateCursor <= dateEnd) {
            const year = dateCursor.getFullYear();
            const month = dateCursor.getMonth() + 1;
            const key = `${year}-${String(month).padStart(2, '0')}`;
            labels.push(new Date(year, month - 1, 1).toLocaleDateString('id-ID', { month: 'short', year: 'numeric' }));
            pemasukan.push(Number(pemasukanMap.get(key) || 0));
            tunggakan.push(Number(tunggakanMap.get(key) || 0));
            dateCursor.setMonth(dateCursor.getMonth() + 1);
        }

        const totalPemasukan = pemasukan.reduce((sum, v) => sum + Number(v || 0), 0);
        const totalTunggakan = tunggakan.reduce((sum, v) => sum + Number(v || 0), 0);
        res.json({
            success: true,
            range: {
                start: `${start.year}-${String(start.month).padStart(2, '0')}`,
                end: `${end.year}-${String(end.month).padStart(2, '0')}`
            },
            labels,
            datasets: { pemasukan, tunggakan },
            totals: { totalPemasukan, totalTunggakan }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/report/detail', async (req, res) => {
    try {
        if (!ensureBranchForAdmin(req, res)) return;
        await ensureOtherIncomeTable();
        await ensureClassFinanceSummarySeeded();
        const branchId = resolveBranchId(req, ['branch_id']) || getSessionBranchId(req);
        const hasRecipientOperationalFlag = await columnExists('scholarship_recipients', 'is_operational_active');
        const recipientOperationalWhere = hasRecipientOperationalFlag ? 'WHERE COALESCE(is_operational_active, 1) = 1' : '';
        const waliClass = getWaliClass(req);
        const byBranchStudents = !isSuperAdmin(req) || branchId ? ' AND s.branch_id = ? ' : '';
        const byBranchSummary = !isSuperAdmin(req) || branchId ? ' AND cfs.branch_id = ? ' : '';
        const byBranchRecipients = !isSuperAdmin(req) || branchId ? ' AND r.branch_id = ? ' : '';
        const byBranchPayments = !isSuperAdmin(req) || branchId ? ' AND p.branch_id = ? ' : '';
        const byBranchBills = !isSuperAdmin(req) || branchId ? ' AND b.branch_id = ? ' : '';
        const superOperationalStudents = isSuperAdmin(req) && !branchId ? ` AND s.branch_id IN (SELECT id FROM branches WHERE ${operationalBranchFilter()}) ` : '';
        const superOperationalSummary = isSuperAdmin(req) && !branchId ? ` AND cfs.branch_id IN (SELECT id FROM branches WHERE ${operationalBranchFilter()}) ` : '';
        const superOperationalRecipients = isSuperAdmin(req) && !branchId ? ` AND r.branch_id IN (SELECT id FROM branches WHERE ${operationalBranchFilter()}) ` : '';
        const superOperationalPayments = isSuperAdmin(req) && !branchId ? ` AND p.branch_id IN (SELECT id FROM branches WHERE ${operationalBranchFilter()}) ` : '';
        const superOperationalBills = isSuperAdmin(req) && !branchId ? ` AND b.branch_id IN (SELECT id FROM branches WHERE ${operationalBranchFilter()}) ` : '';
        const scopeParams = !isSuperAdmin(req) || branchId ? [branchId] : [];
        const byClassStudents = waliClass ? ' AND s.kelas = ? ' : '';
        const byClassSummary = waliClass ? ' AND cfs.kelas = ? ' : '';
        const byClassRecipients = waliClass ? ' AND r.kelas = ? ' : '';
        const byClassPayments = waliClass ? ' AND p.kelas = ? ' : '';
        const byClassBills = waliClass ? ' AND b.kelas = ? ' : '';
        const classParams = waliClass ? [waliClass] : [];
        const cacheKey = JSON.stringify({
            role: String(req.session?.userRole || ''),
            userId: Number(req.session?.adminId || 0),
            branchId: Number(branchId || 0),
            waliClass: String(waliClass || '')
        });
        const cached = getScopedCachePayload(reportDetailCache, cacheKey, REPORT_DETAIL_CACHE_TTL_MS);
        if (cached) return res.json(cached);
        const classRowsPromise = db.query(
            `SELECT
                COALESCE(cfs.kelas, '-') AS kelas,
                cfs.branch_id,
                COALESCE(br.nama_cabang, '-') AS nama_cabang,
                COALESCE(cfs.jumlah_siswa, 0) AS jumlah_siswa,
                COALESCE(cfs.siswa_beasiswa, 0) AS siswa_beasiswa,
                COALESCE(cfs.total_tagihan, 0) AS total_tagihan,
                COALESCE(cfs.total_terbayar, 0) AS total_terbayar,
                COALESCE(cfs.total_sisa, 0) AS total_sisa,
                COALESCE(cfs.siswa_lunas, 0) AS siswa_lunas,
                COALESCE(cfs.siswa_belum_lunas, 0) AS siswa_belum_lunas
             FROM class_finance_summary cfs
             LEFT JOIN branches br ON br.id = cfs.branch_id
              WHERE 1=1
             ${superOperationalSummary}
             ${byBranchSummary}
             ${byClassSummary}
              ORDER BY br.nama_cabang ASC, cfs.kelas ASC`,
            [...scopeParams, ...classParams]
        );
        const beasiswaNominalRowsPromise = db.query(
            `SELECT COALESCE(SUM(p.jumlah_bayar), 0) AS total_nominal_beasiswa
             FROM payments p
              WHERE (LOWER(TRIM(COALESCE(p.penerima, ''))) = 'sistem (beasiswa)'
                     OR LOWER(COALESCE(p.keterangan, '')) LIKE '%beasiswa%')
             ${superOperationalPayments}
             ${byBranchPayments}
              ${byClassPayments}`,
            [...scopeParams, ...classParams]
        );
        const pemasukanRowsPromise = db.query(
            `SELECT COALESCE(SUM(p.jumlah_bayar), 0) AS total_pemasukan
             FROM payments p
              WHERE ${revenuePaymentCondition('p')}
             ${superOperationalPayments}
             ${byBranchPayments}
              ${byClassPayments}`,
            [...scopeParams, ...classParams]
        );
        const otherIncomeRowsPromise = waliClass
            ? [[{ total_pemasukan_lain: 0 }]]
            : await db.query(
                `SELECT COALESCE(SUM(o.nominal), 0) AS total_pemasukan_lain
                 FROM other_incomes o
                 WHERE 1=1
                 ${!isSuperAdmin(req) || branchId ? ' AND o.branch_id = ? ' : ` AND o.branch_id IN (SELECT id FROM branches WHERE ${operationalBranchFilter()}) `}`,
                [...scopeParams]
            );

        const beasiswaRowsPromise = db.query(
            `SELECT
                t.nama_beasiswa,
                COUNT(DISTINCT r.student_id) AS jumlah_penerima,
                COALESCE(SUM(
                    CASE
                        WHEN LOWER(TRIM(COALESCE(p.penerima, ''))) = 'sistem (beasiswa)'
                             AND LOWER(COALESCE(p.keterangan, '')) LIKE CONCAT('%', LOWER(t.nama_beasiswa), '%')
                        THEN p.jumlah_bayar
                        ELSE 0
                    END
                ), 0) AS nominal_tersalur
             FROM scholarship_types t
             LEFT JOIN scholarship_recipients r
                    ON r.type_id = t.id
                    ${superOperationalRecipients}
                    ${byBranchRecipients}
                    ${byClassRecipients}
             LEFT JOIN payments p
                    ON p.student_id = r.student_id
                    ${superOperationalPayments}
                    ${byBranchPayments}
                    ${byClassPayments}
              GROUP BY t.id, t.nama_beasiswa
              ORDER BY nominal_tersalur DESC, jumlah_penerima DESC, t.nama_beasiswa ASC`,
            [...scopeParams, ...classParams, ...scopeParams, ...classParams]
        );

        const [
            [classRows],
            [beasiswaNominalRows],
            [pemasukanRows],
            [otherIncomeRows],
            [beasiswaRows]
        ] = await Promise.all([
            classRowsPromise,
            beasiswaNominalRowsPromise,
            pemasukanRowsPromise,
            Promise.resolve(otherIncomeRowsPromise),
            beasiswaRowsPromise
        ]);
        const totalSiswaAktif = classRows.reduce((acc, r) => acc + Number(r.jumlah_siswa || 0), 0);
        const totalSiswaLunas = classRows.reduce((acc, r) => acc + Number(r.siswa_lunas || 0), 0);
        const totalSiswaBelumLunas = classRows.reduce((acc, r) => acc + Number(r.siswa_belum_lunas || 0), 0);
        const totalPenerimaBeasiswa = classRows.reduce((acc, r) => acc + Number(r.siswa_beasiswa || 0), 0);
        const totalTunggakan = classRows.reduce((acc, r) => acc + Number(r.total_sisa || 0), 0);

        const payload = {
            success: true,
            classRows: classRows.map((r) => ({
                kelas: r.kelas,
                branch_id: Number(r.branch_id || 0),
                nama_cabang: r.nama_cabang,
                jumlah_siswa: Number(r.jumlah_siswa || 0),
                siswa_beasiswa: Number(r.siswa_beasiswa || 0),
                total_tagihan: Number(r.total_tagihan || 0),
                total_terbayar: Number(r.total_terbayar || 0),
                total_sisa: Number(r.total_sisa || 0),
                siswa_lunas: Number(r.siswa_lunas || 0),
                siswa_belum_lunas: Number(r.siswa_belum_lunas || 0),
                persen_lunas: Number(r.siswa_lunas || 0) + Number(r.siswa_belum_lunas || 0) > 0
                    ? (Number(r.siswa_lunas || 0) / (Number(r.siswa_lunas || 0) + Number(r.siswa_belum_lunas || 0))) * 100
                    : 0
            })),
            summary: {
                totalSiswaAktif,
                totalSiswaLunas,
                totalSiswaBelumLunas,
                totalPenerimaBeasiswa,
                totalNominalBeasiswa: Number(beasiswaNominalRows[0]?.total_nominal_beasiswa || 0),
                totalPemasukan: Number(pemasukanRows[0]?.total_pemasukan || 0) + Number(otherIncomeRows[0]?.total_pemasukan_lain || 0),
                totalTunggakan,
                beasiswaDetail: beasiswaRows.map((r) => ({
                    nama_beasiswa: r.nama_beasiswa,
                    jumlah_penerima: Number(r.jumlah_penerima || 0),
                    nominal_tersalur: Number(r.nominal_tersalur || 0)
                }))
            }
        };
        reportDetailCache.set(cacheKey, { payload, cachedAt: Date.now() });
        res.json(payload);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/report/detail/class-students', async (req, res) => {
    try {
        if (!ensureBranchForAdmin(req, res)) return;
        const hasRecipientOperationalFlag = await columnExists('scholarship_recipients', 'is_operational_active');
        const recipientOperationalClause = hasRecipientOperationalFlag ? 'AND COALESCE(r.is_operational_active, 1) = 1' : '';
        const kelas = String(req.query.kelas || '').trim();
        if (!kelas) return res.status(400).json({ success: false, message: 'Parameter kelas wajib diisi.' });
        const waliClass = getWaliClass(req);
        if (waliClass && kelas !== waliClass) {
            return res.status(403).json({ success: false, message: 'Akses kelas tidak diizinkan untuk akun wali kelas.' });
        }

        const sessionBranchId = resolveBranchId(req, ['branch_id']) || getSessionBranchId(req);
        const requestedBranchId = Number(req.query.branch_id || 0);
        let where = `WHERE LOWER(TRIM(COALESCE(s.status, ''))) = 'aktif' AND s.kelas = ?`;
        const params = [kelas];

        if (isSuperAdmin(req)) {
            if (requestedBranchId > 0) {
                where += ' AND s.branch_id = ?';
                params.push(requestedBranchId);
            } else {
                where += ` AND s.branch_id IN (SELECT id FROM branches WHERE ${operationalBranchFilter()})`;
            }
        } else {
            where += ' AND s.branch_id = ?';
            params.push(sessionBranchId);
        }
        const cacheKey = JSON.stringify({
            role: String(req.session?.userRole || ''),
            userId: Number(req.session?.adminId || 0),
            kelas,
            branch_id: requestedBranchId > 0 ? requestedBranchId : 0,
            session_branch_id: Number(sessionBranchId || 0),
            waliClass: String(waliClass || '')
        });
        const cached = getScopedCachePayload(reportClassStudentsCache, cacheKey, REPORT_DETAIL_CACHE_TTL_MS);
        if (cached) return res.json(cached);

        const [rows] = await db.query(
            `WITH target_students AS (
                SELECT
                    s.id,
                    s.nis,
                    s.nama,
                    s.kelas,
                    s.branch_id,
                    COALESCE(br.nama_cabang, '-') AS nama_cabang
                FROM students s
                LEFT JOIN branches br ON br.id = s.branch_id
                ${where}
            ),
            student_bills AS (
                SELECT
                    b.student_id,
                    COALESCE(SUM(b.total), 0) AS total_tagihan,
                    COALESCE(SUM(b.terbayar), 0) AS total_terbayar,
                    COALESCE(SUM(GREATEST(0, b.sisa)), 0) AS total_sisa,
                    GROUP_CONCAT(
                        CONCAT(
                            COALESCE(b.nama_tagihan, '-'),
                            ' (Sisa ',
                            CAST(ROUND(GREATEST(0, COALESCE(b.sisa, 0)), 2) AS CHAR),
                            ')'
                        )
                        ORDER BY b.tanggal_buat DESC, b.id DESC
                        SEPARATOR '; '
                    ) AS rincian_tagihan
                FROM bills b
                JOIN target_students tsb ON tsb.id = b.student_id
                GROUP BY b.student_id
            ),
            student_beasiswa AS (
                SELECT
                    r.student_id,
                    SUBSTRING_INDEX(
                        GROUP_CONCAT(t.nama_beasiswa ORDER BY r.tanggal_terima DESC, r.id DESC SEPARATOR '||'),
                        '||',
                        1
                    ) AS beasiswa
                FROM scholarship_recipients r
                JOIN scholarship_types t ON t.id = r.type_id
                JOIN target_students tss ON tss.id = r.student_id
                WHERE 1=1 ${recipientOperationalClause}
                GROUP BY r.student_id
            )
            SELECT
                ts.id,
                ts.nis,
                ts.nama,
                ts.kelas,
                ts.branch_id,
                ts.nama_cabang,
                COALESCE(sbw.beasiswa, 'Non Beasiswa') AS beasiswa,
                COALESCE(sbl.rincian_tagihan, '-') AS rincian_tagihan,
                COALESCE(sbl.total_tagihan, 0) AS total_tagihan,
                COALESCE(sbl.total_terbayar, 0) AS total_terbayar,
                COALESCE(sbl.total_sisa, 0) AS total_sisa
            FROM target_students ts
            LEFT JOIN student_bills sbl ON sbl.student_id = ts.id
            LEFT JOIN student_beasiswa sbw ON sbw.student_id = ts.id
            ORDER BY ts.nama ASC`,
            params
        );

        const payload = {
            success: true,
            rows: rows.map((r) => ({
                id: r.id,
                nis: r.nis,
                nama: r.nama,
                kelas: r.kelas,
                branch_id: Number(r.branch_id || 0),
                nama_cabang: r.nama_cabang,
                beasiswa: r.beasiswa || 'Non Beasiswa',
                rincian_tagihan: r.rincian_tagihan || '-',
                total_tagihan: Number(r.total_tagihan || 0),
                total_terbayar: Number(r.total_terbayar || 0),
                total_sisa: Number(r.total_sisa || 0)
            }))
        };
        reportClassStudentsCache.set(cacheKey, { payload, cachedAt: Date.now() });
        res.json(payload);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
module.exports.invalidateDashboardCaches = invalidateDashboardCaches;
