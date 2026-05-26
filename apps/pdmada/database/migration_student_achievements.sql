-- Prestasi siswa
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS student_achievements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  title VARCHAR(180) NOT NULL,
  achievement_category ENUM('akademik','non_akademik') NOT NULL DEFAULT 'akademik',
  achievement_type VARCHAR(80) NULL,
  level_name VARCHAR(80) NULL,
  organizer VARCHAR(150) NULL,
  achievement_date DATE NULL,
  rank_value VARCHAR(60) NULL,
  notes TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_student_achievements_student (student_id),
  INDEX idx_student_achievements_date (achievement_date),
  CONSTRAINT fk_student_achievements_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

SET FOREIGN_KEY_CHECKS = 1;
