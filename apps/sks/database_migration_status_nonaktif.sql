-- Tambah status Nonaktif pada kolom students.status (ENUM)
-- Jalankan pada database SKS jika tabel students sudah ada.

ALTER TABLE students
  MODIFY COLUMN status ENUM('Aktif','Nonaktif','Lulus','Pindah','Keluar') DEFAULT 'Aktif';

