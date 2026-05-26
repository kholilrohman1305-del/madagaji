-- SEED SIMULASI SKALA BESAR SKS
-- Target:
-- 1) 2 cabang operasional
-- 2) 28 kelas total (14 per cabang)
-- 3) 1000 siswa
-- 4) >10 jenis tagihan (dibuat 12 jenis per siswa)
-- 5) >15000 transaksi pembayaran (dibuat ~19k)
-- 6) >7 program beasiswa (dibuat 8)
-- 7) Simulasi pengeluaran + kategori
--
-- Aman dijalankan berulang untuk data berprefix SIM2.

SET @pwd_hash = '$2b$10$2BZKEQuiJjRC7jUqZiuGi.VVzZYexeDPLxMrbcaLBFb04Yt2K0Z1y'; -- admin123

-- =====================================================
-- 0) PASTIKAN SELURUH TABEL SKS ADA (FULL)
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

INSERT IGNORE INTO branches (id, kode_cabang, nama_cabang, is_active)
VALUES (1, 'PUSAT', 'Kantor Pusat', 1);

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
  base_total DECIMAL(15,2) DEFAULT NULL,
  scholarship_discount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  net_total DECIMAL(15,2) DEFAULT NULL,
  scholarship_percent_applied DECIMAL(5,2) NOT NULL DEFAULT 0.00,
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
  qr_token VARCHAR(64) DEFAULT NULL,
  qr_payload TEXT,
  is_reversed TINYINT(1) NOT NULL DEFAULT 0,
  reversed_at DATETIME DEFAULT NULL,
  reversal_reason TEXT,
  revised_from_payment_id INT DEFAULT NULL,
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
  start_date DATE DEFAULT NULL,
  end_date DATE DEFAULT NULL,
  eligible_classes TEXT,
  eligible_student_status VARCHAR(20) NOT NULL DEFAULT 'aktif',
  min_arrears DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  max_recipients INT DEFAULT NULL,
  priority INT NOT NULL DEFAULT 100,
  description TEXT,
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

