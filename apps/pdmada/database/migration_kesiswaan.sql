-- Migration modul Kesiswaan: mutasi siswa, riwayat kelas, dokumen siswa
-- Jalankan pada database sekolah_master yang sudah terpasang schema utama.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS student_mutations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  mutation_type ENUM('masuk', 'pindah', 'keluar') NOT NULL,
  mutation_date DATE NOT NULL,
  from_class_id INT NULL,
  to_class_id INT NULL,
  from_school VARCHAR(150) NULL,
  to_school VARCHAR(150) NULL,
  reason VARCHAR(200) NULL,
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_student_mutations_student (student_id),
  INDEX idx_student_mutations_date (mutation_date),
  CONSTRAINT fk_student_mutations_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_student_mutations_from_class FOREIGN KEY (from_class_id) REFERENCES classes(id) ON DELETE SET NULL,
  CONSTRAINT fk_student_mutations_to_class FOREIGN KEY (to_class_id) REFERENCES classes(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS student_class_histories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  class_id INT NOT NULL,
  school_year_id INT NULL,
  semester_id INT NULL,
  start_date DATE NOT NULL,
  end_date DATE NULL,
  status ENUM('aktif', 'naik', 'tinggal', 'pindah', 'lulus', 'keluar') NOT NULL DEFAULT 'aktif',
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_student_class_histories_student (student_id),
  INDEX idx_student_class_histories_class (class_id),
  INDEX idx_student_class_histories_period (start_date, end_date),
  CONSTRAINT fk_student_class_histories_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_student_class_histories_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE RESTRICT,
  CONSTRAINT fk_student_class_histories_school_year FOREIGN KEY (school_year_id) REFERENCES school_years(id) ON DELETE SET NULL,
  CONSTRAINT fk_student_class_histories_semester FOREIGN KEY (semester_id) REFERENCES semesters(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS student_documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  document_type VARCHAR(60) NOT NULL,
  file_number VARCHAR(60) NULL,
  file_url VARCHAR(255) NULL,
  issuer VARCHAR(150) NULL,
  issued_date DATE NULL,
  status ENUM('valid', 'proses', 'kedaluwarsa') NOT NULL DEFAULT 'valid',
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_student_documents_student (student_id),
  INDEX idx_student_documents_type (document_type),
  CONSTRAINT fk_student_documents_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

SET FOREIGN_KEY_CHECKS = 1;
