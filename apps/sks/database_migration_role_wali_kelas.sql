-- Tambah role wali_kelas pada admins
-- Aman dijalankan berulang.

SET @db = DATABASE();

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'admins' AND COLUMN_NAME = 'role'
    ),
    "ALTER TABLE admins MODIFY COLUMN role ENUM('super_admin','admin','wali_kelas') NOT NULL DEFAULT 'super_admin'",
    "ALTER TABLE admins ADD COLUMN role ENUM('super_admin','admin','wali_kelas') NOT NULL DEFAULT 'super_admin' AFTER nama_lengkap"
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'admins' AND COLUMN_NAME = 'homeroom_class'
    ),
    'SELECT 1',
    'ALTER TABLE admins ADD COLUMN homeroom_class VARCHAR(50) NULL AFTER branch_id'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'admins' AND COLUMN_NAME = 'pdmada_teacher_id'
    ),
    'SELECT 1',
    'ALTER TABLE admins ADD COLUMN pdmada_teacher_id BIGINT NULL AFTER homeroom_class'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
