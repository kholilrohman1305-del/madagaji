const express = require('express');
const cors = require('cors');
const path = require('path');

const studentsRoutes = require('./routes/students.routes');
const classesRoutes = require('./routes/classes.routes');
const schoolYearsRoutes = require('./routes/school-years.routes');
const semestersRoutes = require('./routes/semesters.routes');
const importRoutes = require('./routes/import.routes');
const bulkRoutes = require('./routes/bulk.routes');
const templatesRoutes = require('./routes/templates.routes');
const teachersRoutes = require('./routes/teachers.routes');
const subjectsRoutes = require('./routes/subjects.routes');
const syncRoutes = require('./routes/sync.routes');
const auditRoutes = require('./routes/audit.routes');
const exportRoutes = require('./routes/export.routes');
const teacherTasksRoutes = require('./routes/teacher-tasks.routes');
const additionalTasksRoutes = require('./routes/additional-tasks.routes');
const studentAffairsRoutes = require('./routes/student-affairs.routes');
const pondokPesantrenRoutes = require('./routes/pondok-pesantren.routes');
const usersRoutes = require('./routes/users.routes');
const authRoutes = require('./routes/auth.routes');
const bukuIndukRoutes = require('./routes/buku-induk.routes');
const studentScoresRoutes = require('./routes/student-scores.routes');
const schoolSettingsRoutes = require('./routes/school-settings.routes');
const reportCardsRoutes = require('./routes/report-cards.routes');
const classSubjectSettingsRoutes = require('./routes/class-subject-settings.routes');
const recommendationsRoutes = require('./routes/recommendations.routes');
const extracurricularsRoutes = require('./routes/extracurriculars.routes');
const uploadsRoutes = require('./routes/uploads.routes');
const { UPLOAD_ROOT } = require('./controllers/uploads.controller');

function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/uploads/files', express.static(path.resolve(UPLOAD_ROOT)));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/students', studentsRoutes);
  app.use('/api/classes', classesRoutes);
  app.use('/api/school-years', schoolYearsRoutes);
  app.use('/api/semesters', semestersRoutes);
  app.use('/api/import', importRoutes);
  app.use('/api/bulk', bulkRoutes);
  app.use('/api/templates', templatesRoutes);
  app.use('/api/teachers', teachersRoutes);
  app.use('/api/teacher-tasks', teacherTasksRoutes);
  app.use('/api/additional-tasks', additionalTasksRoutes);
  app.use('/api/student-affairs', studentAffairsRoutes);
  app.use('/api/pondok-pesantren', pondokPesantrenRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/buku-induk', bukuIndukRoutes);
  app.use('/api/student-scores', studentScoresRoutes);
  app.use('/api/school-settings', schoolSettingsRoutes);
  app.use('/api/report-cards', reportCardsRoutes);
  app.use('/api/class-subject-settings', classSubjectSettingsRoutes);
  app.use('/api/recommendations', recommendationsRoutes);
  app.use('/api/extracurriculars', extracurricularsRoutes);
  app.use('/api/uploads', uploadsRoutes);
  app.use('/api/subjects', subjectsRoutes);
  app.use('/api/audit', auditRoutes);
  app.use('/api/export', exportRoutes);
  app.use('/sync', syncRoutes);

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  });

  return app;
}

if (require.main === module) {
  require('dotenv').config();
  const app = createApp();
  const port = process.env.PORT || 3001;
  app.listen(port, () => {
    console.log(`Backend running on port ${port}`);
  });
}

module.exports = { createApp };
