CREATE DATABASE IF NOT EXISTS gaji CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE gaji;

CREATE TABLE IF NOT EXISTS guru (
  guru_id VARCHAR(10) PRIMARY KEY,
  kode VARCHAR(50),
  nama VARCHAR(100) NOT NULL,
  klasifikasi VARCHAR(50),
  tmt INT,
  tugas_ids VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS honor_tugas (
  tugas_id VARCHAR(10) PRIMARY KEY,
  nama VARCHAR(100) NOT NULL,
  nominal DECIMAL(12,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS mapel (
  mapel_id VARCHAR(10) PRIMARY KEY,
  nama VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS jadwal (
  id VARCHAR(10) PRIMARY KEY,
  hari VARCHAR(10) NOT NULL,
  jam_ke VARCHAR(20) NOT NULL,
  kelas VARCHAR(20) NOT NULL,
  mapel_id VARCHAR(10),
  guru_id VARCHAR(10),
  INDEX idx_jadwal_hari (hari),
  INDEX idx_jadwal_guru (guru_id),
  INDEX idx_jadwal_kelas (kelas),
  UNIQUE KEY uniq_jadwal_kelas (hari, jam_ke, kelas)
);

CREATE TABLE IF NOT EXISTS kehadiran (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tanggal DATETIME NOT NULL,
  jam_ke VARCHAR(50) NOT NULL,
  kelas VARCHAR(20) NOT NULL,
  guru_id VARCHAR(10),
  status VARCHAR(20) NOT NULL,
  jumlah_jam INT NOT NULL DEFAULT 0,
  tanggal_only DATE NOT NULL,
  INDEX idx_kehadiran_date (tanggal_only),
  INDEX idx_kehadiran_guru (guru_id),
  UNIQUE KEY uniq_kehadiran (guru_id, kelas, jam_ke, tanggal_only),
  CONSTRAINT fk_kehadiran_guru FOREIGN KEY (guru_id) REFERENCES guru(guru_id) ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS konfigurasi (
  config_key VARCHAR(50) PRIMARY KEY,
  config_value VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS kelas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nama VARCHAR(50) NOT NULL
);

CREATE TABLE IF NOT EXISTS piket (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nama VARCHAR(50) NOT NULL
);

CREATE TABLE IF NOT EXISTS kategori_pengeluaran (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nama VARCHAR(50) NOT NULL
);

CREATE TABLE IF NOT EXISTS transport_manual (
  id INT AUTO_INCREMENT PRIMARY KEY,
  guru_id VARCHAR(10) NOT NULL,
  periode VARCHAR(7) NOT NULL,
  transport_hari INT DEFAULT 0,
  transport_acara INT DEFAULT 0,
  INDEX idx_transport_periode (periode),
  UNIQUE KEY uniq_transport (guru_id, periode),
  CONSTRAINT fk_transport_guru FOREIGN KEY (guru_id) REFERENCES guru(guru_id) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pengeluaran_lain (
  id VARCHAR(10) PRIMARY KEY,
  tanggal DATE NOT NULL,
  kategori VARCHAR(50) NOT NULL,
  penerima VARCHAR(100) NOT NULL,
  jumlah INT NOT NULL DEFAULT 1,
  nominal DECIMAL(12,2) NOT NULL DEFAULT 0,
  keterangan TEXT,
  INDEX idx_pengeluaran_tanggal (tanggal)
);

CREATE TABLE IF NOT EXISTS teacher_task_rates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  task_id INT NOT NULL,
  nominal DECIMAL(12,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_task_rate (task_id)
);

CREATE TABLE IF NOT EXISTS teacher_subjects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  teacher_id INT NOT NULL,
  subject_id INT NOT NULL,
  priority INT NOT NULL DEFAULT 1,
  UNIQUE KEY uniq_teacher_subject (teacher_id, subject_id),
  INDEX idx_teacher_priority (teacher_id, priority)
);

CREATE TABLE IF NOT EXISTS class_subjects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  class_id INT NOT NULL,
  subject_id INT NOT NULL,
  hours_per_week INT NOT NULL DEFAULT 2,
  UNIQUE KEY uniq_class_subject (class_id, subject_id),
  INDEX idx_class_subjects (class_id)
);

CREATE TABLE IF NOT EXISTS teacher_limits (
  id INT AUTO_INCREMENT PRIMARY KEY,
  teacher_id INT NOT NULL,
  max_hours_per_week INT DEFAULT NULL,
  max_hours_per_day INT DEFAULT NULL,
  min_hours_linier INT DEFAULT NULL,
  UNIQUE KEY uniq_teacher_limit (teacher_id)
);

CREATE TABLE IF NOT EXISTS schedule_config (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  config_json JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS libur (
  tanggal DATE PRIMARY KEY,
  keterangan VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  password_salt VARCHAR(255) NOT NULL,
  role ENUM('admin','guru') NOT NULL DEFAULT 'admin',
  display_name VARCHAR(100),
  last_login DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS kegiatan (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tanggal DATE NOT NULL,
  nama VARCHAR(150) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_kegiatan_tanggal (tanggal)
);

CREATE TABLE IF NOT EXISTS kegiatan_guru (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kegiatan_id INT NOT NULL,
  guru_id VARCHAR(10) NOT NULL,
  UNIQUE KEY uniq_kegiatan_guru (kegiatan_id, guru_id),
  INDEX idx_kegiatan_guru (guru_id),
  CONSTRAINT fk_kegiatan_guru FOREIGN KEY (kegiatan_id) REFERENCES kegiatan(id) ON DELETE CASCADE
);

INSERT INTO konfigurasi (config_key, config_value) VALUES
  ('RATE_MENGAJAR', '0'),
  ('RATE_HADIR', '0'),
  ('RATE_IZIN', '0'),
  ('RATE_TIDAK_HADIR', '0'),
  ('RATE_TRANSPORT', '0'),
  ('RATE_TRANSPORT_PNS', '0'),
  ('RATE_TRANSPORT_INPASSING', '0'),
  ('RATE_TRANSPORT_SERTIFIKASI', '0'),
  ('RATE_TRANSPORT_NON_SERTIFIKASI', '0'),
  ('WIYATHA_1_5', '0'),
  ('WIYATHA_6_10', '0'),
  ('WIYATHA_11_15', '0'),
  ('WIYATHA_16_20', '0'),
  ('WIYATHA_21_25', '0'),
  ('WIYATHA_26_PLUS', '0')
ON DUPLICATE KEY UPDATE config_value = VALUES(config_value);
