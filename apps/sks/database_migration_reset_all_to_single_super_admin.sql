-- RESET ALL-IN-ONE SKS
-- Tujuan:
-- 1) Pastikan semua tabel utama SKS tersedia (schema lengkap)
-- 2) Kosongkan seluruh data operasional
-- 3) Sisakan 1 user super admin
--
-- Default login:
-- username: superadmin
-- password: admin123
-- (bcrypt hash sudah disiapkan di bawah)

SET @db = DATABASE();

-- =========================
-- 1) SCHEMA LENGKAP
-- =========================

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
  UNIQUE KEY unique_siswa (kelas, nama),
  UNIQUE KEY nis (nis),
  UNIQUE KEY username (username),
  KEY idx_siswa_nama (nama),
  KEY idx_siswa_kelas (kelas),
  KEY idx_students_class_id (class_id),
  KEY idx_students_branch_id (branch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS bills (
  id INT NOT NULL AUTO_INCREMENT,
  id_tagihan_code VARCHAR(50) DEFAULT NULL,
  nama_tagihan VARCHAR(100) DEFAULT NULL,
  kelas VARCHAR(50) DEFAULT NULL,
  nama_siswa VARCHAR(100) DEFAULT NULL,
  total DECIMAL(15,2) DEFAULT 0.00,
  base_total DECIMAL(15,2) DEFAULT NULL,
  scholarship_discount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  net_total DECIMAL(15,2) DEFAULT NULL,
  scholarship_percent_applied DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  terbayar DECIMAL(15,2) DEFAULT 0.00,
  sisa DECIMAL(15,2) DEFAULT 0.00,
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
  nominal_per_siswa DECIMAL(15,2) DEFAULT 0.00,
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
  KEY type_id (type_id),
  KEY idx_sr_student_id (student_id),
  KEY idx_sr_class_id (class_id),
  KEY idx_sr_branch_id (branch_id)
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

-- =========================
-- 2) RESET DATA
-- =========================

SET FOREIGN_KEY_CHECKS = 0;

TRUNCATE TABLE audit_logs;
TRUNCATE TABLE device_sessions;
TRUNCATE TABLE pin_change_requests;
TRUNCATE TABLE payment_revision_logs;
TRUNCATE TABLE payments;
TRUNCATE TABLE bills;
TRUNCATE TABLE scholarship_details;
TRUNCATE TABLE scholarships;
TRUNCATE TABLE scholarship_audit_logs;
TRUNCATE TABLE scholarship_plans;
TRUNCATE TABLE scholarship_recipients;
TRUNCATE TABLE scholarship_types;
TRUNCATE TABLE expenses;
TRUNCATE TABLE expense_categories;
TRUNCATE TABLE students;
TRUNCATE TABLE classes;
TRUNCATE TABLE school_years;
TRUNCATE TABLE semesters;
TRUNCATE TABLE admins;
TRUNCATE TABLE branches;
TRUNCATE TABLE school_settings;

SET FOREIGN_KEY_CHECKS = 1;

-- =========================
-- 3) SEED MINIMAL
-- =========================

INSERT INTO branches (id, kode_cabang, nama_cabang, is_active)
VALUES (1, 'PUSAT', 'Kantor Pusat', 1);

INSERT INTO school_settings (id, nama_sekolah, logo_url)
VALUES (1, 'Sistem Keuangan Sekolah', NULL);

INSERT INTO semesters (id, name, is_active)
VALUES
  (1, 'Ganjil', 0),
  (2, 'Genap', 1);

-- password hash = bcrypt('admin123')
INSERT INTO admins (id, username, password, nama_lengkap, role, branch_id, homeroom_class, pdmada_teacher_id)
VALUES
  (1, 'superadmin', '$2b$10$2BZKEQuiJjRC7jUqZiuGi.VVzZYexeDPLxMrbcaLBFb04Yt2K0Z1y', 'Super Admin', 'super_admin', NULL, NULL, NULL);
