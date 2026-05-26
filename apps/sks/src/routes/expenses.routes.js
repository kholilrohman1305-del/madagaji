const express = require('express');
const db = require('../../db');
const { isSuperAdmin, ensureBranchForAdmin, getSessionBranchId } = require('../utils/branchScope');
const { queryPdmada, isPdmadaConfigured } = require('../utils/pdmadaDb');

const router = express.Router();
let expenseTableEnsured = false;

function isTeacherExpenseRole(req) {
    const role = String(req?.session?.userRole || '');
    return role === 'wali_kelas' || role === 'guru';
}

function normalizeName(value) {
    return String(value || '').trim().toLowerCase();
}

async function getCurrentAdminIdentity(req) {
    const adminId = Number(req?.session?.adminId || 0);
    if (!Number.isFinite(adminId) || adminId <= 0) return null;
    const [rows] = await db.query(
        `SELECT id, branch_id, pdmada_teacher_id, nama_lengkap, username
         FROM admins
         WHERE id = ?
         LIMIT 1`,
        [adminId]
    );
    if (!rows.length) return null;
    return {
        id: Number(rows[0].id || 0),
        branch_id: Number(rows[0].branch_id || 0) || null,
        teacher_id: Number(rows[0].pdmada_teacher_id || 0) || null,
        name: String(rows[0].nama_lengkap || rows[0].username || '').trim()
    };
}

function buildWaliExpenseOwnerFilter(alias, identity) {
    const safeAlias = String(alias || 'e');
    if (!identity) return { clause: '1 = 0', params: [] };
    const nameNorm = normalizeName(identity.name);
    if (identity.teacher_id > 0 && nameNorm) {
        return {
            clause: `((${safeAlias}.penanggung_jawab_id IS NOT NULL AND ${safeAlias}.penanggung_jawab_id = ?) OR LOWER(TRIM(COALESCE(${safeAlias}.penanggung_jawab_nama, ''))) = ?)`,
            params: [identity.teacher_id, nameNorm]
        };
    }
    if (identity.teacher_id > 0) {
        return {
            clause: `${safeAlias}.penanggung_jawab_id = ?`,
            params: [identity.teacher_id]
        };
    }
    if (nameNorm) {
        return {
            clause: `LOWER(TRIM(COALESCE(${safeAlias}.penanggung_jawab_nama, ''))) = ?`,
            params: [nameNorm]
        };
    }
    return { clause: '1 = 0', params: [] };
}

async function ensureExpenseTable() {
    if (expenseTableEnsured) return;
    await db.query(`
        CREATE TABLE IF NOT EXISTS expenses (
            id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            branch_id INT NOT NULL,
            tanggal DATE NOT NULL,
            category_id BIGINT NULL,
            kategori VARCHAR(80) NOT NULL,
            deskripsi VARCHAR(200) NOT NULL,
            nominal DECIMAL(15,2) NOT NULL,
            report_status VARCHAR(10) NOT NULL DEFAULT 'belum',
            penanggung_jawab_id INT NULL,
            penanggung_jawab_nama VARCHAR(120) NULL,
            admin_keuangan_nama VARCHAR(120) NULL,
            is_recurring TINYINT(1) NOT NULL DEFAULT 0,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_exp_branch_date (branch_id, tanggal),
            INDEX idx_exp_branch_active (branch_id, is_active)
        )
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS expense_categories (
            id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            branch_id INT NOT NULL,
            category_name VARCHAR(80) NOT NULL,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_exp_category_branch (branch_id, category_name),
            INDEX idx_exp_category_branch_active (branch_id, is_active)
        )
    `);
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
    await db.query(`
        CREATE TABLE IF NOT EXISTS expense_items (
            id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            expense_id BIGINT NOT NULL,
            branch_id INT NOT NULL,
            item_name VARCHAR(120) NOT NULL,
            item_description VARCHAR(200) NULL,
            nominal DECIMAL(15,2) NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_expense_items_expense (expense_id),
            INDEX idx_expense_items_branch (branch_id)
        )
    `);
    const alterIfMissing = async (columnName, ddl) => {
        const [colRows] = await db.query(
            `SELECT COUNT(*) AS cnt
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'expenses'
               AND COLUMN_NAME = ?`,
            [columnName]
        );
        if (Number(colRows[0]?.cnt || 0) === 0) await db.query(ddl);
    };
    await alterIfMissing('category_id', 'ALTER TABLE expenses ADD COLUMN category_id BIGINT NULL AFTER tanggal');
    await alterIfMissing('report_status', "ALTER TABLE expenses ADD COLUMN report_status VARCHAR(10) NOT NULL DEFAULT 'belum' AFTER nominal");
    await alterIfMissing('penanggung_jawab_id', 'ALTER TABLE expenses ADD COLUMN penanggung_jawab_id INT NULL AFTER nominal');
    await alterIfMissing('penanggung_jawab_nama', 'ALTER TABLE expenses ADD COLUMN penanggung_jawab_nama VARCHAR(120) NULL AFTER penanggung_jawab_id');
    await alterIfMissing('admin_keuangan_nama', 'ALTER TABLE expenses ADD COLUMN admin_keuangan_nama VARCHAR(120) NULL AFTER penanggung_jawab_nama');
    const alterOtherIncomeIfMissing = async (columnName, ddl) => {
        const [colRows] = await db.query(
            `SELECT COUNT(*) AS cnt
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'other_incomes'
               AND COLUMN_NAME = ?`,
            [columnName]
        );
        if (Number(colRows[0]?.cnt || 0) === 0) await db.query(ddl);
    };
    await alterOtherIncomeIfMissing('report_status', "ALTER TABLE other_incomes ADD COLUMN report_status VARCHAR(10) NOT NULL DEFAULT 'belum' AFTER nominal");
    await alterOtherIncomeIfMissing('is_active', "ALTER TABLE other_incomes ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER report_status");
    await alterOtherIncomeIfMissing('admin_keuangan_nama', 'ALTER TABLE other_incomes ADD COLUMN admin_keuangan_nama VARCHAR(120) NULL AFTER is_active');
    expenseTableEnsured = true;
}

