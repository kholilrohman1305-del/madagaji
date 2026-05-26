-- SEED SIMULASI SKALA SANGAT BESAR (SL50)
-- Target proporsional terhadap skala 25K:
-- 1) 80 bendahara operasional (20x dari 4)
-- 2) 1.440 kelas total (18 per bendahara)
-- 3) 500.000 siswa
-- 4) 8 jenis tagihan per siswa (4.000.000 tagihan)
-- 5) >1.500.000 transaksi pembayaran (dibuat ~6.800.000 + beasiswa)
-- 6) 12 jenis beasiswa + penerima proporsional
-- 7) Pengeluaran + pemasukan lain proporsional (20x)
--
-- Catatan:
-- - Script ini berat. Jalankan di MySQL 8+ dan mesin DB yang memadai.
-- - Aman dijalankan berulang untuk data ber-prefix SL50.

SET @pwd_hash = '$2b$10$2BZKEQuiJjRC7jUqZiuGi.VVzZYexeDPLxMrbcaLBFb04Yt2K0Z1y'; -- admin123
SET @db = DATABASE();

-- =====================================================
-- 0) INDEX OPTIMASI (IDEMPOTEN)
-- =====================================================
SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'students' AND INDEX_NAME = 'idx_students_status_branch_class_name'
    ),
    'SELECT 1',
    'CREATE INDEX idx_students_status_branch_class_name ON students(status, branch_id, kelas, nama)'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bills' AND INDEX_NAME = 'idx_bills_sisa_student_branch'
    ),
    'SELECT 1',
    'CREATE INDEX idx_bills_sisa_student_branch ON bills(sisa, student_id, branch_id)'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'payments' AND INDEX_NAME = 'idx_payments_branch_student_date'
    ),
    'SELECT 1',
    'CREATE INDEX idx_payments_branch_student_date ON payments(branch_id, student_id, tanggal)'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'scholarship_recipients' AND INDEX_NAME = 'idx_sr_student_date'
    ),
    'SELECT 1',
    'CREATE INDEX idx_sr_student_date ON scholarship_recipients(student_id, tanggal_terima, id)'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

INSERT IGNORE INTO branches (id, kode_cabang, nama_cabang, is_active)
VALUES (1, 'PUSAT', 'Kantor Pusat', 1);

-- =====================================================
-- 1) BERSIHKAN DATA SL50 LAMA
-- =====================================================
DELETE FROM payments WHERE trans_id LIKE 'SL50-%';
DELETE FROM bills WHERE id_tagihan_code LIKE 'SL50-BILL-%';
DELETE FROM scholarship_recipients WHERE nis LIKE '95%';
DELETE FROM scholarship_types WHERE nama_beasiswa LIKE 'SL50 Beasiswa %';
DELETE FROM expenses WHERE deskripsi LIKE '[SL50]%';
DELETE FROM other_incomes WHERE deskripsi LIKE '[SL50]%';
DELETE FROM expense_categories WHERE category_name LIKE 'SL50 - %';
DELETE FROM students WHERE nis LIKE '95%';
DELETE FROM admins WHERE username LIKE 'admin_sl50_%';

DELETE c
FROM classes c
JOIN branches b ON b.id = c.branch_id
WHERE b.kode_cabang LIKE 'SL50-%';

DELETE FROM branches WHERE kode_cabang LIKE 'SL50-%';

-- =====================================================
-- 2) MASTER ANGKA BANTUAN
-- =====================================================
DROP TEMPORARY TABLE IF EXISTS sl50_branch_seq;
CREATE TEMPORARY TABLE sl50_branch_seq (
  branch_no INT PRIMARY KEY
);

INSERT INTO sl50_branch_seq (branch_no)
SELECT (a.d * 10 + b.d) + 1
FROM (
  SELECT 0 d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
  UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9
) a
CROSS JOIN (
  SELECT 0 d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
  UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9
) b
WHERE (a.d * 10 + b.d) < 80;

