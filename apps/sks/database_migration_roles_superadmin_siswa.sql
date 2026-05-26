-- Tambah dukungan role: super_admin/admin (admins) dan siswa (students)
-- Aman dijalankan berulang.

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'admins'
        AND COLUMN_NAME = 'role'
    ),
    'SELECT 1',
    'ALTER TABLE admins ADD COLUMN role ENUM(''super_admin'',''admin'') NOT NULL DEFAULT ''super_admin'' AFTER nama_lengkap'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = 'ALTER TABLE admins MODIFY COLUMN role ENUM(''super_admin'',''admin'') NOT NULL DEFAULT ''super_admin''';
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE admins
SET role = 'super_admin'
WHERE role IS NULL OR role = '';