function denySuperAdminWrite(req, res) {
    if (isSuperAdmin(req)) {
        res.status(403).json({ success: false, message: 'Menu pengeluaran khusus akun cabang.' });
        return true;
    }
    return false;
}

async function resolveCategory(branchId, categoryId, categoryNameRaw) {
    const categoryName = String(categoryNameRaw || '').trim();
    if (Number(categoryId) > 0) {
        const [catRows] = await db.query(
            `SELECT id, category_name
             FROM expense_categories
             WHERE id = ? AND branch_id = ? AND is_active = 1
             LIMIT 1`,
            [Number(categoryId), branchId]
        );
        if (!catRows.length) return null;
        return { id: Number(catRows[0].id), name: String(catRows[0].category_name || '').trim() };
    }
    if (!categoryName) return null;
    const [catRows] = await db.query(
        `SELECT id, category_name
         FROM expense_categories
         WHERE branch_id = ? AND category_name = ? AND is_active = 1
         LIMIT 1`,
        [branchId, categoryName]
    );
    if (!catRows.length) return null;
    return { id: Number(catRows[0].id), name: String(catRows[0].category_name || '').trim() };
}

async function getAdminFullName(adminId) {
    const id = Number(adminId || 0);
    if (id <= 0) return null;
    const [rows] = await db.query('SELECT nama_lengkap, username FROM admins WHERE id = ? LIMIT 1', [id]);
    if (!rows.length) return null;
    return String(rows[0].nama_lengkap || rows[0].username || '').trim() || null;
}

function normalizeExpenseItems(itemsRaw = []) {
    const items = Array.isArray(itemsRaw) ? itemsRaw : [];
    return items
        .map((it) => ({
            item_name: String(it?.item_name || '').trim(),
            item_description: String(it?.item_description || '').trim() || null,
            nominal: Number(it?.nominal || 0)
        }))
        .filter((it) => it.item_name && Number.isFinite(it.nominal) && it.nominal > 0);
}