-- =====================================================
-- 3) BENDARAHA + ADMIN (80)
-- =====================================================
INSERT INTO branches (kode_cabang, nama_cabang, alamat, telepon, is_active)
SELECT
  CONCAT('SL50-', LPAD(branch_no, 3, '0')) AS kode_cabang,
  CONCAT('Bendahara Simulasi 500K ', LPAD(branch_no, 3, '0')) AS nama_cabang,
  CONCAT('Jl. Simulasi Skala 500K No.', LPAD(branch_no, 3, '0')) AS alamat,
  CONCAT('0812-5000-', LPAD(branch_no, 4, '0')) AS telepon,
  1
FROM sl50_branch_seq;

INSERT INTO admins (username, password, nama_lengkap, role, branch_id)
SELECT
  CONCAT('admin_sl50_', LPAD(s.branch_no, 3, '0')) AS username,
  @pwd_hash AS password,
  CONCAT('Admin Simulasi 500K ', LPAD(s.branch_no, 3, '0')) AS nama_lengkap,
  'admin' AS role,
  b.id AS branch_id
FROM sl50_branch_seq s
JOIN branches b ON b.kode_cabang = CONCAT('SL50-', LPAD(s.branch_no, 3, '0'));

-- =====================================================
-- 4) PERIODE AKADEMIK
-- =====================================================
UPDATE school_years SET is_active = 0;
INSERT INTO school_years (name, is_active)
VALUES ('2025/2026', 0), ('2026/2027', 1)
ON DUPLICATE KEY UPDATE is_active = VALUES(is_active);

UPDATE semesters SET is_active = 0;
INSERT INTO semesters (name, is_active)
VALUES ('Ganjil', 0), ('Genap', 1)
ON DUPLICATE KEY UPDATE is_active = VALUES(is_active);

-- =====================================================
-- 5) KELAS (18 PER BENDARAHA = 1.440)
-- =====================================================
DROP TEMPORARY TABLE IF EXISTS sl50_class_master;
CREATE TEMPORARY TABLE sl50_class_master (
  idx INT PRIMARY KEY,
  nama_kelas VARCHAR(50) NOT NULL
);

INSERT INTO sl50_class_master (idx, nama_kelas) VALUES
(1,'10.1'),(2,'10.2'),(3,'10.3'),(4,'10.4'),(5,'10.5'),(6,'10.6'),
(7,'11.1'),(8,'11.2'),(9,'11.3'),(10,'11.4'),(11,'11.5'),(12,'11.6'),
(13,'12.1'),(14,'12.2'),(15,'12.3'),(16,'12.4'),(17,'12.5'),(18,'12.6');

INSERT INTO classes (branch_id, nama_kelas)
SELECT b.id, m.nama_kelas
FROM branches b
JOIN sl50_class_master m
WHERE b.kode_cabang LIKE 'SL50-%';

-- =====================================================
-- 6) SISWA (500.000)
-- - Rasio dijaga: 6.250 siswa per bendahara
-- =====================================================
DROP TEMPORARY TABLE IF EXISTS sl50_seq;
CREATE TEMPORARY TABLE sl50_seq (
  n INT NOT NULL PRIMARY KEY
);

INSERT INTO sl50_seq (n)
SELECT num + 1
FROM (
  SELECT (a.d * 100000 + b.d * 10000 + c.d * 1000 + d.d * 100 + e.d * 10 + f.d) AS num
  FROM (
    SELECT 0 d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
    UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9
  ) a
  CROSS JOIN (
    SELECT 0 d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
    UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9
  ) b
  CROSS JOIN (
    SELECT 0 d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
    UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9
  ) c
  CROSS JOIN (
    SELECT 0 d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
    UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9
  ) d
  CROSS JOIN (
    SELECT 0 d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
    UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9
  ) e
  CROSS JOIN (
    SELECT 0 d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
    UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9
  ) f
) x
WHERE num < 500000;

DROP TEMPORARY TABLE IF EXISTS sl50_branch_map;
CREATE TEMPORARY TABLE sl50_branch_map (
  branch_no INT PRIMARY KEY,
  branch_id INT NOT NULL,
  kode_cabang VARCHAR(30) NOT NULL
);

INSERT INTO sl50_branch_map (branch_no, branch_id, kode_cabang)
SELECT
  s.branch_no,
  b.id,
  b.kode_cabang
