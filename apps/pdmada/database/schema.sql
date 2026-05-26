CREATE DATABASE IF NOT EXISTS sekolah_master
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE sekolah_master;

CREATE TABLE IF NOT EXISTS students (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nik VARCHAR(20) NULL UNIQUE,
  nis_local VARCHAR(20) NULL,
  nisn VARCHAR(20) NOT NULL UNIQUE,
  nism VARCHAR(20) NULL,
  kip VARCHAR(30) NULL,
  name VARCHAR(100) NOT NULL,
  birth_place VARCHAR(100) NULL,
  gender ENUM('L', 'P') NULL,
  birth_date DATE NULL,
  religion VARCHAR(30) NULL,
  student_status ENUM('aktif', 'pindah', 'lulus', 'keluar') NOT NULL DEFAULT 'aktif',
  previous_school VARCHAR(150) NULL,
  school_origin_npsn VARCHAR(20) NULL,
  no_akta_lahir VARCHAR(50) NULL,
  special_needs TEXT NULL,
  paud VARCHAR(100) NULL,
  tk VARCHAR(100) NULL,
  hobby VARCHAR(100) NULL,
  aspiration VARCHAR(100) NULL,
  blood_type VARCHAR(5) NULL,
  height_cm INT NULL,
  weight_kg INT NULL,
  transportation VARCHAR(50) NULL,
  distance_km DECIMAL(6,2) NULL,
  penerima_kps TINYINT(1) NOT NULL DEFAULT 0,
  no_kps VARCHAR(50) NULL,
  emergency_contact_name VARCHAR(100) NULL,
  emergency_contact_phone VARCHAR(30) NULL,
  emergency_contact_relation VARCHAR(30) NULL,
  family_card_number VARCHAR(30) NULL,
  citizenship VARCHAR(50) NULL,
  living_with VARCHAR(30) NULL,
  siblings_count INT NULL,
  child_order INT NULL,
  phone VARCHAR(30) NULL,
  pondok_pesantren VARCHAR(100) NULL,
  class_id INT NULL,
  entry_date DATE NULL,
  school_year_id INT NULL,
  father_nik VARCHAR(20) NULL,
  father_name VARCHAR(100) NULL,
  father_birth_place VARCHAR(100) NULL,
  father_birth_date DATE NULL,
  father_status VARCHAR(30) NULL,
  father_education VARCHAR(50) NULL,
  father_occupation VARCHAR(100) NULL,
  father_domicile VARCHAR(100) NULL,
  father_phone VARCHAR(30) NULL,
  father_income_monthly DECIMAL(12,2) NULL,
  father_address TEXT NULL,
  mother_nik VARCHAR(20) NULL,
  mother_name VARCHAR(100) NULL,
  mother_birth_place VARCHAR(100) NULL,
  mother_birth_date DATE NULL,
  mother_status VARCHAR(30) NULL,
  mother_education VARCHAR(50) NULL,
  mother_occupation VARCHAR(100) NULL,
  mother_domicile VARCHAR(100) NULL,
  mother_phone VARCHAR(30) NULL,
  mother_income_monthly DECIMAL(12,2) NULL,
  mother_address TEXT NULL,
  guardian_nik VARCHAR(20) NULL,
  guardian_name VARCHAR(100) NULL,
  guardian_birth_place VARCHAR(100) NULL,
  guardian_birth_date DATE NULL,
  guardian_status VARCHAR(30) NULL,
  guardian_education VARCHAR(50) NULL,
  guardian_occupation VARCHAR(100) NULL,
  guardian_domicile VARCHAR(100) NULL,
  guardian_phone VARCHAR(30) NULL,
  guardian_income_monthly DECIMAL(12,2) NULL,
  guardian_address TEXT NULL,
  address TEXT NULL,
  address_dusun VARCHAR(100) NULL,
  address_rt VARCHAR(5) NULL,
  address_rw VARCHAR(5) NULL,
  address_village VARCHAR(100) NULL,
  address_subdistrict VARCHAR(100) NULL,
  address_city VARCHAR(100) NULL,
  address_province VARCHAR(100) NULL,
  postal_code VARCHAR(10) NULL,
  latitude VARCHAR(30) NULL,
  longitude VARCHAR(30) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS school_years (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(20) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_school_year_name (name)
);

CREATE TABLE IF NOT EXISTS semesters (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(20) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_semester_name (name)
);

INSERT IGNORE INTO semesters (name, is_active)
VALUES ('Ganjil', 0), ('Genap', 1);

CREATE TABLE IF NOT EXISTS classes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  grade_level VARCHAR(20) NULL,
  homeroom_teacher VARCHAR(100) NULL,
  homeroom_teacher_id INT NULL,
  room_name VARCHAR(100) NULL,
  curriculum VARCHAR(100) NULL,
  student_count INT NULL,
  max_students INT NULL,
  jtm_rombel INT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_class_name (name)
);

