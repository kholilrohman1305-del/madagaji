const mysql = require('mysql2/promise');

const gajiDbName = process.env.DB1_NAME || process.env.DB_GAJI_NAME || process.env.DB_NAME;
const gajiDbUser = process.env.DB1_USER || process.env.DB_GAJI_USER || process.env.DB_USER;
const gajiDbPass = process.env.DB1_PASSWORD || process.env.DB_GAJI_PASS || process.env.DB_PASSWORD;
const masterDbName = process.env.DB2_NAME || process.env.DB_PDDATA_NAME || process.env.DB_MASTER_NAME || gajiDbName;
const masterDbUser = process.env.DB2_USER || process.env.DB_PDDATA_USER || gajiDbUser;
const masterDbPass = process.env.DB2_PASSWORD || process.env.DB_PDDATA_PASS || gajiDbPass;

if (!process.env.DB_MASTER_NAME) {
  process.env.DB_MASTER_NAME = masterDbName;
}

const baseConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_SIZE || 20),
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  supportBigNumbers: true,
  decimalNumbers: true,
  connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT || 10000)
};

const pool = mysql.createPool({
  ...baseConfig,
  user: gajiDbUser,
  password: gajiDbPass,
  database: gajiDbName
});

const masterPool = mysql.createPool({
  ...baseConfig,
  user: masterDbUser,
  password: masterDbPass,
  database: masterDbName
});

pool.master = masterPool;
pool.dbName = gajiDbName;
pool.masterDbName = masterDbName;

module.exports = pool;
