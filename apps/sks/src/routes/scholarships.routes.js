const express = require('express');
const db = require('../../db');
const { isSuperAdmin, getSessionBranchId, resolveBranchId, ensureBranchForAdmin } = require('../utils/branchScope');

const router = express.Router();
let scholarshipAuditEnsured = false;
let scholarshipSchemaEnsured = false;
let scholarshipPlansEnsured = false;

function ensureNotSuperAdminReadOnly(req, res) {
    if (isSuperAdmin(req)) {
        res.status(403).json({ success: false, message: 'Super admin hanya dapat melihat data beasiswa.' });
        return false;
    }
    return true;
}

function getScope(req) {
    const branchId = resolveBranchId(req, ['branch_id']) || getSessionBranchId(req);
    const scoped = !isSuperAdmin(req) || branchId;
    return {
        branchId,
        scoped,
        clause: scoped ? ' AND branch_id = ? ' : '',
        params: scoped ? [branchId] : []
    };
}

async function ensureScholarshipAuditTable(connLike = db) {
    if (scholarshipAuditEnsured) return;
    await connLike.query(`
        CREATE TABLE IF NOT EXISTS scholarship_audit_logs (
            id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            action ENUM('add_recipient','cancel_recipient') NOT NULL,
            type_id INT NULL,
            recipient_id INT NULL,
            payment_id INT NULL,
            branch_id INT NULL,
            actor_user_id INT NULL,
            actor_role VARCHAR(30) NULL,
            actor_username VARCHAR(100) NULL,
            detail_json JSON NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_sch_audit_type (type_id),
            INDEX idx_sch_audit_branch (branch_id),
            INDEX idx_sch_audit_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
    scholarshipAuditEnsured = true;
}

async function columnExists(connLike, tableName, columnName) {
    const [rows] = await connLike.query(
        `SELECT COUNT(*) AS cnt
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = ?
           AND COLUMN_NAME = ?`,
        [tableName, columnName]
    );
    return Number(rows[0]?.cnt || 0) > 0;
}

async function ensureScholarshipSchema(connLike = db) {
    if (scholarshipSchemaEnsured) return;
    const alters = [];
    if (!(await columnExists(connLike, 'scholarship_types', 'is_active'))) alters.push("ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1");
    if (!(await columnExists(connLike, 'scholarship_types', 'start_date'))) alters.push("ADD COLUMN start_date DATE NULL");
    if (!(await columnExists(connLike, 'scholarship_types', 'end_date'))) alters.push("ADD COLUMN end_date DATE NULL");
    if (!(await columnExists(connLike, 'scholarship_types', 'eligible_classes'))) alters.push("ADD COLUMN eligible_classes TEXT NULL");
    if (!(await columnExists(connLike, 'scholarship_types', 'eligible_student_status'))) alters.push("ADD COLUMN eligible_student_status VARCHAR(20) NOT NULL DEFAULT 'aktif'");
    if (!(await columnExists(connLike, 'scholarship_types', 'min_arrears'))) alters.push("ADD COLUMN min_arrears DECIMAL(15,2) NOT NULL DEFAULT 0");
    if (!(await columnExists(connLike, 'scholarship_types', 'max_recipients'))) alters.push("ADD COLUMN max_recipients INT NULL");
    if (!(await columnExists(connLike, 'scholarship_types', 'priority'))) alters.push("ADD COLUMN priority INT NOT NULL DEFAULT 100");
    if (!(await columnExists(connLike, 'scholarship_types', 'description'))) alters.push("ADD COLUMN description TEXT NULL");
    if (alters.length) {
        await connLike.query(`ALTER TABLE scholarship_types ${alters.join(', ')}`);
    }

    const recipientAlters = [];
    if (!(await columnExists(connLike, 'scholarship_recipients', 'period_month'))) recipientAlters.push("ADD COLUMN period_month TINYINT NULL");
    if (!(await columnExists(connLike, 'scholarship_recipients', 'period_year'))) recipientAlters.push("ADD COLUMN period_year INT NULL");
    if (!(await columnExists(connLike, 'scholarship_recipients', 'is_operational_active'))) recipientAlters.push("ADD COLUMN is_operational_active TINYINT(1) NOT NULL DEFAULT 1");
    if (!(await columnExists(connLike, 'scholarship_recipients', 'student_status_snapshot'))) recipientAlters.push("ADD COLUMN student_status_snapshot VARCHAR(20) NULL");
    if (recipientAlters.length) {
        await connLike.query(`ALTER TABLE scholarship_recipients ${recipientAlters.join(', ')}`);
    }
    scholarshipSchemaEnsured = true;
}

async function ensureScholarshipPlanTable(connLike = db) {
    if (scholarshipPlansEnsured) return;
    await connLike.query(`
        CREATE TABLE IF NOT EXISTS scholarship_plans (
            id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            type_id INT NOT NULL,
            branch_id INT NULL,
            target_month TINYINT NOT NULL,
            target_year INT NOT NULL,
            target_recipients INT NOT NULL DEFAULT 0,
            target_nominal DECIMAL(15,2) NOT NULL DEFAULT 0,
            notes TEXT NULL,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_sch_plan_period (target_year, target_month),
            INDEX idx_sch_plan_type (type_id),
            INDEX idx_sch_plan_branch (branch_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
    const [idxRows] = await connLike.query(
        `SELECT COUNT(*) AS cnt
         FROM INFORMATION_SCHEMA.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'scholarship_plans'
           AND INDEX_NAME = 'uniq_sch_plan_scope'`
    );
    if (Number(idxRows[0]?.cnt || 0) === 0) {
        await connLike.query('ALTER TABLE scholarship_plans ADD UNIQUE KEY uniq_sch_plan_scope (type_id, branch_id, target_year, target_month)');
    }
    scholarshipPlansEnsured = true;
}

function semesterMonths(semester) {
    return String(semester).toLowerCase() === 'ganjil' ? [7, 8, 9, 10, 11, 12] : [1, 2, 3, 4, 5, 6];
}

function getPeriodConfig(query = {}) {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const periodType = String(query.period_type || 'month').toLowerCase();

    if (periodType === 'year') {
        const year = Number.parseInt(query.year, 10) || currentYear;
        return {
            periodType,
            label: `Tahun ${year}`,
            months: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, year }))
        };
    }

    if (periodType === 'semester' || periodType === 'next_semester') {
        const currentSemester = currentMonth >= 7 ? 'ganjil' : 'genap';
        let semester = String(query.semester || currentSemester).toLowerCase();
        let year = Number.parseInt(query.year, 10) || currentYear;

        if (periodType === 'next_semester') {
            if (semester === 'ganjil') {
                semester = 'genap';
                year += 1;
            } else {
                semester = 'ganjil';
            }
        }
        semester = semester === 'ganjil' ? 'ganjil' : 'genap';
        const months = semesterMonths(semester).map((m) => ({ month: m, year }));
        return {
            periodType,
            semester,
            year,
            label: `${semester === 'ganjil' ? 'Semester Ganjil' : 'Semester Genap'} ${year}`,
            months
        };
    }

    const month = Math.max(1, Math.min(12, Number.parseInt(query.month, 10) || currentMonth));
    const year = Number.parseInt(query.year, 10) || currentYear;
    return {
        periodType: 'month',
        month,
        year,
        label: `Bulan ${month}/${year}`,
        months: [{ month, year }]
    };
}

