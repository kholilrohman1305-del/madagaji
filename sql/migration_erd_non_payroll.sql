-- ERD expansion (NON-PAYROLL) for shared hosting / MySQL
-- Tujuan:
-- 1) Menambahkan tabel dari ERD (master, academic, administration, finance non-gaji)
-- 2) TIDAK mengubah logika penggajian existing (tetap pakai tabel gaji lama)
--
-- Cara pakai:
-- - Pilih database target di phpMyAdmin
-- - Import file ini setelah schema utama terpasang

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- =========================================================
-- MASTER DATA EXTENSIONS
-- =========================================================

CREATE TABLE IF NOT EXISTS students (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  nisn VARCHAR(20) UNIQUE,
  nis VARCHAR(20) UNIQUE,
  full_name VARCHAR(100) NOT NULL,
  gender CHAR(1) NULL,
  birth_date DATE NULL,
  birth_place VARCHAR(50) NULL,
  religion VARCHAR(20) NULL,
  address TEXT NULL,
  phone VARCHAR(20) NULL,
  class_id INT NULL,
  parent_name VARCHAR(100) NULL,
  parent_phone VARCHAR(20) NULL,
  enrollment_year INT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  photo_url VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_students_class (class_id),
  INDEX idx_students_status (status),
  INDEX idx_students_user (user_id)
);

CREATE TABLE IF NOT EXISTS employees (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  nip VARCHAR(20) NULL,
  full_name VARCHAR(100) NOT NULL,
  position VARCHAR(50) NULL,
  department VARCHAR(50) NULL,
  gender CHAR(1) NULL,
  birth_date DATE NULL,
  address TEXT NULL,
  phone VARCHAR(20) NULL,
  email VARCHAR(100) NULL,
  hire_date DATE NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_employees_user (user_id),
  INDEX idx_employees_status (status)
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
-- ACADEMIC MODULE
-- =========================================================

CREATE TABLE IF NOT EXISTS schedules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  class_id INT NOT NULL,
  subject_id INT NOT NULL,
  teacher_id INT NOT NULL,
  day_of_week INT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  room VARCHAR(50) NULL,
  academic_year_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_schedules_class (class_id),
  INDEX idx_schedules_subject (subject_id),
  INDEX idx_schedules_teacher (teacher_id),
  INDEX idx_schedules_year (academic_year_id),
  UNIQUE KEY uniq_schedules_slot (class_id, day_of_week, start_time, end_time)
);

CREATE TABLE IF NOT EXISTS student_attendance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  date DATE NOT NULL,
  status VARCHAR(20) NOT NULL,
  notes TEXT NULL,
  recorded_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_student_attendance_student_date (student_id, date),
  INDEX idx_student_attendance_status (status),
  INDEX idx_student_attendance_recorded_by (recorded_by),
  UNIQUE KEY uniq_student_attendance (student_id, date)
);

CREATE TABLE IF NOT EXISTS grades (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  subject_id INT NOT NULL,
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
  INDEX idx_grades_subject (subject_id),
  INDEX idx_grades_year (academic_year_id),
  INDEX idx_grades_input_by (input_by),
  UNIQUE KEY uniq_grade_period (student_id, subject_id, academic_year_id, semester)
);

CREATE TABLE IF NOT EXISTS report_cards (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  academic_year_id INT NOT NULL,
  semester INT NOT NULL,
  total_grade DECIMAL(5,2) DEFAULT NULL,
  rank_no INT DEFAULT NULL,
  notes TEXT NULL,
  generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_report_cards_student (student_id),
  INDEX idx_report_cards_year (academic_year_id),
  UNIQUE KEY uniq_report_period (student_id, academic_year_id, semester)
);

CREATE TABLE IF NOT EXISTS staff_attendance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  date DATE NOT NULL,
  check_in TIME NULL,
  check_out TIME NULL,
  status VARCHAR(20) NOT NULL,
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_staff_attendance_user_date (user_id, date),
  UNIQUE KEY uniq_staff_attendance (user_id, date)
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  leave_type VARCHAR(20) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  approved_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_leave_requests_user (user_id),
  INDEX idx_leave_requests_status (status),
  INDEX idx_leave_requests_period (start_date, end_date)
);

-- =========================================================
-- FINANCE MODULE (NON-PAYROLL)
-- NOTE: payroll existing tetap dipakai, tidak disentuh migration ini.
-- =========================================================

CREATE TABLE IF NOT EXISTS fee_types (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT NULL,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  payment_type VARCHAR(20) NOT NULL DEFAULT 'monthly',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_fee_types_active (is_active)
);

