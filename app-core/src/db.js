const mysql = require('mysql2/promise');

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

const db1 = mysql.createPool({
  ...baseConfig,
  user: process.env.DB1_USER || process.env.DB_USER,
  password: process.env.DB1_PASSWORD || process.env.DB_PASSWORD,
  database: process.env.DB1_NAME || process.env.DB_NAME
});

const db2 = mysql.createPool({
  ...baseConfig,
  user: process.env.DB2_USER || process.env.DB1_USER || process.env.DB_USER,
  password: process.env.DB2_PASSWORD || process.env.DB1_PASSWORD || process.env.DB_PASSWORD,
  database: process.env.DB2_NAME || process.env.DB_MASTER_NAME || process.env.DB1_NAME || process.env.DB_NAME
});

module.exports = { db1, db2 };
