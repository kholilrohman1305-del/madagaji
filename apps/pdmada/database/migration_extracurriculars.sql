CREATE TABLE IF NOT EXISTS extracurriculars (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  description TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_extracurricular_name (name),
  INDEX idx_extracurricular_active (is_active)
);

INSERT INTO extracurriculars (name, description, is_active)
VALUES
('Atletik', NULL, 1),
('Baca Cipta Puisi', NULL, 1),
('Biologi (KSM)', NULL, 1),
('Bulu Tangkis', NULL, 1),
('Catur', NULL, 1),
('Desain Grafis', NULL, 1),
('Ekonomi (KSM)', NULL, 1),
('Tari Saman', NULL, 1),
('Fisika (KSM)', NULL, 1),
('Futsal', NULL, 1),
('Geografi (KSM)', NULL, 1),
('Hadrah', NULL, 1),
('Handy Craft', NULL, 1),
('Kelas Tahfidz', NULL, 1),
('Kimia (KSM)', NULL, 1),
('Las Listrik', NULL, 1),
('LKBB', NULL, 1),
('Matematika (KSM)', NULL, 1),
('Menjahit', NULL, 1),
('MFQ', NULL, 1),
('MTQ', NULL, 1),
('Pencak Silat', NULL, 1),
('Pidato Bahasa Arab', NULL, 1),
('Pidato Bahasa Inggris', NULL, 1),
('PMR', NULL, 1),
('Singing & Padus', NULL, 1),
('Teknik Sepeda Motor (TSM)', NULL, 1),
('Tenis Meja', NULL, 1),
('Voli', NULL, 1)
ON DUPLICATE KEY UPDATE
  is_active = VALUES(is_active),
  description = COALESCE(extracurriculars.description, VALUES(description));