CREATE TABLE IF NOT EXISTS student_payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  fee_type_id INT NOT NULL,
  payment_date DATE NOT NULL,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  payment_method VARCHAR(20) NULL,
  receipt_number VARCHAR(50) NULL,
  notes TEXT NULL,
  received_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_student_payments_student (student_id),
  INDEX idx_student_payments_fee_type (fee_type_id),
  INDEX idx_student_payments_date (payment_date),
  INDEX idx_student_payments_receipt (receipt_number)
);

CREATE TABLE IF NOT EXISTS cash_transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  transaction_date DATE NOT NULL,
  type VARCHAR(20) NOT NULL,
  category VARCHAR(50) NOT NULL,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  description TEXT NULL,
  reference_number VARCHAR(50) NULL,
  recorded_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_cash_transactions_date (transaction_date),
  INDEX idx_cash_transactions_type (type),
  INDEX idx_cash_transactions_category (category)
);

CREATE TABLE IF NOT EXISTS journal_entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  entry_date DATE NOT NULL,
  account_code VARCHAR(20) NOT NULL,
  account_name VARCHAR(100) NOT NULL,
  debit DECIMAL(12,2) NOT NULL DEFAULT 0,
  credit DECIMAL(12,2) NOT NULL DEFAULT 0,
  description TEXT NULL,
  transaction_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_journal_entries_date (entry_date),
  INDEX idx_journal_entries_account (account_code),
  INDEX idx_journal_entries_transaction (transaction_id)
);

-- =========================================================
-- ADMINISTRATION MODULE
-- =========================================================

CREATE TABLE IF NOT EXISTS incoming_letters (
  id INT AUTO_INCREMENT PRIMARY KEY,
  letter_number VARCHAR(50) NULL,
  letter_date DATE NULL,
  received_date DATE NULL,
  sender VARCHAR(200) NULL,
  subject VARCHAR(255) NOT NULL,
  content TEXT NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'normal',
  status VARCHAR(20) NOT NULL DEFAULT 'baru',
  file_url VARCHAR(255) NULL,
  received_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_incoming_letters_date (letter_date),
  INDEX idx_incoming_letters_received_date (received_date),
  INDEX idx_incoming_letters_status (status)
);

CREATE TABLE IF NOT EXISTS outgoing_letters (
  id INT AUTO_INCREMENT PRIMARY KEY,
  letter_number VARCHAR(50) NULL,
  letter_date DATE NULL,
  recipient VARCHAR(200) NULL,
  subject VARCHAR(255) NOT NULL,
  content TEXT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  file_url VARCHAR(255) NULL,
  created_by INT NULL,
  approved_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_outgoing_letters_date (letter_date),
  INDEX idx_outgoing_letters_status (status)
);

CREATE TABLE IF NOT EXISTS letter_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  category VARCHAR(50) NULL,
  content LONGTEXT NOT NULL,
  variables JSON NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_letter_templates_category (category),
  INDEX idx_letter_templates_active (is_active)
);

CREATE TABLE IF NOT EXISTS letter_dispositions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  letter_id INT NOT NULL,
  from_user_id INT NULL,
  to_user_id INT NULL,
  instruction TEXT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'baru',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_letter_dispositions_letter (letter_id),
  INDEX idx_letter_dispositions_to (to_user_id),
  INDEX idx_letter_dispositions_status (status)
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NULL,
  name VARCHAR(200) NOT NULL,
  category VARCHAR(50) NULL,
  description TEXT NULL,
  quantity INT NOT NULL DEFAULT 0,
  unit VARCHAR(20) NULL,
  `condition` VARCHAR(20) NOT NULL DEFAULT 'baik',
  location VARCHAR(100) NULL,
  purchase_date DATE NULL,
  purchase_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  photo_url VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_inventory_items_code (code),
  INDEX idx_inventory_items_category (category),
  INDEX idx_inventory_items_condition (`condition`)
);

CREATE TABLE IF NOT EXISTS item_loans (
  id INT AUTO_INCREMENT PRIMARY KEY,
  item_id INT NOT NULL,
  borrower_id INT NULL,
  loan_date DATE NOT NULL,
  return_due_date DATE NULL,
  actual_return_date DATE NULL,
  quantity INT NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'dipinjam',
  purpose TEXT NULL,
  notes TEXT NULL,
  approved_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_item_loans_item (item_id),
  INDEX idx_item_loans_borrower (borrower_id),
  INDEX idx_item_loans_status (status),
  INDEX idx_item_loans_dates (loan_date, return_due_date)
);

SET FOREIGN_KEY_CHECKS = 1;
