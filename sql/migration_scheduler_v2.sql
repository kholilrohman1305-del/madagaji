-- Migration for Scheduler v2: Priority-based teacher-subject mapping & positive class-subject mapping
-- Run this migration on existing databases
-- Usage: mysql -u root -p gaji < migration_scheduler_v2.sql

USE gaji;

-- 1. Recreate teacher_subjects table with priority column
-- First backup existing data, then recreate
CREATE TABLE IF NOT EXISTS teacher_subjects_backup AS SELECT * FROM teacher_subjects;

DROP TABLE IF EXISTS teacher_subjects;

CREATE TABLE teacher_subjects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  teacher_id INT NOT NULL,
  subject_id INT NOT NULL,
  priority INT NOT NULL DEFAULT 1,
  UNIQUE KEY uniq_teacher_subject (teacher_id, subject_id),
  INDEX idx_teacher_priority (teacher_id, priority)
);

-- Restore data from backup with default priority 1
INSERT INTO teacher_subjects (teacher_id, subject_id, priority)
SELECT teacher_id, subject_id, 1 FROM teacher_subjects_backup;

DROP TABLE IF EXISTS teacher_subjects_backup;

-- 2. Create new class_subjects table (positive mapping)
CREATE TABLE IF NOT EXISTS class_subjects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  class_id INT NOT NULL,
  subject_id INT NOT NULL,
  hours_per_week INT NOT NULL DEFAULT 2,
  UNIQUE KEY uniq_class_subject (class_id, subject_id),
  INDEX idx_class_subjects (class_id)
);

-- 3. Migrate data from class_subject_rules (where allowed=1) to class_subjects
-- This preserves existing "allowed" mappings (ignore if table doesn't exist or no data)
INSERT IGNORE INTO class_subjects (class_id, subject_id, hours_per_week)
SELECT class_id, subject_id, 2
FROM class_subject_rules
WHERE allowed = 1;

-- 4. Recreate teacher_limits table with min_hours_linier column
CREATE TABLE IF NOT EXISTS teacher_limits_backup AS SELECT * FROM teacher_limits;

DROP TABLE IF EXISTS teacher_limits;

CREATE TABLE teacher_limits (
  id INT AUTO_INCREMENT PRIMARY KEY,
  teacher_id INT NOT NULL,
  max_hours_per_week INT DEFAULT NULL,
  max_hours_per_day INT DEFAULT NULL,
  min_hours_linier INT DEFAULT NULL,
  UNIQUE KEY uniq_teacher_limit (teacher_id)
);

-- Restore data from backup
INSERT INTO teacher_limits (teacher_id, max_hours_per_week, max_hours_per_day)
SELECT teacher_id, max_hours_per_week, max_hours_per_day FROM teacher_limits_backup;

DROP TABLE IF EXISTS teacher_limits_backup;

-- 5. Create schedule_config table if not exists
CREATE TABLE IF NOT EXISTS schedule_config (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  config_json JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Done!
-- Note: class_subject_rules table is kept for backward compatibility
-- You can drop it later if not needed: DROP TABLE IF EXISTS class_subject_rules;
