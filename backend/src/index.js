require('dotenv').config();
const app = require('./app');
const pool = require('./db');
const { ensureAdminUser } = require('./services/authService');

const port = process.env.PORT || 4000;

const server = app.listen(port, () => {
  console.log(`API running on http://localhost:${port}`);
});

ensureAdminUser().catch((err) => {
  console.error('Failed to ensure admin user', err);
});

server.keepAliveTimeout = Number(process.env.HTTP_KEEP_ALIVE_TIMEOUT_MS || 65000);
server.headersTimeout = Number(process.env.HTTP_HEADERS_TIMEOUT_MS || 66000);
server.requestTimeout = Number(process.env.HTTP_REQUEST_TIMEOUT_MS || 120000);

const shutdown = async () => {
  try {
    await new Promise(resolve => server.close(resolve));
    await pool.end();
  } finally {
    process.exit(0);
  }
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection', err);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception', err);
  shutdown();
});
