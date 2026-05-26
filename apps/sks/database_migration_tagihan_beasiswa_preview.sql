-- Tambahan kolom jejak potongan beasiswa di tabel bills
-- Aman dijalankan berulang.

SET @db = DATABASE();

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bills' AND COLUMN_NAME = 'base_total'
    ),
    'SELECT 1',
    'ALTER TABLE bills ADD COLUMN base_total DECIMAL(15,2) NULL AFTER total'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bills' AND COLUMN_NAME = 'scholarship_discount'
    ),
    'SELECT 1',
    'ALTER TABLE bills ADD COLUMN scholarship_discount DECIMAL(15,2) NOT NULL DEFAULT 0 AFTER base_total'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bills' AND COLUMN_NAME = 'net_total'
    ),
    'SELECT 1',
    'ALTER TABLE bills ADD COLUMN net_total DECIMAL(15,2) NULL AFTER scholarship_discount'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bills' AND COLUMN_NAME = 'scholarship_percent_applied'
    ),
    'SELECT 1',
    'ALTER TABLE bills ADD COLUMN scholarship_percent_applied DECIMAL(5,2) NOT NULL DEFAULT 0 AFTER net_total'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE bills
SET base_total = COALESCE(base_total, total),
    net_total = COALESCE(net_total, total - COALESCE(scholarship_discount, 0))
WHERE base_total IS NULL OR net_total IS NULL;

