# ERD Rollout (Non-Payroll)

Dokumen ini mengikuti permintaan:
- Terapkan ERD baru
- **Payroll/penggajian tetap pakai skema existing** (tidak diubah)

## File SQL
- `sql/migration_erd_non_payroll.sql`

## Yang Ditambahkan
- Master: `students`, `employees`, `academic_years`
- Academic: `schedules`, `student_attendance`, `grades`, `report_cards`, `staff_attendance`, `leave_requests`
- Finance non-payroll: `fee_types`, `student_payments`, `cash_transactions`, `journal_entries`
- Administration: `incoming_letters`, `outgoing_letters`, `letter_templates`, `letter_dispositions`, `inventory_items`, `item_loans`

## Yang Sengaja Tidak Diubah
- Tabel payroll/bisyaroh existing (`guru`, `kehadiran`, `pengeluaran_lain`, `konfigurasi`, dan service penggajian saat ini).

## Cara Eksekusi (Shared Hosting/phpMyAdmin)
1. Backup database terlebih dahulu.
2. Pilih database target.
3. Import `sql/migration_erd_non_payroll.sql`.
4. Verifikasi tabel baru muncul.
5. Jangan hapus tabel payroll existing.
