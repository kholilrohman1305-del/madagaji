-- NOTE:
-- This schema is synced from the original phpMyAdmin dump "sekolah_db (1).sql"
-- to match what the current backend (`server.js`) expects.

CREATE DATABASE IF NOT EXISTS sekolah_db;
USE sekolah_db;

-- Branches (cabang)
CREATE TABLE IF NOT EXISTS branches (
  id INT NOT NULL AUTO_INCREMENT,
  kode_cabang VARCHAR(30) NOT NULL,
  nama_cabang VARCHAR(120) NOT NULL,
  alamat TEXT DEFAULT NULL,
  telepon VARCHAR(50) DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_branch_code (kode_cabang),
  UNIQUE KEY uniq_branch_name (nama_cabang)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT IGNORE INTO branches (id, kode_cabang, nama_cabang, is_active) VALUES (1, 'PUSAT', 'Kantor Pusat', 1);

-- Admin login (basic)
CREATE TABLE IF NOT EXISTS admins (
  id INT NOT NULL AUTO_INCREMENT,
  username VARCHAR(50) NOT NULL,
  password VARCHAR(255) NOT NULL,
  nama_lengkap VARCHAR(100) DEFAULT NULL,
  role ENUM('super_admin','admin') NOT NULL DEFAULT 'super_admin',
  branch_id INT DEFAULT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY username (username),
  KEY idx_admin_branch (branch_id),
  CONSTRAINT fk_admin_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Master classes
CREATE TABLE IF NOT EXISTS classes (
  id INT NOT NULL AUTO_INCREMENT,
  branch_id INT NOT NULL DEFAULT 1,
  nama_kelas VARCHAR(50) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_branch_class (branch_id, nama_kelas),
  KEY idx_classes_branch (branch_id),
  CONSTRAINT fk_classes_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Students
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
  status ENUM('Aktif','Nonaktif','Lulus','Pindah','Keluar') DEFAULT 'Aktif',
  nama VARCHAR(100) NOT NULL,
  jenis_kelamin ENUM('L','P') DEFAULT 'L',
  tempat_lahir VARCHAR(50) DEFAULT NULL,
  tanggal_lahir DATE DEFAULT NULL,
  alamat TEXT,
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
  KEY idx_students_branch_id (branch_id),
  CONSTRAINT fk_students_class_id FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL,
  CONSTRAINT fk_students_branch_id FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Bills / arrears
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
  student_id INT DEFAULT NULL,
  class_id INT DEFAULT NULL,
  branch_id INT NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  KEY idx_tagihan_nama (nama_siswa),
  KEY idx_bills_student_id (student_id),
  KEY idx_bills_class_id (class_id),
  KEY idx_bills_branch_id (branch_id),
  CONSTRAINT fk_bills_student_id FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL,
  CONSTRAINT fk_bills_class_id FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL,
  CONSTRAINT fk_bills_branch_id FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Payments (cashflow)
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
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_bayar_tanggal (tanggal),
  KEY idx_payments_student_id (student_id),
  KEY idx_payments_class_id (class_id),
  KEY idx_payments_branch_id (branch_id),
  CONSTRAINT fk_payments_student_id FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL,
  CONSTRAINT fk_payments_class_id FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL,
  CONSTRAINT fk_payments_branch_id FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Scholarship master types
CREATE TABLE IF NOT EXISTS scholarship_types (
  id INT NOT NULL AUTO_INCREMENT,
  nama_beasiswa VARCHAR(100) NOT NULL,
  jenis_nilai ENUM('nominal','persen') DEFAULT 'nominal',
  nominal_per_siswa DECIMAL(15,2) DEFAULT '0.00',
  keterangan TEXT,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Scholarship application/recipient
CREATE TABLE IF NOT EXISTS scholarship_recipients (
  id INT NOT NULL AUTO_INCREMENT,
  type_id INT DEFAULT NULL,
  nama_siswa VARCHAR(100) DEFAULT NULL,
  kelas VARCHAR(50) DEFAULT NULL,
  nis VARCHAR(20) DEFAULT NULL,
  tanggal_terima DATE DEFAULT NULL,
  payment_id INT DEFAULT NULL,
  student_id INT DEFAULT NULL,
  class_id INT DEFAULT NULL,
  branch_id INT NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  KEY type_id (type_id),
  KEY idx_sr_student_id (student_id),
  KEY idx_sr_class_id (class_id),
  KEY idx_sr_branch_id (branch_id),
  CONSTRAINT scholarship_recipients_ibfk_1
    FOREIGN KEY (type_id) REFERENCES scholarship_types (id) ON DELETE CASCADE,
  CONSTRAINT fk_sr_student_id FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL,
  CONSTRAINT fk_sr_class_id FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL,
  CONSTRAINT fk_sr_branch_id FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- (Legacy) Scholarship header table
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

-- (Legacy) Scholarship usage detail table
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

-- School settings (single row id=1)
CREATE TABLE IF NOT EXISTS school_settings (
  id INT NOT NULL DEFAULT '1',
  nama_sekolah VARCHAR(100) DEFAULT 'NAMA SEKOLAH ANDA',
  alamat_sekolah TEXT,
  telepon VARCHAR(50) DEFAULT NULL,
  email VARCHAR(100) DEFAULT NULL,
  website VARCHAR(100) DEFAULT NULL,
  footer_kwitansi TEXT,
  logo_url VARCHAR(255) DEFAULT NULL,
  payment_pin_hash VARCHAR(255) DEFAULT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Academic period master
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

INSERT IGNORE INTO semesters (name, is_active) VALUES ('Ganjil', 0), ('Genap', 1);
