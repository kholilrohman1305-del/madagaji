const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const mysql = require('mysql2');
const db = require('../../db');

const DEFAULT_BACKUP_DIR = path.join(__dirname, '..', '..', 'backups');
const configuredBackupDir = (
    process.env.SKS_GOOGLE_DRIVE_BACKUP_DIR ||
    process.env.GOOGLE_DRIVE_BACKUP_DIR ||
    process.env.SKS_BACKUP_DIR ||
    ''
).trim();
const BACKUP_DIR = configuredBackupDir
    ? path.resolve(configuredBackupDir)
    : DEFAULT_BACKUP_DIR;
const MAX_BACKUPS = 3;
const INTERVAL_MS = 8 * 60 * 60 * 1000; // 8 jam
let generatingPromise = null;
let schedulerStarted = false;

function envTrue(v) {
    return ['1', 'true', 'yes', 'on'].includes(String(v || '').trim().toLowerCase());
}

function isGoogleDriveUploadEnabled() {
    return envTrue(process.env.SKS_GOOGLE_DRIVE_UPLOAD_ENABLED);
}

function isLocalBackupEnabled() {
    const raw = String(process.env.SKS_BACKUP_LOCAL_ENABLED || '').trim().toLowerCase();
    if (!raw) return true;
    return ['1', 'true', 'yes', 'on'].includes(raw);
}

function isDriveOnlyMode() {
    return isGoogleDriveUploadEnabled() && !isLocalBackupEnabled();
}

function isGoogleDriveOAuthEnabled() {
    return envTrue(process.env.SKS_GOOGLE_DRIVE_OAUTH_ENABLED);
}

function hasGoogleDriveOAuthConfig() {
    const clientId = String(process.env.SKS_GOOGLE_DRIVE_CLIENT_ID || '').trim();
    const clientSecret = String(process.env.SKS_GOOGLE_DRIVE_CLIENT_SECRET || '').trim();
    const refreshToken = String(process.env.SKS_GOOGLE_DRIVE_REFRESH_TOKEN || '').trim();
    return Boolean(clientId && clientSecret && refreshToken);
}

async function createGoogleDriveClient() {
    const folderId = String(process.env.SKS_GOOGLE_DRIVE_FOLDER_ID || '').trim();
    if (!folderId) {
        throw new Error('Google Drive belum terkonfigurasi. Set SKS_GOOGLE_DRIVE_FOLDER_ID.');
    }

    let google;
    try {
        ({ google } = require('googleapis'));
    } catch {
        throw new Error('Dependency "googleapis" belum terpasang. Jalankan: npm i googleapis');
    }

    const useOAuth = isGoogleDriveOAuthEnabled() || hasGoogleDriveOAuthConfig();
    let authClient;

    if (useOAuth) {
        const clientId = String(process.env.SKS_GOOGLE_DRIVE_CLIENT_ID || '').trim();
        const clientSecret = String(process.env.SKS_GOOGLE_DRIVE_CLIENT_SECRET || '').trim();
        const refreshToken = String(process.env.SKS_GOOGLE_DRIVE_REFRESH_TOKEN || '').trim();
        if (!clientId || !clientSecret || !refreshToken) {
            throw new Error('OAuth Google Drive belum lengkap. Set SKS_GOOGLE_DRIVE_CLIENT_ID, SKS_GOOGLE_DRIVE_CLIENT_SECRET, SKS_GOOGLE_DRIVE_REFRESH_TOKEN.');
        }
        const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
        oauth2Client.setCredentials({ refresh_token: refreshToken });
        authClient = oauth2Client;
    } else {
        const keyFile = String(process.env.SKS_GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON || '').trim();
        if (!keyFile) {
            throw new Error('Google Drive belum terkonfigurasi. Set SKS_GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON atau aktifkan OAuth Google Drive.');
        }
        const resolvedKeyFile = path.resolve(keyFile);
        if (!fs.existsSync(resolvedKeyFile)) {
            throw new Error(`File service account tidak ditemukan: ${resolvedKeyFile}`);
        }
        const auth = new google.auth.GoogleAuth({
            keyFile: resolvedKeyFile,
            scopes: ['https://www.googleapis.com/auth/drive.file']
        });
        authClient = await auth.getClient();
    }

    return {
        folderId,
        drive: google.drive({ version: 'v3', auth: authClient })
    };
}