CREATE TABLE IF NOT EXISTS school_settings (
  id INT NOT NULL DEFAULT 1,
  nama_sekolah VARCHAR(150) NOT NULL,
  alamat_sekolah TEXT DEFAULT NULL,
  telepon VARCHAR(50) DEFAULT NULL,
  email VARCHAR(120) DEFAULT NULL,
  kepala_sekolah VARCHAR(120) DEFAULT NULL,
  website VARCHAR(100) DEFAULT NULL,
  footer_kwitansi TEXT,
  logo_url VARCHAR(255) DEFAULT NULL,
  payment_pin_hash VARCHAR(255) DEFAULT NULL,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Kompatibilitas schema school_settings (beberapa DB lama masih pakai kolom `alamat`)
SET @db = DATABASE();

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'school_settings' AND COLUMN_NAME = 'alamat_sekolah'
    ),
    'SELECT 1',
    'ALTER TABLE school_settings ADD COLUMN alamat_sekolah TEXT NULL AFTER nama_sekolah'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'school_settings' AND COLUMN_NAME = 'alamat'
    ),
    'UPDATE school_settings SET alamat_sekolah = COALESCE(NULLIF(alamat_sekolah, ''''), alamat) WHERE COALESCE(NULLIF(alamat, ''''), '''') <> ''''',
    'SELECT 1'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS scholarships (
  id INT NOT NULL AUTO_INCREMENT,
  id_beasiswa VARCHAR(50) DEFAULT NULL,
  tanggal DATE DEFAULT NULL,
  kelas VARCHAR(50) DEFAULT NULL,
  nama_siswa VARCHAR(100) DEFAULT NULL,
  nama_beasiswa VARCHAR(100) DEFAULT NULL,
  nominal_diajukan DECIMAL(15,2) DEFAULT NULL,
  nominal_terpakai DECIMAL(15,2) DEFAULT NULL,
  sisa_beasiswa DECIMAL(15,2) DEFAULT NULL,
  mode VARCHAR(50) DEFAULT NULL,
  catatan TEXT,
  admin VARCHAR(100) DEFAULT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS scholarship_details (
  id INT NOT NULL AUTO_INCREMENT,
  id_beasiswa VARCHAR(50) DEFAULT NULL,
  id_bill INT DEFAULT NULL,
  id_tagihan_code VARCHAR(50) DEFAULT NULL,
  nama_tagihan VARCHAR(100) DEFAULT NULL,
  sisa_sebelum DECIMAL(15,2) DEFAULT NULL,
  nominal_dipakai DECIMAL(15,2) DEFAULT NULL,
  sisa_sesudah DECIMAL(15,2) DEFAULT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS scholarship_audit_logs (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  action ENUM('add_recipient','cancel_recipient') NOT NULL,
  type_id INT NULL,
  recipient_id INT NULL,
  payment_id INT NULL,
  branch_id INT NULL,
  actor_user_id INT NULL,
  actor_role VARCHAR(30) NULL,
  actor_username VARCHAR(100) NULL,
  detail_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sch_audit_type (type_id),
  INDEX idx_sch_audit_branch (branch_id),
  INDEX idx_sch_audit_created (created_at)
);

CREATE TABLE IF NOT EXISTS scholarship_plans (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  type_id INT NOT NULL,
  branch_id INT NULL,
  target_month TINYINT NOT NULL,
  target_year INT NOT NULL,
  target_recipients INT NOT NULL DEFAULT 0,
  target_nominal DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  notes TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sch_plan_period (target_year, target_month),
  INDEX idx_sch_plan_type (type_id),
  INDEX idx_sch_plan_branch (branch_id)
);

CREATE TABLE IF NOT EXISTS payment_revision_logs (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  old_payment_id INT NOT NULL,
  new_payment_id INT NULL,
  branch_id INT NULL,
  reason TEXT NOT NULL,
  old_payload JSON NULL,
  new_payload JSON NULL,
  actor_user_id INT NULL,
  actor_role VARCHAR(30) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_payment_revision_old (old_payment_id),
  INDEX idx_payment_revision_new (new_payment_id),
  INDEX idx_payment_revision_branch (branch_id),
  INDEX idx_payment_revision_created (created_at)
);

CREATE TABLE IF NOT EXISTS expense_categories (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  branch_id INT NOT NULL,
  category_name VARCHAR(80) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_exp_category_branch (branch_id, category_name),
  INDEX idx_exp_category_branch_active (branch_id, is_active)
);

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
);

CREATE TABLE IF NOT EXISTS pin_change_requests (
  id BIGINT NOT NULL AUTO_INCREMENT,
  admin_id INT NOT NULL,
  branch_id INT NOT NULL,
  requested_pin_hash VARCHAR(255) NOT NULL,
  status ENUM('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
  requested_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP NULL DEFAULT NULL,
  reviewed_by INT NULL,
  review_note VARCHAR(255) NULL,
  PRIMARY KEY (id),
  KEY idx_pin_req_status (status),
  KEY idx_pin_req_admin (admin_id),
  KEY idx_pin_req_branch (branch_id),
  KEY idx_pin_req_reviewed_by (reviewed_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS device_sessions (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  session_id VARCHAR(128) NULL,
  user_id INT NOT NULL,
  role VARCHAR(20) NOT NULL,
  username VARCHAR(100) NULL,
  branch_id INT NULL,
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  login_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  logout_reason VARCHAR(50) NULL,
  INDEX idx_device_user (user_id, role, is_active),
  INDEX idx_device_branch (branch_id, is_active),
  INDEX idx_device_seen (last_seen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  actor_user_id INT NULL,
  actor_role VARCHAR(20) NULL,
  actor_username VARCHAR(100) NULL,
  branch_id INT NULL,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(80) NULL,
  entity_id VARCHAR(80) NULL,
  method VARCHAR(10) NULL,
  path VARCHAR(255) NULL,
  status_code INT NULL,
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  detail_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_actor (actor_user_id, actor_role),
  INDEX idx_audit_branch (branch_id),
  INDEX idx_audit_action (action),
  INDEX idx_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =====================================================
-- B) BERSIHKAN DATA SIM2 LAMA
-- =====================================================
DELETE FROM payments WHERE trans_id LIKE 'SIM2-%';
DELETE FROM bills WHERE id_tagihan_code LIKE 'SIM2-BILL-%';
DELETE FROM scholarship_recipients WHERE nis LIKE '9%';
DELETE FROM scholarship_types WHERE nama_beasiswa LIKE 'SIM2 Beasiswa %';
DELETE FROM expenses WHERE deskripsi LIKE '[SIM2]%';
DELETE FROM expense_categories WHERE category_name LIKE 'SIM2 - %';
DELETE FROM students WHERE nis LIKE '9%';
DELETE FROM admins WHERE username IN ('admin_sim2_a','admin_sim2_b');

DELETE c
FROM classes c
JOIN branches b ON b.id = c.branch_id
WHERE b.kode_cabang IN ('SIM2-A','SIM2-B');

DELETE FROM branches WHERE kode_cabang IN ('SIM2-A','SIM2-B');

-- =====================================================
-- C) CABANG + ADMIN
-- =====================================================
-- Pastikan akun super admin tersedia
INSERT INTO admins (username, password, nama_lengkap, role, branch_id)
SELECT 'superadmin', @pwd_hash, 'Super Admin', 'super_admin', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM admins WHERE username = 'superadmin'
);

INSERT INTO branches (kode_cabang, nama_cabang, alamat, telepon, is_active)
VALUES
  ('SIM2-A', 'Cabang Simulasi Besar A', 'Jl. Simulasi Besar A No.1', '0812-1111-0001', 1),
  ('SIM2-B', 'Cabang Simulasi Besar B', 'Jl. Simulasi Besar B No.2', '0812-2222-0002', 1);

INSERT INTO admins (username, password, nama_lengkap, role, branch_id)
SELECT 'admin_sim2_a', @pwd_hash, 'Admin Simulasi Besar A', 'admin', id
FROM branches WHERE kode_cabang = 'SIM2-A';

INSERT INTO admins (username, password, nama_lengkap, role, branch_id)
SELECT 'admin_sim2_b', @pwd_hash, 'Admin Simulasi Besar B', 'admin', id
FROM branches WHERE kode_cabang = 'SIM2-B';

-- Hardening: pastikan admin simulasi selalu terikat ke branch yang benar
UPDATE admins a
JOIN branches b ON b.kode_cabang = 'SIM2-A'
SET a.branch_id = b.id
WHERE a.username = 'admin_sim2_a';

UPDATE admins a
JOIN branches b ON b.kode_cabang = 'SIM2-B'
SET a.branch_id = b.id
WHERE a.username = 'admin_sim2_b';

-- =====================================================
-- D) PERIODE AKADEMIK
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
-- E) KELAS (14 PER CABANG = 28 TOTAL)
-- =====================================================
DROP TEMPORARY TABLE IF EXISTS sim2_class_master;
CREATE TEMPORARY TABLE sim2_class_master (
  idx INT PRIMARY KEY,
  nama_kelas VARCHAR(50) NOT NULL
);

INSERT INTO sim2_class_master (idx, nama_kelas) VALUES
(1,'10.1'),(2,'10.2'),(3,'10.3'),(4,'10.4'),(5,'10.5'),
(6,'11.1'),(7,'11.2'),(8,'11.3'),(9,'11.4'),(10,'11.5'),
(11,'12.1'),(12,'12.2'),(13,'12.3'),(14,'12.4');

INSERT INTO classes (branch_id, nama_kelas)
SELECT b.id, m.nama_kelas
FROM branches b
JOIN sim2_class_master m
WHERE b.kode_cabang IN ('SIM2-A','SIM2-B');

-- =====================================================
-- F) SISWA (1000)
-- =====================================================
DROP TEMPORARY TABLE IF EXISTS sim2_seq;
CREATE TEMPORARY TABLE sim2_seq (
  n INT NOT NULL PRIMARY KEY
);

