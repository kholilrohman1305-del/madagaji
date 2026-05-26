-- Multi-branch foundation migration (super_admin pusat, admin cabang)
-- Aman dijalankan berulang.

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

INSERT IGNORE INTO branches (id, kode_cabang, nama_cabang, is_active)
VALUES (1, 'PUSAT', 'Kantor Pusat', 1);

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admins' AND COLUMN_NAME = 'role'
    ),
    'ALTER TABLE admins MODIFY COLUMN role ENUM(''super_admin'',''admin'') NOT NULL DEFAULT ''super_admin''',
    'ALTER TABLE admins ADD COLUMN role ENUM(''super_admin'',''admin'') NOT NULL DEFAULT ''super_admin'' AFTER nama_lengkap'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admins' AND COLUMN_NAME = 'branch_id'
    ),
    'SELECT 1',
    'ALTER TABLE admins ADD COLUMN branch_id INT NULL AFTER role'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admins' AND INDEX_NAME = 'idx_admin_branch'
    ),
    'SELECT 1',
    'ALTER TABLE admins ADD INDEX idx_admin_branch (branch_id)'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admins' AND CONSTRAINT_NAME = 'fk_admin_branch'
    ),
    'SELECT 1',
    'ALTER TABLE admins ADD CONSTRAINT fk_admin_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE admins SET role = 'super_admin' WHERE role IS NULL OR role = '';

-- Add branch_id to operational tables + backfill branch_id=1
SET @tables = 'classes,students,bills,payments,scholarship_recipients';

-- classes
SET @sql = (
  SELECT IF(
    EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='classes' AND COLUMN_NAME='branch_id'),
    'SELECT 1',
    'ALTER TABLE classes ADD COLUMN branch_id INT NOT NULL DEFAULT 1 AFTER id'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
UPDATE classes SET branch_id = 1 WHERE branch_id IS NULL OR branch_id = 0;
SET @sql = (
  SELECT IF(
    EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='classes' AND INDEX_NAME='uniq_branch_class'),
    'SELECT 1',
    'ALTER TABLE classes ADD UNIQUE KEY uniq_branch_class (branch_id, nama_kelas)'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- students
SET @sql = (
  SELECT IF(
    EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='students' AND COLUMN_NAME='branch_id'),
    'SELECT 1',
    'ALTER TABLE students ADD COLUMN branch_id INT NOT NULL DEFAULT 1 AFTER class_id'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
UPDATE students SET branch_id = 1 WHERE branch_id IS NULL OR branch_id = 0;

-- bills
SET @sql = (
  SELECT IF(
    EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='bills' AND COLUMN_NAME='branch_id'),
    'SELECT 1',
    'ALTER TABLE bills ADD COLUMN branch_id INT NOT NULL DEFAULT 1 AFTER class_id'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
UPDATE bills SET branch_id = 1 WHERE branch_id IS NULL OR branch_id = 0;

-- payments
SET @sql = (
  SELECT IF(
    EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='payments' AND COLUMN_NAME='branch_id'),
    'SELECT 1',
    'ALTER TABLE payments ADD COLUMN branch_id INT NOT NULL DEFAULT 1 AFTER class_id'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
UPDATE payments SET branch_id = 1 WHERE branch_id IS NULL OR branch_id = 0;

-- scholarship_recipients
SET @sql = (
  SELECT IF(
    EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='scholarship_recipients' AND COLUMN_NAME='branch_id'),
    'SELECT 1',
    'ALTER TABLE scholarship_recipients ADD COLUMN branch_id INT NOT NULL DEFAULT 1 AFTER class_id'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
UPDATE scholarship_recipients SET branch_id = 1 WHERE branch_id IS NULL OR branch_id = 0;

