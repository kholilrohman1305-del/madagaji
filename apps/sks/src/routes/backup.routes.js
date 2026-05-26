const express = require('express');
const fs = require('fs');
const {
    ensureLatestBackup,
    generateBackup,
    listBackups,
    resolveBackupPath,
    isDriveOnlyMode,
    downloadBackupStreamFromDrive,
    MAX_BACKUPS,
    INTERVAL_MS
} = require('../services/backupService');

const router = express.Router();

router.get('/backup/list', async (req, res) => {
    try {
        await ensureLatestBackup();
        const rows = await listBackups();
        res.json({
            success: true,
            max_backups: MAX_BACKUPS,
            interval_hours: INTERVAL_MS / (60 * 60 * 1000),
            rows: rows.map((r) => ({
                filename: r.filename,
                size: r.size,
                updated_at: r.updatedAtIso
            }))
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/backup/generate', async (req, res) => {
    try {
        const out = await generateBackup();
        const rows = await listBackups();
        res.json({
            success: true,
            message: 'Backup berhasil dibuat.',
            latest: out.filename,
            rows: rows.map((r) => ({
                filename: r.filename,
                size: r.size,
                updated_at: r.updatedAtIso
            }))
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/backup/download/:fileName', async (req, res) => {
    try {
        const fileName = String(req.params.fileName || '');
        const p = resolveBackupPath(fileName);
        if (p && fs.existsSync(p)) {
            return res.download(p, fileName);
        }

        if (isDriveOnlyMode()) {
            const stream = await downloadBackupStreamFromDrive(fileName);
            if (!stream) {
                return res.status(404).json({ success: false, message: 'File backup tidak ditemukan.' });
            }
            res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
            res.setHeader('Content-Type', 'application/sql');
            stream.on('error', () => {
                if (!res.headersSent) res.status(500).end();
            });
            stream.pipe(res);
            return;
        }

        return res.status(404).json({ success: false, message: 'File backup tidak ditemukan.' });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