INSERT INTO sim2_seq (n)
SELECT (a.d * 100 + b.d * 10 + c.d) + 1 AS n
FROM
  (SELECT 0 d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) a
  CROSS JOIN
  (SELECT 0 d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) b
  CROSS JOIN
  (SELECT 0 d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) c
WHERE (a.d * 100 + b.d * 10 + c.d) < 1000;

INSERT INTO students (
  nis, username, password,
  kelas, class_id, branch_id,
  tahun_masuk, tahun_lulus, status,
  nama, jenis_kelamin,
  alamat, nama_wali, no_hp_wali
)
SELECT
  CONCAT('9', LPAD(s.n, 6, '0')) AS nis,
  CONCAT('9', LPAD(s.n, 6, '0')) AS username,
  @pwd_hash AS password,
  cm.nama_kelas,
  c.id AS class_id,
  b.id AS branch_id,
  CAST(2022 + (s.n % 4) AS CHAR) AS tahun_masuk,
  CASE
    WHEN MOD(s.n, 20) = 0 THEN (2022 + (s.n % 4) + 3)
    ELSE NULL
  END AS tahun_lulus,
  CASE
    WHEN MOD(s.n, 20) = 0 THEN 'Lulus'
    WHEN MOD(s.n, 13) = 0 THEN 'Nonaktif'
    ELSE 'Aktif'
  END AS status,
  CONCAT('SIM2 Siswa ', LPAD(s.n, 4, '0')) AS nama,
  IF(MOD(s.n,2)=0, 'L', 'P') AS jenis_kelamin,
  CONCAT('Alamat SIM2 Blok ', LPAD(s.n, 4, '0')) AS alamat,
  CONCAT('Wali SIM2 ', LPAD(s.n, 4, '0')) AS nama_wali,
  CONCAT('0813', LPAD(s.n, 8, '0')) AS no_hp_wali
