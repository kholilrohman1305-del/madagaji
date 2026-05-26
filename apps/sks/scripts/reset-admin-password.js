// Usage:
//   node scripts/reset-admin-password.js <username> <new_password>
//
// Reads DB config from .env (DB_HOST/DB_USER/DB_PASS/DB_NAME).

require('dotenv').config({ quiet: true });

const bcrypt = require('bcryptjs');
const db = require('../db');

async function main() {
    const username = process.argv[2];
    const newPassword = process.argv[3];

    if (!username || !newPassword) {
        console.error('Usage: node scripts/reset-admin-password.js <username> <new_password>');
        process.exit(2);
    }

    const [rows] = await db.query('SELECT id FROM admins WHERE username = ? LIMIT 1', [username]);
    if (rows.length === 0) {
        console.error(`User not found: ${username}`);
        process.exit(1);
    }

    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(String(newPassword), salt);
    await db.query('UPDATE admins SET password = ? WHERE username = ?', [hashed, username]);

    console.log(`Password updated for user: ${username}`);
}

main().catch((err) => {
    console.error(err && err.message ? err.message : err);
    process.exit(1);
});