FROM sl50_branch_seq s
JOIN branches b ON b.kode_cabang = CONCAT('SL50-', LPAD(s.branch_no, 3, '0'));

INSERT INTO students (
  nis, username, password,
  kelas, class_id, branch_id,
  tahun_masuk, tahun_lulus, status,
  nama, jenis_kelamin,
  alamat, nama_wali, no_hp_wali
)
SELECT
  CONCAT('95', LPAD(s.n, 7, '0')) AS nis,
  CONCAT('95', LPAD(s.n, 7, '0')) AS username,
  @pwd_hash AS password,
  cm.nama_kelas,
  c.id AS class_id,
  bm.branch_id AS branch_id,
  CAST(2022 + (s.n % 4) AS CHAR) AS tahun_masuk,
  CASE WHEN MOD(s.n, 25) = 0 THEN (2022 + (s.n % 4) + 3) ELSE NULL END AS tahun_lulus,
  CASE
    WHEN MOD(s.n, 25) = 0 THEN 'Lulus'
    WHEN MOD(s.n, 17) = 0 THEN 'Nonaktif'
    WHEN MOD(s.n, 43) = 0 THEN 'Pindah'
    ELSE 'Aktif'
  END AS status,
  CONCAT('SL50 Siswa ', LPAD(s.n, 6, '0')) AS nama,
  IF(MOD(s.n,2)=0, 'L', 'P') AS jenis_kelamin,
  CONCAT('Alamat SL50 Blok ', LPAD(s.n, 6, '0')) AS alamat,
  CONCAT('Wali SL50 ', LPAD(s.n, 6, '0')) AS nama_wali,
  CONCAT('0821', LPAD(s.n, 8, '0')) AS no_hp_wali
FROM sl50_seq s
JOIN sl50_branch_map bm ON bm.branch_no = FLOOR((s.n - 1) / 6250) + 1
JOIN sl50_class_master cm ON cm.idx = (MOD(s.n - 1, 18) + 1)
JOIN classes c ON c.branch_id = bm.branch_id AND c.nama_kelas = cm.nama_kelas;

-- =====================================================
-- 7) TAGIHAN (8 / siswa = 4.000.000)
-- =====================================================
DROP TEMPORARY TABLE IF EXISTS sl50_bill_templates;
CREATE TEMPORARY TABLE sl50_bill_templates (
  seq INT PRIMARY KEY,
  nama_tagihan VARCHAR(100) NOT NULL,
  nominal DECIMAL(15,2) NOT NULL,
  tanggal_buat DATETIME NOT NULL
);

INSERT INTO sl50_bill_templates (seq, nama_tagihan, nominal, tanggal_buat) VALUES
(1,'SPP Januari 2026',400000,'2026-01-05 08:00:00'),
(2,'SPP Februari 2026',400000,'2026-02-05 08:00:00'),
(3,'SPP Maret 2026',400000,'2026-03-05 08:00:00'),
(4,'SPP April 2026',400000,'2026-04-05 08:00:00'),
(5,'SPP Mei 2026',400000,'2026-05-05 08:00:00'),
(6,'SPP Juni 2026',400000,'2026-06-05 08:00:00'),
(7,'Kegiatan Semester',450000,'2026-02-18 09:00:00'),
(8,'Ujian & Evaluasi',350000,'2026-03-15 09:00:00');

INSERT INTO bills (
  id_tagihan_code, nama_tagihan, kelas, nama_siswa,
  total, terbayar, sisa, status,
  tanggal_buat, school_year_name, student_id, class_id, branch_id
)
SELECT
  CONCAT('SL50-BILL-', LPAD(s.id, 9, '0'), '-', LPAD(t.seq, 2, '0')),
  t.nama_tagihan,
  s.kelas,
  s.nama,
  t.nominal,
  0,
  t.nominal,
  'Belum Lunas',
  t.tanggal_buat,
  COALESCE((SELECT sy.name FROM school_years sy WHERE sy.is_active = 1 ORDER BY sy.id DESC LIMIT 1), '2026/2027'),
  s.id,
  s.class_id,
  s.branch_id
