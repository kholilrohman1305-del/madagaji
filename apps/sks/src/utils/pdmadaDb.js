const mysql = require('mysql2');

let pool = null;
let initError = null;

function getConfig() {
    const host = process.env.PDMADA_DB_HOST || process.env.DB2_HOST || process.env.SKS_PDMADA_DB_HOST || '';
    const user = process.env.PDMADA_DB_USER || process.env.DB2_USER || process.env.SKS_PDMADA_DB_USER || '';
    const password = process.env.PDMADA_DB_PASSWORD || process.env.DB2_PASSWORD || process.env.SKS_PDMADA_DB_PASSWORD || '';
    const database = process.env.PDMADA_DB_NAME || process.env.DB2_NAME || process.env.SKS_PDMADA_DB_NAME || '';
    const port = Number(process.env.PDMADA_DB_PORT || process.env.DB2_PORT || process.env.SKS_PDMADA_DB_PORT || 3306);
    if (!host || !user || !database) return null;
    return {
        host,
        user,
        password,
        database,
        port,
        waitForConnections: true,
        connectionLimit: Number(process.env.PDMADA_DB_POOL_SIZE || process.env.DB2_POOL_SIZE || 5),
        queueLimit: 0
    };
}

function getPdmadaPool() {
    if (pool || initError) return pool;
    const cfg = getConfig();
    if (!cfg) {
        initError = new Error('Konfigurasi database PDMADA belum lengkap.');
        return null;
    }
    try {
        pool = mysql.createPool(cfg).promise();
        return pool;
    } catch (err) {
        initError = err;
        return null;
    }
}

async function queryPdmada(sql, params = []) {
    const p = getPdmadaPool();
    if (!p) throw initError || new Error('Database PDMADA tidak tersedia.');
    return p.query(sql, params);
}

function isPdmadaConfigured() {
    return Boolean(getConfig());
}

module.exports = {
    queryPdmada,
    isPdmadaConfigured
};

