const express = require('express');
const path = require('path');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const requestId = require('./middleware/requestId');
const requestLogger = require('./middleware/requestLogger');
const errorHandler = require('./middleware/errorHandler');
const { authRequired } = require('./middleware/auth');

const dashboardRoutes = require('./routes/dashboard');
const masterRoutes = require('./routes/master');
const attendanceRoutes = require('./routes/attendance');
const scheduleRoutes = require('./routes/schedule');
const payrollRoutes = require('./routes/payroll');
const schedulerRoutes = require('./routes/scheduler');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');

const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet());
app.use(compression({ level: Number(process.env.HTTP_COMPRESSION_LEVEL || 6) }));
app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
  credentials: true
}));
app.use(cookieParser());
app.use(express.json({ limit: process.env.HTTP_JSON_LIMIT || '2mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(requestId);
app.use(requestLogger);

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);

app.use('/api', authRequired);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/master', masterRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/scheduler', schedulerRoutes);
app.use('/api/users', userRoutes);

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.use(errorHandler);

module.exports = app;