FROM sim2_seq s
JOIN branches b ON b.kode_cabang = IF(s.n <= 500, 'SIM2-A', 'SIM2-B')
JOIN sim2_class_master cm ON cm.idx = (MOD(s.n - 1, 14) + 1)
JOIN classes c ON c.branch_id = b.id AND c.nama_kelas = cm.nama_kelas;

-- =====================================================
-- G) TAGIHAN (>10 JENIS, dibuat 12 jenis per siswa)
-- =====================================================
DROP TEMPORARY TABLE IF EXISTS sim2_bill_templates;
CREATE TEMPORARY TABLE sim2_bill_templates (
  seq INT PRIMARY KEY,
  nama_tagihan VARCHAR(100) NOT NULL,
  nominal DECIMAL(15,2) NOT NULL,
  tanggal_buat DATETIME NOT NULL
);

INSERT INTO sim2_bill_templates (seq, nama_tagihan, nominal, tanggal_buat) VALUES
(1,'SPP Januari 2026',350000,'2026-01-05 08:00:00'),
(2,'SPP Februari 2026',350000,'2026-02-05 08:00:00'),
(3,'SPP Maret 2026',350000,'2026-03-05 08:00:00'),
(4,'SPP April 2026',350000,'2026-04-05 08:00:00'),
(5,'SPP Mei 2026',350000,'2026-05-05 08:00:00'),
(6,'SPP Juni 2026',350000,'2026-06-05 08:00:00'),
(7,'Uang Kegiatan Semester',500000,'2026-02-15 09:00:00'),
(8,'Praktikum Lab',220000,'2026-02-20 09:00:00'),
(9,'Tryout & Ujian',275000,'2026-03-12 09:00:00'),
(10,'Perpustakaan',125000,'2026-03-20 09:00:00'),
(11,'Ekstrakurikuler',180000,'2026-04-10 09:00:00'),
(12,'Administrasi Tahunan',600000,'2026-01-25 09:00:00');

INSERT INTO bills (
  id_tagihan_code, nama_tagihan, kelas, nama_siswa,
  total, terbayar, sisa, status,
  tanggal_buat, school_year_name, student_id, class_id, branch_id
)
SELECT
  CONCAT('SIM2-BILL-', LPAD(s.id, 6, '0'), '-', LPAD(t.seq, 2, '0')),
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
JOIN sim2_bill_templates t
WHERE s.nis LIKE '9%';

-- =====================================================
-- H) PEMBAYARAN (>15000 transaksi)
-- Strategi:
-- 1) Semua bill bayar 40%
-- 2) 50% bill bayar lagi 35%
-- 3) Sebagian bill bayar lagi 25% (pelunasan)
-- =====================================================
INSERT INTO payments (
  trans_id, tanggal, kelas, nama, jumlah_bayar,
  penerima, keterangan, bill_id, student_id, class_id, branch_id
)
SELECT
  CONCAT('SIM2-TRX-A-', b.id),
  DATE(b.tanggal_buat),
  b.kelas,
  b.nama_siswa,
  ROUND(b.total * 0.40, 2),
  IF(b.branch_id = (SELECT id FROM branches WHERE kode_cabang='SIM2-A' LIMIT 1), 'Admin Sim2 A', 'Admin Sim2 B'),
  'Cicilan 1 (40%)',
  b.id,
  b.student_id,
  b.class_id,
  b.branch_id
