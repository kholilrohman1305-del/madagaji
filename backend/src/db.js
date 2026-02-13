const mysql = require('mysql2/promise');

const gajiDbName = process.env.DB1_NAME || process.env.DB_GAJI_NAME || process.env.DB_NAME;
const gajiDbUser = process.env.DB1_USER || process.env.DB_GAJI_USER || process.env.DB_USER;
const gajiDbPass = process.env.DB1_PASSWORD || process.env.DB_GAJI_PASS || process.env.DB_PASSWORD;

if (!process.env.DB_MASTER_NAME) {
  process.env.DB_MASTER_NAME = process.env.DB2_NAME || process.env.DB_PDDATA_NAME || gajiDbName;
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  user: gajiDbUser,
  password: gajiDbPass,
  database: gajiDbName,
  port: Number(process.env.DB_PORT || 3306),
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_SIZE || 20),
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  supportBigNumbers: true,
  decimalNumbers: true,
  connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT || 10000)
});

module.exports = pool;