async function uploadBackupToGoogleDrive(localPath, filename) {
    if (!isGoogleDriveUploadEnabled()) return null;
    const { drive, folderId } = await createGoogleDriveClient();
    const response = await drive.files.create({
        requestBody: {
            name: filename,
            parents: [folderId],
            mimeType: 'application/sql'
        },
        media: {
            mimeType: 'application/sql',
            body: fs.createReadStream(localPath)
        },
        supportsAllDrives: true,
        fields: 'id,name,webViewLink'
    });
    return response?.data || null;
}

async function listBackupsFromDrive() {
    const { drive, folderId } = await createGoogleDriveClient();
    const response = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false and name contains 'sks_backup_' and name contains '.sql'`,
        orderBy: 'modifiedTime desc',
        pageSize: 100,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        fields: 'files(id,name,size,modifiedTime)'
    });
    const files = response?.data?.files || [];
    return files.map((f) => ({
        id: f.id,
        filename: f.name,
        path: null,
        size: Number(f.size || 0),
        updatedAt: new Date(f.modifiedTime),
        updatedAtIso: new Date(f.modifiedTime).toISOString()
    }));
}

async function removeBackupsFromDrive(items) {
    if (!items?.length) return;
    const { drive } = await createGoogleDriveClient();
    await Promise.all(items.map((item) => drive.files.delete({ fileId: item.id, supportsAllDrives: true }).catch(() => {})));
}

async function findBackupIdInDriveByName(fileName) {
    const { drive, folderId } = await createGoogleDriveClient();
    const safeName = String(fileName || '').trim();
    if (!safeName) return null;
    const response = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false and name = '${safeName.replace(/'/g, "\\'")}'`,
        orderBy: 'modifiedTime desc',
        pageSize: 1,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        fields: 'files(id,name)'
    });
    return response?.data?.files?.[0]?.id || null;
}

async function downloadBackupStreamFromDrive(fileName) {
    const fileId = await findBackupIdInDriveByName(fileName);
    if (!fileId) return null;
    const { drive } = await createGoogleDriveClient();
    const response = await drive.files.get(
        { fileId, alt: 'media', supportsAllDrives: true },
        { responseType: 'stream' }
    );
    return response?.data || null;
}

function nowStamp(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return `${y}${m}${d}_${hh}${mm}${ss}`;
}

async function ensureDir() {
    await fsp.mkdir(BACKUP_DIR, { recursive: true });
}

function sqlValue(v) {
    if (v && typeof v === 'object' && !Buffer.isBuffer(v) && !(v instanceof Date)) {
        return mysql.escape(JSON.stringify(v));
    }
    if (typeof v === 'bigint') {
        return mysql.escape(v.toString());
    }
    return mysql.escape(v);
}

async function getDatabaseName() {
    const [rows] = await db.query('SELECT DATABASE() AS db_name');
    return rows[0]?.db_name || 'database';
}

async function getTableNames() {
    const [rows] = await db.query('SHOW TABLES');
    if (!rows.length) return [];
    const firstKey = Object.keys(rows[0])[0];
    return rows.map((r) => r[firstKey]).filter(Boolean);
}

async function dumpTableSql(tableName) {
    const parts = [];
    const [createRows] = await db.query('SHOW CREATE TABLE ??', [tableName]);
    const createSql = createRows[0]?.['Create Table'];
    if (!createSql) return '';

    parts.push(`\n-- ----------------------------`);
    parts.push(`-- Table structure for \`${tableName}\``);
    parts.push(`-- ----------------------------`);
    parts.push(`DROP TABLE IF EXISTS \`${tableName}\`;`);
    parts.push(`${createSql};\n`);

    const [rows] = await db.query('SELECT * FROM ??', [tableName]);
    if (!rows.length) return parts.join('\n');

    const cols = Object.keys(rows[0]);
    parts.push(`-- ----------------------------`);
    parts.push(`-- Records of \`${tableName}\``);
    parts.push(`-- ----------------------------`);
    for (const row of rows) {
        const values = cols.map((col) => sqlValue(row[col])).join(', ');
        parts.push(`INSERT INTO \`${tableName}\` (\`${cols.join('`, `')}\`) VALUES (${values});`);
    }
    return parts.join('\n');
}

