SET @schema_name = DATABASE();

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @schema_name
        AND TABLE_NAME = 'teachers'
        AND COLUMN_NAME = 'subject_id'
    ),
    'SELECT 1',
    'ALTER TABLE teachers ADD COLUMN subject_id INT NULL AFTER subject'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = @schema_name
        AND TABLE_NAME = 'teachers'
        AND INDEX_NAME = 'idx_teachers_subject_id'
    ),
    'SELECT 1',
    'ALTER TABLE teachers ADD INDEX idx_teachers_subject_id (subject_id)'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.TABLE_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = @schema_name
        AND TABLE_NAME = 'teachers'
        AND CONSTRAINT_NAME = 'fk_teachers_subject'
        AND CONSTRAINT_TYPE = 'FOREIGN KEY'
    ),
    'SELECT 1',
    'ALTER TABLE teachers ADD CONSTRAINT fk_teachers_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @schema_name
        AND TABLE_NAME = 'classes'
        AND COLUMN_NAME = 'homeroom_teacher_id'
    ),
    'SELECT 1',
    'ALTER TABLE classes ADD COLUMN homeroom_teacher_id INT NULL AFTER homeroom_teacher'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = @schema_name
        AND TABLE_NAME = 'classes'
        AND INDEX_NAME = 'idx_classes_homeroom_teacher_id'
    ),
    'SELECT 1',
    'ALTER TABLE classes ADD INDEX idx_classes_homeroom_teacher_id (homeroom_teacher_id)'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.TABLE_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = @schema_name
        AND TABLE_NAME = 'classes'
        AND CONSTRAINT_NAME = 'fk_classes_homeroom_teacher'
        AND CONSTRAINT_TYPE = 'FOREIGN KEY'
    ),
    'SELECT 1',
    'ALTER TABLE classes ADD CONSTRAINT fk_classes_homeroom_teacher FOREIGN KEY (homeroom_teacher_id) REFERENCES teachers(id) ON DELETE SET NULL'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE teachers t
LEFT JOIN subjects s
  ON LOWER(TRIM(s.name)) = LOWER(TRIM(t.subject))
SET t.subject_id = s.id
WHERE t.subject_id IS NULL
  AND t.subject IS NOT NULL
  AND TRIM(t.subject) <> '';

UPDATE teachers t
LEFT JOIN subjects s ON s.id = t.subject_id
SET t.subject = s.name
WHERE t.subject_id IS NOT NULL;

UPDATE classes c
LEFT JOIN teachers t
  ON LOWER(TRIM(t.name)) = LOWER(TRIM(c.homeroom_teacher))
SET c.homeroom_teacher_id = t.id
WHERE c.homeroom_teacher_id IS NULL
  AND c.homeroom_teacher IS NOT NULL
  AND TRIM(c.homeroom_teacher) <> '';

UPDATE classes c
LEFT JOIN teachers t ON t.id = c.homeroom_teacher_id
SET c.homeroom_teacher = t.name
WHERE c.homeroom_teacher_id IS NOT NULL;
