const express = require('express');
const db = require('../../db');
const { isSuperAdmin } = require('../utils/branchScope');
const { ensureDeviceSessionTable, deactivateDeviceSession } = require('../utils/deviceSession');
const { ensureAuditLogTable } = require('../utils/auditLog');

const router = express.Router();

function getRole(req) {
    return String(req.session?.userRole || '');
}

function getSessionUserId(req) {
    if (getRole(req) === 'siswa') return Number(req.session?.studentId || 0);
    return Number(req.session?.adminId || 0);
}

router.get('/device-sessions', async (req, res) => {
    try {
        await ensureDeviceSessionTable();
        const role = getRole(req);
        const userId = getSessionUserId(req);
        const branchId = Number(req.session?.branchId || 0);
        const filters = [];
        const params = [];

        if (isSuperAdmin(req)) {
            const roleFilter = String(req.query.role || '').trim();
            const userFilter = String(req.query.user_id || '').trim();
            const branchFilter = String(req.query.branch_id || '').trim();
            const activeFilter = String(req.query.is_active || '').trim();
            if (roleFilter) {
                filters.push('role = ?');
                params.push(roleFilter);
            }
            if (userFilter) {
                filters.push('user_id = ?');
                params.push(Number(userFilter));
            }
            if (branchFilter) {
                filters.push('branch_id = ?');
                params.push(Number(branchFilter));
            }
            if (activeFilter !== '') {
                filters.push('is_active = ?');
                params.push(Number(activeFilter) === 1 ? 1 : 0);
            }
        } else {
            filters.push('role = ?');
            params.push(role);
            filters.push('user_id = ?');
            params.push(userId);
            if (role === 'admin' && branchId > 0) {
                filters.push('branch_id = ?');
                params.push(branchId);
            }
        }

        const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
        const [rows] = await db.query(
            `SELECT id, role, user_id, username, branch_id, ip_address, user_agent, login_at, last_seen_at, is_active, logout_reason
             FROM device_sessions
             ${where}
             ORDER BY is_active DESC, last_seen_at DESC
             LIMIT 20`,
            params
        );
        res.json({ success: true, rows, current_device_session_id: Number(req.session?.deviceSessionId || 0) || null });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/device-sessions/:id/revoke', async (req, res) => {
    try {
        await ensureDeviceSessionTable();
        const targetId = Number(req.params.id || 0);
        if (!targetId) return res.status(400).json({ success: false, message: 'ID sesi tidak valid.' });

        const [rows] = await db.query('SELECT * FROM device_sessions WHERE id = ? LIMIT 1', [targetId]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'Sesi tidak ditemukan.' });
        const target = rows[0];

        const role = getRole(req);
        const userId = getSessionUserId(req);
        const branchId = Number(req.session?.branchId || 0);
        const canManageAll = isSuperAdmin(req);
        const ownSession = target.role === role && Number(target.user_id) === userId;
        const sameBranchAdmin = role === 'admin' && target.role === 'admin' && branchId > 0 && Number(target.branch_id) === branchId;

        if (!(canManageAll || ownSession || sameBranchAdmin)) {
            return res.status(403).json({ success: false, message: 'Tidak punya akses mencabut sesi ini.' });
        }

        await deactivateDeviceSession(targetId, 'revoked_by_user');
        if (Number(req.session?.deviceSessionId || 0) === targetId) {
            req.session.destroy(() => {});
        }
        res.json({ success: true, message: 'Sesi berhasil dicabut.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/audit-logs', async (req, res) => {
    try {
        await ensureAuditLogTable();
        const role = getRole(req);
        const branchId = Number(req.session?.branchId || 0);
        const actorUserId = Number(req.query.user_id || 0);
        const actorRole = String(req.query.role || '').trim();
        const targetBranch = Number(req.query.branch_id || 0);
        const action = String(req.query.action || '').trim();
        const dateFrom = String(req.query.date_from || '').trim();
        const dateTo = String(req.query.date_to || '').trim();
        const limit = Math.min(20, Math.max(1, Number(req.query.limit || 20)));

        const filters = [];
        const params = [];

        if (!isSuperAdmin(req)) {
            if (role === 'admin') {
                filters.push('(branch_id = ? OR branch_id IS NULL)');
                params.push(branchId);
            } else {
                filters.push('actor_user_id = ?');
                params.push(getSessionUserId(req));
                filters.push('actor_role = ?');
                params.push(role);
            }
        }

        if (actorUserId > 0) {
            filters.push('actor_user_id = ?');
            params.push(actorUserId);
        }
        if (actorRole) {
            filters.push('actor_role = ?');
            params.push(actorRole);
        }
        if (targetBranch > 0) {
            filters.push('branch_id = ?');
            params.push(targetBranch);
        }
        if (action) {
            filters.push('action = ?');
            params.push(action);
        }
        if (dateFrom) {
            filters.push('DATE(created_at) >= ?');
            params.push(dateFrom);
        }
        if (dateTo) {
            filters.push('DATE(created_at) <= ?');
            params.push(dateTo);
        }

        const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
        const [rows] = await db.query(
            `SELECT id, actor_user_id, actor_role, actor_username, branch_id, action, entity_type, entity_id, method, path, status_code, ip_address, user_agent, detail_json, created_at
             FROM audit_logs
             ${where}
             ORDER BY id DESC
             LIMIT ?`,
            [...params, limit]
        );
        res.json({ success: true, rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
