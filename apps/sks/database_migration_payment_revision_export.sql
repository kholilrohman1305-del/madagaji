-- Tambahan dukungan revisi pembayaran aman (reversal + repost)
-- Aman dijalankan berulang.

SET @db = DATABASE();

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'payments' AND COLUMN_NAME = 'is_reversed'
    ),
    'SELECT 1',
    'ALTER TABLE payments ADD COLUMN is_reversed TINYINT(1) NOT NULL DEFAULT 0'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'payments' AND COLUMN_NAME = 'reversed_at'
    ),
    'SELECT 1',
    'ALTER TABLE payments ADD COLUMN reversed_at DATETIME NULL'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'payments' AND COLUMN_NAME = 'reversal_reason'
    ),
    'SELECT 1',
    'ALTER TABLE payments ADD COLUMN reversal_reason TEXT NULL'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'payments' AND COLUMN_NAME = 'revised_from_payment_id'
    ),
    'SELECT 1',
    'ALTER TABLE payments ADD COLUMN revised_from_payment_id INT NULL'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS payment_revision_logs (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  old_payment_id INT NOT NULL,
  new_payment_id INT NULL,
  branch_id INT NULL,
  reason TEXT NOT NULL,
  old_payload JSON NULL,
  new_payload JSON NULL,
  actor_user_id INT NULL,
  actor_role VARCHAR(30) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_payment_revision_old (old_payment_id),
  INDEX idx_payment_revision_new (new_payment_id),
  INDEX idx_payment_revision_branch (branch_id),
  INDEX idx_payment_revision_created (created_at)
);

