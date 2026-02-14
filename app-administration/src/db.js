const mysql = require('mysql2/promise');

const baseConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_SIZE || 10),
  queueLimit: 0,
  connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT || 10000),
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  supportBigNumbers: true,
  decimalNumbers: true
};

const db1 = mysql.createPool({
  ...baseConfig,
  database: process.env.DB1_NAME,
  user: process.env.DB1_USER,
  password: process.env.DB1_PASSWORD
});

module.exports = { db1 };
