SET NAMES utf8mb4 COLLATE utf8mb4_0900_ai_ci;
SET @BATCH_NO = 10;
SET @N_START  = 450001;
SET @N_END    = 500000;
SET @TAG = CONCAT('SL50-B', LPAD(@BATCH_NO,2,'0'));
SET @nis_start = CONCAT('95', LPAD(@N_START,7,'0'));
SET @nis_end   = CONCAT('95', LPAD(@N_END,7,'0'));
SET @pwd_hash = '$2b$10$2BZKEQuiJjRC7jUqZiuGi.VVzZYexeDPLxMrbcaLBFb04Yt2K0Z1y';

DELETE FROM payments WHERE trans_id LIKE CONCAT(@TAG, '-%');
DELETE FROM bills WHERE id_tagihan_code LIKE CONCAT(@TAG, '-BILL-%');
DELETE FROM scholarship_recipients WHERE nis BETWEEN @nis_start AND @nis_end AND period_month=3 AND period_year=2026;
DELETE FROM students WHERE nis BETWEEN @nis_start AND @nis_end;
DELETE FROM expenses WHERE deskripsi LIKE CONCAT('[', @TAG, ']%');
DELETE FROM other_incomes WHERE deskripsi LIKE CONCAT('[', @TAG, ']%');

DROP TEMPORARY TABLE IF EXISTS tmp_batch_seq;
CREATE TEMPORARY TABLE tmp_batch_seq (n INT PRIMARY KEY);

INSERT INTO tmp_batch_seq (n)
SELECT num + 1
FROM (
  SELECT (a.d*100000 + b.d*10000 + c.d*1000 + d.d*100 + e.d*10 + f.d) AS num
  FROM (SELECT 0 d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) a
  CROSS JOIN (SELECT 0 d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) b
  CROSS JOIN (SELECT 0 d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) c
  CROSS JOIN (SELECT 0 d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) d
  CROSS JOIN (SELECT 0 d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) e
  CROSS JOIN (SELECT 0 d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) f
) x
WHERE (num + 1) BETWEEN @N_START AND @N_END;

INSERT INTO students (
  nis, username, password, kelas, class_id, branch_id, tahun_masuk, tahun_lulus, status,
  nama, jenis_kelamin, alamat, nama_wali, no_hp_wali
)
SELECT
  CONCAT('95', LPAD(t.n,7,'0')),
  CONCAT('95', LPAD(t.n,7,'0')),
  @pwd_hash,
  k.nama_kelas, c.id, b.id,
  CAST(2022 + (t.n % 4) AS CHAR),
  CASE WHEN MOD(t.n,25)=0 THEN (2022 + (t.n % 4) + 3) ELSE NULL END,
  CASE WHEN MOD(t.n,25)=0 THEN 'Lulus' WHEN MOD(t.n,17)=0 THEN 'Nonaktif' WHEN MOD(t.n,43)=0 THEN 'Pindah' ELSE 'Aktif' END,
  CONCAT('SL50 Siswa ', LPAD(t.n,6,'0')),
  IF(MOD(t.n,2)=0,'L','P'),
  CONCAT('Alamat SL50 Blok ', LPAD(t.n,6,'0')),
  CONCAT('Wali SL50 ', LPAD(t.n,6,'0')),
  CONCAT('0821', LPAD(t.n,8,'0'))
FROM tmp_batch_seq t
JOIN (
  SELECT 1 idx,'10.1' nama_kelas UNION ALL SELECT 2,'10.2' UNION ALL SELECT 3,'10.3' UNION ALL SELECT 4,'10.4' UNION ALL SELECT 5,'10.5' UNION ALL SELECT 6,'10.6'
  UNION ALL SELECT 7,'11.1' UNION ALL SELECT 8,'11.2' UNION ALL SELECT 9,'11.3' UNION ALL SELECT 10,'11.4' UNION ALL SELECT 11,'11.5' UNION ALL SELECT 12,'11.6'
  UNION ALL SELECT 13,'12.1' UNION ALL SELECT 14,'12.2' UNION ALL SELECT 15,'12.3' UNION ALL SELECT 16,'12.4' UNION ALL SELECT 17,'12.5' UNION ALL SELECT 18,'12.6'
) k ON k.idx = (MOD(t.n - 1, 18) + 1)
JOIN branches b ON b.kode_cabang = CONCAT('SL50-', LPAD(FLOOR((t.n - 1) / 6250) + 1, 3, '0'))
JOIN classes c ON c.branch_id=b.id AND c.nama_kelas=k.nama_kelas;

