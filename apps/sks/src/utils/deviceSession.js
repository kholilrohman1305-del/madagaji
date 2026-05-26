const db = require('../../db');

let ensured = false;

async function ensureDeviceSessionTable() {
    if (ensured) return;
    await db.query(`
        CREATE TABLE IF NOT EXISTS device_sessions (
            id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            session_id VARCHAR(128) NULL,
            user_id INT NOT NULL,
            role VARCHAR(20) NOT NULL,
            username VARCHAR(100) NULL,
            branch_id INT NULL,
            ip_address VARCHAR(64) NULL,
            user_agent VARCHAR(255) NULL,
            login_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            logout_reason VARCHAR(50) NULL,
            INDEX idx_device_user (user_id, role, is_active),
            INDEX idx_device_branch (branch_id, is_active),
            INDEX idx_device_seen (last_seen_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
    ensured = true;
}

async function createDeviceSession({ sessionId, userId, role, username, branchId, ipAddress, userAgent }) {
    await ensureDeviceSessionTable();
    const [result] = await db.query(
        `INSERT INTO device_sessions
         (session_id, user_id, role, username, branch_id, ip_address, user_agent, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
        [sessionId || null, userId, role, username || null, branchId || null, ipAddress || null, userAgent || null]
    );
    await db.query(`
        DELETE FROM device_sessions
        WHERE id NOT IN (
            SELECT id FROM (
                SELECT id
                FROM device_sessions
                ORDER BY id DESC
                LIMIT 20
            ) AS keep_rows
        )
    `);
    return Number(result.insertId || 0);
}

async function touchDeviceSession(deviceSessionId, sessionId = null) {
    await ensureDeviceSessionTable();
    if (!deviceSessionId) return;
    await db.query(
        `UPDATE device_sessions
         SET session_id = COALESCE(?, session_id),
             last_seen_at = NOW()
         WHERE id = ? AND is_active = 1`,
        [sessionId, deviceSessionId]
    );
}

async function getDeviceSession(deviceSessionId) {
    await ensureDeviceSessionTable();
    const [rows] = await db.query('SELECT * FROM device_sessions WHERE id = ? LIMIT 1', [deviceSessionId]);
    return rows[0] || null;
}

async function deactivateDeviceSession(deviceSessionId, reason = 'manual_logout') {
    await ensureDeviceSessionTable();
    if (!deviceSessionId) return;
    await db.query(
        `UPDATE device_sessions
         SET is_active = 0,
             logout_reason = ?
         WHERE id = ?`,
        [reason, deviceSessionId]
    );
}

module.exports = {
    ensureDeviceSessionTable,
    createDeviceSession,
    touchDeviceSession,
    getDeviceSession,
    deactivateDeviceSession
};
