-- Cleanup tabel yang tidak dipakai oleh MadaGaji core (DB gaji)
-- Aman dijalankan berulang (pakai IF EXISTS).
-- WAJIB backup dulu sebelum eksekusi di production.
--
-- Contoh:
--   mysqldump -u root -p gaji > backup_gaji_before_cleanup.sql
--   mysql -u root -p gaji < sql/cleanup_madagaji_unused.sql

SET FOREIGN_KEY_CHECKS = 0;

-- Modul akademik/non-payroll tambahan (tidak dipakai MadaGaji core)
DROP TABLE IF EXISTS report_cards;
DROP TABLE IF EXISTS grades;
DROP TABLE IF EXISTS student_attendance;
DROP TABLE IF EXISTS staff_attendance;
DROP TABLE IF EXISTS leave_requests;
DROP TABLE IF EXISTS schedules;
DROP TABLE IF EXISTS academic_years;
DROP TABLE IF EXISTS students;
DROP TABLE IF EXISTS employees;

-- Modul keuangan sekolah (non-penggajian)
DROP TABLE IF EXISTS journal_entries;
DROP TABLE IF EXISTS cash_transactions;
DROP TABLE IF EXISTS student_payments;
DROP TABLE IF EXISTS fee_types;

-- Modul administrasi surat/inventaris
DROP TABLE IF EXISTS item_loans;
DROP TABLE IF EXISTS inventory_items;
DROP TABLE IF EXISTS letter_dispositions;
DROP TABLE IF EXISTS letter_templates;
DROP TABLE IF EXISTS outgoing_letters;
DROP TABLE IF EXISTS incoming_letters;

SET FOREIGN_KEY_CHECKS = 1;
