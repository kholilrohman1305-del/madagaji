CREATE TABLE IF NOT EXISTS pondok_pesantren (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_pondok_pesantren_name (name)
);

INSERT IGNORE INTO pondok_pesantren (name, is_active)
SELECT DISTINCT TRIM(pondok_pesantren) AS name, 1
FROM students
WHERE pondok_pesantren IS NOT NULL
  AND TRIM(pondok_pesantren) <> '';