FROM students s
JOIN sl50_bill_templates t
WHERE s.nis LIKE '95%';

-- =====================================================
-- 8) PEMBAYARAN (~6.800.000 + beasiswa)
-- Strategi proporsional sama:
-- 1) Semua bill bayar 35%
-- 2) 50% bill bayar lagi 40%
-- 3) 20% bill bayar lagi 25%
-- =====================================================
INSERT INTO payments (
  trans_id, tanggal, kelas, nama, jumlah_bayar,
  penerima, keterangan, bill_id, student_id, class_id, branch_id
)
SELECT
  CONCAT('SL50-TRX-A-', b.id),
  DATE(b.tanggal_buat),
  b.kelas,
  b.nama_siswa,
  ROUND(b.total * 0.35, 2),
  CONCAT('Admin SL50 ', LPAD(MOD(b.branch_id, 1000), 3, '0')),
  'Cicilan 1 (35%)',
  b.id,
  b.student_id,
  b.class_id,
  b.branch_id
FROM bills b
WHERE b.id_tagihan_code LIKE 'SL50-BILL-%';

INSERT INTO payments (
  trans_id, tanggal, kelas, nama, jumlah_bayar,
  penerima, keterangan, bill_id, student_id, class_id, branch_id
)
SELECT
  CONCAT('SL50-TRX-B-', b.id),
  DATE_ADD(DATE(b.tanggal_buat), INTERVAL 12 DAY),
  b.kelas,
  b.nama_siswa,
  ROUND(b.total * 0.40, 2),
  CONCAT('Admin SL50 ', LPAD(MOD(b.branch_id, 1000), 3, '0')),
  'Cicilan 2 (40%)',
  b.id,
  b.student_id,
  b.class_id,
  b.branch_id
FROM bills b
WHERE b.id_tagihan_code LIKE 'SL50-BILL-%'
  AND MOD(b.id, 2) = 0;

INSERT INTO payments (
  trans_id, tanggal, kelas, nama, jumlah_bayar,
  penerima, keterangan, bill_id, student_id, class_id, branch_id
)
SELECT
  CONCAT('SL50-TRX-C-', b.id),
  DATE_ADD(DATE(b.tanggal_buat), INTERVAL 24 DAY),
  b.kelas,
  b.nama_siswa,
  ROUND(b.total * 0.25, 2),
  CONCAT('Admin SL50 ', LPAD(MOD(b.branch_id, 1000), 3, '0')),
  'Pelunasan (25%)',
  b.id,
  b.student_id,
  b.class_id,
  b.branch_id
FROM bills b
WHERE b.id_tagihan_code LIKE 'SL50-BILL-%'
  AND MOD(b.id, 5) = 0;

-- Sinkronisasi bill
UPDATE bills b
JOIN (
  SELECT bill_id, SUM(jumlah_bayar) AS total_bayar
  FROM payments
  WHERE trans_id LIKE 'SL50-%'
    AND bill_id IS NOT NULL
  GROUP BY bill_id
) p ON p.bill_id = b.id
SET b.terbayar = LEAST(b.total, p.total_bayar),
    b.sisa = GREATEST(0, b.total - p.total_bayar),
    b.status = CASE WHEN GREATEST(0, b.total - p.total_bayar) <= 0.01 THEN 'Lunas' ELSE 'Belum Lunas' END
WHERE b.id_tagihan_code LIKE 'SL50-BILL-%';

-- =====================================================
-- 9) BEASISWA PROPORSIONAL
-- =====================================================
INSERT INTO scholarship_types (nama_beasiswa, jenis_nilai, nominal_per_siswa, keterangan)
VALUES
('SL50 Beasiswa 1','nominal',200000,'Reguler 1'),
('SL50 Beasiswa 2','persen',20,'Persen 2'),
('SL50 Beasiswa 3','nominal',250000,'Reguler 3'),
('SL50 Beasiswa 4','persen',25,'Persen 4'),
('SL50 Beasiswa 5','nominal',300000,'Reguler 5'),
('SL50 Beasiswa 6','persen',30,'Persen 6'),
('SL50 Beasiswa 7','nominal',350000,'Reguler 7'),
('SL50 Beasiswa 8','persen',35,'Persen 8'),
('SL50 Beasiswa 9','nominal',400000,'Reguler 9'),
('SL50 Beasiswa 10','persen',40,'Persen 10'),
('SL50 Beasiswa 11','nominal',450000,'Reguler 11'),
('SL50 Beasiswa 12','persen',45,'Persen 12');

