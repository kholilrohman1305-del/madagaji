const express = require('express');
const path = require('path');
const session = require('express-session');

const { requestLogger } = require('./middlewares/requestLogger');
const { errorHandler } = require('./middlewares/errorHandler');
const { requireAdmin } = require('./middlewares/requireAdmin');
const { securityHeaders } = require('./middlewares/securityHeaders');

const authRoutes = require('./routes/auth.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const settingsRoutes = require('./routes/settings.routes');
const studentsRoutes = require('./routes/students.routes');
const classesRoutes = require('./routes/classes.routes');
const scholarshipsRoutes = require('./routes/scholarships.routes');
const billingRoutes = require('./routes/billing.routes');
const usersRoutes = require('./routes/users.routes');
const backupRoutes = require('./routes/backup.routes');
const expensesRoutes = require('./routes/expenses.routes');
const mobileRoutes = require('./routes/mobile.routes');
const securityRoutes = require('./routes/security.routes');
const { ensureDeviceSessionTable, getDeviceSession, touchDeviceSession } = require('./utils/deviceSession');
const { writeAuditLog } = require('./utils/auditLog');
const { startBackupScheduler } = require('./services/backupService');

function createApp(options = {}) {
    const basePath = String(options.basePath || '').replace(/\/+$/, '');
    const withBase = (urlPath) => (basePath ? `${basePath}${urlPath}` : urlPath);
    const app = express();
    app.set('trust proxy', 1);
    app.disable('x-powered-by');

    // Body size limits: protect from accidental huge JSON payloads.
    app.use(express.json({ limit: '1mb' }));
    app.use(express.urlencoded({ extended: true, limit: '1mb' }));

    app.use(securityHeaders);

    const sessionSecret = process.env.SESSION_SECRET || 'dev_secret_change_me';
    if (process.env.NODE_ENV === 'production') {
        if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32 || sessionSecret === 'dev_secret_change_me') {
            throw new Error('SESSION_SECRET is required and must be strong in production');
        }
    }

    app.use(
        session({
            name: 'sks.sid',
            secret: sessionSecret,
            resave: false,
            saveUninitialized: false,
            cookie: {
                httpOnly: true,
                sameSite: 'lax',
                secure: process.env.NODE_ENV === 'production',
                maxAge: 8 * 60 * 60 * 1000
            }
        })
    );

    app.use(async (req, res, next) => {
        try {
            const hasSession = req.session && req.session.userRole && req.session.userId && req.session.deviceSessionId;
            if (!hasSession) return next();
            await ensureDeviceSessionTable();
            const device = await getDeviceSession(Number(req.session.deviceSessionId || 0));
            if (!device || Number(device.is_active) !== 1) {
                req.session.destroy(() => {});
                if (req.path.startsWith('/api')) {
                    return res.status(401).json({ success: false, message: 'Sesi perangkat tidak aktif. Silakan login kembali.' });
                }
                return res.redirect(withBase('/login.html'));
            }
            await touchDeviceSession(Number(req.session.deviceSessionId), req.sessionID || null);
            return next();
        } catch (_) {
            return next();
        }
    });

    // Serve static assets, but don't auto-serve index.html.
    app.use(express.static(path.join(__dirname, '..', 'public'), { index: false }));
    app.use(requestLogger);

    app.use((req, res, next) => {
        if (!req.path.startsWith('/api')) return next();
        if (['GET', 'HEAD', 'OPTIONS'].includes(String(req.method || '').toUpperCase())) return next();
        const started = Date.now();
        const originalJson = res.json.bind(res);
        res.json = (payload) => {
            const statusCode = res.statusCode || 200;
            writeAuditLog({
                actor_user_id: req.session?.userId || null,
                actor_role: req.session?.userRole || null,
                actor_username: req.session?.username || req.session?.adminUsername || null,
                branch_id: req.session?.branchId || null,
                action: `${req.method} ${req.path}`,
                entity_type: 'api',
                entity_id: null,
                method: req.method,
                path: req.path,
                status_code: statusCode,
                ip_address: req.ip || req.headers['x-forwarded-for'] || null,
                user_agent: req.headers['user-agent'] || null,
                detail: {
                    duration_ms: Date.now() - started,
                    body: req.body || null,
                    query: req.query || null,
                    success: payload?.success
                }
            });
            return originalJson(payload);
        };
        return next();
    });

    // Auth API (public)
    app.use('/api/auth', authRoutes);
    app.use('/api/mobile/v1', mobileRoutes);

    // API (protected)
    app.use('/api', requireAdmin, (req, res, next) => {
        const role = String(req.session?.userRole || '');
        const method = String(req.method || '').toUpperCase();
        const isReadMethod = method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
        const path = String(req.path || '');
        if (role === 'guru') {
            const allowGuruRead = [
                '/profile/me'
            ];
            const allowGuruReadByPattern = [
                /^\/expenses$/,
                /^\/expenses\/\d+\/items$/,
                /^\/expenses\/\d+\/receipt$/
            ];
            const allowGuruWrite = new Set([
                '/profile/account'
            ]);
            const allowGuruWriteByPattern = [
                { method: 'PUT', pattern: /^\/expenses\/\d+$/ }
            ];
            if (isReadMethod) {
                if (allowGuruRead.includes(path) || allowGuruReadByPattern.some((rule) => rule.test(path))) return next();
                return res.status(403).json({ success: false, message: 'Akun guru hanya dapat mengakses data pengeluaran yang menjadi tanggung jawabnya.' });
            }
            if (allowGuruWrite.has(path)) return next();
            if (allowGuruWriteByPattern.some((rule) => rule.method === method && rule.pattern.test(path))) return next();
            return res.status(403).json({ success: false, message: 'Akun guru tidak memiliki akses ubah data ini.' });
        }
        if (role !== 'wali_kelas') return next();

        const allowRead = [
            '/initial-data',
            '/settings',
            '/students',
            '/arrears',
            '/student/details',
            '/student/tunggakan_total',
            '/bills/student',
            '/bills/reconciliation',
            '/report/monthly',
            '/report/detail',
            '/report/detail/class-students',
            '/profile/me'
        ];
        const allowWrite = new Set([
            '/profile/account'
        ]);
        const allowReadByPattern = [
            /^\/expenses$/,
            /^\/expenses\/\d+\/items$/,
            /^\/expenses\/\d+\/receipt$/
        ];
        const allowWriteByPattern = [
            { method: 'PUT', pattern: /^\/expenses\/\d+$/ }
        ];

        if (isReadMethod) {
            if (allowRead.includes(path) || allowReadByPattern.some((rule) => rule.test(path))) return next();
            return res.status(403).json({ success: false, message: 'Akun wali kelas hanya dapat mengakses data kelas yang diizinkan.' });
        }

        if (method === 'PUT' && allowWrite.has(path)) return next();
        if (allowWriteByPattern.some((rule) => rule.method === method && rule.pattern.test(path))) return next();
        return res.status(403).json({ success: false, message: 'Akun wali kelas tidak memiliki akses ubah data ini.' });
    });
    app.use('/api', requireAdmin, dashboardRoutes);
    app.use('/api', requireAdmin, settingsRoutes);
    app.use('/api', requireAdmin, studentsRoutes);
    app.use('/api', requireAdmin, classesRoutes);
    app.use('/api', requireAdmin, scholarshipsRoutes);
    app.use('/api', requireAdmin, billingRoutes);
    app.use('/api', requireAdmin, usersRoutes);
    app.use('/api', requireAdmin, backupRoutes);
    app.use('/api', requireAdmin, expensesRoutes);
    app.use('/api', requireAdmin, securityRoutes);

    startBackupScheduler();

    // Entry points
    app.get('/', (req, res) => {
        if (req.session && (req.session.userRole === 'super_admin' || req.session.userRole === 'admin' || req.session.userRole === 'wali_kelas' || req.session.userRole === 'guru') && req.session.adminId) {
            return res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
        }
        if (req.session && req.session.userRole === 'siswa' && req.session.studentId) {
            return res.sendFile(path.join(__dirname, '..', 'public', 'student.html'));
        }
        return res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
    });
    app.get('/login.html', (req, res) => {
        if (req.session && req.session.userRole && req.session.userId) return res.redirect(withBase('/'));
        return res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
    });

    // SPA fallback (only when authenticated)
    app.get(/.*/, (req, res) => {
        if (req.session && (req.session.userRole === 'super_admin' || req.session.userRole === 'admin' || req.session.userRole === 'wali_kelas' || req.session.userRole === 'guru') && req.session.adminId) {
            return res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
        }
        if (req.session && req.session.userRole === 'siswa' && req.session.studentId) {
            return res.sendFile(path.join(__dirname, '..', 'public', 'student.html'));
        }
        return res.redirect(withBase('/login.html'));
    });

    app.use(errorHandler);
    return app;
}

module.exports = { createApp };
