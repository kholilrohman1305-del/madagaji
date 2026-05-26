-- Tambah kolom keamanan transaksi pembayaran (PIN + QR)
-- Aman dijalankan berulang.

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'school_settings'
        AND COLUMN_NAME = 'payment_pin_hash'
    ),
    'SELECT 1',
    'ALTER TABLE school_settings ADD COLUMN payment_pin_hash VARCHAR(255) NULL AFTER logo_url'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'payments'
        AND COLUMN_NAME = 'qr_token'
    ),
    'SELECT 1',
    'ALTER TABLE payments ADD COLUMN qr_token VARCHAR(64) NULL AFTER class_id'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'payments'
        AND COLUMN_NAME = 'qr_payload'
    ),
    'SELECT 1',
    'ALTER TABLE payments ADD COLUMN qr_payload TEXT NULL AFTER qr_token'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