-- Idempotent FK creation (safe when schema.sql dijalankan berulang)
SET @schema_name = DATABASE();

SET @fk_exists = (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = @schema_name
    AND TABLE_NAME = 'students'
    AND CONSTRAINT_NAME = 'fk_students_class'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @sql_fk_students_class = IF(
  @fk_exists = 0,
  'ALTER TABLE students ADD CONSTRAINT fk_students_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL',
  'SELECT "fk_students_class already exists"'
);
PREPARE stmt_fk_students_class FROM @sql_fk_students_class;
EXECUTE stmt_fk_students_class;
DEALLOCATE PREPARE stmt_fk_students_class;

SET @fk_exists = (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = @schema_name
    AND TABLE_NAME = 'students'
    AND CONSTRAINT_NAME = 'fk_students_school_year'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @sql_fk_students_school_year = IF(
  @fk_exists = 0,
  'ALTER TABLE students ADD CONSTRAINT fk_students_school_year FOREIGN KEY (school_year_id) REFERENCES school_years(id) ON DELETE SET NULL',
  'SELECT "fk_students_school_year already exists"'
);
PREPARE stmt_fk_students_school_year FROM @sql_fk_students_school_year;
EXECUTE stmt_fk_students_school_year;
DEALLOCATE PREPARE stmt_fk_students_school_year;

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

CREATE TABLE IF NOT EXISTS student_achievements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  title VARCHAR(180) NOT NULL,
  achievement_category ENUM('akademik','non_akademik') NOT NULL DEFAULT 'akademik',
  achievement_type VARCHAR(80) NULL,
  level_name VARCHAR(80) NULL,
  organizer VARCHAR(150) NULL,
  achievement_date DATE NULL,
  rank_value VARCHAR(60) NULL,
  notes TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_student_achievements_student (student_id),
  INDEX idx_student_achievements_date (achievement_date),
  CONSTRAINT fk_student_achievements_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS teachers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  niy VARCHAR(30) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  classification VARCHAR(50) NULL,
  degree VARCHAR(50) NULL,
  subject VARCHAR(100) NULL,
  subject_id INT NULL,
  additional_task VARCHAR(100) NULL,
  phone VARCHAR(30) NULL,
  email VARCHAR(100) NULL,
  s1_university VARCHAR(100) NULL,
  s1_major VARCHAR(100) NULL,
  s1_grad_year YEAR NULL,
  s2_university VARCHAR(100) NULL,
  s2_major VARCHAR(100) NULL,
  s2_grad_year YEAR NULL,
  educator_certificate VARCHAR(100) NULL,
  certificate_major VARCHAR(100) NULL,
  nik VARCHAR(20) NULL,
  family_card_number VARCHAR(30) NULL,
  tmt DATE NULL,
  gender ENUM('L', 'P') NULL,
  birth_place VARCHAR(100) NULL,
  birth_date DATE NULL,
  address TEXT NULL,
  address_village VARCHAR(100) NULL,
  address_subdistrict VARCHAR(100) NULL,
  address_city VARCHAR(100) NULL,
  address_province VARCHAR(100) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS teacher_tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  teacher_id INT NOT NULL,
  title VARCHAR(150) NOT NULL,
  description TEXT NULL,
  start_date DATE NULL,
  end_date DATE NULL,
  status ENUM('aktif', 'selesai', 'dibatalkan') NOT NULL DEFAULT 'aktif',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_teacher_tasks_teacher (teacher_id),
  CONSTRAINT fk_teacher_tasks_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS additional_tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL UNIQUE,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT IGNORE INTO additional_tasks (name, is_active) VALUES
('Kepala Madrasah', 1),
('Bendahara', 1),
('Waka Kesiswaan', 1),
('Waka Akademik', 1),
('Waka Sarpras', 1),
('Waka Humas', 1),
('Asisten Waka', 1),
('Kepala Tata Usaha', 1),
('Tata Usaha', 1),
('Tata Usaha 1', 1),
('Tata Usaha 2', 1),
('Piket', 1),
('Pembina Osis', 1),
('Pembina Prestasi', 1),
('Wali Kelas', 1),
('Badal', 1),
('BK', 1),
('Pendamping Ekstra', 1),
('Petugas Ketertiban 1', 1),
('Petugas Ketertiban 2', 1);

CREATE TABLE IF NOT EXISTS subjects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  group_name VARCHAR(50) NULL,
  grade_level VARCHAR(20) NULL,
  kkm DECIMAL(5,2) NULL,
  display_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS extracurriculars (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  description TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_extracurricular_name (name),
  INDEX idx_extracurricular_active (is_active)
);

SET @fk_exists = (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = @schema_name
    AND TABLE_NAME = 'teachers'
    AND CONSTRAINT_NAME = 'fk_teachers_subject'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @sql_fk_teachers_subject = IF(
  @fk_exists = 0,
  'ALTER TABLE teachers ADD CONSTRAINT fk_teachers_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL',
  'SELECT "fk_teachers_subject already exists"'
);
PREPARE stmt_fk_teachers_subject FROM @sql_fk_teachers_subject;
EXECUTE stmt_fk_teachers_subject;
DEALLOCATE PREPARE stmt_fk_teachers_subject;

SET @fk_exists = (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = @schema_name
    AND TABLE_NAME = 'classes'
    AND CONSTRAINT_NAME = 'fk_classes_homeroom_teacher'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @sql_fk_classes_homeroom_teacher = IF(
  @fk_exists = 0,
  'ALTER TABLE classes ADD CONSTRAINT fk_classes_homeroom_teacher FOREIGN KEY (homeroom_teacher_id) REFERENCES teachers(id) ON DELETE SET NULL',
  'SELECT "fk_classes_homeroom_teacher already exists"'
);
PREPARE stmt_fk_classes_homeroom_teacher FROM @sql_fk_classes_homeroom_teacher;
EXECUTE stmt_fk_classes_homeroom_teacher;
DEALLOCATE PREPARE stmt_fk_classes_homeroom_teacher;

CREATE TABLE IF NOT EXISTS student_scores (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  class_id INT NULL,
  subject_id INT NOT NULL,
  school_year_id INT NOT NULL,
  semester_id INT NOT NULL,
  score_value DECIMAL(5,2) NULL,
  achievement_note TEXT NULL,
  extracurricular_activity VARCHAR(150) NULL,
  extracurricular_predicate VARCHAR(50) NULL,
  attendance_sick INT NULL,
  attendance_permit INT NULL,
  attendance_absent INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_student_score_period (student_id, subject_id, school_year_id, semester_id),
  INDEX idx_student_scores_student_period (student_id, school_year_id, semester_id),
  INDEX idx_student_scores_subject (subject_id),
  CONSTRAINT fk_student_scores_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_student_scores_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL,
  CONSTRAINT fk_student_scores_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
  CONSTRAINT fk_student_scores_school_year FOREIGN KEY (school_year_id) REFERENCES school_years(id) ON DELETE CASCADE,
  CONSTRAINT fk_student_scores_semester FOREIGN KEY (semester_id) REFERENCES semesters(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS student_report_meta (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  class_id INT NULL,
  school_year_id INT NOT NULL,
  semester_id INT NOT NULL,
  extracurricular_activity VARCHAR(150) NULL,
  extracurricular_predicate VARCHAR(50) NULL,
  attendance_sick INT NULL,
  attendance_permit INT NULL,
  attendance_absent INT NULL,
  homeroom_note TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_report_meta_period (student_id, school_year_id, semester_id),
  INDEX idx_report_meta_class_period (class_id, school_year_id, semester_id),
  CONSTRAINT fk_report_meta_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_report_meta_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL,
  CONSTRAINT fk_report_meta_school_year FOREIGN KEY (school_year_id) REFERENCES school_years(id) ON DELETE CASCADE,
  CONSTRAINT fk_report_meta_semester FOREIGN KEY (semester_id) REFERENCES semesters(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS class_subject_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  class_id INT NOT NULL,
  subject_id INT NOT NULL,
  school_year_id INT NOT NULL,
  semester_id INT NOT NULL,
  kkm DECIMAL(5,2) NULL,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_class_subject_period (class_id, subject_id, school_year_id, semester_id),
  INDEX idx_css_period (school_year_id, semester_id, class_id),
  INDEX idx_css_subject (subject_id),
  CONSTRAINT fk_css_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_css_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
  CONSTRAINT fk_css_school_year FOREIGN KEY (school_year_id) REFERENCES school_years(id) ON DELETE CASCADE,
  CONSTRAINT fk_css_semester FOREIGN KEY (semester_id) REFERENCES semesters(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pondok_pesantren (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_pondok_pesantren_name (name)
);

CREATE TABLE IF NOT EXISTS school_settings (
  id INT NOT NULL PRIMARY KEY DEFAULT 1,
  school_name VARCHAR(160) NOT NULL DEFAULT '',
  school_subtitle VARCHAR(160) NOT NULL DEFAULT '',
  npsn VARCHAR(30) NOT NULL DEFAULT '',
  nsm VARCHAR(30) NOT NULL DEFAULT '',
  address TEXT NULL,
  village VARCHAR(120) NOT NULL DEFAULT '',
  city VARCHAR(120) NOT NULL DEFAULT '',
  province VARCHAR(120) NOT NULL DEFAULT '',
  postal_code VARCHAR(20) NOT NULL DEFAULT '',
  phone VARCHAR(50) NOT NULL DEFAULT '',
  email VARCHAR(120) NOT NULL DEFAULT '',
  website VARCHAR(160) NOT NULL DEFAULT '',
  logo_url VARCHAR(255) NOT NULL DEFAULT '',
  principal_name VARCHAR(160) NOT NULL DEFAULT '',
  principal_nip VARCHAR(80) NOT NULL DEFAULT '',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO school_settings
  (id, school_name, school_subtitle, npsn, nsm, address, village, city, province, postal_code, phone, email, website, logo_url, principal_name, principal_nip)
VALUES
  (1, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '')
ON DUPLICATE KEY UPDATE id = id;

CREATE TABLE IF NOT EXISTS change_log (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  table_name VARCHAR(50) NOT NULL,
  record_id INT NOT NULL,
  operation ENUM('insert', 'update', 'delete') NOT NULL,
  data_json JSON NULL,
  source VARCHAR(20) NOT NULL DEFAULT 'local',
  changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_change_time (changed_at),
  INDEX idx_change_table (table_name, record_id)
);