FROM bills b
WHERE b.id_tagihan_code LIKE 'SIM2-BILL-%';

INSERT INTO payments (
  trans_id, tanggal, kelas, nama, jumlah_bayar,
  penerima, keterangan, bill_id, student_id, class_id, branch_id
)
SELECT
  CONCAT('SIM2-TRX-B-', b.id),
  DATE_ADD(DATE(b.tanggal_buat), INTERVAL 10 DAY),
  b.kelas,
  b.nama_siswa,
  ROUND(b.total * 0.35, 2),
  IF(b.branch_id = (SELECT id FROM branches WHERE kode_cabang='SIM2-A' LIMIT 1), 'Admin Sim2 A', 'Admin Sim2 B'),
  'Cicilan 2 (35%)',
  b.id,
  b.student_id,
  b.class_id,
  b.branch_id
FROM bills b
WHERE b.id_tagihan_code LIKE 'SIM2-BILL-%'
  AND MOD(b.id, 2) = 0;

INSERT INTO payments (
  trans_id, tanggal, kelas, nama, jumlah_bayar,
  penerima, keterangan, bill_id, student_id, class_id, branch_id
)
SELECT
  CONCAT('SIM2-TRX-C-', b.id),
  DATE_ADD(DATE(b.tanggal_buat), INTERVAL 20 DAY),
  b.kelas,
  b.nama_siswa,
  ROUND(b.total * 0.25, 2),
  IF(b.branch_id = (SELECT id FROM branches WHERE kode_cabang='SIM2-A' LIMIT 1), 'Admin Sim2 A', 'Admin Sim2 B'),
  'Pelunasan (25%)',
  b.id,
  b.student_id,
  b.class_id,
  b.branch_id
FROM bills b
WHERE b.id_tagihan_code LIKE 'SIM2-BILL-%'
  AND MOD(b.id, 7) = 0;

-- Sinkron terbayar/sisa/status bill
UPDATE bills b
JOIN (
  SELECT bill_id, SUM(jumlah_bayar) AS total_bayar
  FROM payments
  WHERE trans_id LIKE 'SIM2-%'
  GROUP BY bill_id
) p ON p.bill_id = b.id
SET b.terbayar = LEAST(b.total, p.total_bayar),
    b.sisa = GREATEST(0, b.total - p.total_bayar),
    b.status = CASE WHEN GREATEST(0, b.total - p.total_bayar) <= 0.01 THEN 'Lunas' ELSE 'Belum Lunas' END
WHERE b.id_tagihan_code LIKE 'SIM2-BILL-%';

-- =====================================================
-- I) BEASISWA (>7 program)
-- =====================================================
INSERT INTO scholarship_types (nama_beasiswa, jenis_nilai, nominal_per_siswa, keterangan)
VALUES
('SIM2 Beasiswa 1','nominal',250000,'Beasiswa reguler 1'),
('SIM2 Beasiswa 2','persen',30,'Beasiswa persen 2'),
('SIM2 Beasiswa 3','nominal',300000,'Beasiswa reguler 3'),
('SIM2 Beasiswa 4','persen',40,'Beasiswa persen 4'),
('SIM2 Beasiswa 5','nominal',200000,'Beasiswa reguler 5'),
('SIM2 Beasiswa 6','persen',25,'Beasiswa persen 6'),
('SIM2 Beasiswa 7','nominal',350000,'Beasiswa reguler 7'),
('SIM2 Beasiswa 8','persen',50,'Beasiswa persen 8');

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
  ON t.nama_beasiswa = CONCAT('SIM2 Beasiswa ', (MOD(s.id, 8) + 1))
WHERE s.nis LIKE '9%'
  AND s.status = 'Aktif'
  AND MOD(s.id, 3) = 0;

-- Buat transaksi beasiswa agar kolom total anggaran terhitung di tab Ringkasan & Realisasi
INSERT INTO payments (
  trans_id, tanggal, kelas, nama, jumlah_bayar,
  penerima, keterangan, bill_id, student_id, class_id, branch_id
)
SELECT
  CONCAT('SIM2-BEA-', r.id) AS trans_id,
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
  CONCAT('Otomatis SIM2: ', t.nama_beasiswa) AS keterangan,
  NULL AS bill_id,
  r.student_id,
  r.class_id,
  r.branch_id
