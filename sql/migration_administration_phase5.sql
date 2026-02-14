-- Phase 5: Administration module tables
-- Run this in DB1 (gaji database)

CREATE TABLE IF NOT EXISTS surat_masuk_keluar (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nomor_surat VARCHAR(100) DEFAULT '',
  tanggal DATE NOT NULL,
  jenis ENUM('masuk', 'keluar') NOT NULL,
  perihal VARCHAR(255) DEFAULT '',
  tujuan VARCHAR(255) DEFAULT '',
  keterangan TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_surat_tanggal (tanggal),
  INDEX idx_surat_jenis (jenis)
);

CREATE TABLE IF NOT EXISTS inventaris (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kode VARCHAR(80) UNIQUE,
  nama VARCHAR(150) NOT NULL,
  kategori VARCHAR(100) DEFAULT '',
  jumlah_total INT NOT NULL DEFAULT 0,
  jumlah_tersedia INT NOT NULL DEFAULT 0,
  kondisi VARCHAR(50) DEFAULT 'baik',
  lokasi VARCHAR(150) DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_inventaris_nama (nama),
  INDEX idx_inventaris_kategori (kategori)
);

CREATE TABLE IF NOT EXISTS peminjaman (
  id INT AUTO_INCREMENT PRIMARY KEY,
  inventaris_id INT NOT NULL,
  peminjam VARCHAR(150) NOT NULL,
  tanggal_pinjam DATE NOT NULL,
  tanggal_kembali_rencana DATE NULL,
  tanggal_kembali_real DATE NULL,
  jumlah INT NOT NULL DEFAULT 1,
  status ENUM('dipinjam', 'kembali') NOT NULL DEFAULT 'dipinjam',
  keterangan TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_peminjaman_status (status),
  INDEX idx_peminjaman_tanggal (tanggal_pinjam),
  CONSTRAINT fk_peminjaman_inventaris FOREIGN KEY (inventaris_id)
    REFERENCES inventaris(id)
    ON UPDATE CASCADE ON DELETE RESTRICT
);