async function resolveActor(req, connLike = db) {
    const actorRole = req.session?.userRole || null;
    const actorUserId = req.session?.userId || null;
    let actorUsername = null;
    if (actorRole === 'super_admin' || actorRole === 'admin') {
        const adminId = req.session?.adminId || actorUserId;
        if (adminId) {
            const [rows] = await connLike.query('SELECT username FROM admins WHERE id = ? LIMIT 1', [adminId]);
            actorUsername = rows[0]?.username || null;
        }
    }
    return { actorRole, actorUserId, actorUsername };
}

async function logScholarshipAudit(connLike, req, payload) {
    await ensureScholarshipAuditTable(connLike);
    const actor = await resolveActor(req, connLike);
    await connLike.query(
        `INSERT INTO scholarship_audit_logs
         (action, type_id, recipient_id, payment_id, branch_id, actor_user_id, actor_role, actor_username, detail_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            payload.action,
            payload.typeId || null,
            payload.recipientId || null,
            payload.paymentId || null,
            payload.branchId || null,
            actor.actorUserId || null,
            actor.actorRole || null,
            actor.actorUsername || null,
            JSON.stringify(payload.detail || {})
        ]
    );
}

// Scholarship types
router.get('/scholarships/types', async (req, res) => {
    try {
        if (!ensureBranchForAdmin(req, res)) return;
        await ensureScholarshipSchema(db);
        const scope = getScope(req);
        const sql = `SELECT t.id, t.nama_beasiswa, t.nominal_per_siswa, t.jenis_nilai, t.is_active, t.start_date, t.end_date,
                t.min_arrears, t.max_recipients, t.description,
                COUNT(DISTINCT CASE
                    WHEN LOWER(TRIM(COALESCE(s.status, ''))) = 'aktif'
                    THEN COALESCE(CAST(r.student_id AS CHAR), CONCAT('NIS:', r.nis))
                    ELSE NULL
                END) as jumlah_penerima,
                COALESCE(SUM(CASE
                    WHEN LOWER(TRIM(COALESCE(s.status, ''))) = 'aktif' THEN
                        CASE
                            WHEN p.id IS NOT NULL THEN COALESCE(p.jumlah_bayar, 0)
                            WHEN LOWER(TRIM(COALESCE(t.jenis_nilai, 'nominal'))) = 'nominal' THEN COALESCE(t.nominal_per_siswa, 0)
                            ELSE 0
                        END
                    ELSE 0
                END), 0) as total_anggaran
            FROM scholarship_types t
            LEFT JOIN scholarship_recipients r ON t.id = r.type_id ${scope.scoped ? ' AND r.branch_id = ? ' : ''}
            LEFT JOIN students s ON s.id = r.student_id
            LEFT JOIN payments p ON p.id = r.payment_id
            GROUP BY t.id
            ORDER BY t.id DESC`;
        const [rows] = await db.query(sql, scope.params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/scholarships/types', async (req, res) => {
    try {
        if (!ensureNotSuperAdminReadOnly(req, res)) return;
        await ensureScholarshipSchema(db);
        const {
            nama,
            nominal,
            jenis_nilai = 'nominal',
            is_active = 1,
            start_date = null,
            end_date = null,
            min_arrears = 0,
            max_recipients = null,
            description = null
        } = req.body;
        if (!nama || !String(nama).trim()) return res.status(400).json({ success: false, message: 'Nama beasiswa wajib diisi.' });
        const nominalNum = Number(nominal || 0);
        if (!Number.isFinite(nominalNum) || nominalNum <= 0) return res.status(400).json({ success: false, message: 'Nominal harus lebih dari 0.' });
        if (!['nominal', 'persen'].includes(String(jenis_nilai))) return res.status(400).json({ success: false, message: 'jenis_nilai harus nominal/persen.' });
        if (String(jenis_nilai) === 'persen' && (nominalNum <= 0 || nominalNum > 100)) {
            return res.status(400).json({ success: false, message: 'Nilai persen harus antara 1 sampai 100.' });
        }
        if (start_date && end_date && new Date(start_date) > new Date(end_date)) {
            return res.status(400).json({ success: false, message: 'Tanggal akhir harus >= tanggal mulai.' });
        }
        await db.query(
            `INSERT INTO scholarship_types
             (nama_beasiswa, nominal_per_siswa, jenis_nilai, is_active, start_date, end_date, eligible_classes, eligible_student_status, min_arrears, max_recipients, priority, description)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                String(nama).trim(),
                nominalNum,
                String(jenis_nilai),
                Number(is_active) === 1 ? 1 : 0,
                start_date || null,
                end_date || null,
                null,
                'aktif',
                Number(min_arrears || 0),
                max_recipients ? Number(max_recipients) : null,
                100,
                description ? String(description).trim() : null
            ]
        );
        res.json({ success: true, message: 'Jenis beasiswa ditambahkan.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.put('/scholarships/types/:id', async (req, res) => {
    try {
        if (!ensureNotSuperAdminReadOnly(req, res)) return;
        await ensureScholarshipSchema(db);
        const {
            nama,
            nominal,
            jenis_nilai = 'nominal',
            is_active = 1,
            start_date = null,
            end_date = null,
            min_arrears = 0,
            max_recipients = null,
            description = null
        } = req.body;
        const nominalNum = Number(nominal || 0);
        if (!Number.isFinite(nominalNum) || nominalNum <= 0) return res.status(400).json({ success: false, message: 'Nominal harus lebih dari 0.' });
        if (!['nominal', 'persen'].includes(String(jenis_nilai))) return res.status(400).json({ success: false, message: 'jenis_nilai harus nominal/persen.' });
        if (String(jenis_nilai) === 'persen' && (nominalNum <= 0 || nominalNum > 100)) {
            return res.status(400).json({ success: false, message: 'Nilai persen harus antara 1 sampai 100.' });
        }
        if (start_date && end_date && new Date(start_date) > new Date(end_date)) {
            return res.status(400).json({ success: false, message: 'Tanggal akhir harus >= tanggal mulai.' });
        }
        await db.query(
            `UPDATE scholarship_types
             SET nama_beasiswa = ?, nominal_per_siswa = ?, jenis_nilai = ?, is_active = ?, start_date = ?, end_date = ?,
                 eligible_classes = ?, eligible_student_status = ?, min_arrears = ?, max_recipients = ?, priority = ?, description = ?
             WHERE id = ?`,
            [
                String(nama || '').trim(),
                nominalNum,
                String(jenis_nilai),
                Number(is_active) === 1 ? 1 : 0,
                start_date || null,
                end_date || null,
                null,
                'aktif',
                Number(min_arrears || 0),
                max_recipients ? Number(max_recipients) : null,
                100,
                description ? String(description).trim() : null,
                req.params.id
            ]
        );
        res.json({ success: true, message: 'Program beasiswa diperbarui.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.delete('/scholarships/types/:id', async (req, res) => {
    try {
        if (!ensureNotSuperAdminReadOnly(req, res)) return;
        await ensureScholarshipSchema(db);
        if (!ensureBranchForAdmin(req, res)) return;
        const scope = getScope(req);
        const typeId = Number(req.params.id);
        if (!Number.isFinite(typeId) || typeId <= 0) {
            return res.status(400).json({ success: false, message: 'ID program tidak valid.' });
        }

        const [typeRows] = await db.query('SELECT id, nama_beasiswa FROM scholarship_types WHERE id = ? LIMIT 1', [typeId]);
        if (!typeRows.length) return res.status(404).json({ success: false, message: 'Program beasiswa tidak ditemukan.' });

        const [recipientRows] = await db.query(
            `SELECT COUNT(*) AS total
             FROM scholarship_recipients
             WHERE type_id = ? ${scope.scoped ? 'AND branch_id = ?' : ''}`,
            scope.scoped ? [typeId, scope.branchId] : [typeId]
        );
        const totalRecipients = Number(recipientRows[0]?.total || 0);
        if (totalRecipients > 0) {
            return res.status(400).json({
                success: false,
                message: `Program tidak bisa dihapus karena sudah memiliki ${totalRecipients} penerima beasiswa.`
            });
        }

        await db.query('DELETE FROM scholarship_types WHERE id = ?', [typeId]);
        res.json({ success: true, message: `Program "${typeRows[0].nama_beasiswa}" berhasil dihapus.` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/scholarships/:typeId/recipients', async (req, res) => {
    try {
        if (!ensureBranchForAdmin(req, res)) return;
        await ensureScholarshipSchema(db);
        const scope = getScope(req);
        const q = String(req.query.q || '').trim();
        const kelas = String(req.query.kelas || '').trim();
        const status = String(req.query.status || '').trim().toLowerCase();
        const month = Number.parseInt(req.query.month, 10);
        const year = Number.parseInt(req.query.year, 10);
        const filters = [];
        const params = [req.params.typeId, ...scope.params];
        if (q) {
            filters.push('(r.nama_siswa LIKE ? OR r.nis LIKE ?)');
            params.push(`%${q}%`, `%${q}%`);
        }
        if (kelas) {
            filters.push('r.kelas = ?');
            params.push(kelas);
        }
        if (status) {
            filters.push('LOWER(TRIM(COALESCE(s.status, ""))) = ?');
            params.push(status);
        }
        if (Number.isInteger(month) && month >= 1 && month <= 12) {
            filters.push('MONTH(r.tanggal_terima) = ?');
            params.push(month);
        }
        if (Number.isInteger(year) && year >= 2000 && year <= 3000) {
            filters.push('YEAR(r.tanggal_terima) = ?');
            params.push(year);
        }
        const whereFilter = filters.length ? ` AND ${filters.join(' AND ')}` : '';
        const [rows] = await db.query(
            `SELECT r.*, COALESCE(s.status, 'Aktif') AS student_status
             FROM scholarship_recipients r
             LEFT JOIN students s ON s.id = r.student_id
             WHERE r.type_id = ? ${scope.scoped ? ' AND r.branch_id = ? ' : ''} ${whereFilter}
             ORDER BY r.tanggal_terima DESC, r.id DESC`,
            params
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/scholarships/recipients/:id/removal-preview', async (req, res) => {
    try {
        if (!ensureBranchForAdmin(req, res)) return;
        const scope = getScope(req);
        const recipientId = Number(req.params.id);
        if (!Number.isFinite(recipientId) || recipientId <= 0) {
            return res.status(400).json({ success: false, message: 'ID penerima tidak valid.' });
        }

        const [recipientRows] = await db.query(
            `SELECT r.*, t.nama_beasiswa, t.jenis_nilai
             FROM scholarship_recipients r
             LEFT JOIN scholarship_types t ON t.id = r.type_id
             WHERE r.id = ? ${scope.clause}
             LIMIT 1`,
            [recipientId, ...scope.params]
        );
        if (!recipientRows.length) {
            return res.status(404).json({ success: false, message: 'Data penerima tidak ditemukan.' });
        }
        const recipient = recipientRows[0];

        let paymentAmount = 0;
        if (recipient.payment_id) {
            const [paymentRows] = await db.query(
                `SELECT jumlah_bayar
                 FROM payments
                 WHERE id = ? ${scope.clause}
                 LIMIT 1`,
                [recipient.payment_id, ...scope.params]
            );
            paymentAmount = Number(paymentRows[0]?.jumlah_bayar || 0);
        }

        const billParams = [];
        let billScope = '';
        if (scope.scoped) {
            billScope += ' AND b.branch_id = ? ';
            billParams.push(scope.branchId);
        }
        if (recipient.student_id) {
            billScope += ' AND b.student_id = ? ';
            billParams.push(recipient.student_id);
        } else {
            billScope += ' AND b.nama_siswa = ? AND b.kelas = ? ';
            billParams.push(recipient.nama_siswa, recipient.kelas);
        }

        const [billRows] = await db.query(
            `SELECT b.id, b.id_tagihan_code, b.nama_tagihan, b.total, b.terbayar, b.sisa, b.status, b.tanggal_buat
             FROM bills b
             WHERE b.terbayar > 0 ${billScope}
             ORDER BY b.id DESC`,
            billParams
        );

        res.json({
            success: true,
            recipient: {
                id: recipient.id,
                type_id: recipient.type_id,
                nama_beasiswa: recipient.nama_beasiswa || null,
                nama_siswa: recipient.nama_siswa,
                nis: recipient.nis,
                kelas: recipient.kelas,
                payment_id: recipient.payment_id || null,
                nominal_beasiswa: paymentAmount
            },
            bills: billRows.map((b) => ({
                id: b.id,
                id_tagihan_code: b.id_tagihan_code,
                nama_tagihan: b.nama_tagihan,
                total: Number(b.total || 0),
                terbayar: Number(b.terbayar || 0),
                sisa: Number(b.sisa || 0),
                status: b.status,
                tanggal_buat: b.tanggal_buat
            }))
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/scholarships/:typeId/history', async (req, res) => {
    try {
        if (!ensureBranchForAdmin(req, res)) return;
        const scope = getScope(req);
        await ensureScholarshipAuditTable(db);
        const [rows] = await db.query(
            `SELECT id, action, type_id, recipient_id, payment_id, branch_id, actor_user_id, actor_role, actor_username, detail_json, created_at
             FROM scholarship_audit_logs
             WHERE type_id = ? ${scope.clause}
             ORDER BY id DESC
             LIMIT 100`,
            [req.params.typeId, ...scope.params]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/scholarships/preview', async (req, res) => {
    try {
        if (!ensureBranchForAdmin(req, res)) return;
        const scope = getScope(req);
        const { typeId, nis } = req.body;
        if (!typeId || !nis) return res.status(400).json({ success: false, message: 'typeId dan nis wajib diisi.' });
        await ensureScholarshipSchema(db);

        const [typeRows] = await db.query('SELECT * FROM scholarship_types WHERE id = ? LIMIT 1', [typeId]);
        if (!typeRows.length) return res.status(404).json({ success: false, message: 'Program beasiswa tidak ditemukan.' });
        const t = typeRows[0];
        if (Number(t.is_active || 0) !== 1) return res.status(400).json({ success: false, message: 'Program beasiswa nonaktif.' });
        const today = new Date();
        if (t.start_date && new Date(t.start_date) > today) return res.status(400).json({ success: false, message: 'Program belum masuk periode berlaku.' });
        if (t.end_date && new Date(t.end_date) < today) return res.status(400).json({ success: false, message: 'Program sudah melewati periode berlaku.' });

        const [stuRows] = await db.query(
            `SELECT id, nama, nis, kelas, status, branch_id
             FROM students WHERE nis = ? ${scope.clause} LIMIT 1`,
            [nis, ...scope.params]
        );
        if (!stuRows.length) return res.status(404).json({ success: false, message: 'Siswa tidak ditemukan pada cabang ini.' });
        const s = stuRows[0];
        const [bills] = await db.query(
            `SELECT id, nama_tagihan, sisa
             FROM bills
             WHERE branch_id = ?
               AND student_id = ?
               AND sisa > 0
             ORDER BY id ASC`,
            [s.branch_id, s.id]
        );
        const totalHutang = bills.reduce((a, b) => a + Number(b.sisa || 0), 0);
        if (Number(totalHutang) < Number(t.min_arrears || 0)) {
            return res.status(400).json({ success: false, message: `Total tunggakan siswa kurang dari syarat minimal ${Number(t.min_arrears || 0)}.` });
        }
        const nominalDidapat = String(t.jenis_nilai) === 'persen'
            ? totalHutang * (Number(t.nominal_per_siswa) / 100)
            : Number(t.nominal_per_siswa);
        const previewPotongan = Math.min(totalHutang, nominalDidapat);
        res.json({
            success: true,
            preview: {
                nama_siswa: s.nama,
                nis: s.nis,
                kelas: s.kelas,
                total_tunggakan: totalHutang,
                nominal_program: Number(t.nominal_per_siswa),
                jenis_nilai: t.jenis_nilai,
                estimasi_potongan: previewPotongan,
                sisa_setelah_potongan: Math.max(0, totalHutang - previewPotongan)
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/scholarships/recipients', async (req, res) => {
    const conn = await db.getConnection();
    try {
        if (!ensureNotSuperAdminReadOnly(req, res)) return;
        if (!ensureBranchForAdmin(req, res)) return;
        const scope = getScope(req);
        await conn.beginTransaction();
        const { typeId, nama, kelas, nis, tanggal } = req.body;
        await ensureScholarshipSchema(conn);

        const [typeInfo] = await conn.query('SELECT * FROM scholarship_types WHERE id = ?', [typeId]);
        if (!typeInfo.length) {
            await conn.rollback();
            return res.status(404).json({ success: false, message: 'Program beasiswa tidak ditemukan.' });
        }
        const jenisNilai = typeInfo[0].jenis_nilai;
        const nilaiMaster = Number(typeInfo[0].nominal_per_siswa);
        const namaProgram = typeInfo[0].nama_beasiswa;
        const t = typeInfo[0];
        if (Number(t.is_active || 0) !== 1) {
            await conn.rollback();
            return res.status(400).json({ success: false, message: 'Program beasiswa nonaktif.' });
        }
        const applyDate = tanggal ? new Date(tanggal) : new Date();
        if (t.start_date && new Date(t.start_date) > applyDate) {
            await conn.rollback();
            return res.status(400).json({ success: false, message: 'Program belum aktif pada tanggal tersebut.' });
        }
        if (t.end_date && new Date(t.end_date) < applyDate) {
            await conn.rollback();
            return res.status(400).json({ success: false, message: 'Program sudah berakhir pada tanggal tersebut.' });
        }

        // Resolve student_id and class_id for strong linking.
        const [stu] = await conn.query(`SELECT id, class_id, branch_id, status FROM students WHERE nis = ? ${scope.clause} LIMIT 1`, [nis, ...scope.params]);
        const studentId = stu[0] ? stu[0].id : null;
        const classId = stu[0] ? stu[0].class_id : null;
        const branchId = stu[0] ? stu[0].branch_id : (scope.branchId || 1);
        const studentStatus = String(stu[0]?.status || '').toLowerCase();
        if (!studentId || studentStatus !== 'aktif') {
            await conn.rollback();
            return res.status(400).json({ success: false, message: 'Beasiswa hanya bisa diberikan ke siswa aktif.' });
        }
        if (t.max_recipients) {
            const [recipientCountRows] = await conn.query(
                `SELECT COUNT(*) AS total FROM scholarship_recipients WHERE type_id = ? ${scope.clause}`,
                [typeId, ...scope.params]
            );
            const recipientCount = Number(recipientCountRows[0]?.total || 0);
            if (recipientCount >= Number(t.max_recipients)) {
                await conn.rollback();
                return res.status(400).json({ success: false, message: 'Kuota penerima beasiswa sudah penuh.' });
            }
        }

        const periodMonth = applyDate.getMonth() + 1;
        const periodYear = applyDate.getFullYear();
        const [periodExistsRows] = await conn.query(
            `SELECT id FROM scholarship_recipients
             WHERE type_id = ?
               AND student_id = ?
               AND period_month = ?
               AND period_year = ?
               ${scope.clause}
             LIMIT 1`,
            [typeId, studentId || 0, periodMonth, periodYear, ...scope.params]
        );
        if (periodExistsRows.length > 0) {
            await conn.rollback();
            return res.status(400).json({ success: false, message: 'Siswa sudah menerima program ini pada periode yang sama.' });
        }

        const [bills] = studentId
            ? await conn.query(`SELECT * FROM bills WHERE student_id = ? AND sisa > 0 ${scope.clause} ORDER BY id ASC`, [studentId, ...scope.params])
            : await conn.query(`SELECT * FROM bills WHERE nama_siswa = ? AND kelas = ? AND sisa > 0 ${scope.clause} ORDER BY id ASC`, [nama, kelas, ...scope.params]);

        let nominalDidapat = 0;
        if (jenisNilai === 'nominal') {
            nominalDidapat = nilaiMaster;
        } else {
        const totalHutang = bills.reduce((acc, curr) => acc + Number(curr.sisa), 0);
        if (totalHutang < Number(t.min_arrears || 0)) {
            await conn.rollback();
            return res.status(400).json({ success: false, message: `Total tunggakan siswa kurang dari syarat minimal ${Number(t.min_arrears || 0)}.` });
        }
        nominalDidapat = totalHutang * (nilaiMaster / 100);
        }

        let sisaDana = nominalDidapat;
        let totalTerpakai = 0;

        for (let bill of bills) {
            if (sisaDana <= 0) break;

            let bayarKeBillIni = 0;
            if (jenisNilai === 'persen') {
                bayarKeBillIni = bill.sisa * (nilaiMaster / 100);
            } else {
                bayarKeBillIni = Math.min(bill.sisa, sisaDana);
            }

            await conn.query(
                `UPDATE bills
                 SET terbayar = terbayar + ?,
                     sisa = sisa - ?,
                     status = CASE WHEN (sisa - ?) <= 0 THEN 'Lunas' ELSE 'Belum Lunas' END
                 WHERE id = ? ${scope.clause}`,
                [bayarKeBillIni, bayarKeBillIni, bayarKeBillIni, bill.id, ...scope.params]
            );

            sisaDana -= bayarKeBillIni;
            totalTerpakai += bayarKeBillIni;
        }

        let paymentId = null;
        if (totalTerpakai > 0) {
            const transId = `BEA-${Date.now()}`;
            const [payResult] = await conn.query(
                `INSERT INTO payments (trans_id, tanggal, kelas, nama, jumlah_bayar, penerima, keterangan, student_id, class_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    transId,
                    tanggal,
                    kelas,
                    nama,
                    totalTerpakai,
                    'Sistem (Beasiswa)',
                    `Otomatis: ${namaProgram} (${jenisNilai === 'persen' ? nilaiMaster + '%' : ''})`,
                    studentId,
                    classId
                ]
            );
            await conn.query('UPDATE payments SET branch_id = ? WHERE id = ?', [branchId, payResult.insertId]);
            paymentId = payResult.insertId;
        }

        // NOTE: keep nama/kelas snapshot, but link with student_id/class_id.
        await conn.query(
            'INSERT INTO scholarship_recipients (type_id, payment_id, nama_siswa, kelas, nis, tanggal_terima, student_id, class_id, branch_id, period_month, period_year, is_operational_active, student_status_snapshot) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [typeId, paymentId, nama, kelas, nis, tanggal, studentId, classId, branchId, periodMonth, periodYear, 1, stu[0]?.status || 'Aktif']
        );
        const [lastRecipient] = await conn.query(
            'SELECT id FROM scholarship_recipients WHERE type_id = ? AND nis = ? AND branch_id = ? ORDER BY id DESC LIMIT 1',
            [typeId, nis, branchId]
        );
        await logScholarshipAudit(conn, req, {
            action: 'add_recipient',
            typeId,
            recipientId: lastRecipient[0]?.id || null,
            paymentId,
            branchId,
            detail: {
                nama_siswa: nama,
                nis,
                kelas,
                tanggal_terima: tanggal,
                nominal_terpakai: totalTerpakai
            }
        });

        await conn.commit();
        res.json({ success: true, message: `Beasiswa diterapkan. Potongan: Rp ${totalTerpakai.toLocaleString('id-ID')}.` });
    } catch (err) {
        await conn.rollback();
        res.status(500).json({ success: false, message: err.message });
    } finally {
        conn.release();
    }
});

router.delete('/scholarships/recipients/:id', async (req, res) => {
    const conn = await db.getConnection();
    try {
        if (!ensureNotSuperAdminReadOnly(req, res)) return;
        if (!ensureBranchForAdmin(req, res)) return;
        const scope = getScope(req);
        await conn.beginTransaction();
        const recipientId = req.params.id;
        const cancelReason = String(req.body?.reason || '').trim();
        const selectedBillIds = Array.isArray(req.body?.bill_ids)
            ? req.body.bill_ids.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0)
            : [];
        if (!cancelReason) {
            await conn.rollback();
            return res.status(400).json({ success: false, message: 'Alasan pembatalan wajib diisi.' });
        }
        const [recipients] = await conn.query(`SELECT * FROM scholarship_recipients WHERE id = ? ${scope.clause}`, [recipientId, ...scope.params]);
        if (recipients.length === 0) {
            await conn.rollback();
            return res.status(404).json({ success: false, message: 'Data tidak ditemukan.' });
        }

        const data = recipients[0];
        let totalRefunded = 0;
        let selectedBillsMeta = [];

        if (data.payment_id) {
            const [payments] = await conn.query(`SELECT * FROM payments WHERE id = ? ${scope.clause}`, [data.payment_id, ...scope.params]);
            if (payments.length > 0) {
                const nominalDikembalikan = payments[0].jumlah_bayar;
                const billsParams = [];
                let billsWhere = '';
                if (data.student_id) {
                    billsWhere += ' AND student_id = ? ';
                    billsParams.push(data.student_id);
                } else {
                    billsWhere += ' AND nama_siswa = ? AND kelas = ? ';
                    billsParams.push(data.nama_siswa, data.kelas);
                }
                billsWhere += scope.clause;
                billsParams.push(...scope.params);
                if (selectedBillIds.length) {
                    billsWhere += ` AND id IN (${selectedBillIds.map(() => '?').join(',')}) `;
                    billsParams.push(...selectedBillIds);
                }

                const [paidBills] = await conn.query(
                    `SELECT * FROM bills WHERE terbayar > 0 ${billsWhere} ORDER BY id DESC`,
                    billsParams
                );
                if (!paidBills.length) {
                    await conn.rollback();
                    return res.status(400).json({ success: false, message: 'Tidak ada tagihan yang bisa dibatalkan untuk penerima ini.' });
                }

                let sisaRefund = nominalDikembalikan;
                for (let bill of paidBills) {
                    if (sisaRefund <= 0) break;
                    const tarikKembali = Math.min(bill.terbayar, sisaRefund);
                    if (tarikKembali <= 0) continue;
                    await conn.query(`UPDATE bills SET terbayar = terbayar - ?, sisa = sisa + ?, status = 'Belum Lunas' WHERE id = ? ${scope.clause}`, [
                        tarikKembali,
                        tarikKembali,
                        bill.id,
                        ...scope.params
                    ]);
                    sisaRefund -= tarikKembali;
                    totalRefunded += tarikKembali;
                    selectedBillsMeta.push({
                        id: bill.id,
                        nama_tagihan: bill.nama_tagihan,
                        nominal_refund: tarikKembali
                    });
                }

                if (totalRefunded <= 0) {
                    await conn.rollback();
                    return res.status(400).json({ success: false, message: 'Nominal refund bernilai 0. Pilih tagihan lain.' });
                }

                if (totalRefunded >= Number(nominalDikembalikan)) {
                    await conn.query(`DELETE FROM payments WHERE id = ? ${scope.clause}`, [data.payment_id, ...scope.params]);
                } else {
                    await conn.query(
                        `UPDATE payments
                         SET jumlah_bayar = GREATEST(0, jumlah_bayar - ?),
                             keterangan = CONCAT(COALESCE(keterangan, ''), ' | Penyesuaian pembatalan sebagian')
                         WHERE id = ? ${scope.clause}`,
                        [totalRefunded, data.payment_id, ...scope.params]
                    );
                }
            }
        }

        if (data.payment_id && totalRefunded > 0) {
            const [paymentLeftRows] = await conn.query(`SELECT id, jumlah_bayar FROM payments WHERE id = ? ${scope.clause} LIMIT 1`, [data.payment_id, ...scope.params]);
            const paymentStillExists = paymentLeftRows.length > 0 && Number(paymentLeftRows[0].jumlah_bayar || 0) > 0;
            if (!paymentStillExists) {
                await conn.query(`DELETE FROM scholarship_recipients WHERE id = ? ${scope.clause}`, [recipientId, ...scope.params]);
            }
        } else {
            await conn.query(`DELETE FROM scholarship_recipients WHERE id = ? ${scope.clause}`, [recipientId, ...scope.params]);
        }

        await logScholarshipAudit(conn, req, {
            action: 'cancel_recipient',
            typeId: data.type_id,
            recipientId: data.id,
            paymentId: data.payment_id,
            branchId: data.branch_id,
            detail: {
                nama_siswa: data.nama_siswa,
                nis: data.nis,
                kelas: data.kelas,
                tanggal_terima: data.tanggal_terima,
                reason: cancelReason,
                selected_bill_ids: selectedBillIds,
                refunded_nominal: totalRefunded,
                refunded_bills: selectedBillsMeta
            }
        });
        await conn.commit();
        res.json({
            success: true,
            partial: data.payment_id ? totalRefunded > 0 && selectedBillIds.length > 0 : false,
            refunded_nominal: totalRefunded,
            message: totalRefunded > 0
                ? `Pembatalan beasiswa diproses. Refund Rp ${Number(totalRefunded).toLocaleString('id-ID')}.`
                : 'Beasiswa dibatalkan.'
        });
    } catch (err) {
        await conn.rollback();
        res.status(500).json({ success: false, message: err.message });
    } finally {
        conn.release();
    }
});

router.get('/scholarships/summary', async (req, res) => {
    try {
        if (!ensureBranchForAdmin(req, res)) return;
        await ensureScholarshipSchema(db);
        await ensureScholarshipPlanTable(db);
        const scope = getScope(req);
        const period = getPeriodConfig(req.query);
        const periodWhere = period.months
            .map(() => '(COALESCE(r.period_month, MONTH(r.tanggal_terima)) = ? AND COALESCE(r.period_year, YEAR(r.tanggal_terima)) = ?)')
            .join(' OR ');
        const periodParams = period.months.flatMap((x) => [x.month, x.year]);
        const paymentPeriodWhere = period.months.map(() => '(MONTH(p.tanggal) = ? AND YEAR(p.tanggal) = ?)').join(' OR ');
        const paymentPeriodParams = period.months.flatMap((x) => [x.month, x.year]);
        const planPeriodWhere = period.months.map(() => '(sp.target_month = ? AND sp.target_year = ?)').join(' OR ');
        const planPeriodParams = period.months.flatMap((x) => [x.month, x.year]);

        const [kpiRows] = await db.query(
            `SELECT
                COUNT(DISTINCT t.id) AS total_program,
                COUNT(DISTINCT COALESCE(CAST(r.student_id AS CHAR), CONCAT('NIS:', r.nis))) AS total_penerima,
                COUNT(DISTINCT CASE WHEN LOWER(TRIM(COALESCE(s.status, ''))) = 'aktif' THEN COALESCE(CAST(r.student_id AS CHAR), CONCAT('NIS:', r.nis)) ELSE NULL END) AS total_penerima_aktif,
                COALESCE(SUM(
                    CASE
                        WHEN p.id IS NOT NULL THEN COALESCE(p.jumlah_bayar, 0)
                        WHEN LOWER(TRIM(COALESCE(s.status, ''))) = 'aktif'
                             AND LOWER(TRIM(COALESCE(t.jenis_nilai, 'nominal'))) = 'nominal'
                        THEN COALESCE(t.nominal_per_siswa, 0)
                        ELSE 0
                    END
                ), 0) AS total_terserap
             FROM scholarship_types t
             LEFT JOIN scholarship_recipients r ON r.type_id = t.id
                ${scope.scoped ? ' AND r.branch_id = ? ' : ''}
                AND (${periodWhere})
             LEFT JOIN students s ON s.id = r.student_id
             LEFT JOIN payments p ON p.id = r.payment_id`,
            [...scope.params, ...periodParams]
        );

        const [branchRows] = await db.query(
            `SELECT b.id, b.nama_cabang, b.kode_cabang,
                    COUNT(DISTINCT COALESCE(CAST(r.student_id AS CHAR), CONCAT('NIS:', r.nis))) AS total_penerima,
                    COALESCE(SUM(
                        CASE
                            WHEN p.id IS NOT NULL THEN COALESCE(p.jumlah_bayar, 0)
                            WHEN LOWER(TRIM(COALESCE(s.status, ''))) = 'aktif'
                                 AND LOWER(TRIM(COALESCE(t.jenis_nilai, 'nominal'))) = 'nominal'
                            THEN COALESCE(t.nominal_per_siswa, 0)
                            ELSE 0
                        END
                    ), 0) AS total_terserap
              FROM branches b
              LEFT JOIN scholarship_recipients r ON r.branch_id = b.id AND (${periodWhere})
              LEFT JOIN scholarship_types t ON t.id = r.type_id
              LEFT JOIN students s ON s.id = r.student_id
              LEFT JOIN payments p ON p.id = r.payment_id
              WHERE b.id <> 1
              ${scope.clause ? 'AND b.id = ?' : ''}
             GROUP BY b.id, b.nama_cabang, b.kode_cabang
             ORDER BY total_terserap DESC, total_penerima DESC`,
            scope.clause ? [...periodParams, scope.branchId] : [...periodParams]
        );

        const [programRows] = await db.query(
            `SELECT t.id, t.nama_beasiswa, t.jenis_nilai, t.nominal_per_siswa,
                    COUNT(DISTINCT COALESCE(CAST(r.student_id AS CHAR), CONCAT('NIS:', r.nis))) AS total_penerima,
                    COALESCE(SUM(
                        CASE
                            WHEN p.id IS NOT NULL THEN COALESCE(p.jumlah_bayar, 0)
                            WHEN LOWER(TRIM(COALESCE(s.status, ''))) = 'aktif'
                                 AND LOWER(TRIM(COALESCE(t.jenis_nilai, 'nominal'))) = 'nominal'
                            THEN COALESCE(t.nominal_per_siswa, 0)
                            ELSE 0
                        END
                    ), 0) AS total_terserap
              FROM scholarship_types t
              LEFT JOIN scholarship_recipients r ON r.type_id = t.id
                 ${scope.scoped ? ' AND r.branch_id = ? ' : ''}
                 AND (${periodWhere})
              LEFT JOIN students s ON s.id = r.student_id
              LEFT JOIN payments p ON p.id = r.payment_id
              GROUP BY t.id
             ORDER BY total_terserap DESC, total_penerima DESC`,
            [...scope.params, ...periodParams]
        );

        const [planRows] = await db.query(
            `SELECT
                COALESCE(SUM(sp.target_recipients), 0) AS target_recipients,
                COALESCE(SUM(sp.target_nominal), 0) AS target_nominal
             FROM scholarship_plans sp
             WHERE (${planPeriodWhere}) ${scope.scoped ? ' AND sp.branch_id = ? ' : ''} AND COALESCE(sp.is_active, 1) = 1`,
            [...planPeriodParams, ...scope.params]
        );

        const [planByProgramRows] = await db.query(
            `SELECT
                t.id,
                t.nama_beasiswa,
                COALESCE(SUM(sp.target_recipients), 0) AS target_recipients,
                COALESCE(SUM(sp.target_nominal), 0) AS target_nominal
             FROM scholarship_types t
             LEFT JOIN scholarship_plans sp ON sp.type_id = t.id
               AND (${planPeriodWhere})
               AND COALESCE(sp.is_active, 1) = 1
               ${scope.scoped ? ' AND sp.branch_id = ? ' : ''}
             GROUP BY t.id, t.nama_beasiswa
             ORDER BY target_nominal DESC, target_recipients DESC`,
            [...planPeriodParams, ...scope.params]
        );

        res.json({
            success: true,
            period,
            kpi: {
                totalProgram: Number(kpiRows[0]?.total_program || 0),
                totalPenerima: Number(kpiRows[0]?.total_penerima || 0),
                totalPenerimaAktif: Number(kpiRows[0]?.total_penerima_aktif || 0),
                totalTerserap: Number(kpiRows[0]?.total_terserap || 0),
                targetPenerima: Number(planRows[0]?.target_recipients || 0),
                targetNominal: Number(planRows[0]?.target_nominal || 0)
            },
            byBranch: branchRows.map((r) => ({ ...r, total_penerima: Number(r.total_penerima || 0), total_terserap: Number(r.total_terserap || 0) })),
            byProgram: programRows.map((r) => ({ ...r, total_penerima: Number(r.total_penerima || 0), total_terserap: Number(r.total_terserap || 0) })),
            planByProgram: planByProgramRows.map((r) => ({ ...r, target_recipients: Number(r.target_recipients || 0), target_nominal: Number(r.target_nominal || 0) }))
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/scholarships/export', async (req, res) => {
    try {
        if (!ensureBranchForAdmin(req, res)) return;
        await ensureScholarshipPlanTable(db);
        await ensureScholarshipSchema(db);
        const scope = getScope(req);
        const reportRaw = String(req.query.report || 'realisasi_operasional').toLowerCase();
        const reportType = ['rekap', 'rencana'].includes(reportRaw) ? reportRaw : 'realisasi';
        const realisasiMode =
            reportRaw === 'realisasi_audit' || String(req.query.mode || '').toLowerCase() === 'audit'
                ? 'audit'
                : 'operasional';
        const period = getPeriodConfig(req.query);
        const periodWhere = period.months
            .map(() => '(COALESCE(r.period_month, MONTH(r.tanggal_terima)) = ? AND COALESCE(r.period_year, YEAR(r.tanggal_terima)) = ?)')
            .join(' OR ');
        const periodParams = period.months.flatMap((x) => [x.month, x.year]);
        const planPeriodWhere = period.months.map(() => '(sp.target_month = ? AND sp.target_year = ?)').join(' OR ');
        const planPeriodParams = period.months.flatMap((x) => [x.month, x.year]);
        let rows = [];

        if (reportType === 'rekap') {
            const [dataRows] = await db.query(
                `SELECT
                    r.period_year,
                    r.period_month,
                    t.nama_beasiswa,
                    COUNT(DISTINCT COALESCE(CAST(r.student_id AS CHAR), CONCAT('NIS:', r.nis))) AS total_penerima,
                    COALESCE(SUM(p.jumlah_bayar), 0) AS total_nominal
                 FROM scholarship_recipients r
                 JOIN scholarship_types t ON t.id = r.type_id
                 LEFT JOIN payments p ON p.id = r.payment_id
                 WHERE (${periodWhere}) ${scope.scoped ? ' AND r.branch_id = ? ' : ''}
                 GROUP BY r.period_year, r.period_month, t.nama_beasiswa
                 ORDER BY r.period_year DESC, r.period_month DESC, t.nama_beasiswa ASC`,
                [...periodParams, ...scope.params]
            );
            rows = dataRows.map((r) => ({
                periode: `${r.period_month}/${r.period_year}`,
                program: r.nama_beasiswa,
                jumlah_penerima: Number(r.total_penerima || 0),
                total_nominal: Number(r.total_nominal || 0)
            }));
        } else if (reportType === 'rencana') {
            const [dataRows] = await db.query(
                `SELECT
                    sp.target_year,
                    sp.target_month,
                    t.nama_beasiswa,
                    b.nama_cabang,
                    sp.target_recipients,
                    sp.target_nominal,
                    sp.notes
                 FROM scholarship_plans sp
                 JOIN scholarship_types t ON t.id = sp.type_id
                 LEFT JOIN branches b ON b.id = sp.branch_id
                 WHERE (${planPeriodWhere}) ${scope.scoped ? ' AND sp.branch_id = ? ' : ''}
                 ORDER BY sp.target_year DESC, sp.target_month DESC, t.nama_beasiswa ASC`,
                [...planPeriodParams, ...scope.params]
            );
            rows = dataRows.map((r) => ({
                periode: `${r.target_month}/${r.target_year}`,
                program: r.nama_beasiswa,
                cabang: r.nama_cabang || '-',
                target_penerima: Number(r.target_recipients || 0),
                target_nominal: Number(r.target_nominal || 0),
                catatan: r.notes || ''
            }));
        } else {
            const realisasiFilter =
                realisasiMode === 'audit'
                    ? ''
                    : " AND r.is_operational_active = 1 AND LOWER(TRIM(COALESCE(s.status, ''))) = 'aktif' ";
            const [dataRows] = await db.query(
                `SELECT t.nama_beasiswa, r.nama_siswa, r.nis, r.kelas,
                        COALESCE(s.status, r.student_status_snapshot, '-') AS status_siswa,
                        r.student_status_snapshot,
                        r.tanggal_terima, p.jumlah_bayar, b.nama_cabang
                 FROM scholarship_recipients r
                 JOIN scholarship_types t ON t.id = r.type_id
                 LEFT JOIN students s ON s.id = r.student_id
                 LEFT JOIN payments p ON p.id = r.payment_id
                 LEFT JOIN branches b ON b.id = r.branch_id
                 WHERE (${periodWhere})
                   ${scope.scoped ? ' AND r.branch_id = ? ' : ''}
                   ${realisasiFilter}
                 ORDER BY t.nama_beasiswa ASC, r.tanggal_terima DESC`,
                [...periodParams, ...scope.params]
            );
            rows = dataRows.map((r) => ({
                program: r.nama_beasiswa,
                nama_siswa: r.nama_siswa,
                nis: r.nis,
                kelas: r.kelas,
                status_siswa: r.status_siswa || '-',
                status_snapshot: r.student_status_snapshot || '-',
                tanggal_terima: r.tanggal_terima,
                nominal_terserap: Number(r.jumlah_bayar || 0),
                cabang: r.nama_cabang || '-'
            }));
        }
        res.json({
            success: true,
            report: reportType === 'realisasi' ? `realisasi_${realisasiMode}` : reportType,
            report_label:
                reportType === 'realisasi'
                    ? `Realisasi ${realisasiMode === 'audit' ? 'Audit (Semua Status)' : 'Operasional (Siswa Aktif)'}`
                    : reportType === 'rekap'
                        ? 'Rekap'
                        : 'Rencana',
            period,
            filters: {
                student_scope: reportType === 'realisasi' ? (realisasiMode === 'audit' ? 'semua_status' : 'aktif_saja') : null,
                generated_at: new Date().toISOString()
            },
            rows
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/scholarships/plans', async (req, res) => {
    try {
        if (!ensureBranchForAdmin(req, res)) return;
        await ensureScholarshipPlanTable(db);
        const scope = getScope(req);
        const period = getPeriodConfig(req.query);
        const wherePeriod = period.months.map(() => '(sp.target_month = ? AND sp.target_year = ?)').join(' OR ');
        const params = [...period.months.flatMap((x) => [x.month, x.year]), ...scope.params];
        const [rows] = await db.query(
            `SELECT sp.id, sp.type_id, t.nama_beasiswa, sp.branch_id, b.nama_cabang, sp.target_month, sp.target_year, sp.target_recipients, sp.target_nominal, sp.notes, sp.is_active
             FROM scholarship_plans sp
             JOIN scholarship_types t ON t.id = sp.type_id
             LEFT JOIN branches b ON b.id = sp.branch_id
             WHERE (${wherePeriod}) ${scope.scoped ? ' AND sp.branch_id = ? ' : ''}
             ORDER BY sp.target_year DESC, sp.target_month DESC, t.nama_beasiswa ASC`,
            params
        );
        res.json({ success: true, period, rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/scholarships/plans', async (req, res) => {
    try {
        if (!ensureNotSuperAdminReadOnly(req, res)) return;
        if (!ensureBranchForAdmin(req, res)) return;
        await ensureScholarshipPlanTable(db);
        const scope = getScope(req);
        const {
            type_id,
            target_month,
            target_year,
            target_recipients = 0,
            target_nominal = 0,
            notes = null,
            is_active = 1
        } = req.body;
        const month = Number(target_month);
        const year = Number(target_year);
        const recipients = Number(target_recipients);
        const nominal = Number(target_nominal);
        if (!Number.isFinite(Number(type_id)) || Number(type_id) <= 0) {
            return res.status(400).json({ success: false, message: 'Program beasiswa wajib dipilih.' });
        }
        if (!Number.isFinite(month) || month < 1 || month > 12) {
            return res.status(400).json({ success: false, message: 'Bulan target tidak valid.' });
        }
        if (!Number.isFinite(year) || year < 2000 || year > 3000) {
            return res.status(400).json({ success: false, message: 'Tahun target tidak valid.' });
        }
        if (!Number.isFinite(recipients) || recipients < 0) {
            return res.status(400).json({ success: false, message: 'Target penerima tidak valid.' });
        }
        if (!Number.isFinite(nominal) || nominal < 0) {
            return res.status(400).json({ success: false, message: 'Target nominal tidak valid.' });
        }

        const [dupRows] = await db.query(
            `SELECT id FROM scholarship_plans
             WHERE type_id = ?
               AND target_month = ?
               AND target_year = ?
               AND branch_id <=> ?
             LIMIT 1`,
            [Number(type_id), month, year, scope.branchId || null]
        );
        if (dupRows.length) {
            return res.status(400).json({ success: false, message: 'Rencana periode ini sudah ada untuk program yang sama.' });
        }

        await db.query(
            `INSERT INTO scholarship_plans
             (type_id, branch_id, target_month, target_year, target_recipients, target_nominal, notes, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                Number(type_id),
                scope.branchId || null,
                month,
                year,
                Math.round(recipients),
                nominal,
                notes ? String(notes).trim() : null,
                Number(is_active) === 1 ? 1 : 0
            ]
        );
        res.json({ success: true, message: 'Rencana beasiswa berhasil disimpan.' });
    } catch (err) {
        if (err?.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, message: 'Rencana periode ini sudah ada untuk program yang sama.' });
        }
        res.status(500).json({ success: false, message: err.message });
    }
});

router.put('/scholarships/plans/:id', async (req, res) => {
    try {
        if (!ensureNotSuperAdminReadOnly(req, res)) return;
        if (!ensureBranchForAdmin(req, res)) return;
        await ensureScholarshipPlanTable(db);
        const scope = getScope(req);
        const planId = Number(req.params.id);
        if (!Number.isFinite(planId) || planId <= 0) {
            return res.status(400).json({ success: false, message: 'ID rencana tidak valid.' });
        }
        const {
            type_id,
            target_month,
            target_year,
            target_recipients = 0,
            target_nominal = 0,
            notes = null,
            is_active = 1
        } = req.body;
        const month = Number(target_month);
        const year = Number(target_year);
        const recipients = Number(target_recipients);
        const nominal = Number(target_nominal);
        if (!Number.isFinite(Number(type_id)) || Number(type_id) <= 0) {
            return res.status(400).json({ success: false, message: 'Program beasiswa wajib dipilih.' });
        }
        if (!Number.isFinite(month) || month < 1 || month > 12) {
            return res.status(400).json({ success: false, message: 'Bulan target tidak valid.' });
        }
        if (!Number.isFinite(year) || year < 2000 || year > 3000) {
            return res.status(400).json({ success: false, message: 'Tahun target tidak valid.' });
        }

        const [existRows] = await db.query(
            `SELECT id FROM scholarship_plans WHERE id = ? ${scope.scoped ? ' AND branch_id = ? ' : ''} LIMIT 1`,
            scope.scoped ? [planId, scope.branchId] : [planId]
        );
        if (!existRows.length) return res.status(404).json({ success: false, message: 'Rencana tidak ditemukan.' });

        await db.query(
            `UPDATE scholarship_plans
             SET type_id = ?, target_month = ?, target_year = ?, target_recipients = ?, target_nominal = ?, notes = ?, is_active = ?
             WHERE id = ? ${scope.scoped ? ' AND branch_id = ? ' : ''}`,
            scope.scoped
                ? [Number(type_id), month, year, Math.max(0, Math.round(recipients)), Math.max(0, nominal), notes ? String(notes).trim() : null, Number(is_active) === 1 ? 1 : 0, planId, scope.branchId]
                : [Number(type_id), month, year, Math.max(0, Math.round(recipients)), Math.max(0, nominal), notes ? String(notes).trim() : null, Number(is_active) === 1 ? 1 : 0, planId]
        );
        res.json({ success: true, message: 'Rencana beasiswa diperbarui.' });
    } catch (err) {
        if (err?.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, message: 'Rencana periode ini sudah ada untuk program yang sama.' });
        }
        res.status(500).json({ success: false, message: err.message });
    }
});

router.delete('/scholarships/plans/:id', async (req, res) => {
    try {
        if (!ensureNotSuperAdminReadOnly(req, res)) return;
        if (!ensureBranchForAdmin(req, res)) return;
        await ensureScholarshipPlanTable(db);
        const scope = getScope(req);
        const planId = Number(req.params.id);
        if (!Number.isFinite(planId) || planId <= 0) {
            return res.status(400).json({ success: false, message: 'ID rencana tidak valid.' });
        }
        const [result] = await db.query(
            `DELETE FROM scholarship_plans WHERE id = ? ${scope.scoped ? ' AND branch_id = ? ' : ''}`,
            scope.scoped ? [planId, scope.branchId] : [planId]
        );
        if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Rencana tidak ditemukan.' });
        res.json({ success: true, message: 'Rencana beasiswa dihapus.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
