SET @schema_name = DATABASE();

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @schema_name
        AND TABLE_NAME = 'student_achievements'
        AND COLUMN_NAME = 'achievement_category'
    ),
    'SELECT 1',
    "ALTER TABLE student_achievements ADD COLUMN achievement_category ENUM('akademik','non_akademik') NOT NULL DEFAULT 'akademik' AFTER title"
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
