const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config({ quiet: true });

async function main() {
    const schemaPath = path.join(__dirname, 'database.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    console.log('[setup] applying schema from database.sql');

    // This script is intended for local/dev bootstrap. It runs a trusted schema file,
    // so enabling multipleStatements is acceptable here.
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME || undefined,
        multipleStatements: true
    });

    try {
        await conn.query(schema);
        console.log('[setup] schema applied');

        // Optional seed: create first admin if requested and table is empty.
        if (process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) {
            const [rows] = await conn.query('SELECT COUNT(*) as c FROM admins');
            const count = rows && rows[0] ? Number(rows[0].c) : 0;
            if (count === 0) {
                const salt = await bcrypt.genSalt(10);
                const hashed = await bcrypt.hash(String(process.env.ADMIN_PASSWORD), salt);
                await conn.query('INSERT INTO admins (username, password, nama_lengkap) VALUES (?, ?, ?)', [
                    process.env.ADMIN_USERNAME,
                    hashed,
                    process.env.ADMIN_NAME || 'Administrator'
                ]);
                console.log('[setup] seeded first admin from env');
            }
        }
    } finally {
        await conn.end();
    }
}

main().catch((err) => {
    console.error('[setup] failed:', err && err.message ? err.message : err);
    process.exitCode = 1;
});
