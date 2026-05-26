-- Menu Pengeluaran Cabang (SKS)
-- Aman dijalankan berulang.

CREATE TABLE IF NOT EXISTS expenses (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  branch_id INT NOT NULL,
  tanggal DATE NOT NULL,
  category_id BIGINT NULL,
  kategori VARCHAR(80) NOT NULL,
  deskripsi VARCHAR(200) NOT NULL,
  nominal DECIMAL(15,2) NOT NULL,
  report_status VARCHAR(10) NOT NULL DEFAULT 'belum',
  penanggung_jawab_id INT NULL,
  penanggung_jawab_nama VARCHAR(120) NULL,
  admin_keuangan_nama VARCHAR(120) NULL,
  is_recurring TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_exp_branch_date (branch_id, tanggal),
  INDEX idx_exp_branch_active (branch_id, is_active)
);

CREATE TABLE IF NOT EXISTS expense_categories (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  branch_id INT NOT NULL,
  category_name VARCHAR(80) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_exp_category_branch (branch_id, category_name),
  INDEX idx_exp_category_branch_active (branch_id, is_active)
);

SET @db = DATABASE();

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'expenses' AND COLUMN_NAME = 'report_status'
    ),
    'SELECT 1',
    'ALTER TABLE expenses ADD COLUMN report_status VARCHAR(10) NOT NULL DEFAULT ''belum'' AFTER nominal'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'expenses' AND COLUMN_NAME = 'category_id'
    ),
    'SELECT 1',
    'ALTER TABLE expenses ADD COLUMN category_id BIGINT NULL AFTER tanggal'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'expenses' AND COLUMN_NAME = 'penanggung_jawab_id'
    ),
    'SELECT 1',
    'ALTER TABLE expenses ADD COLUMN penanggung_jawab_id INT NULL AFTER nominal'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'expenses' AND COLUMN_NAME = 'penanggung_jawab_nama'
    ),
    'SELECT 1',
    'ALTER TABLE expenses ADD COLUMN penanggung_jawab_nama VARCHAR(120) NULL AFTER penanggung_jawab_id'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'expenses' AND COLUMN_NAME = 'admin_keuangan_nama'
    ),
    'SELECT 1',
    'ALTER TABLE expenses ADD COLUMN admin_keuangan_nama VARCHAR(120) NULL AFTER penanggung_jawab_nama'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
