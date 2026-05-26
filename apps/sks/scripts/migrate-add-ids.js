// Migration: add student_id + class_id relations to legacy tables and backfill data.
// Safe to re-run (idempotent-ish).
//
// Usage:
//   node scripts/migrate-add-ids.js
//
// Requires .env: DB_HOST/DB_USER/DB_PASS/DB_NAME

require('dotenv').config({ quiet: true });

const mysql = require('mysql2/promise');

async function columnExists(conn, table, column) {
    const [rows] = await conn.query(
        `SELECT COUNT(*) as c
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = ?
           AND COLUMN_NAME = ?`,
        [table, column]
    );
    return Number(rows[0].c) > 0;
}

async function fkExists(conn, table, fkName) {
    const [rows] = await conn.query(
        `SELECT COUNT(*) as c
         FROM information_schema.TABLE_CONSTRAINTS
         WHERE CONSTRAINT_SCHEMA = DATABASE()
           AND TABLE_NAME = ?
           AND CONSTRAINT_NAME = ?
           AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
        [table, fkName]
    );
    return Number(rows[0].c) > 0;
}

async function tryQueryIgnore(conn, sql, ignoreCodes) {
    try {
        await conn.query(sql);
    } catch (e) {
        if (ignoreCodes && ignoreCodes.includes(e.code)) return;
        throw e;
    }
}

async function main() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
        multipleStatements: true
    });

    try {
        console.log('[migrate] starting');

        // 1) Ensure class_id in students
        if (!(await columnExists(conn, 'students', 'class_id'))) {
            console.log('[migrate] add students.class_id');
            await conn.query('ALTER TABLE students ADD COLUMN class_id INT NULL');
            await conn.query('ALTER TABLE students ADD KEY idx_students_class_id (class_id)');
        }

        // 2) Ensure ids on bills/payments/scholarship_recipients
        const targets = [
            { table: 'bills', cols: ['student_id', 'class_id'] },
            { table: 'payments', cols: ['student_id', 'class_id'] },
            { table: 'scholarship_recipients', cols: ['student_id', 'class_id'] }
        ];

        for (const t of targets) {
            for (const c of t.cols) {
                if (!(await columnExists(conn, t.table, c))) {
                    console.log(`[migrate] add ${t.table}.${c}`);
                    await conn.query(`ALTER TABLE \`${t.table}\` ADD COLUMN \`${c}\` INT NULL`);
                }
            }
        }

        // Indexes
        // (Ignore duplicate key name)
        await tryQueryIgnore(conn, 'ALTER TABLE bills ADD KEY idx_bills_student_id (student_id)', ['ER_DUP_KEYNAME']);
        await tryQueryIgnore(conn, 'ALTER TABLE bills ADD KEY idx_bills_class_id (class_id)', ['ER_DUP_KEYNAME']);
        await tryQueryIgnore(conn, 'ALTER TABLE payments ADD KEY idx_payments_student_id (student_id)', ['ER_DUP_KEYNAME']);
        await tryQueryIgnore(conn, 'ALTER TABLE payments ADD KEY idx_payments_class_id (class_id)', ['ER_DUP_KEYNAME']);
        await tryQueryIgnore(conn, 'ALTER TABLE scholarship_recipients ADD KEY idx_sr_student_id (student_id)', ['ER_DUP_KEYNAME']);
        await tryQueryIgnore(conn, 'ALTER TABLE scholarship_recipients ADD KEY idx_sr_class_id (class_id)', ['ER_DUP_KEYNAME']);

        // 3) Backfill classes from students.kelas (string)
        console.log('[migrate] ensure classes contains all students.kelas');
        await conn.query(`
            INSERT IGNORE INTO classes (nama_kelas)
            SELECT DISTINCT kelas
            FROM students
            WHERE kelas IS NOT NULL AND kelas <> ''
        `);

        // 4) Backfill class_id
        console.log('[migrate] backfill class_id');
        await conn.query(`
            UPDATE students s
            JOIN classes c ON c.nama_kelas = s.kelas
            SET s.class_id = c.id
            WHERE s.class_id IS NULL
        `);

        for (const t of targets) {
            await conn.query(
                `
                UPDATE \`${t.table}\` x
                JOIN classes c ON c.nama_kelas = x.kelas
                SET x.class_id = c.id
                WHERE x.class_id IS NULL AND x.kelas IS NOT NULL AND x.kelas <> ''
            `
            );
        }

        // 5) Backfill student_id
        console.log('[migrate] backfill student_id');

        // scholarship_recipients: prefer nis
        await conn.query(`
            UPDATE scholarship_recipients r
            JOIN students s ON s.nis = r.nis
            SET r.student_id = s.id
            WHERE r.student_id IS NULL AND r.nis IS NOT NULL AND r.nis <> ''
        `);

        // bills/payments/scholarship_recipients: by unique (kelas, nama)
        await conn.query(`
            UPDATE bills b
            JOIN students s ON s.kelas = b.kelas AND s.nama = b.nama_siswa
            SET b.student_id = s.id
            WHERE b.student_id IS NULL
        `);

        await conn.query(`
            UPDATE payments p
            JOIN students s ON s.kelas = p.kelas AND s.nama = p.nama
            SET p.student_id = s.id
            WHERE p.student_id IS NULL
        `);

        await conn.query(`
            UPDATE scholarship_recipients r
            JOIN students s ON s.kelas = r.kelas AND s.nama = r.nama_siswa
            SET r.student_id = s.id
            WHERE r.student_id IS NULL
        `);

        // 6) Add foreign keys (only if not exists)
        const fks = [
            {
                table: 'students',
                name: 'fk_students_class_id',
                sql: 'ALTER TABLE students ADD CONSTRAINT fk_students_class_id FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL'
            },
            {
                table: 'bills',
                name: 'fk_bills_student_id',
                sql: 'ALTER TABLE bills ADD CONSTRAINT fk_bills_student_id FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL'
            },
            {
                table: 'bills',
                name: 'fk_bills_class_id',
                sql: 'ALTER TABLE bills ADD CONSTRAINT fk_bills_class_id FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL'
            },
            {
                table: 'payments',
                name: 'fk_payments_student_id',
                sql: 'ALTER TABLE payments ADD CONSTRAINT fk_payments_student_id FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL'
            },
            {
                table: 'payments',
                name: 'fk_payments_class_id',
                sql: 'ALTER TABLE payments ADD CONSTRAINT fk_payments_class_id FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL'
            },
            {
                table: 'scholarship_recipients',
                name: 'fk_sr_student_id',
                sql: 'ALTER TABLE scholarship_recipients ADD CONSTRAINT fk_sr_student_id FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL'
            },
            {
                table: 'scholarship_recipients',
                name: 'fk_sr_class_id',
                sql: 'ALTER TABLE scholarship_recipients ADD CONSTRAINT fk_sr_class_id FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL'
            }
        ];

        for (const fk of fks) {
            if (!(await fkExists(conn, fk.table, fk.name))) {
                console.log(`[migrate] add FK ${fk.name}`);
                try {
                    await conn.query(fk.sql);
                } catch (e) {
                    // If this fails due to existing bad data, we still keep the columns and backfill.
                    console.warn(`[migrate] WARN cannot add FK ${fk.name}: ${e.message}`);
                }
            }
        }

        // Summary
        const [[pNull]] = await conn.query('SELECT COUNT(*) as c FROM payments WHERE student_id IS NULL');
        const [[bNull]] = await conn.query('SELECT COUNT(*) as c FROM bills WHERE student_id IS NULL');
        const [[rNull]] = await conn.query('SELECT COUNT(*) as c FROM scholarship_recipients WHERE student_id IS NULL');
        console.log('[migrate] done');
        console.log(`[migrate] payments.student_id NULL: ${pNull.c}`);
        console.log(`[migrate] bills.student_id NULL: ${bNull.c}`);
        console.log(`[migrate] scholarship_recipients.student_id NULL: ${rNull.c}`);
    } finally {
        await conn.end();
    }
}

main().catch((err) => {
    console.error('[migrate] failed:', err && err.message ? err.message : err);
    process.exit(1);
});
