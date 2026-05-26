const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.PDMADA_DB_HOST || process.env.DB_HOST,
  user: process.env.PDMADA_DB_USER || process.env.DB_USER || process.env.DB1_USER,
  password: process.env.PDMADA_DB_PASSWORD || process.env.DB_PASSWORD || process.env.DB1_PASSWORD,
  database: process.env.PDMADA_DB_NAME || process.env.DB_NAME || process.env.DB1_NAME,
  port: Number(process.env.PDMADA_DB_PORT || process.env.DB_PORT || 3306),
  waitForConnections: true,
  connectionLimit: Number(process.env.PDMADA_DB_POOL_SIZE || 10),
  queueLimit: 0,
  dateStrings: true
});

module.exports = pool;
