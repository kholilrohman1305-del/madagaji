const path = require('path');
const dotenv = require('dotenv');

dotenv.config({
  // Always load backend/.env even if process started from repo root/PM2.
  path: path.resolve(__dirname, '..', '.env')
});

// Optional fallback: auto-read child app envs when running in unified single-process mode.
// It fills SKS_DB_* and PDMADA_DB_* only when those vars are not already provided in backend/.env.
const sksEnv = dotenv.config({ path: path.resolve(__dirname, '..', '..', 'apps', 'sks', '.env') }).parsed || {};
if (!process.env.SKS_DB_HOST && sksEnv.DB_HOST) process.env.SKS_DB_HOST = sksEnv.DB_HOST;
if (!process.env.SKS_DB_PORT && sksEnv.DB_PORT) process.env.SKS_DB_PORT = sksEnv.DB_PORT;
if (!process.env.SKS_DB_USER && sksEnv.DB_USER) process.env.SKS_DB_USER = sksEnv.DB_USER;
if (!process.env.SKS_DB_PASS && sksEnv.DB_PASS) process.env.SKS_DB_PASS = sksEnv.DB_PASS;
if (!process.env.SKS_DB_NAME && sksEnv.DB_NAME) process.env.SKS_DB_NAME = sksEnv.DB_NAME;
if (!process.env.SESSION_SECRET && sksEnv.SESSION_SECRET) process.env.SESSION_SECRET = sksEnv.SESSION_SECRET;

const pdmadaEnv = dotenv.config({ path: path.resolve(__dirname, '..', '..', 'apps', 'pdmada', 'backend', '.env') }).parsed || {};
if (!process.env.PDMADA_DB_HOST && pdmadaEnv.DB_HOST) process.env.PDMADA_DB_HOST = pdmadaEnv.DB_HOST;
if (!process.env.PDMADA_DB_PORT && pdmadaEnv.DB_PORT) process.env.PDMADA_DB_PORT = pdmadaEnv.DB_PORT;
if (!process.env.PDMADA_DB_USER && pdmadaEnv.DB_USER) process.env.PDMADA_DB_USER = pdmadaEnv.DB_USER;
if (!process.env.PDMADA_DB_PASSWORD && pdmadaEnv.DB_PASSWORD) process.env.PDMADA_DB_PASSWORD = pdmadaEnv.DB_PASSWORD;
if (!process.env.PDMADA_DB_NAME && pdmadaEnv.DB_NAME) process.env.PDMADA_DB_NAME = pdmadaEnv.DB_NAME;
const app = require('./app');
const pool = require('./db');
const { ensureAdminUser } = require('./services/authService');

const port = process.env.PORT || 4000;

const server = app.listen(port, () => {
  console.log(`Backend running on http://localhost:${port}`);
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
