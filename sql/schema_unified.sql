-- =========================================================
-- SCHEMA UNIFIED - Madagaji School Management System
-- Single database, English table names, 30+ tables
-- =========================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- =========================================================
-- CORE / AUTH
-- =========================================================

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  password_salt VARCHAR(255) NOT NULL,
  role ENUM('admin','guru','staff','student') NOT NULL DEFAULT 'admin',
  display_name VARCHAR(100),
  email VARCHAR(100),
  phone VARCHAR(20),
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_login DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
  config_key VARCHAR(100) PRIMARY KEY,
  config_value TEXT,
  category VARCHAR(50) NOT NULL DEFAULT 'general',
  description VARCHAR(255),
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS academic_years (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  start_date DATE NULL,
  end_date DATE NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_academic_years_name (name),
  INDEX idx_academic_years_active (is_active)
);

-- =========================================================
-- MASTER DATA
-- =========================================================

CREATE TABLE IF NOT EXISTS teachers (
  id VARCHAR(10) PRIMARY KEY,
  user_id INT NULL,
  nip VARCHAR(20),
  name VARCHAR(100) NOT NULL,
  classification VARCHAR(50),
  tmt INT,
  gender CHAR(1),
  birth_date DATE,
  address TEXT,
  phone VARCHAR(20),
  email VARCHAR(100),
  specialization VARCHAR(100),
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  photo_url VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_teachers_user (user_id),
  INDEX idx_teachers_active (is_active),
  CONSTRAINT fk_teachers_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS subjects (
  id VARCHAR(10) PRIMARY KEY,
  code VARCHAR(20),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS classes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  grade_level INT,
  homeroom_teacher_id VARCHAR(10) NULL,
  academic_year_id INT NULL,
  max_students INT,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_classes_teacher FOREIGN KEY (homeroom_teacher_id) REFERENCES teachers(id) ON DELETE SET NULL,
  CONSTRAINT fk_classes_year FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS students (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  nisn VARCHAR(20) UNIQUE,
  nis VARCHAR(20) UNIQUE,
  full_name VARCHAR(100) NOT NULL,
  gender CHAR(1),
  birth_date DATE,
  birth_place VARCHAR(50),
  religion VARCHAR(20),
  address TEXT,
  phone VARCHAR(20),
  class_id INT NULL,
  parent_name VARCHAR(100),
  parent_phone VARCHAR(20),
  enrollment_year INT,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  photo_url VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_students_class (class_id),
  INDEX idx_students_status (status),
  CONSTRAINT fk_students_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_students_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS employees (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  nip VARCHAR(20),
  full_name VARCHAR(100) NOT NULL,
  position VARCHAR(50),
  department VARCHAR(50),
  gender CHAR(1),
  birth_date DATE,
  address TEXT,
  phone VARCHAR(20),
  email VARCHAR(100),
  hire_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_employees_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_employees_status (status)
);

-- =========================================================
-- ACADEMIC MODULE
-- =========================================================

CREATE TABLE IF NOT EXISTS schedules (
  id VARCHAR(10) PRIMARY KEY,
  class_id INT NOT NULL,
  subject_id VARCHAR(10),
  teacher_id VARCHAR(10),
  day_name VARCHAR(10) NOT NULL,
  period VARCHAR(20) NOT NULL,
  room VARCHAR(50),
  academic_year_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_schedules_day (day_name),
  INDEX idx_schedules_teacher (teacher_id),
  INDEX idx_schedules_class (class_id),
  UNIQUE KEY uniq_schedules_slot (day_name, period, class_id),
  CONSTRAINT fk_schedules_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_schedules_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL,
  CONSTRAINT fk_schedules_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS teacher_subjects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  teacher_id VARCHAR(10) NOT NULL,
  subject_id VARCHAR(10) NOT NULL,
  tingkat VARCHAR(10) NOT NULL DEFAULT '',
  class_id INT NOT NULL DEFAULT 0,
  is_linear TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY uniq_teacher_subject_scope (teacher_id, subject_id, tingkat, class_id),
  INDEX idx_teacher_priority (teacher_id),
  CONSTRAINT fk_ts_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
  CONSTRAINT fk_ts_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS class_subjects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  class_id INT NOT NULL,
  subject_id VARCHAR(10) NOT NULL,
  hours_per_week INT NOT NULL DEFAULT 2,
  UNIQUE KEY uniq_class_subject (class_id, subject_id),
  INDEX idx_class_subjects (class_id),
  CONSTRAINT fk_cs_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_cs_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS teacher_limits (
  id INT AUTO_INCREMENT PRIMARY KEY,
  teacher_id VARCHAR(10) NOT NULL,
  max_hours_per_week INT DEFAULT NULL,
  max_hours_per_day INT DEFAULT NULL,
  min_hours_linier INT DEFAULT NULL,
  UNIQUE KEY uniq_teacher_limit (teacher_id),
  CONSTRAINT fk_tl_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS schedule_config (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  config_json JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS holidays (
  date DATE PRIMARY KEY,
  description VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS attendance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  teacher_id VARCHAR(10),
  date DATE NOT NULL,
  period VARCHAR(50) NOT NULL,
  class_id INT NOT NULL,
  status VARCHAR(20) NOT NULL,
  hour_count INT NOT NULL DEFAULT 0,
  recorded_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_attendance_date (date),
  INDEX idx_attendance_teacher (teacher_id),
  UNIQUE KEY uniq_attendance (teacher_id, class_id, period, date),
  CONSTRAINT fk_attendance_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS student_attendance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  date DATE NOT NULL,
  status VARCHAR(20) NOT NULL,
  notes TEXT,
  recorded_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_student_attendance_date (student_id, date),
  UNIQUE KEY uniq_student_attendance (student_id, date),
  CONSTRAINT fk_sa_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_sa_recorder FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS grades (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  subject_id VARCHAR(10) NOT NULL,
  academic_year_id INT NOT NULL,
  semester INT NOT NULL,
  uh1 DECIMAL(5,2) DEFAULT NULL,
  uh2 DECIMAL(5,2) DEFAULT NULL,
  uts DECIMAL(5,2) DEFAULT NULL,
  uas DECIMAL(5,2) DEFAULT NULL,
  final_grade DECIMAL(5,2) DEFAULT NULL,
  input_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_grades_student (student_id),
  UNIQUE KEY uniq_grade_period (student_id, subject_id, academic_year_id, semester),
  CONSTRAINT fk_grades_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_grades_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
  CONSTRAINT fk_grades_year FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS report_cards (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  academic_year_id INT NOT NULL,
  semester INT NOT NULL,
  total_grade DECIMAL(5,2) DEFAULT NULL,
  rank_no INT DEFAULT NULL,
  notes TEXT,
  generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_report_cards_student (student_id),
  UNIQUE KEY uniq_report_period (student_id, academic_year_id, semester),
  CONSTRAINT fk_rc_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_rc_year FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS staff_attendance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  date DATE NOT NULL,
  check_in TIME NULL,
  check_out TIME NULL,
  status VARCHAR(20) NOT NULL,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_staff_attendance (user_id, date),
  CONSTRAINT fk_staffatt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  leave_type VARCHAR(20) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  approved_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_leave_user (user_id),
  CONSTRAINT fk_leave_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_leave_approver FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS activities (
  id INT AUTO_INCREMENT PRIMARY KEY,
  date DATE NOT NULL,
  name VARCHAR(150) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_activities_date (date)
);

CREATE TABLE IF NOT EXISTS activity_teachers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  activity_id INT NOT NULL,
  teacher_id VARCHAR(10) NOT NULL,
  UNIQUE KEY uniq_activity_teacher (activity_id, teacher_id),
  INDEX idx_at_teacher (teacher_id),
  CONSTRAINT fk_at_activity FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE,
  CONSTRAINT fk_at_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS duty_roster (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL
);

-- =========================================================
-- FINANCE MODULE
-- =========================================================

CREATE TABLE IF NOT EXISTS salary_components (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  type ENUM('earning','deduction') NOT NULL DEFAULT 'earning',
  description TEXT,
  is_taxable TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS teacher_tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  teacher_id VARCHAR(10) NOT NULL,
  title VARCHAR(150) NOT NULL,
  description TEXT,
  start_date DATE,
  end_date DATE,
  status ENUM('aktif','nonaktif') NOT NULL DEFAULT 'aktif',
  nominal DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_tt_teacher (teacher_id),
  INDEX idx_tt_status (status),
  CONSTRAINT fk_tt_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS transport_manual (
  id INT AUTO_INCREMENT PRIMARY KEY,
  teacher_id VARCHAR(10) NOT NULL,
  period VARCHAR(7) NOT NULL,
  transport_days INT DEFAULT 0,
  transport_events INT DEFAULT 0,
  INDEX idx_transport_period (period),
  UNIQUE KEY uniq_transport (teacher_id, period),
  CONSTRAINT fk_tm_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS expense_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL
);

CREATE TABLE IF NOT EXISTS expenses (
  id VARCHAR(10) PRIMARY KEY,
  date DATE NOT NULL,
  category VARCHAR(50) NOT NULL,
  recipient VARCHAR(100) NOT NULL DEFAULT '',
  quantity INT NOT NULL DEFAULT 1,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_expenses_date (date)
);

CREATE TABLE IF NOT EXISTS fee_types (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  payment_type VARCHAR(20) NOT NULL DEFAULT 'monthly',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS student_payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  fee_type_id INT NOT NULL,
  payment_date DATE NOT NULL,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  payment_method VARCHAR(20),
  receipt_number VARCHAR(50),
  notes TEXT,
  received_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sp_student (student_id),
  INDEX idx_sp_date (payment_date),
  CONSTRAINT fk_sp_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_sp_feetype FOREIGN KEY (fee_type_id) REFERENCES fee_types(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS budget (
  id INT AUTO_INCREMENT PRIMARY KEY,
  academic_year_id INT NOT NULL,
  category VARCHAR(100) NOT NULL,
  planned_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_budget_year FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS budget_transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  budget_id INT NOT NULL,
  date DATE NOT NULL,
  amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  type ENUM('income','expense') NOT NULL,
  description TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_bt_budget FOREIGN KEY (budget_id) REFERENCES budget(id) ON DELETE CASCADE
);

-- =========================================================
-- ADMINISTRATION MODULE
-- =========================================================

CREATE TABLE IF NOT EXISTS letters (
  id INT AUTO_INCREMENT PRIMARY KEY,
  letter_number VARCHAR(100) DEFAULT '',
  date DATE NOT NULL,
  type ENUM('incoming','outgoing') NOT NULL,
  subject VARCHAR(255) DEFAULT '',
  sender_recipient VARCHAR(255) DEFAULT '',
  priority VARCHAR(20) NOT NULL DEFAULT 'normal',
  notes TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'new',
  file_url VARCHAR(255),
  created_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_letters_date (date),
  INDEX idx_letters_type (type),
  CONSTRAINT fk_letters_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS letter_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  category VARCHAR(50),
  content LONGTEXT NOT NULL,
  variables JSON,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventory (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(80) UNIQUE,
  name VARCHAR(150) NOT NULL,
  category VARCHAR(100) DEFAULT '',
  total_quantity INT NOT NULL DEFAULT 0,
  available_quantity INT NOT NULL DEFAULT 0,
  `condition` VARCHAR(50) DEFAULT 'good',
  location VARCHAR(150) DEFAULT '',
  purchase_date DATE,
  purchase_price DECIMAL(12,2) DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventory_transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  inventory_id INT NOT NULL,
  type ENUM('loan','return','adjustment') NOT NULL,
  borrower VARCHAR(150),
  borrower_id INT NULL,
  loan_date DATE,
  expected_return_date DATE,
  actual_return_date DATE,
  quantity INT NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_it_inventory (inventory_id),
  CONSTRAINT fk_it_inventory FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS announcements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  content TEXT,
  target_role VARCHAR(50),
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  start_date DATE,
  end_date DATE,
  created_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ann_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

SET FOREIGN_KEY_CHECKS = 1;

-- =========================================================
-- SEED DATA: Settings (migrated from konfigurasi)
-- =========================================================

INSERT INTO settings (config_key, config_value, category) VALUES
  ('RATE_MENGAJAR', '0', 'payroll'),
  ('RATE_HADIR', '0', 'payroll'),
  ('RATE_HADIR_KETERAMPILAN', '0', 'payroll'),
  ('RATE_IZIN', '0', 'payroll'),
  ('RATE_TIDAK_HADIR', '0', 'payroll'),
  ('RATE_TRANSPORT', '0', 'payroll'),
  ('RATE_TRANSPORT_PNS', '0', 'payroll'),
  ('RATE_TRANSPORT_INPASSING', '0', 'payroll'),
  ('RATE_TRANSPORT_SERTIFIKASI', '0', 'payroll'),
  ('RATE_TRANSPORT_NON_SERTIFIKASI', '0', 'payroll'),
  ('RATE_TRANSPORT_KETERAMPILAN', '0', 'payroll'),
  ('WIYATHA_1_5', '0', 'payroll'),
  ('WIYATHA_6_10', '0', 'payroll'),
  ('WIYATHA_11_15', '0', 'payroll'),
  ('WIYATHA_16_20', '0', 'payroll'),
  ('WIYATHA_21_25', '0', 'payroll'),
  ('WIYATHA_26_PLUS', '0', 'payroll')
ON DUPLICATE KEY UPDATE config_value = VALUES(config_value);
