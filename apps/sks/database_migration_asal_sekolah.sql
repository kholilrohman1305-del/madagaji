-- Tambah kolom asal_sekolah pada tabel students
-- Aman dijalankan berulang.

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'students'
        AND COLUMN_NAME = 'asal_sekolah'
    ),
    'SELECT 1',
    'ALTER TABLE students ADD COLUMN asal_sekolah VARCHAR(150) NULL AFTER alamat'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

