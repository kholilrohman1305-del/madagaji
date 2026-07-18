INSERT INTO konfigurasi (config_key, config_value) VALUES
  ('RATE_HADIR_KETERAMPILAN', '0'),
  ('RATE_TRANSPORT_KETERAMPILAN', '0')
ON DUPLICATE KEY UPDATE config_value = config_value;
