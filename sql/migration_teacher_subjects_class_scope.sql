ALTER TABLE teacher_subjects
  ADD COLUMN class_id INT NOT NULL DEFAULT 0 AFTER tingkat;

ALTER TABLE teacher_subjects
  DROP INDEX uniq_ts_tingkat;

ALTER TABLE teacher_subjects
  ADD UNIQUE KEY uniq_ts_scope (teacher_id, subject_id, tingkat, class_id);