router.get('/expense-categories', async (req, res) => {
    try {
        if (!ensureBranchForAdmin(req, res)) return;
        if (isSuperAdmin(req)) return res.status(403).json({ success: false, message: 'Menu kategori pengeluaran khusus akun cabang.' });
        await ensureExpenseTable();
        const branchId = getSessionBranchId(req);
        const [rows] = await db.query(
            `SELECT id, category_name, is_active
             FROM expense_categories
             WHERE branch_id = ?
             ORDER BY category_name ASC`,
            [branchId]
        );
        res.json({ success: true, rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/expense-categories', async (req, res) => {
    try {
        if (!ensureBranchForAdmin(req, res)) return;
        if (denySuperAdminWrite(req, res)) return;
        await ensureExpenseTable();
        const branchId = getSessionBranchId(req);
        const categoryName = String(req.body.category_name || '').trim();
        if (!categoryName) return res.status(400).json({ success: false, message: 'Nama kategori wajib diisi.' });
        await db.query(
            `INSERT INTO expense_categories (branch_id, category_name, is_active)
             VALUES (?, ?, 1)
             ON DUPLICATE KEY UPDATE is_active = VALUES(is_active), updated_at = CURRENT_TIMESTAMP`,
            [branchId, categoryName]
        );
        res.json({ success: true, message: 'Kategori pengeluaran berhasil disimpan.' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ success: false, message: 'Kategori sudah ada.' });
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/expenses/teachers', async (req, res) => {
    try {
        if (!ensureBranchForAdmin(req, res)) return;
        if (!isPdmadaConfigured()) {
            return res.json({ success: true, rows: [], warning: 'Konfigurasi DB PDMADA belum diisi.' });
        }
        const [rows] = await queryPdmada(
            `SELECT id, niy, name
             FROM teachers
             WHERE COALESCE(is_active, 1) = 1
             ORDER BY name ASC
             LIMIT 500`
        );
        res.json({ success: true, rows: rows || [] });
    } catch (err) {
        res.status(500).json({ success: false, message: `Gagal mengambil data guru PDMADA: ${err.message}` });
    }
});

router.get('/expenses', async (req, res) => {
    try {
        if (!ensureBranchForAdmin(req, res)) return;
        await ensureExpenseTable();
        const isSuper = isSuperAdmin(req);
        const isWali = isTeacherExpenseRole(req);
        const branchId = getSessionBranchId(req);
        const branchFilter = Number(req.query.branch_id || 0);
        const search = String(req.query.search || '').trim().toLowerCase();
        const dateFrom = String(req.query.date_from || '').trim();
        const dateTo = String(req.query.date_to || '').trim();

        const where = [];
        const params = [];
        if (isSuper) {
            where.push("e.branch_id IN (SELECT id FROM branches WHERE id <> 1)");
            if (branchFilter > 0) {
                where.push('e.branch_id = ?');
                params.push(branchFilter);
            }
        } else {
            where.push('e.branch_id = ?');
            params.push(branchId);
        }
        if (isWali) {
            const identity = await getCurrentAdminIdentity(req);
            const ownerFilter = buildWaliExpenseOwnerFilter('e', identity);
            where.push(ownerFilter.clause);
            params.push(...ownerFilter.params);
        }
        if (search) {
            where.push('(LOWER(e.kategori) LIKE ? OR LOWER(e.deskripsi) LIKE ?)');
            params.push(`%${search}%`, `%${search}%`);
        }
        if (dateFrom) {
            where.push('e.tanggal >= ?');
            params.push(dateFrom);
        }
        if (dateTo) {
            where.push('e.tanggal <= ?');
            params.push(dateTo);
        }

        const [rows] = await db.query(
            `SELECT e.id, e.tanggal, e.category_id, e.kategori, e.deskripsi, e.nominal, e.report_status,
                    e.penanggung_jawab_id, e.penanggung_jawab_nama, e.admin_keuangan_nama,
                    e.is_recurring, e.is_active, e.branch_id, b.nama_cabang,
                    COALESCE(ei.item_count, 0) AS item_count
             FROM expenses e
             LEFT JOIN branches b ON b.id = e.branch_id
             LEFT JOIN (
                SELECT expense_id, COUNT(*) AS item_count
                FROM expense_items
                GROUP BY expense_id
             ) ei ON ei.expense_id = e.id
             ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
             ORDER BY e.tanggal DESC, e.id DESC`,
            params
        );
        const [sumRows] = await db.query(
            `SELECT COALESCE(SUM(e.nominal),0) AS total_nominal
             FROM expenses e
             ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`,
            params
        );

        res.json({
            success: true,
            rows,
            summary: {
                total_nominal: Number(sumRows[0]?.total_nominal || 0),
                total_items: rows.length
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/expenses/:id/items', async (req, res) => {
    try {
        if (!ensureBranchForAdmin(req, res)) return;
        await ensureExpenseTable();
        const id = Number(req.params.id || 0);
        if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ success: false, message: 'ID tidak valid.' });
        const isSuper = isSuperAdmin(req);
        const isWali = isTeacherExpenseRole(req);
        const branchId = getSessionBranchId(req);
        const where = ['e.id = ?'];
        const params = [id];
        if (!isSuper && branchId) {
            where.push('e.branch_id = ?');
            params.push(branchId);
        } else if (isSuper) {
            where.push("e.branch_id IN (SELECT id FROM branches WHERE id <> 1)");
        }
        if (isWali) {
            const identity = await getCurrentAdminIdentity(req);
            const ownerFilter = buildWaliExpenseOwnerFilter('e', identity);
            where.push(ownerFilter.clause);
            params.push(...ownerFilter.params);
        }
        const [headRows] = await db.query(
            `SELECT e.id, e.tanggal, e.kategori, e.deskripsi, e.nominal, e.branch_id, b.nama_cabang
             FROM expenses e
             LEFT JOIN branches b ON b.id = e.branch_id
             WHERE ${where.join(' AND ')}
             LIMIT 1`,
            params
        );
        if (!headRows.length) return res.status(404).json({ success: false, message: 'Data pengeluaran tidak ditemukan.' });
        const [items] = await db.query(
            `SELECT id, item_name, item_description, nominal
             FROM expense_items
             WHERE expense_id = ?
             ORDER BY id ASC`,
            [id]
        );
        res.json({ success: true, expense: headRows[0], items });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/expenses', async (req, res) => {
    const conn = await db.getConnection();
    try {
        if (!ensureBranchForAdmin(req, res)) return;
        if (denySuperAdminWrite(req, res)) return;
        if (isTeacherExpenseRole(req)) return res.status(403).json({ success: false, message: 'Akun penanggung jawab hanya dapat mengisi rincian pengeluaran.' });
        await ensureExpenseTable();
        await conn.beginTransaction();

        const branchId = getSessionBranchId(req);
        const tanggal = String(req.body.tanggal || '').trim();
        const kategori = String(req.body.kategori || '').trim();
        const deskripsi = String(req.body.deskripsi || '').trim();
        const nominalInput = Number(req.body.nominal || 0);
        const items = normalizeExpenseItems(req.body.items);
        const reportStatus = String(req.body.report_status || 'belum').trim().toLowerCase() === 'sudah' ? 'sudah' : 'belum';
        const categoryId = Number(req.body.category_id || 0);
        const penanggungJawabId = Number(req.body.penanggung_jawab_id || 0) || null;
        const penanggungJawabNama = String(req.body.penanggung_jawab_nama || '').trim();
        const isRecurring = Number(req.body.is_recurring || 0) === 1 ? 1 : 0;
        const isActive = Number(req.body.is_active || 1) === 1 ? 1 : 0;

        if (!isWali && !/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
            return res.status(400).json({ success: false, message: 'Tanggal wajib format YYYY-MM-DD.' });
        }
        const selectedCategory = isWali
            ? { id: Number(existing.category_id || 0), name: String(existing.kategori || '').trim() }
            : await resolveCategory(branchId, categoryId, kategori);
        if (!selectedCategory || Number(selectedCategory.id || 0) <= 0 || !selectedCategory.name) {
            return res.status(400).json({ success: false, message: 'Kategori tidak valid. Tambahkan kategori dulu.' });
        }
        if (!isWali && !deskripsi) return res.status(400).json({ success: false, message: 'Deskripsi wajib diisi.' });
        const nominal = items.length
            ? items.reduce((sum, item) => sum + Number(item.nominal || 0), 0)
            : nominalInput;
        if (!isWali && (!Number.isFinite(nominal) || nominal <= 0)) {
            return res.status(400).json({ success: false, message: 'Nominal harus lebih dari 0.' });
        }
        if (!isWali && !penanggungJawabNama) {
            return res.status(400).json({ success: false, message: 'Penanggung jawab wajib dipilih.' });
        }
        const adminKeuanganNama = await getAdminFullName(req.session?.adminId);

        const [insertRes] = await conn.query(
            `INSERT INTO expenses
             (branch_id, tanggal, category_id, kategori, deskripsi, nominal, report_status, penanggung_jawab_id, penanggung_jawab_nama, admin_keuangan_nama, is_recurring, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                branchId,
                tanggal,
                selectedCategory.id,
                selectedCategory.name,
                deskripsi,
                nominal,
                reportStatus,
                penanggungJawabId,
                penanggungJawabNama,
                adminKeuanganNama,
                isRecurring,
                isActive
            ]
        );
        if (items.length) {
            for (const item of items) {
                await conn.query(
                    `INSERT INTO expense_items (expense_id, branch_id, item_name, item_description, nominal)
                     VALUES (?, ?, ?, ?, ?)`,
                    [insertRes.insertId, branchId, item.item_name, item.item_description, item.nominal]
                );
            }
        }
        await conn.commit();
        res.json({ success: true, id: insertRes.insertId, message: 'Pengeluaran berhasil ditambahkan.' });
    } catch (err) {
        try { await conn.rollback(); } catch (_) {}
        res.status(500).json({ success: false, message: err.message });
    } finally {
        conn.release();
    }
});

router.put('/expenses/:id', async (req, res) => {
    const conn = await db.getConnection();
    try {
        if (!ensureBranchForAdmin(req, res)) return;
        if (denySuperAdminWrite(req, res)) return;
        await ensureExpenseTable();
        await conn.beginTransaction();

        const id = Number(req.params.id || 0);
        const branchId = getSessionBranchId(req);
        const isWali = isTeacherExpenseRole(req);
        const tanggal = String(req.body.tanggal || '').trim();
        const kategori = String(req.body.kategori || '').trim();
        const deskripsi = String(req.body.deskripsi || '').trim();
        const nominalInput = Number(req.body.nominal || 0);
        const items = normalizeExpenseItems(req.body.items);
        const reportStatus = String(req.body.report_status || 'belum').trim().toLowerCase() === 'sudah' ? 'sudah' : 'belum';
        const categoryId = Number(req.body.category_id || 0);
        const penanggungJawabId = Number(req.body.penanggung_jawab_id || 0) || null;
        const penanggungJawabNama = String(req.body.penanggung_jawab_nama || '').trim();
        const isRecurring = Number(req.body.is_recurring || 0) === 1 ? 1 : 0;
        const isActive = Number(req.body.is_active || 1) === 1 ? 1 : 0;

        if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ success: false, message: 'ID tidak valid.' });
        const [existingRows] = await conn.query(
            `SELECT id, branch_id, tanggal, category_id, kategori, deskripsi, nominal, report_status,
                    penanggung_jawab_id, penanggung_jawab_nama, admin_keuangan_nama, is_recurring, is_active
             FROM expenses
             WHERE id = ? AND branch_id = ?
             LIMIT 1`,
            [id, branchId]
        );
        if (!existingRows.length) {
            return res.status(404).json({ success: false, message: 'Data pengeluaran tidak ditemukan.' });
        }
        const existing = existingRows[0];
        if (isWali) {
            const identity = await getCurrentAdminIdentity(req);
            const ownerByTeacher = identity?.teacher_id > 0 && Number(existing.penanggung_jawab_id || 0) === Number(identity.teacher_id);
            const ownerByName = normalizeName(existing.penanggung_jawab_nama) && normalizeName(existing.penanggung_jawab_nama) === normalizeName(identity?.name);
            if (!ownerByTeacher && !ownerByName) {
                return res.status(403).json({ success: false, message: 'Anda hanya dapat mengisi rincian pengeluaran yang menjadi tanggung jawab Anda.' });
            }
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
            return res.status(400).json({ success: false, message: 'Tanggal wajib format YYYY-MM-DD.' });
        }
        const selectedCategory = await resolveCategory(branchId, categoryId, kategori);
        if (!selectedCategory) {
            return res.status(400).json({ success: false, message: 'Kategori tidak valid. Tambahkan kategori dulu.' });
        }
        if (!deskripsi) return res.status(400).json({ success: false, message: 'Deskripsi wajib diisi.' });
        const nominal = items.length
            ? items.reduce((sum, item) => sum + Number(item.nominal || 0), 0)
            : nominalInput;
        if (!Number.isFinite(nominal) || nominal <= 0) {
            return res.status(400).json({ success: false, message: 'Nominal harus lebih dari 0.' });
        }
        if (!penanggungJawabNama) {
            return res.status(400).json({ success: false, message: 'Penanggung jawab wajib dipilih.' });
        }
        const adminKeuanganNama = await getAdminFullName(req.session?.adminId);

        const finalTanggal = isWali ? String(existing.tanggal || '').slice(0, 10) : tanggal;
        const finalCategoryId = isWali ? Number(existing.category_id || 0) : selectedCategory.id;
        const finalKategori = isWali ? String(existing.kategori || '').trim() : selectedCategory.name;
        const finalDeskripsi = isWali ? String(existing.deskripsi || '').trim() : deskripsi;
        const finalReportStatus = isWali ? String(existing.report_status || 'belum') : reportStatus;
        const finalPenanggungJawabId = isWali ? (Number(existing.penanggung_jawab_id || 0) || null) : penanggungJawabId;
        const finalPenanggungJawabNama = isWali ? String(existing.penanggung_jawab_nama || '').trim() : penanggungJawabNama;
        const finalAdminKeuanganNama = isWali ? String(existing.admin_keuangan_nama || '').trim() : adminKeuanganNama;
        const finalIsRecurring = isWali ? (Number(existing.is_recurring || 0) === 1 ? 1 : 0) : isRecurring;
        const finalIsActive = isWali ? (Number(existing.is_active || 0) === 1 ? 1 : 0) : isActive;
        const finalNominal = isWali
            ? (items.length ? items.reduce((sum, item) => sum + Number(item.nominal || 0), 0) : Number(existing.nominal || 0))
            : nominal;
        if (!Number.isFinite(finalNominal) || finalNominal <= 0) {
            return res.status(400).json({ success: false, message: 'Nominal harus lebih dari 0.' });
        }

        const [result] = await conn.query(
            `UPDATE expenses
             SET tanggal = ?, category_id = ?, kategori = ?, deskripsi = ?, nominal = ?, report_status = ?,
                 penanggung_jawab_id = ?, penanggung_jawab_nama = ?, admin_keuangan_nama = ?,
                 is_recurring = ?, is_active = ?
             WHERE id = ? AND branch_id = ?`,
            [
                finalTanggal,
                finalCategoryId,
                finalKategori,
                finalDeskripsi,
                finalNominal,
                finalReportStatus,
                finalPenanggungJawabId,
                finalPenanggungJawabNama,
                finalAdminKeuanganNama,
                finalIsRecurring,
                finalIsActive,
                id,
                branchId
            ]
        );
        if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Data pengeluaran tidak ditemukan.' });
        await conn.query('DELETE FROM expense_items WHERE expense_id = ? AND branch_id = ?', [id, branchId]);
        if (items.length) {
            for (const item of items) {
                await conn.query(
                    `INSERT INTO expense_items (expense_id, branch_id, item_name, item_description, nominal)
                     VALUES (?, ?, ?, ?, ?)`,
                    [id, branchId, item.item_name, item.item_description, item.nominal]
                );
            }
        }
        await conn.commit();
        res.json({ success: true, message: 'Pengeluaran berhasil diperbarui.' });
    } catch (err) {
        try { await conn.rollback(); } catch (_) {}
        res.status(500).json({ success: false, message: err.message });
    } finally {
        conn.release();
    }
});

router.delete('/expenses/:id', async (req, res) => {
    const conn = await db.getConnection();
    try {
        if (!ensureBranchForAdmin(req, res)) return;
        if (denySuperAdminWrite(req, res)) return;
        if (isTeacherExpenseRole(req)) return res.status(403).json({ success: false, message: 'Akun penanggung jawab tidak dapat menghapus pengeluaran.' });
        await ensureExpenseTable();

        const id = Number(req.params.id || 0);
        const branchId = getSessionBranchId(req);
        if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ success: false, message: 'ID tidak valid.' });
        await conn.beginTransaction();

        await conn.query('DELETE FROM expense_items WHERE expense_id = ? AND branch_id = ?', [id, branchId]);
        const [result] = await conn.query('DELETE FROM expenses WHERE id = ? AND branch_id = ?', [id, branchId]);
        if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Data pengeluaran tidak ditemukan.' });
        await conn.commit();
        res.json({ success: true, message: 'Pengeluaran berhasil dihapus.' });
    } catch (err) {
        try { await conn.rollback(); } catch (_) {}
        res.status(500).json({ success: false, message: err.message });
    } finally {
        conn.release();
    }
});

router.put('/expenses/:id/report-status', async (req, res) => {
    try {
        if (!ensureBranchForAdmin(req, res)) return;
        if (denySuperAdminWrite(req, res)) return;
        if (isTeacherExpenseRole(req)) return res.status(403).json({ success: false, message: 'Akun penanggung jawab tidak dapat mengubah status laporan.' });
        await ensureExpenseTable();
        const id = Number(req.params.id || 0);
        const branchId = getSessionBranchId(req);
        if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ success: false, message: 'ID tidak valid.' });
        const reportStatus = String(req.body.report_status || '').trim().toLowerCase();
        if (!['belum', 'sudah'].includes(reportStatus)) {
            return res.status(400).json({ success: false, message: 'Status laporan harus belum atau sudah.' });
        }
        const [result] = await db.query(
            'UPDATE expenses SET report_status = ? WHERE id = ? AND branch_id = ?',
            [reportStatus, id, branchId]
        );
        if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Data pengeluaran tidak ditemukan.' });
        res.json({ success: true, message: 'Status laporan pengeluaran diperbarui.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/other-incomes', async (req, res) => {
    try {
        if (!ensureBranchForAdmin(req, res)) return;
        await ensureExpenseTable();
        const isSuper = isSuperAdmin(req);
        const branchId = getSessionBranchId(req);
        const branchFilter = Number(req.query.branch_id || 0);
        const search = String(req.query.search || '').trim().toLowerCase();
        const dateFrom = String(req.query.date_from || '').trim();
        const dateTo = String(req.query.date_to || '').trim();

        const where = [];
        const params = [];
        if (isSuper) {
            where.push("o.branch_id IN (SELECT id FROM branches WHERE id <> 1)");
            if (branchFilter > 0) {
                where.push('o.branch_id = ?');
                params.push(branchFilter);
            }
        } else {
            where.push('o.branch_id = ?');
            params.push(branchId);
        }
        if (search) {
            where.push('(LOWER(o.sumber) LIKE ? OR LOWER(o.deskripsi) LIKE ?)');
            params.push(`%${search}%`, `%${search}%`);
        }
        if (dateFrom) {
            where.push('o.tanggal >= ?');
            params.push(dateFrom);
        }
        if (dateTo) {
            where.push('o.tanggal <= ?');
            params.push(dateTo);
        }

        const [rows] = await db.query(
            `SELECT o.id, o.tanggal, o.sumber, o.deskripsi, o.nominal, o.report_status, o.is_active, o.admin_keuangan_nama, o.branch_id, b.nama_cabang
             FROM other_incomes o
             LEFT JOIN branches b ON b.id = o.branch_id
             ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
             ORDER BY o.tanggal DESC, o.id DESC`,
            params
        );
        const [sumRows] = await db.query(
            `SELECT COALESCE(SUM(o.nominal),0) AS total_nominal
             FROM other_incomes o
             ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`,
            params
        );

        res.json({
            success: true,
            rows,
            summary: {
                total_nominal: Number(sumRows[0]?.total_nominal || 0),
                total_items: rows.length
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/other-incomes', async (req, res) => {
    try {
        if (!ensureBranchForAdmin(req, res)) return;
        if (denySuperAdminWrite(req, res)) return;
        await ensureExpenseTable();

        const branchId = getSessionBranchId(req);
        const tanggal = String(req.body.tanggal || '').trim();
        const sumber = String(req.body.sumber || '').trim();
        const deskripsi = String(req.body.deskripsi || '').trim();
        const nominal = Number(req.body.nominal || 0);
        const reportStatus = String(req.body.report_status || 'belum').trim().toLowerCase() === 'sudah' ? 'sudah' : 'belum';
        const isActive = Number(req.body.is_active || 1) === 1 ? 1 : 0;
        const adminKeuanganNama = await getAdminFullName(req.session?.adminId);

        if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
            return res.status(400).json({ success: false, message: 'Tanggal wajib format YYYY-MM-DD.' });
        }
        if (!sumber) return res.status(400).json({ success: false, message: 'Sumber wajib diisi.' });
        if (!deskripsi) return res.status(400).json({ success: false, message: 'Deskripsi wajib diisi.' });
        if (!Number.isFinite(nominal) || nominal <= 0) {
            return res.status(400).json({ success: false, message: 'Nominal harus lebih dari 0.' });
        }

        const [insertRes] = await db.query(
            `INSERT INTO other_incomes
             (branch_id, tanggal, sumber, deskripsi, nominal, report_status, is_active, admin_keuangan_nama)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [branchId, tanggal, sumber, deskripsi, nominal, reportStatus, isActive, adminKeuanganNama]
        );
        res.json({ success: true, id: insertRes.insertId, message: 'Pemasukan lain berhasil ditambahkan.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.put('/other-incomes/:id', async (req, res) => {
    try {
        if (!ensureBranchForAdmin(req, res)) return;
        if (denySuperAdminWrite(req, res)) return;
        await ensureExpenseTable();

        const id = Number(req.params.id || 0);
        const branchId = getSessionBranchId(req);
        const tanggal = String(req.body.tanggal || '').trim();
        const sumber = String(req.body.sumber || '').trim();
        const deskripsi = String(req.body.deskripsi || '').trim();
        const nominal = Number(req.body.nominal || 0);
        const reportStatus = String(req.body.report_status || 'belum').trim().toLowerCase() === 'sudah' ? 'sudah' : 'belum';
        const isActive = Number(req.body.is_active || 1) === 1 ? 1 : 0;
        const adminKeuanganNama = await getAdminFullName(req.session?.adminId);

        if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ success: false, message: 'ID tidak valid.' });
        if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
            return res.status(400).json({ success: false, message: 'Tanggal wajib format YYYY-MM-DD.' });
        }
        if (!sumber) return res.status(400).json({ success: false, message: 'Sumber wajib diisi.' });
        if (!deskripsi) return res.status(400).json({ success: false, message: 'Deskripsi wajib diisi.' });
        if (!Number.isFinite(nominal) || nominal <= 0) {
            return res.status(400).json({ success: false, message: 'Nominal harus lebih dari 0.' });
        }

        const [result] = await db.query(
            `UPDATE other_incomes
             SET tanggal = ?, sumber = ?, deskripsi = ?, nominal = ?, report_status = ?, is_active = ?, admin_keuangan_nama = ?
             WHERE id = ? AND branch_id = ?`,
            [tanggal, sumber, deskripsi, nominal, reportStatus, isActive, adminKeuanganNama, id, branchId]
        );
        if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Data pemasukan lain tidak ditemukan.' });
        res.json({ success: true, message: 'Pemasukan lain berhasil diperbarui.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.delete('/other-incomes/:id', async (req, res) => {
    try {
        if (!ensureBranchForAdmin(req, res)) return;
        if (denySuperAdminWrite(req, res)) return;
        await ensureExpenseTable();

        const id = Number(req.params.id || 0);
        const branchId = getSessionBranchId(req);
        if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ success: false, message: 'ID tidak valid.' });

        const [result] = await db.query('DELETE FROM other_incomes WHERE id = ? AND branch_id = ?', [id, branchId]);
        if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Data pemasukan lain tidak ditemukan.' });
        res.json({ success: true, message: 'Pemasukan lain berhasil dihapus.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.put('/other-incomes/:id/report-status', async (req, res) => {
    try {
        if (!ensureBranchForAdmin(req, res)) return;
        if (denySuperAdminWrite(req, res)) return;
        await ensureExpenseTable();
        const id = Number(req.params.id || 0);
        const branchId = getSessionBranchId(req);
        if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ success: false, message: 'ID tidak valid.' });
        const reportStatus = String(req.body.report_status || '').trim().toLowerCase();
        if (!['belum', 'sudah'].includes(reportStatus)) {
            return res.status(400).json({ success: false, message: 'Status laporan harus belum atau sudah.' });
        }
        const [result] = await db.query(
            'UPDATE other_incomes SET report_status = ? WHERE id = ? AND branch_id = ?',
            [reportStatus, id, branchId]
        );
        if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Data pemasukan lain tidak ditemukan.' });
        res.json({ success: true, message: 'Status laporan pemasukan diperbarui.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/all-laporan/summary', async (req, res) => {
    try {
        if (!ensureBranchForAdmin(req, res)) return;
        await ensureExpenseTable();
        const dateFrom = String(req.query.date_from || '').trim();
        const dateTo = String(req.query.date_to || '').trim();
        const branchId = getSessionBranchId(req);
        const isSuper = isSuperAdmin(req);
        const branchFilter = Number(req.query.branch_id || 0);

        const paymentWhere = [];
        const paymentParams = [];
        const expenseWhere = [];
        const expenseParams = [];
        if (dateFrom) {
            paymentWhere.push('DATE(p.tanggal) >= ?');
            paymentParams.push(dateFrom);
            expenseWhere.push('e.tanggal >= ?');
            expenseParams.push(dateFrom);
        }
        if (dateTo) {
            paymentWhere.push('DATE(p.tanggal) <= ?');
            paymentParams.push(dateTo);
            expenseWhere.push('e.tanggal <= ?');
            expenseParams.push(dateTo);
        }
        if (!isSuper && branchId) {
            paymentWhere.push('p.branch_id = ?');
            paymentParams.push(branchId);
            expenseWhere.push('e.branch_id = ?');
            expenseParams.push(branchId);
        } else if (isSuper) {
            paymentWhere.push("p.branch_id IN (SELECT id FROM branches WHERE id <> 1)");
            expenseWhere.push("e.branch_id IN (SELECT id FROM branches WHERE id <> 1)");
            if (branchFilter > 0) {
                paymentWhere.push('p.branch_id = ?');
                paymentParams.push(branchFilter);
                expenseWhere.push('e.branch_id = ?');
                expenseParams.push(branchFilter);
            }
        }
        paymentWhere.push("COALESCE(p.penerima,'') NOT LIKE 'Sistem (Beasiswa)%'");
        paymentWhere.push("COALESCE(p.trans_id,'') NOT LIKE 'BEA-%'");

        const paymentSql = `
            SELECT COALESCE(SUM(p.jumlah_bayar), 0) AS total_income
            FROM payments p
            ${paymentWhere.length ? `WHERE ${paymentWhere.join(' AND ')}` : ''}
        `;
        const otherIncomeWhere = [];
        const otherIncomeParams = [];
        if (dateFrom) {
            otherIncomeWhere.push('o.tanggal >= ?');
            otherIncomeParams.push(dateFrom);
        }
        if (dateTo) {
            otherIncomeWhere.push('o.tanggal <= ?');
            otherIncomeParams.push(dateTo);
        }
        if (!isSuper && branchId) {
            otherIncomeWhere.push('o.branch_id = ?');
            otherIncomeParams.push(branchId);
        } else if (isSuper) {
            otherIncomeWhere.push("o.branch_id IN (SELECT id FROM branches WHERE id <> 1)");
            if (branchFilter > 0) {
                otherIncomeWhere.push('o.branch_id = ?');
                otherIncomeParams.push(branchFilter);
            }
        }
        const otherIncomeSql = `
            SELECT COALESCE(SUM(o.nominal), 0) AS total_other_income
            FROM other_incomes o
            ${otherIncomeWhere.length ? `WHERE ${otherIncomeWhere.join(' AND ')}` : ''}
        `;
        const expenseSql = `
            SELECT COALESCE(SUM(e.nominal), 0) AS total_expense
            FROM expenses e
            ${expenseWhere.length ? `WHERE ${expenseWhere.join(' AND ')}` : ''}
        `;
        const [paymentSumRows] = await db.query(paymentSql, paymentParams);
        const [otherIncomeSumRows] = await db.query(otherIncomeSql, otherIncomeParams);
        const [expenseSumRows] = await db.query(expenseSql, expenseParams);
        const totalIncome = Number(paymentSumRows[0]?.total_income || 0) + Number(otherIncomeSumRows[0]?.total_other_income || 0);
        const totalExpense = Number(expenseSumRows[0]?.total_expense || 0);

        const [incomeSeriesRows] = await db.query(
            `SELECT DATE(p.tanggal) AS report_date, COALESCE(SUM(p.jumlah_bayar), 0) AS total_income
             FROM payments p
             ${paymentWhere.length ? `WHERE ${paymentWhere.join(' AND ')}` : ''}
             GROUP BY DATE(p.tanggal)
             ORDER BY DATE(p.tanggal) ASC`,
            paymentParams
        );
        const [expenseSeriesRows] = await db.query(
            `SELECT e.tanggal AS report_date, COALESCE(SUM(e.nominal), 0) AS total_expense
             FROM expenses e
             ${expenseWhere.length ? `WHERE ${expenseWhere.join(' AND ')}` : ''}
             GROUP BY e.tanggal
             ORDER BY e.tanggal ASC`,
            expenseParams
        );
        const [otherIncomeSeriesRows] = await db.query(
            `SELECT o.tanggal AS report_date, COALESCE(SUM(o.nominal), 0) AS total_other_income
             FROM other_incomes o
             ${otherIncomeWhere.length ? `WHERE ${otherIncomeWhere.join(' AND ')}` : ''}
             GROUP BY o.tanggal
             ORDER BY o.tanggal ASC`,
            otherIncomeParams
        );
        const points = new Map();
        for (const row of incomeSeriesRows || []) {
            const key = String(row.report_date || '').slice(0, 10);
            if (!key) continue;
            if (!points.has(key)) points.set(key, { date: key, income: 0, expense: 0 });
            points.get(key).income = Number(row.total_income || 0);
        }
        for (const row of otherIncomeSeriesRows || []) {
            const key = String(row.report_date || '').slice(0, 10);
            if (!key) continue;
            if (!points.has(key)) points.set(key, { date: key, income: 0, expense: 0 });
            points.get(key).income += Number(row.total_other_income || 0);
        }
        for (const row of expenseSeriesRows || []) {
            const key = String(row.report_date || '').slice(0, 10);
            if (!key) continue;
            if (!points.has(key)) points.set(key, { date: key, income: 0, expense: 0 });
            points.get(key).expense = Number(row.total_expense || 0);
        }
        const series = Array.from(points.values()).sort((a, b) => a.date.localeCompare(b.date));

        res.json({
            success: true,
            summary: {
                total_payment_income: Number(paymentSumRows[0]?.total_income || 0),
                total_other_income: Number(otherIncomeSumRows[0]?.total_other_income || 0),
                total_income: totalIncome,
                total_expense: totalExpense,
                saldo: totalIncome - totalExpense
            },
            series
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/expenses/:id/receipt', async (req, res) => {
    try {
        if (!ensureBranchForAdmin(req, res)) return;
        await ensureExpenseTable();

        const id = Number(req.params.id || 0);
        const branchId = getSessionBranchId(req);
        const isSuper = isSuperAdmin(req);
        const isWali = isTeacherExpenseRole(req);
        if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ success: false, message: 'ID tidak valid.' });

        const where = ['e.id = ?'];
        const params = [id];
        if (!isSuper && branchId) {
            where.push('e.branch_id = ?');
            params.push(branchId);
        } else if (isSuper) {
            where.push("e.branch_id IN (SELECT id FROM branches WHERE id <> 1)");
        }
        if (isWali) {
            const identity = await getCurrentAdminIdentity(req);
            const ownerFilter = buildWaliExpenseOwnerFilter('e', identity);
            where.push(ownerFilter.clause);
            params.push(...ownerFilter.params);
        }
        const [rows] = await db.query(
            `SELECT e.id, e.tanggal, e.kategori, e.deskripsi, e.nominal,
                    e.penanggung_jawab_nama, e.admin_keuangan_nama,
                    b.nama_cabang
             FROM expenses e
             LEFT JOIN branches b ON b.id = e.branch_id
             WHERE ${where.join(' AND ')}
             LIMIT 1`,
            params
        );
        if (!rows.length) return res.status(404).json({ success: false, message: 'Data pengeluaran tidak ditemukan.' });

        const [settingRows] = await db.query('SELECT nama_sekolah, alamat_sekolah, telepon FROM school_settings WHERE id = 1 LIMIT 1');
        const settings = settingRows[0] || {};
        const adminNama = rows[0].admin_keuangan_nama || await getAdminFullName(req.session?.adminId) || '-';
        const receiptNo = `EXP-${String(rows[0].id).padStart(6, '0')}`;
        return res.json({
            success: true,
            data: {
                receipt_no: receiptNo,
                school_name: settings.nama_sekolah || 'SKS',
                school_address: settings.alamat_sekolah || '-',
                school_phone: settings.telepon || '-',
                branch_name: rows[0].nama_cabang || '-',
                tanggal: rows[0].tanggal,
                kategori: rows[0].kategori,
                deskripsi: rows[0].deskripsi,
                nominal: Number(rows[0].nominal || 0),
                penerima_nama: rows[0].penanggung_jawab_nama || '-',
                admin_keuangan_nama: adminNama
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