INSERT INTO scholarship_recipients (
  type_id, nama_siswa, kelas, nis, tanggal_terima,
  period_month, period_year, is_operational_active, student_status_snapshot,
  payment_id, student_id, class_id, branch_id
)
SELECT
  t.id,
  s.nama,
  s.kelas,
  s.nis,
  '2026-03-01',
  3,
  2026,
  1,
  s.status,
  NULL,
  s.id,
  s.class_id,
  s.branch_id
FROM students s
JOIN scholarship_types t
  ON t.nama_beasiswa = CONCAT('SL50 Beasiswa ', (MOD(s.id, 12) + 1))
WHERE s.nis LIKE '95%'
  AND s.status = 'Aktif'
  AND MOD(s.id, 5) = 0;

INSERT INTO payments (
  trans_id, tanggal, kelas, nama, jumlah_bayar,
  penerima, keterangan, bill_id, student_id, class_id, branch_id
)
SELECT
  CONCAT('SL50-BEA-', r.id) AS trans_id,
  '2026-03-01' AS tanggal,
  r.kelas,
  r.nama_siswa,
  CASE
    WHEN t.jenis_nilai = 'nominal' THEN ROUND(t.nominal_per_siswa, 2)
    ELSE ROUND(COALESCE((
      SELECT SUM(COALESCE(b.sisa, 0))
      FROM bills b
      WHERE b.student_id = r.student_id
    ), 0) * (t.nominal_per_siswa / 100), 2)
  END AS jumlah_bayar,
  'Sistem (Beasiswa)' AS penerima,
  CONCAT('Otomatis SL50: ', t.nama_beasiswa) AS keterangan,
  NULL AS bill_id,
  r.student_id,
  r.class_id,
  r.branch_id
FROM scholarship_recipients r
JOIN scholarship_types t ON t.id = r.type_id
WHERE r.nis LIKE '95%'
  AND r.tanggal_terima = '2026-03-01';

UPDATE scholarship_recipients r
JOIN payments p ON p.trans_id = CONCAT('SL50-BEA-', r.id)
SET r.payment_id = p.id
WHERE r.nis LIKE '95%'
  AND r.tanggal_terima = '2026-03-01';

-- =====================================================
-- 10) PENGELUARAN + KATEGORI PROPORSIONAL
-- - 64.000 expenses (3.200 x 20)
-- =====================================================
INSERT INTO expense_categories (branch_id, category_name, is_active)
SELECT b.id, c.category_name, 1
FROM branches b
JOIN (
  SELECT 'SL50 - Operasional' AS category_name
  UNION ALL SELECT 'SL50 - Gaji'
  UNION ALL SELECT 'SL50 - ATK'
  UNION ALL SELECT 'SL50 - Maintenance'
  UNION ALL SELECT 'SL50 - Transport'
  UNION ALL SELECT 'SL50 - Kegiatan'
  UNION ALL SELECT 'SL50 - Lainnya'
) c
WHERE b.kode_cabang LIKE 'SL50-%';

INSERT INTO expenses (
  branch_id, tanggal, category_id, kategori, deskripsi, nominal,
  report_status, penanggung_jawab_nama, admin_keuangan_nama, is_recurring, is_active
)
SELECT
  b.id,
  DATE_ADD('2026-01-01', INTERVAL (s.n - 1) DAY),
  ec.id,
  ec.category_name,
  CONCAT('[SL50] Pengeluaran ', LPAD(s.n, 5, '0'), ' - ', ec.category_name),
  (300000 + (MOD(s.n, 20) * 50000)),
  IF(MOD(s.n, 2) = 0, 'sudah', 'belum'),
  CONCAT('PJ SL50 ', LPAD(s.n, 5, '0')),
  CONCAT('Admin SL50 ', LPAD(MOD(b.id, 1000), 3, '0')),
  IF(MOD(s.n, 6) = 0, 1, 0),
  1
