-- SEED SIMULASI SKALA BESAR (SL25)
-- Target utama:
-- 1) 4 bendahara operasional
-- 2) 72 kelas total (18 per bendahara)
-- 3) 25.000 siswa
-- 4) 8 jenis tagihan per siswa (200.000 tagihan)
-- 5) >75.000 transaksi pembayaran (dibuat ~340.000 + beasiswa)
-- 6) 12 program beasiswa + penerima proporsional
-- 7) Pengeluaran + pemasukan lain proporsional
--
-- Aman dijalankan berulang untuk data berprefix SL25.

SET @pwd_hash = '$2b$10$2BZKEQuiJjRC7jUqZiuGi.VVzZYexeDPLxMrbcaLBFb04Yt2K0Z1y'; -- admin123
SET @db = DATABASE();

-- =====================================================
-- 0) PASTIKAN TABEL YANG DIPAKAI ADA
-- =====================================================
CREATE TABLE IF NOT EXISTS branches (
  id INT NOT NULL AUTO_INCREMENT,
  kode_cabang VARCHAR(30) NOT NULL,
  nama_cabang VARCHAR(120) NOT NULL,
  alamat TEXT DEFAULT NULL,
  telepon VARCHAR(50) DEFAULT NULL,
  payment_pin_hash VARCHAR(255) DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_branch_code (kode_cabang),
  UNIQUE KEY uniq_branch_name (nama_cabang)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS admins (
  id INT NOT NULL AUTO_INCREMENT,
  username VARCHAR(50) NOT NULL,
  password VARCHAR(255) NOT NULL,
  nama_lengkap VARCHAR(100) DEFAULT NULL,
  role ENUM('super_admin','admin','wali_kelas') NOT NULL DEFAULT 'super_admin',
  branch_id INT DEFAULT NULL,
  homeroom_class VARCHAR(50) DEFAULT NULL,
  pdmada_teacher_id BIGINT DEFAULT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY username (username),
  KEY idx_admin_branch (branch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS classes (
  id INT NOT NULL AUTO_INCREMENT,
  branch_id INT NOT NULL DEFAULT 1,
  nama_kelas VARCHAR(50) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_branch_class (branch_id, nama_kelas),
  KEY idx_classes_branch (branch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS students (
  id INT NOT NULL AUTO_INCREMENT,
  nis VARCHAR(20) DEFAULT NULL,
  nisn VARCHAR(20) DEFAULT NULL,
  username VARCHAR(50) DEFAULT NULL,
  password VARCHAR(255) DEFAULT NULL,
  kelas VARCHAR(50) NOT NULL,
  class_id INT DEFAULT NULL,
  branch_id INT NOT NULL DEFAULT 1,
  tahun_masuk VARCHAR(4) DEFAULT NULL,
  tahun_lulus INT DEFAULT NULL,
  status ENUM('Aktif','Nonaktif','Lulus','Pindah','Keluar') DEFAULT 'Aktif',
  nama VARCHAR(100) NOT NULL,
  jenis_kelamin ENUM('L','P') DEFAULT 'L',
  tempat_lahir VARCHAR(50) DEFAULT NULL,
  tanggal_lahir DATE DEFAULT NULL,
  alamat TEXT,
  asal_sekolah VARCHAR(150) DEFAULT NULL,
  nama_wali VARCHAR(100) DEFAULT NULL,
  no_hp_wali VARCHAR(20) DEFAULT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY nis (nis),
  UNIQUE KEY username (username),
  KEY idx_students_class_id (class_id),
  KEY idx_students_branch_id (branch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS bills (
  id INT NOT NULL AUTO_INCREMENT,
  id_tagihan_code VARCHAR(50) DEFAULT NULL,
  nama_tagihan VARCHAR(100) DEFAULT NULL,
  kelas VARCHAR(50) DEFAULT NULL,
  nama_siswa VARCHAR(100) DEFAULT NULL,
  total DECIMAL(15,2) DEFAULT '0.00',
  terbayar DECIMAL(15,2) DEFAULT '0.00',
  sisa DECIMAL(15,2) DEFAULT '0.00',
  status ENUM('Lunas','Belum Lunas') DEFAULT 'Belum Lunas',
  tanggal_buat DATETIME DEFAULT CURRENT_TIMESTAMP,
  school_year_name VARCHAR(20) DEFAULT NULL,
  student_id INT DEFAULT NULL,
  class_id INT DEFAULT NULL,
  branch_id INT NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  KEY idx_tagihan_nama (nama_siswa),
  KEY idx_bills_student_id (student_id),
  KEY idx_bills_class_id (class_id),
  KEY idx_bills_branch_id (branch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS payments (
  id INT NOT NULL AUTO_INCREMENT,
  trans_id VARCHAR(50) DEFAULT NULL,
  tanggal DATE DEFAULT NULL,
  kelas VARCHAR(50) DEFAULT NULL,
  nama VARCHAR(100) DEFAULT NULL,
  jumlah_bayar DECIMAL(15,2) DEFAULT NULL,
  penerima VARCHAR(100) DEFAULT NULL,
  keterangan TEXT,
  bill_id INT DEFAULT NULL,
  student_id INT DEFAULT NULL,
  class_id INT DEFAULT NULL,
  branch_id INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_bayar_tanggal (tanggal),
  KEY idx_payments_student_id (student_id),
  KEY idx_payments_class_id (class_id),
  KEY idx_payments_branch_id (branch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS scholarship_types (
  id INT NOT NULL AUTO_INCREMENT,
  nama_beasiswa VARCHAR(100) NOT NULL,
  jenis_nilai ENUM('nominal','persen') DEFAULT 'nominal',
  nominal_per_siswa DECIMAL(15,2) DEFAULT '0.00',
  keterangan TEXT,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS scholarship_recipients (
  id INT NOT NULL AUTO_INCREMENT,
  type_id INT DEFAULT NULL,
  nama_siswa VARCHAR(100) DEFAULT NULL,
  kelas VARCHAR(50) DEFAULT NULL,
  nis VARCHAR(20) DEFAULT NULL,
  tanggal_terima DATE DEFAULT NULL,
  period_month TINYINT DEFAULT NULL,
  period_year INT DEFAULT NULL,
  is_operational_active TINYINT(1) NOT NULL DEFAULT 1,
  student_status_snapshot VARCHAR(20) DEFAULT NULL,
  payment_id INT DEFAULT NULL,
  student_id INT DEFAULT NULL,
  class_id INT DEFAULT NULL,
  branch_id INT NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  KEY idx_sr_student_id (student_id),
  KEY idx_sr_class_id (class_id),
  KEY idx_sr_branch_id (branch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS school_years (
  id INT NOT NULL AUTO_INCREMENT,
  name VARCHAR(20) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_school_year_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS semesters (
  id INT NOT NULL AUTO_INCREMENT,
  name VARCHAR(20) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_semester_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS expense_categories (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  branch_id INT NOT NULL,
  category_name VARCHAR(80) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_exp_category_branch (branch_id, category_name),
  INDEX idx_exp_category_branch_active (branch_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS expenses (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  branch_id INT NOT NULL,
  tanggal DATE NOT NULL,
  category_id BIGINT NULL,
  kategori VARCHAR(80) NOT NULL,
  deskripsi VARCHAR(200) NOT NULL,
  nominal DECIMAL(15,2) NOT NULL,
  report_status VARCHAR(10) NOT NULL DEFAULT 'belum',
  penanggung_jawab_id INT NULL,
  penanggung_jawab_nama VARCHAR(120) NULL,
  admin_keuangan_nama VARCHAR(120) NULL,
  is_recurring TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_exp_branch_date (branch_id, tanggal),
  INDEX idx_exp_branch_active (branch_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS other_incomes (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  branch_id INT NOT NULL,
  tanggal DATE NOT NULL,
  sumber VARCHAR(80) NOT NULL,
  deskripsi VARCHAR(200) NOT NULL,
  nominal DECIMAL(15,2) NOT NULL,
  report_status VARCHAR(10) NOT NULL DEFAULT 'belum',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  admin_keuangan_nama VARCHAR(120) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_other_income_branch_date (branch_id, tanggal),
  INDEX idx_other_income_branch_active (branch_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =====================================================
-- 0.1) INDEX OPTIMASI QUERY SKALA BESAR
-- =====================================================
SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bills' AND INDEX_NAME = 'idx_bills_branch_student_sisa'
    ),
    'SELECT 1',
    'CREATE INDEX idx_bills_branch_student_sisa ON bills(branch_id, student_id, sisa)'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bills' AND INDEX_NAME = 'idx_bills_branch_class_name'
    ),
    'SELECT 1',
    'CREATE INDEX idx_bills_branch_class_name ON bills(branch_id, kelas, nama_siswa)'
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
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'scholarship_recipients' AND INDEX_NAME = 'idx_sr_branch_student_lookup'
    ),
    'SELECT 1',
    'CREATE INDEX idx_sr_branch_student_lookup ON scholarship_recipients(branch_id, student_id, nama_siswa, kelas)'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

INSERT IGNORE INTO branches (id, kode_cabang, nama_cabang, is_active)
VALUES (1, 'PUSAT', 'Kantor Pusat', 1);

-- =====================================================
-- 1) BERSIHKAN DATA SL25 LAMA
-- =====================================================
DELETE FROM payments WHERE trans_id LIKE 'SL25-%';
DELETE FROM bills WHERE id_tagihan_code LIKE 'SL25-BILL-%';
DELETE FROM scholarship_recipients WHERE nis LIKE '8%';
DELETE FROM scholarship_types WHERE nama_beasiswa LIKE 'SL25 Beasiswa %';
DELETE FROM expenses WHERE deskripsi LIKE '[SL25]%';
DELETE FROM other_incomes WHERE deskripsi LIKE '[SL25]%';
DELETE FROM expense_categories WHERE category_name LIKE 'SL25 - %';
DELETE FROM students WHERE nis LIKE '8%';
DELETE FROM admins WHERE username IN ('admin_sl25_a','admin_sl25_b','admin_sl25_c','admin_sl25_d');

DELETE c
FROM classes c
JOIN branches b ON b.id = c.branch_id
WHERE b.kode_cabang IN ('SL25-A','SL25-B','SL25-C','SL25-D');

DELETE FROM branches WHERE kode_cabang IN ('SL25-A','SL25-B','SL25-C','SL25-D');

-- =====================================================
-- 2) BENDARAHA + ADMIN
-- =====================================================
INSERT INTO branches (kode_cabang, nama_cabang, alamat, telepon, is_active)
VALUES
  ('SL25-A', 'Bendahara Simulasi A', 'Jl. Simulasi A No.25', '0812-2500-0001', 1),
  ('SL25-B', 'Bendahara Simulasi B', 'Jl. Simulasi B No.25', '0812-2500-0002', 1),
  ('SL25-C', 'Bendahara Simulasi C', 'Jl. Simulasi C No.25', '0812-2500-0003', 1),
  ('SL25-D', 'Bendahara Simulasi D', 'Jl. Simulasi D No.25', '0812-2500-0004', 1);

INSERT INTO admins (username, password, nama_lengkap, role, branch_id)
SELECT 'admin_sl25_a', @pwd_hash, 'Admin Simulasi 25K A', 'admin', id
FROM branches WHERE kode_cabang = 'SL25-A';

INSERT INTO admins (username, password, nama_lengkap, role, branch_id)
SELECT 'admin_sl25_b', @pwd_hash, 'Admin Simulasi 25K B', 'admin', id
FROM branches WHERE kode_cabang = 'SL25-B';

INSERT INTO admins (username, password, nama_lengkap, role, branch_id)
SELECT 'admin_sl25_c', @pwd_hash, 'Admin Simulasi 25K C', 'admin', id
FROM branches WHERE kode_cabang = 'SL25-C';

INSERT INTO admins (username, password, nama_lengkap, role, branch_id)
SELECT 'admin_sl25_d', @pwd_hash, 'Admin Simulasi 25K D', 'admin', id
FROM branches WHERE kode_cabang = 'SL25-D';

-- =====================================================
-- 3) PERIODE AKADEMIK
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
-- 4) KELAS (18 PER BENDARAHA = 72 TOTAL)
-- =====================================================
DROP TEMPORARY TABLE IF EXISTS sl25_class_master;
CREATE TEMPORARY TABLE sl25_class_master (
  idx INT PRIMARY KEY,
  nama_kelas VARCHAR(50) NOT NULL
);

INSERT INTO sl25_class_master (idx, nama_kelas) VALUES
(1,'10.1'),(2,'10.2'),(3,'10.3'),(4,'10.4'),(5,'10.5'),(6,'10.6'),
(7,'11.1'),(8,'11.2'),(9,'11.3'),(10,'11.4'),(11,'11.5'),(12,'11.6'),
(13,'12.1'),(14,'12.2'),(15,'12.3'),(16,'12.4'),(17,'12.5'),(18,'12.6');

INSERT INTO classes (branch_id, nama_kelas)
SELECT b.id, m.nama_kelas
FROM branches b
JOIN sl25_class_master m
WHERE b.kode_cabang IN ('SL25-A','SL25-B','SL25-C','SL25-D');

-- =====================================================
-- 5) SISWA (25.000)
-- =====================================================
DROP TEMPORARY TABLE IF EXISTS sl25_seq;
CREATE TEMPORARY TABLE sl25_seq (
  n INT NOT NULL PRIMARY KEY
);

INSERT INTO sl25_seq (n)
SELECT num + 1
FROM (
  SELECT (a.d * 10000 + b.d * 1000 + c.d * 100 + d.d * 10 + e.d) AS num
  FROM (SELECT 0 d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) a
  CROSS JOIN (SELECT 0 d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) b
  CROSS JOIN (SELECT 0 d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) c
  CROSS JOIN (SELECT 0 d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) d
  CROSS JOIN (SELECT 0 d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) e
) x
WHERE num < 25000;

INSERT INTO students (
  nis, username, password,
  kelas, class_id, branch_id,
  tahun_masuk, tahun_lulus, status,
  nama, jenis_kelamin,
  alamat, nama_wali, no_hp_wali
)
SELECT
  CONCAT('8', LPAD(s.n, 7, '0')) AS nis,
  CONCAT('8', LPAD(s.n, 7, '0')) AS username,
  @pwd_hash AS password,
  cm.nama_kelas,
  c.id AS class_id,
  b.id AS branch_id,
  CAST(2022 + (s.n % 4) AS CHAR) AS tahun_masuk,
  CASE WHEN MOD(s.n, 25) = 0 THEN (2022 + (s.n % 4) + 3) ELSE NULL END AS tahun_lulus,
  CASE
    WHEN MOD(s.n, 25) = 0 THEN 'Lulus'
    WHEN MOD(s.n, 17) = 0 THEN 'Nonaktif'
    WHEN MOD(s.n, 43) = 0 THEN 'Pindah'
    ELSE 'Aktif'
  END AS status,
  CONCAT('SL25 Siswa ', LPAD(s.n, 5, '0')) AS nama,
  IF(MOD(s.n,2)=0, 'L', 'P') AS jenis_kelamin,
  CONCAT('Alamat SL25 Blok ', LPAD(s.n, 5, '0')) AS alamat,
  CONCAT('Wali SL25 ', LPAD(s.n, 5, '0')) AS nama_wali,
  CONCAT('0815', LPAD(s.n, 8, '0')) AS no_hp_wali
FROM sl25_seq s
JOIN branches b ON b.kode_cabang = CASE
  WHEN s.n <= 6250 THEN 'SL25-A'
  WHEN s.n <= 12500 THEN 'SL25-B'
  WHEN s.n <= 18750 THEN 'SL25-C'
  ELSE 'SL25-D'
END
JOIN sl25_class_master cm ON cm.idx = (MOD(s.n - 1, 18) + 1)
JOIN classes c ON c.branch_id = b.id AND c.nama_kelas = cm.nama_kelas;

-- =====================================================
-- 6) TAGIHAN (8 JENIS PER SISWA = 200.000 TAGIHAN)
-- =====================================================
DROP TEMPORARY TABLE IF EXISTS sl25_bill_templates;
CREATE TEMPORARY TABLE sl25_bill_templates (
  seq INT PRIMARY KEY,
  nama_tagihan VARCHAR(100) NOT NULL,
  nominal DECIMAL(15,2) NOT NULL,
  tanggal_buat DATETIME NOT NULL
);

INSERT INTO sl25_bill_templates (seq, nama_tagihan, nominal, tanggal_buat) VALUES
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
  CONCAT('SL25-BILL-', LPAD(s.id, 8, '0'), '-', LPAD(t.seq, 2, '0')),
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
JOIN sl25_bill_templates t
WHERE s.nis LIKE '8%';

-- =====================================================
-- 7) PEMBAYARAN (>75.000, dibuat ~340.000)
-- Strategi:
-- 1) Semua bill bayar 35%
-- 2) 50% bill bayar lagi 40%
-- 3) 20% bill bayar lagi 25%
-- =====================================================
INSERT INTO payments (
  trans_id, tanggal, kelas, nama, jumlah_bayar,
  penerima, keterangan, bill_id, student_id, class_id, branch_id
)
SELECT
  CONCAT('SL25-TRX-A-', b.id),
  DATE(b.tanggal_buat),
  b.kelas,
  b.nama_siswa,
  ROUND(b.total * 0.35, 2),
  CASE br.kode_cabang
    WHEN 'SL25-A' THEN 'Admin Sl25 A'
    WHEN 'SL25-B' THEN 'Admin Sl25 B'
    WHEN 'SL25-C' THEN 'Admin Sl25 C'
    ELSE 'Admin Sl25 D'
  END,
  'Cicilan 1 (35%)',
  b.id,
  b.student_id,
  b.class_id,
  b.branch_id
FROM bills b
JOIN branches br ON br.id = b.branch_id
WHERE b.id_tagihan_code LIKE 'SL25-BILL-%';

INSERT INTO payments (
  trans_id, tanggal, kelas, nama, jumlah_bayar,
  penerima, keterangan, bill_id, student_id, class_id, branch_id
)
SELECT
  CONCAT('SL25-TRX-B-', b.id),
  DATE_ADD(DATE(b.tanggal_buat), INTERVAL 12 DAY),
  b.kelas,
  b.nama_siswa,
  ROUND(b.total * 0.40, 2),
  CASE br.kode_cabang
    WHEN 'SL25-A' THEN 'Admin Sl25 A'
    WHEN 'SL25-B' THEN 'Admin Sl25 B'
    WHEN 'SL25-C' THEN 'Admin Sl25 C'
    ELSE 'Admin Sl25 D'
  END,
  'Cicilan 2 (40%)',
  b.id,
  b.student_id,
  b.class_id,
  b.branch_id
FROM bills b
JOIN branches br ON br.id = b.branch_id
WHERE b.id_tagihan_code LIKE 'SL25-BILL-%'
  AND MOD(b.id, 2) = 0;

INSERT INTO payments (
  trans_id, tanggal, kelas, nama, jumlah_bayar,
  penerima, keterangan, bill_id, student_id, class_id, branch_id
)
SELECT
  CONCAT('SL25-TRX-C-', b.id),
  DATE_ADD(DATE(b.tanggal_buat), INTERVAL 24 DAY),
  b.kelas,
  b.nama_siswa,
  ROUND(b.total * 0.25, 2),
  CASE br.kode_cabang
    WHEN 'SL25-A' THEN 'Admin Sl25 A'
    WHEN 'SL25-B' THEN 'Admin Sl25 B'
    WHEN 'SL25-C' THEN 'Admin Sl25 C'
    ELSE 'Admin Sl25 D'
  END,
  'Pelunasan (25%)',
  b.id,
  b.student_id,
  b.class_id,
  b.branch_id
FROM bills b
JOIN branches br ON br.id = b.branch_id
WHERE b.id_tagihan_code LIKE 'SL25-BILL-%'
  AND MOD(b.id, 5) = 0;

-- Sinkronisasi bill
UPDATE bills b
JOIN (
  SELECT bill_id, SUM(jumlah_bayar) AS total_bayar
  FROM payments
  WHERE trans_id LIKE 'SL25-%'
    AND bill_id IS NOT NULL
  GROUP BY bill_id
) p ON p.bill_id = b.id
SET b.terbayar = LEAST(b.total, p.total_bayar),
    b.sisa = GREATEST(0, b.total - p.total_bayar),
    b.status = CASE WHEN GREATEST(0, b.total - p.total_bayar) <= 0.01 THEN 'Lunas' ELSE 'Belum Lunas' END
WHERE b.id_tagihan_code LIKE 'SL25-BILL-%';

-- =====================================================
-- 8) BEASISWA PROPORSIONAL
-- =====================================================
INSERT INTO scholarship_types (nama_beasiswa, jenis_nilai, nominal_per_siswa, keterangan)
VALUES
('SL25 Beasiswa 1','nominal',200000,'Reguler 1'),
('SL25 Beasiswa 2','persen',20,'Persen 2'),
('SL25 Beasiswa 3','nominal',250000,'Reguler 3'),
('SL25 Beasiswa 4','persen',25,'Persen 4'),
('SL25 Beasiswa 5','nominal',300000,'Reguler 5'),
('SL25 Beasiswa 6','persen',30,'Persen 6'),
('SL25 Beasiswa 7','nominal',350000,'Reguler 7'),
('SL25 Beasiswa 8','persen',35,'Persen 8'),
('SL25 Beasiswa 9','nominal',400000,'Reguler 9'),
('SL25 Beasiswa 10','persen',40,'Persen 10'),
('SL25 Beasiswa 11','nominal',450000,'Reguler 11'),
('SL25 Beasiswa 12','persen',45,'Persen 12');

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
  ON t.nama_beasiswa = CONCAT('SL25 Beasiswa ', (MOD(s.id, 12) + 1))
WHERE s.nis LIKE '8%'
  AND s.status = 'Aktif'
  AND MOD(s.id, 5) = 0;

INSERT INTO payments (
  trans_id, tanggal, kelas, nama, jumlah_bayar,
  penerima, keterangan, bill_id, student_id, class_id, branch_id
)
SELECT
  CONCAT('SL25-BEA-', r.id) AS trans_id,
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
  CONCAT('Otomatis SL25: ', t.nama_beasiswa) AS keterangan,
  NULL AS bill_id,
  r.student_id,
  r.class_id,
  r.branch_id
FROM scholarship_recipients r
JOIN scholarship_types t ON t.id = r.type_id
WHERE r.nis LIKE '8%'
  AND r.tanggal_terima = '2026-03-01';

UPDATE scholarship_recipients r
JOIN payments p ON p.trans_id = CONCAT('SL25-BEA-', r.id)
SET r.payment_id = p.id
WHERE r.nis LIKE '8%'
  AND r.tanggal_terima = '2026-03-01';

-- =====================================================
-- 9) PENGELUARAN + KATEGORI PROPORSIONAL
-- =====================================================
INSERT INTO expense_categories (branch_id, category_name, is_active)
SELECT b.id, c.category_name, 1
FROM branches b
JOIN (
  SELECT 'SL25 - Operasional' AS category_name
  UNION ALL SELECT 'SL25 - Gaji'
  UNION ALL SELECT 'SL25 - ATK'
  UNION ALL SELECT 'SL25 - Maintenance'
  UNION ALL SELECT 'SL25 - Transport'
  UNION ALL SELECT 'SL25 - Kegiatan'
  UNION ALL SELECT 'SL25 - Lainnya'
) c
WHERE b.kode_cabang IN ('SL25-A','SL25-B','SL25-C','SL25-D');

INSERT INTO expenses (
  branch_id, tanggal, category_id, kategori, deskripsi, nominal,
  report_status, penanggung_jawab_nama, admin_keuangan_nama, is_recurring, is_active
)
SELECT
  b.id,
  DATE_ADD('2026-01-01', INTERVAL (s.n - 1) DAY),
  ec.id,
  ec.category_name,
  CONCAT('[SL25] Pengeluaran ', LPAD(s.n, 4, '0'), ' - ', ec.category_name),
  (300000 + (MOD(s.n, 20) * 50000)),
  IF(MOD(s.n, 2) = 0, 'sudah', 'belum'),
  CONCAT('PJ SL25 ', LPAD(s.n, 4, '0')),
  CASE b.kode_cabang
    WHEN 'SL25-A' THEN 'Admin Sl25 A'
    WHEN 'SL25-B' THEN 'Admin Sl25 B'
    WHEN 'SL25-C' THEN 'Admin Sl25 C'
    ELSE 'Admin Sl25 D'
  END,
  IF(MOD(s.n, 6) = 0, 1, 0),
  1
FROM sl25_seq s
JOIN branches b ON b.kode_cabang IN ('SL25-A','SL25-B','SL25-C','SL25-D')
JOIN expense_categories ec
  ON ec.branch_id = b.id
 AND ec.category_name = CASE MOD(s.n, 7)
   WHEN 0 THEN 'SL25 - Operasional'
   WHEN 1 THEN 'SL25 - Gaji'
   WHEN 2 THEN 'SL25 - ATK'
   WHEN 3 THEN 'SL25 - Maintenance'
   WHEN 4 THEN 'SL25 - Transport'
   WHEN 5 THEN 'SL25 - Kegiatan'
   ELSE 'SL25 - Lainnya'
 END
WHERE s.n <= 800; -- 800 x 4 bendahara = 3.200 pengeluaran

-- =====================================================
-- 10) PEMASUKAN LAIN PROPORSIONAL
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
  CONCAT('[SL25] Pemasukan lain ', LPAD(s.n, 4, '0')),
  (250000 + (MOD(s.n, 30) * 25000)),
  IF(MOD(s.n, 2) = 0, 'sudah', 'belum'),
  1,
  CASE b.kode_cabang
    WHEN 'SL25-A' THEN 'Admin Sl25 A'
    WHEN 'SL25-B' THEN 'Admin Sl25 B'
    WHEN 'SL25-C' THEN 'Admin Sl25 C'
    ELSE 'Admin Sl25 D'
  END
FROM sl25_seq s
JOIN branches b ON b.kode_cabang IN ('SL25-A','SL25-B','SL25-C','SL25-D')
WHERE s.n <= 500; -- 500 x 4 bendahara = 2.000 pemasukan lain

-- =====================================================
-- 11) RINGKASAN CEK CEPAT
-- =====================================================
-- EXPECTED MINIMUM:
-- students                 : 25.000
-- classes                  : 72 (SL25-A..D)
-- bills                    : 200.000
-- payments                 : >75.000 (sekitar 345.000+)
-- scholarship types        : 12
-- scholarship recipients   : ~4.000-5.000
-- expenses                 : 3.200
-- other incomes            : 2.000

SELECT 'students_sl25' AS metric, COUNT(*) AS total
FROM students WHERE nis LIKE '8%'
UNION ALL
SELECT 'classes_sl25', COUNT(*)
FROM classes c JOIN branches b ON b.id = c.branch_id WHERE b.kode_cabang IN ('SL25-A','SL25-B','SL25-C','SL25-D')
UNION ALL
SELECT 'bills_sl25', COUNT(*)
FROM bills WHERE id_tagihan_code LIKE 'SL25-BILL-%'
UNION ALL
SELECT 'payments_sl25', COUNT(*)
FROM payments WHERE trans_id LIKE 'SL25-%'
UNION ALL
SELECT 'scholarship_types_sl25', COUNT(*)
FROM scholarship_types WHERE nama_beasiswa LIKE 'SL25 Beasiswa %'
UNION ALL
SELECT 'scholarship_recipients_sl25', COUNT(*)
FROM scholarship_recipients WHERE nis LIKE '8%'
UNION ALL
SELECT 'expenses_sl25', COUNT(*)
FROM expenses WHERE deskripsi LIKE '[SL25]%'
UNION ALL
SELECT 'other_incomes_sl25', COUNT(*)
FROM other_incomes WHERE deskripsi LIKE '[SL25]%';
