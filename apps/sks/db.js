const mysql = require('mysql2');
require('dotenv').config({ quiet: true });

// Keep logs safe for production; avoid printing env values.
const isProd = process.env.NODE_ENV === 'production';
if (!isProd) console.log('[db] initializing connection pool');

const pool = mysql.createPool({
    host: process.env.SKS_DB_HOST || process.env.DB_HOST || 'localhost',
    user: process.env.SKS_DB_USER || process.env.DB_USER || process.env.DB1_USER,
    password: process.env.SKS_DB_PASS || process.env.DB_PASS || process.env.DB_PASSWORD || process.env.DB1_PASSWORD,
    database: process.env.SKS_DB_NAME || process.env.DB_NAME || process.env.DB1_NAME,
    port: Number(process.env.SKS_DB_PORT || process.env.DB_PORT || 3306),
    waitForConnections: true,
    connectionLimit: Number(process.env.SKS_DB_POOL_SIZE || 10),
    queueLimit: 0
});

pool.getConnection((err, connection) => {
    if (err) {
        console.error('[db] connection failed:', err.message);
        return;
    }
    if (!isProd) console.log('[db] connected');
    connection.release();
});

module.exports = pool.promise();