FROM scholarship_recipients r
JOIN scholarship_types t ON t.id = r.type_id
WHERE r.nis LIKE '9%'
  AND r.tanggal_terima = '2026-03-01';

-- Kaitkan recipient ke payment yang baru dibuat
UPDATE scholarship_recipients r
JOIN payments p ON p.trans_id = CONCAT('SIM2-BEA-', r.id)
SET r.payment_id = p.id
WHERE r.nis LIKE '9%'
  AND r.tanggal_terima = '2026-03-01';

-- =====================================================
-- J) PENGELUARAN + KATEGORI
-- =====================================================
INSERT INTO expense_categories (branch_id, category_name, is_active)
SELECT b.id, c.category_name, 1
FROM branches b
JOIN (
  SELECT 'SIM2 - Operasional' AS category_name
  UNION ALL SELECT 'SIM2 - ATK'
  UNION ALL SELECT 'SIM2 - Maintenance'
  UNION ALL SELECT 'SIM2 - Transport'
  UNION ALL SELECT 'SIM2 - Event'
  UNION ALL SELECT 'SIM2 - Lainnya'
) c
WHERE b.kode_cabang IN ('SIM2-A','SIM2-B');

INSERT INTO expenses (
  branch_id, tanggal, category_id, kategori, deskripsi, nominal,
  report_status, penanggung_jawab_nama, admin_keuangan_nama, is_recurring, is_active
)
SELECT
  b.id,
  DATE_ADD('2026-01-01', INTERVAL (e.n - 1) DAY),
  ec.id,
  ec.category_name,
  CONCAT('[SIM2] Pengeluaran ', LPAD(e.n, 3, '0'), ' - ', ec.category_name),
  (100000 + (MOD(e.n, 15) * 25000)),
  IF(MOD(e.n, 2) = 0, 'sudah', 'belum'),
  CONCAT('PJ SIM2 ', LPAD(e.n, 3, '0')),
  IF(b.kode_cabang='SIM2-A', 'Admin Sim2 A', 'Admin Sim2 B'),
  IF(MOD(e.n, 5) = 0, 1, 0),
  1
FROM sim2_seq e
JOIN branches b ON b.kode_cabang IN ('SIM2-A','SIM2-B')
JOIN expense_categories ec
  ON ec.branch_id = b.id
 AND ec.category_name = CASE MOD(e.n, 6)
   WHEN 0 THEN 'SIM2 - Operasional'
   WHEN 1 THEN 'SIM2 - ATK'
   WHEN 2 THEN 'SIM2 - Maintenance'
   WHEN 3 THEN 'SIM2 - Transport'
   WHEN 4 THEN 'SIM2 - Event'
   ELSE 'SIM2 - Lainnya'
 END
WHERE e.n <= 240;

-- =====================================================
-- K) RINGKASAN CEK CEPAT
-- =====================================================
-- EXPECTED MINIMUM:
-- students         : 1000
-- classes          : 28 (SIM2-A + SIM2-B)
-- bill templates   : 12
-- bills            : 12000
-- payments         : >15000 (sekitar 19700)
-- scholarships     : 8 type
-- recipients       : >300
-- expenses         : 480

SELECT 'students_sim2' AS metric, COUNT(*) AS total
FROM students WHERE nis LIKE '9%'
UNION ALL
SELECT 'classes_sim2', COUNT(*)
FROM classes c JOIN branches b ON b.id=c.branch_id WHERE b.kode_cabang IN ('SIM2-A','SIM2-B')
UNION ALL
SELECT 'bills_sim2', COUNT(*)
FROM bills WHERE id_tagihan_code LIKE 'SIM2-BILL-%'
UNION ALL
SELECT 'payments_sim2', COUNT(*)
FROM payments WHERE trans_id LIKE 'SIM2-%'
UNION ALL
SELECT 'scholarship_types_sim2', COUNT(*)
FROM scholarship_types WHERE nama_beasiswa LIKE 'SIM2 Beasiswa %'
UNION ALL
SELECT 'scholarship_recipients_sim2', COUNT(*)
FROM scholarship_recipients WHERE nis LIKE '9%'
UNION ALL
SELECT 'expenses_sim2', COUNT(*)
FROM expenses WHERE deskripsi LIKE '[SIM2]%';
