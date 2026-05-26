-- Reset akun admin SKS:
-- - 1 super admin
-- - 2 bendahara (role = admin)
--
-- Aman dijalankan berulang.
-- Password default ketiganya: admin123
-- bcrypt hash(admin123):
-- $2b$10$2BZKEQuiJjRC7jUqZiuGi.VVzZYexeDPLxMrbcaLBFb04Yt2K0Z1y

SET @pwd_hash = '$2b$10$2BZKEQuiJjRC7jUqZiuGi.VVzZYexeDPLxMrbcaLBFb04Yt2K0Z1y';
SET @db = DATABASE();

SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS branches (
  id INT NOT NULL AUTO_INCREMENT,
  kode_cabang VARCHAR(30) NOT NULL,
  nama_cabang VARCHAR(120) NOT NULL,
  alamat TEXT DEFAULT NULL,
  telepon VARCHAR(50) DEFAULT NULL,
  payment_pin_hash VARCHAR(255) DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_branch_code (kode_cabang),
  UNIQUE KEY uniq_branch_name (nama_cabang)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS admins (
  id INT NOT NULL AUTO_INCREMENT,
  username VARCHAR(50) NOT NULL,
  password VARCHAR(255) NOT NULL,
  nama_lengkap VARCHAR(100) DEFAULT NULL,
  role ENUM('super_admin','admin','wali_kelas') NOT NULL DEFAULT 'super_admin',
  branch_id INT DEFAULT NULL,
  homeroom_class VARCHAR(50) DEFAULT NULL,
  pdmada_teacher_id BIGINT DEFAULT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY username (username),
  KEY idx_admin_branch (branch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Pastikan cabang utama + 2 cabang bendahara tersedia
INSERT INTO branches (kode_cabang, nama_cabang, is_active)
VALUES
  ('PUSAT', 'Kantor Pusat', 1),
  ('BND-A', 'Cabang Bendahara A', 1),
  ('BND-B', 'Cabang Bendahara B', 1)
ON DUPLICATE KEY UPDATE
  is_active = VALUES(is_active);

-- Reset total akun admin agar hanya tersisa 3 akun berikut
DELETE FROM admins;
ALTER TABLE admins AUTO_INCREMENT = 1;

INSERT INTO admins (username, password, nama_lengkap, role, branch_id, homeroom_class, pdmada_teacher_id)
VALUES
  (
    'superadmin',
    @pwd_hash,
    'Super Admin',
    'super_admin',
    NULL,
    NULL,
    NULL
  ),
  (
    'bendahara_a',
    @pwd_hash,
    'Bendahara Cabang A',
    'admin',
    (SELECT id FROM branches WHERE kode_cabang = 'BND-A' LIMIT 1),
    NULL,
    NULL
  ),
  (
    'bendahara_b',
    @pwd_hash,
    'Bendahara Cabang B',
    'admin',
    (SELECT id FROM branches WHERE kode_cabang = 'BND-B' LIMIT 1),
    NULL,
    NULL
  );

SET FOREIGN_KEY_CHECKS = 1;

-- Verifikasi cepat
SELECT id, username, nama_lengkap, role, branch_id
FROM admins
ORDER BY id;
