-- Tambah kolom tahun_lulus untuk menu Alumni SKS
-- Aman dijalankan berulang.

SET @db_name := DATABASE();

SET @has_col := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'students'
    AND COLUMN_NAME = 'tahun_lulus'
);

SET @sql := IF(
  @has_col = 0,
  'ALTER TABLE students ADD COLUMN tahun_lulus INT NULL AFTER tahun_masuk',
  'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Sinkron awal: siswa status Lulus tapi tahun_lulus kosong -> isi tahun berjalan
UPDATE students
SET tahun_lulus = YEAR(CURDATE())
WHERE status = 'Lulus'
  AND (tahun_lulus IS NULL OR tahun_lulus = 0);
