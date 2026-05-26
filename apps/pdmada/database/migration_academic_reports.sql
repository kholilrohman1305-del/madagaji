SET @schema_name = DATABASE();

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @schema_name
        AND TABLE_NAME = 'subjects'
        AND COLUMN_NAME = 'kkm'
    ),
    'SELECT 1',
    'ALTER TABLE subjects ADD COLUMN kkm DECIMAL(5,2) NULL AFTER grade_level'
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
        AND TABLE_NAME = 'subjects'
        AND COLUMN_NAME = 'display_order'
    ),
    'SELECT 1',
    'ALTER TABLE subjects ADD COLUMN display_order INT NOT NULL DEFAULT 0 AFTER kkm'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS student_report_meta (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  class_id INT NULL,
  school_year_id INT NOT NULL,
  semester_id INT NOT NULL,
  extracurricular_activity VARCHAR(150) NULL,
  extracurricular_predicate VARCHAR(50) NULL,
  attendance_sick INT NULL,
  attendance_permit INT NULL,
  attendance_absent INT NULL,
  homeroom_note TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_report_meta_period (student_id, school_year_id, semester_id),
  INDEX idx_report_meta_class_period (class_id, school_year_id, semester_id),
  CONSTRAINT fk_report_meta_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_report_meta_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL,
  CONSTRAINT fk_report_meta_school_year FOREIGN KEY (school_year_id) REFERENCES school_years(id) ON DELETE CASCADE,
  CONSTRAINT fk_report_meta_semester FOREIGN KEY (semester_id) REFERENCES semesters(id) ON DELETE CASCADE
);

INSERT INTO student_report_meta (
  student_id,
  class_id,
  school_year_id,
  semester_id,
  extracurricular_activity,
  extracurricular_predicate,
  attendance_sick,
  attendance_permit,
  attendance_absent
)
SELECT
  ss.student_id,
  MAX(ss.class_id) AS class_id,
  ss.school_year_id,
  ss.semester_id,
  MAX(NULLIF(ss.extracurricular_activity, '')) AS extracurricular_activity,
  MAX(NULLIF(ss.extracurricular_predicate, '')) AS extracurricular_predicate,
  MAX(ss.attendance_sick) AS attendance_sick,
  MAX(ss.attendance_permit) AS attendance_permit,
  MAX(ss.attendance_absent) AS attendance_absent
FROM student_scores ss
GROUP BY ss.student_id, ss.school_year_id, ss.semester_id
ON DUPLICATE KEY UPDATE
  class_id = COALESCE(VALUES(class_id), student_report_meta.class_id),
  extracurricular_activity = COALESCE(NULLIF(VALUES(extracurricular_activity), ''), student_report_meta.extracurricular_activity),
  extracurricular_predicate = COALESCE(NULLIF(VALUES(extracurricular_predicate), ''), student_report_meta.extracurricular_predicate),
  attendance_sick = COALESCE(VALUES(attendance_sick), student_report_meta.attendance_sick),
  attendance_permit = COALESCE(VALUES(attendance_permit), student_report_meta.attendance_permit),
  attendance_absent = COALESCE(VALUES(attendance_absent), student_report_meta.attendance_absent);