INSERT INTO bills (
  id_tagihan_code,nama_tagihan,kelas,nama_siswa,total,terbayar,sisa,status,tanggal_buat,school_year_name,student_id,class_id,branch_id
)
SELECT
  CONCAT(@TAG, '-BILL-', LPAD(s.id,9,'0'), '-', LPAD(bt.seq,2,'0')),
  bt.nama_tagihan, s.kelas, s.nama, bt.nominal, 0, bt.nominal, 'Belum Lunas', bt.tanggal_buat,
  COALESCE((SELECT sy.name FROM school_years sy WHERE sy.is_active=1 ORDER BY sy.id DESC LIMIT 1),'2026/2027'),
  s.id, s.class_id, s.branch_id
FROM students s
JOIN sl50_bill_templates bt
WHERE s.nis BETWEEN @nis_start AND @nis_end;

INSERT INTO payments (trans_id,tanggal,kelas,nama,jumlah_bayar,penerima,keterangan,bill_id,student_id,class_id,branch_id)
SELECT CONCAT(@TAG,'-TRX-A-',b.id), DATE(b.tanggal_buat), b.kelas, b.nama_siswa, ROUND(b.total*0.35,2),
       CONCAT('Admin SL50 ', LPAD(MOD(b.branch_id,1000),3,'0')), 'Cicilan 1 (35%)', b.id,b.student_id,b.class_id,b.branch_id
FROM bills b WHERE b.id_tagihan_code LIKE CONCAT(@TAG,'-BILL-%');

INSERT INTO payments (trans_id,tanggal,kelas,nama,jumlah_bayar,penerima,keterangan,bill_id,student_id,class_id,branch_id)
SELECT CONCAT(@TAG,'-TRX-B-',b.id), DATE_ADD(DATE(b.tanggal_buat), INTERVAL 12 DAY), b.kelas, b.nama_siswa, ROUND(b.total*0.40,2),
       CONCAT('Admin SL50 ', LPAD(MOD(b.branch_id,1000),3,'0')), 'Cicilan 2 (40%)', b.id,b.student_id,b.class_id,b.branch_id
FROM bills b WHERE b.id_tagihan_code LIKE CONCAT(@TAG,'-BILL-%') AND MOD(b.id,2)=0;

INSERT INTO payments (trans_id,tanggal,kelas,nama,jumlah_bayar,penerima,keterangan,bill_id,student_id,class_id,branch_id)
SELECT CONCAT(@TAG,'-TRX-C-',b.id), DATE_ADD(DATE(b.tanggal_buat), INTERVAL 24 DAY), b.kelas, b.nama_siswa, ROUND(b.total*0.25,2),
       CONCAT('Admin SL50 ', LPAD(MOD(b.branch_id,1000),3,'0')), 'Pelunasan (25%)', b.id,b.student_id,b.class_id,b.branch_id
FROM bills b WHERE b.id_tagihan_code LIKE CONCAT(@TAG,'-BILL-%') AND MOD(b.id,5)=0;

UPDATE bills b
JOIN (
  SELECT bill_id, SUM(jumlah_bayar) total_bayar
  FROM payments
  WHERE trans_id LIKE CONCAT(@TAG,'-%') AND bill_id IS NOT NULL
  GROUP BY bill_id
) p ON p.bill_id=b.id
SET b.terbayar=LEAST(b.total,p.total_bayar),
    b.sisa=GREATEST(0,b.total-p.total_bayar),
    b.status=CASE WHEN GREATEST(0,b.total-p.total_bayar)<=0.01 THEN 'Lunas' ELSE 'Belum Lunas' END
WHERE b.id_tagihan_code LIKE CONCAT(@TAG,'-BILL-%');

INSERT INTO scholarship_recipients (
  type_id,nama_siswa,kelas,nis,tanggal_terima,period_month,period_year,is_operational_active,student_status_snapshot,payment_id,student_id,class_id,branch_id
)
SELECT t.id,s.nama,s.kelas,s.nis,'2026-03-01',3,2026,1,s.status,NULL,s.id,s.class_id,s.branch_id
FROM students s
JOIN scholarship_types t ON t.nama_beasiswa = CONCAT('SL50 Beasiswa ', (MOD(s.id,12)+1))
WHERE s.nis BETWEEN @nis_start AND @nis_end
  AND s.status='Aktif' AND MOD(s.id,5)=0;

