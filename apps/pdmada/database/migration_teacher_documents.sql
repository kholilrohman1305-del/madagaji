SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS teacher_documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  teacher_id INT NOT NULL,
  document_type VARCHAR(60) NOT NULL,
  file_number VARCHAR(60) NULL,
  file_url VARCHAR(255) NULL,
  issuer VARCHAR(150) NULL,
  issued_date DATE NULL,
  status ENUM('valid', 'proses', 'kedaluwarsa') NOT NULL DEFAULT 'valid',
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_teacher_documents_teacher (teacher_id),
  INDEX idx_teacher_documents_type (document_type),
  CONSTRAINT fk_teacher_documents_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
);
