const db = require('../../db');

let ensured = false;

const SENSITIVE_KEYS = new Set([
    'password',
    'new_password',
    'current_password',
    'confirm_password',
    'pin',
    'old_pin',
    'confirm_pin',
    'pinTransaksi'
]);

function sanitizeDetail(detail) {
    if (!detail || typeof detail !== 'object') return detail;
    if (Array.isArray(detail)) return detail.map(sanitizeDetail);
    const out = {};
    Object.keys(detail).forEach((key) => {
        if (SENSITIVE_KEYS.has(key)) {
            out[key] = '***';
            return;
        }
        const val = detail[key];
        if (val && typeof val === 'object') out[key] = sanitizeDetail(val);
        else out[key] = val;
    });
    return out;
}

async function ensureAuditLogTable() {
    if (ensured) return;
    await db.query(`
        CREATE TABLE IF NOT EXISTS audit_logs (
            id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            actor_user_id INT NULL,
            actor_role VARCHAR(20) NULL,
            actor_username VARCHAR(100) NULL,
            branch_id INT NULL,
            action VARCHAR(80) NOT NULL,
            entity_type VARCHAR(80) NULL,
            entity_id VARCHAR(80) NULL,
            method VARCHAR(10) NULL,
            path VARCHAR(255) NULL,
            status_code INT NULL,
            ip_address VARCHAR(64) NULL,
            user_agent VARCHAR(255) NULL,
            detail_json JSON NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_audit_actor (actor_user_id, actor_role),
            INDEX idx_audit_branch (branch_id),
            INDEX idx_audit_action (action),
            INDEX idx_audit_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
    ensured = true;
}

async function writeAuditLog(entry = {}) {
    try {
        await ensureAuditLogTable();
        const safeDetail = sanitizeDetail(entry.detail || null);
        await db.query(
            `INSERT INTO audit_logs
             (actor_user_id, actor_role, actor_username, branch_id, action, entity_type, entity_id, method, path, status_code, ip_address, user_agent, detail_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                entry.actor_user_id || null,
                entry.actor_role || null,
                entry.actor_username || null,
                entry.branch_id || null,
                entry.action || 'UNKNOWN',
                entry.entity_type || null,
                entry.entity_id || null,
                entry.method || null,
                entry.path || null,
                entry.status_code || null,
                entry.ip_address || null,
                entry.user_agent || null,
                safeDetail ? JSON.stringify(safeDetail) : null
            ]
        );
        await db.query(`
            DELETE FROM audit_logs
            WHERE id NOT IN (
                SELECT id FROM (
                    SELECT id
                    FROM audit_logs
                    ORDER BY id DESC
                    LIMIT 20
                ) AS keep_rows
            )
        `);
    } catch (_) {
        // ignore audit logging errors to avoid breaking main flow
    }
}

module.exports = {
    ensureAuditLogTable,
    writeAuditLog,
    sanitizeDetail
};
