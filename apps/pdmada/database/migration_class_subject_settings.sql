CREATE TABLE IF NOT EXISTS class_subject_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  class_id INT NOT NULL,
  subject_id INT NOT NULL,
  school_year_id INT NOT NULL,
  semester_id INT NOT NULL,
  kkm DECIMAL(5,2) NULL,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_class_subject_period (class_id, subject_id, school_year_id, semester_id),
  INDEX idx_css_period (school_year_id, semester_id, class_id),
  INDEX idx_css_subject (subject_id),
  CONSTRAINT fk_css_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_css_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
  CONSTRAINT fk_css_school_year FOREIGN KEY (school_year_id) REFERENCES school_years(id) ON DELETE CASCADE,
  CONSTRAINT fk_css_semester FOREIGN KEY (semester_id) REFERENCES semesters(id) ON DELETE CASCADE
);

SET @schema_name = DATABASE();

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @schema_name
        AND TABLE_NAME = 'class_subject_settings'
        AND COLUMN_NAME = 'kkm'
    ),
    'SELECT 1',
    'ALTER TABLE class_subject_settings ADD COLUMN kkm DECIMAL(5,2) NULL AFTER semester_id'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @schema_name
        AND TABLE_NAME = 'class_subject_settings'
        AND COLUMN_NAME = 'display_order'
    ),
    'SELECT 1',
    'ALTER TABLE class_subject_settings ADD COLUMN display_order INT NOT NULL DEFAULT 0 AFTER kkm'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE class_subject_settings css
LEFT JOIN subjects s ON s.id = css.subject_id
SET css.kkm = COALESCE(css.kkm, s.kkm),
    css.display_order = CASE
      WHEN css.display_order IS NULL OR css.display_order = 0 THEN COALESCE(s.display_order, 0)
      ELSE css.display_order
    END;
