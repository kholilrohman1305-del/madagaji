-- Enhancement Beasiswa (Program, Eligibility, Audit, Summary Support)
-- Aman dijalankan berulang.

SET @db = DATABASE();

-- scholarship_types extensions
SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'scholarship_types' AND COLUMN_NAME = 'is_active'
    ),
    'SELECT 1',
    'ALTER TABLE scholarship_types ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'scholarship_types' AND COLUMN_NAME = 'start_date'
    ),
    'SELECT 1',
    'ALTER TABLE scholarship_types ADD COLUMN start_date DATE NULL'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'scholarship_types' AND COLUMN_NAME = 'end_date'
    ),
    'SELECT 1',
    'ALTER TABLE scholarship_types ADD COLUMN end_date DATE NULL'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'scholarship_types' AND COLUMN_NAME = 'eligible_classes'
    ),
    'SELECT 1',
    'ALTER TABLE scholarship_types ADD COLUMN eligible_classes TEXT NULL'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'scholarship_types' AND COLUMN_NAME = 'eligible_student_status'
    ),
    'SELECT 1',
    'ALTER TABLE scholarship_types ADD COLUMN eligible_student_status VARCHAR(20) NOT NULL DEFAULT ''aktif'''
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'scholarship_types' AND COLUMN_NAME = 'min_arrears'
    ),
    'SELECT 1',
    'ALTER TABLE scholarship_types ADD COLUMN min_arrears DECIMAL(15,2) NOT NULL DEFAULT 0'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'scholarship_types' AND COLUMN_NAME = 'max_recipients'
    ),
    'SELECT 1',
    'ALTER TABLE scholarship_types ADD COLUMN max_recipients INT NULL'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'scholarship_types' AND COLUMN_NAME = 'priority'
    ),
    'SELECT 1',
    'ALTER TABLE scholarship_types ADD COLUMN priority INT NOT NULL DEFAULT 100'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'scholarship_types' AND COLUMN_NAME = 'description'
    ),
    'SELECT 1',
    'ALTER TABLE scholarship_types ADD COLUMN description TEXT NULL'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- scholarship_recipients extensions
SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'scholarship_recipients' AND COLUMN_NAME = 'period_month'
    ),
    'SELECT 1',
    'ALTER TABLE scholarship_recipients ADD COLUMN period_month TINYINT NULL'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'scholarship_recipients' AND COLUMN_NAME = 'period_year'
    ),
    'SELECT 1',
    'ALTER TABLE scholarship_recipients ADD COLUMN period_year INT NULL'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'scholarship_recipients' AND COLUMN_NAME = 'is_operational_active'
    ),
    'SELECT 1',
    'ALTER TABLE scholarship_recipients ADD COLUMN is_operational_active TINYINT(1) NOT NULL DEFAULT 1'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'scholarship_recipients' AND COLUMN_NAME = 'student_status_snapshot'
    ),
    'SELECT 1',
    'ALTER TABLE scholarship_recipients ADD COLUMN student_status_snapshot VARCHAR(20) NULL'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE scholarship_recipients
SET period_month = MONTH(tanggal_terima),
    period_year = YEAR(tanggal_terima)
WHERE tanggal_terima IS NOT NULL
  AND (period_month IS NULL OR period_year IS NULL);

-- Audit table
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
