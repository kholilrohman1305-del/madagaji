-- Tabel rencana/proyeksi beasiswa
-- Aman dijalankan berulang.

CREATE TABLE IF NOT EXISTS scholarship_plans (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  type_id INT NOT NULL,
  branch_id INT NULL,
  target_month TINYINT NOT NULL,
  target_year INT NOT NULL,
  target_recipients INT NOT NULL DEFAULT 0,
  target_nominal DECIMAL(15,2) NOT NULL DEFAULT 0,
  notes TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sch_plan_period (target_year, target_month),
  INDEX idx_sch_plan_type (type_id),
  INDEX idx_sch_plan_branch (branch_id)
);