INSERT INTO payments (trans_id,tanggal,kelas,nama,jumlah_bayar,penerima,keterangan,bill_id,student_id,class_id,branch_id)
SELECT
  CONCAT(@TAG,'-BEA-',r.id), '2026-03-01', r.kelas, r.nama_siswa,
  CASE WHEN t.jenis_nilai='nominal' THEN ROUND(t.nominal_per_siswa,2)
       ELSE ROUND(COALESCE((SELECT SUM(COALESCE(b.sisa,0)) FROM bills b WHERE b.student_id=r.student_id),0)*(t.nominal_per_siswa/100),2)
  END,
  'Sistem (Beasiswa)', CONCAT('Otomatis ',@TAG,': ',t.nama_beasiswa), NULL, r.student_id, r.class_id, r.branch_id
FROM scholarship_recipients r
JOIN scholarship_types t ON t.id=r.type_id
WHERE r.nis BETWEEN @nis_start AND @nis_end
  AND r.tanggal_terima='2026-03-01';

UPDATE scholarship_recipients r
JOIN payments p ON p.trans_id = CONCAT(@TAG,'-BEA-',r.id)
SET r.payment_id=p.id
WHERE r.nis BETWEEN @nis_start AND @nis_end
  AND r.tanggal_terima='2026-03-01';

WITH RECURSIVE seq80 AS (
  SELECT 1 n UNION ALL SELECT n+1 FROM seq80 WHERE n<80
)
INSERT INTO expenses (
  branch_id,tanggal,category_id,kategori,deskripsi,nominal,report_status,penanggung_jawab_nama,admin_keuangan_nama,is_recurring,is_active
)
SELECT
  b.id, DATE_ADD('2026-01-01', INTERVAL (s.n-1) DAY), ec.id, ec.category_name,
  CONCAT('[',@TAG,'] Pengeluaran ', LPAD(s.n,3,'0'), ' - ', ec.category_name),
  (300000 + (MOD(s.n,20)*50000)), IF(MOD(s.n,2)=0,'sudah','belum'),
  CONCAT('PJ ',@TAG,' ', LPAD(s.n,3,'0')), CONCAT('Admin SL50 ', LPAD(MOD(b.id,1000),3,'0')),
  IF(MOD(s.n,6)=0,1,0), 1
FROM seq80 s
JOIN branches b ON b.kode_cabang LIKE 'SL50-%'
JOIN expense_categories ec ON ec.branch_id=b.id
 AND ec.category_name = CASE MOD(s.n,7)
   WHEN 0 THEN 'SL50 - Operasional' WHEN 1 THEN 'SL50 - Gaji' WHEN 2 THEN 'SL50 - ATK'
   WHEN 3 THEN 'SL50 - Maintenance' WHEN 4 THEN 'SL50 - Transport' WHEN 5 THEN 'SL50 - Kegiatan'
   ELSE 'SL50 - Lainnya' END;

WITH RECURSIVE seq50 AS (
  SELECT 1 n UNION ALL SELECT n+1 FROM seq50 WHERE n<50
)
INSERT INTO other_incomes (
  branch_id,tanggal,sumber,deskripsi,nominal,report_status,is_active,admin_keuangan_nama
)
SELECT
  b.id, DATE_ADD('2026-01-01', INTERVAL (s.n-1) DAY),
  CASE MOD(s.n,5) WHEN 0 THEN 'Donasi' WHEN 1 THEN 'Sewa Fasilitas' WHEN 2 THEN 'Kerja Sama' WHEN 3 THEN 'Penjualan Aset Ringan' ELSE 'Lain-lain' END,
  CONCAT('[',@TAG,'] Pemasukan lain ', LPAD(s.n,3,'0')),
  (250000 + (MOD(s.n,30)*25000)), IF(MOD(s.n,2)=0,'sudah','belum'), 1,
  CONCAT('Admin SL50 ', LPAD(MOD(b.id,1000),3,'0'))
FROM seq50 s
JOIN branches b ON b.kode_cabang LIKE 'SL50-%';

SELECT @TAG AS batch, COUNT(*) AS students_batch FROM students WHERE nis BETWEEN @nis_start AND @nis_end;