async function cleanupOldBackups() {
    const list = isDriveOnlyMode() ? await listBackupsFromDrive() : await listBackups();
    if (list.length <= MAX_BACKUPS) return;
    const toDelete = list.slice(MAX_BACKUPS);
    if (isDriveOnlyMode()) {
        await removeBackupsFromDrive(toDelete);
    } else {
        await Promise.all(toDelete.map((item) => fsp.unlink(item.path).catch(() => {})));
    }
}

async function generateBackup() {
    if (generatingPromise) return generatingPromise;
    generatingPromise = (async () => {
        const saveLocal = isLocalBackupEnabled();
        if (saveLocal) await ensureDir();

        const tempDir = saveLocal ? BACKUP_DIR : path.join(os.tmpdir(), 'sks-backup-temp');
        await fsp.mkdir(tempDir, { recursive: true });
        const dbName = await getDatabaseName();
        const tables = await getTableNames();
        const lines = [];
        lines.push(`-- SKS SQL Backup`);
        lines.push(`-- Database: ${dbName}`);
        lines.push(`-- Generated at: ${new Date().toISOString()}`);
        lines.push(`SET NAMES utf8mb4;`);
        lines.push(`SET FOREIGN_KEY_CHECKS = 0;`);

        for (const table of tables) {
            const sql = await dumpTableSql(table);
            if (sql) lines.push(sql);
        }

        lines.push(`\nSET FOREIGN_KEY_CHECKS = 1;`);
        const filename = `sks_backup_${nowStamp()}.sql`;
        const filePath = path.join(tempDir, filename);
        await fsp.writeFile(filePath, `${lines.join('\n')}\n`, 'utf8');
        const driveFile = await uploadBackupToGoogleDrive(filePath, filename);
        if (!saveLocal) {
            await fsp.unlink(filePath).catch(() => {});
        }
        await cleanupOldBackups();
        return { filename, path: saveLocal ? filePath : null, driveFile };
    })();

    try {
        return await generatingPromise;
    } finally {
        generatingPromise = null;
    }
}

async function listBackups() {
    if (isDriveOnlyMode()) {
        return listBackupsFromDrive();
    }
    await ensureDir();
    const files = await fsp.readdir(BACKUP_DIR);
    const sqlFiles = files.filter((f) => f.toLowerCase().endsWith('.sql'));
    const stats = await Promise.all(
        sqlFiles.map(async (name) => {
            const p = path.join(BACKUP_DIR, name);
            const s = await fsp.stat(p);
            return {
                filename: name,
                path: p,
                size: s.size,
                updatedAt: s.mtime,
                updatedAtIso: s.mtime.toISOString()
            };
        })
    );
    stats.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    return stats;
}

async function ensureLatestBackup() {
    const list = await listBackups();
    if (!list.length) {
        await generateBackup();
        await cleanupOldBackups();
        return;
    }
    const latest = list[0];
    const age = Date.now() - latest.updatedAt.getTime();
    if (age >= INTERVAL_MS) {
        await generateBackup();
    }
    await cleanupOldBackups();
}

function startBackupScheduler() {
    if (schedulerStarted) return;
    schedulerStarted = true;
    ensureLatestBackup().catch((e) => console.error('[backup] init failed:', e.message));
    setInterval(() => {
        generateBackup().catch((e) => console.error('[backup] scheduled failed:', e.message));
    }, INTERVAL_MS);
}

function resolveBackupPath(fileName) {
    if (isDriveOnlyMode()) return null;
    const safe = path.basename(String(fileName || ''));
    if (!safe || safe !== fileName || !safe.toLowerCase().endsWith('.sql')) return null;
    return path.join(BACKUP_DIR, safe);
}

module.exports = {
    BACKUP_DIR,
    MAX_BACKUPS,
    INTERVAL_MS,
    startBackupScheduler,
    ensureLatestBackup,
    generateBackup,
    listBackups,
    resolveBackupPath,
    isDriveOnlyMode,
    downloadBackupStreamFromDrive
};