FROM sl50_seq s
JOIN branches b ON b.kode_cabang LIKE 'SL50-%'
JOIN expense_categories ec
  ON ec.branch_id = b.id
 AND ec.category_name = CASE MOD(s.n, 7)
   WHEN 0 THEN 'SL50 - Operasional'
   WHEN 1 THEN 'SL50 - Gaji'
   WHEN 2 THEN 'SL50 - ATK'
   WHEN 3 THEN 'SL50 - Maintenance'
   WHEN 4 THEN 'SL50 - Transport'
   WHEN 5 THEN 'SL50 - Kegiatan'
   ELSE 'SL50 - Lainnya'
 END
WHERE s.n <= 800; -- 800 x 80 bendahara = 64.000 pengeluaran

-- =====================================================
-- 11) PEMASUKAN LAIN PROPORSIONAL
-- - 40.000 other incomes (2.000 x 20)
-- =====================================================
INSERT INTO other_incomes (
  branch_id, tanggal, sumber, deskripsi, nominal,
  report_status, is_active, admin_keuangan_nama
)
SELECT
  b.id,
  DATE_ADD('2026-01-01', INTERVAL (s.n - 1) DAY),
  CASE MOD(s.n, 5)
    WHEN 0 THEN 'Donasi'
    WHEN 1 THEN 'Sewa Fasilitas'
    WHEN 2 THEN 'Kerja Sama'
    WHEN 3 THEN 'Penjualan Aset Ringan'
    ELSE 'Lain-lain'
  END AS sumber,
  CONCAT('[SL50] Pemasukan lain ', LPAD(s.n, 5, '0')),
  (250000 + (MOD(s.n, 30) * 25000)),
  IF(MOD(s.n, 2) = 0, 'sudah', 'belum'),
  1,
  CONCAT('Admin SL50 ', LPAD(MOD(b.id, 1000), 3, '0'))
FROM sl50_seq s
JOIN branches b ON b.kode_cabang LIKE 'SL50-%'
WHERE s.n <= 500; -- 500 x 80 bendahara = 40.000 pemasukan lain

-- =====================================================
-- 12) RINGKASAN CEK CEPAT
-- =====================================================
-- EXPECTED MINIMUM:
-- students                 : 500.000
-- branches                 : 80 (SL50-001..080)
-- classes                  : 1.440
-- bills                    : 4.000.000
-- payments                 : >1.500.000 (sekitar 6.800.000 + beasiswa)
-- scholarship types        : 12
-- scholarship recipients   : ~80.000-95.000
-- expenses                 : 64.000
-- other incomes            : 40.000

SELECT 'students_sl50' AS metric, COUNT(*) AS total
FROM students WHERE nis LIKE '95%'
UNION ALL
SELECT 'branches_sl50', COUNT(*)
FROM branches WHERE kode_cabang LIKE 'SL50-%'
UNION ALL
SELECT 'classes_sl50', COUNT(*)
FROM classes c JOIN branches b ON b.id = c.branch_id WHERE b.kode_cabang LIKE 'SL50-%'
UNION ALL
SELECT 'bills_sl50', COUNT(*)
FROM bills WHERE id_tagihan_code LIKE 'SL50-BILL-%'
UNION ALL
SELECT 'payments_sl50', COUNT(*)
FROM payments WHERE trans_id LIKE 'SL50-%'
UNION ALL
SELECT 'scholarship_types_sl50', COUNT(*)
FROM scholarship_types WHERE nama_beasiswa LIKE 'SL50 Beasiswa %'
UNION ALL
SELECT 'scholarship_recipients_sl50', COUNT(*)
FROM scholarship_recipients WHERE nis LIKE '95%'
UNION ALL
SELECT 'expenses_sl50', COUNT(*)
FROM expenses WHERE deskripsi LIKE '[SL50]%'
UNION ALL
SELECT 'other_incomes_sl50', COUNT(*)
FROM other_incomes WHERE deskripsi LIKE '[SL50]%';
