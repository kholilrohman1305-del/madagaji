CREATE TABLE IF NOT EXISTS school_settings (
  id INT NOT NULL PRIMARY KEY DEFAULT 1,
  school_name VARCHAR(160) NOT NULL DEFAULT '',
  school_subtitle VARCHAR(160) NOT NULL DEFAULT '',
  npsn VARCHAR(30) NOT NULL DEFAULT '',
  nsm VARCHAR(30) NOT NULL DEFAULT '',
  address TEXT NULL,
  village VARCHAR(120) NOT NULL DEFAULT '',
  city VARCHAR(120) NOT NULL DEFAULT '',
  province VARCHAR(120) NOT NULL DEFAULT '',
  postal_code VARCHAR(20) NOT NULL DEFAULT '',
  phone VARCHAR(50) NOT NULL DEFAULT '',
  email VARCHAR(120) NOT NULL DEFAULT '',
  website VARCHAR(160) NOT NULL DEFAULT '',
  logo_url VARCHAR(255) NOT NULL DEFAULT '',
  principal_name VARCHAR(160) NOT NULL DEFAULT '',
  principal_nip VARCHAR(80) NOT NULL DEFAULT '',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO school_settings
  (id, school_name, school_subtitle, npsn, nsm, address, village, city, province, postal_code, phone, email, website, logo_url, principal_name, principal_nip)
VALUES
  (1, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '')
ON DUPLICATE KEY UPDATE id = id;
