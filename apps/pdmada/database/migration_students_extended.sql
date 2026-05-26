-- Migration: tambah kolom data siswa lengkap
-- Aman dijalankan berulang (MySQL 8+)

USE sekolah_master;

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS school_origin_npsn VARCHAR(20) NULL AFTER previous_school,
  ADD COLUMN IF NOT EXISTS no_akta_lahir VARCHAR(50) NULL AFTER school_origin_npsn,
  ADD COLUMN IF NOT EXISTS paud VARCHAR(100) NULL AFTER special_needs,
  ADD COLUMN IF NOT EXISTS tk VARCHAR(100) NULL AFTER paud,
  ADD COLUMN IF NOT EXISTS hobby VARCHAR(100) NULL AFTER tk,
  ADD COLUMN IF NOT EXISTS aspiration VARCHAR(100) NULL AFTER hobby,
  ADD COLUMN IF NOT EXISTS penerima_kps TINYINT(1) NOT NULL DEFAULT 0 AFTER distance_km,
  ADD COLUMN IF NOT EXISTS no_kps VARCHAR(50) NULL AFTER penerima_kps,
  ADD COLUMN IF NOT EXISTS address_dusun VARCHAR(100) NULL AFTER address,
  ADD COLUMN IF NOT EXISTS address_rt VARCHAR(5) NULL AFTER address_dusun,
  ADD COLUMN IF NOT EXISTS address_rw VARCHAR(5) NULL AFTER address_rt,
  ADD COLUMN IF NOT EXISTS latitude VARCHAR(30) NULL AFTER postal_code,
  ADD COLUMN IF NOT EXISTS longitude VARCHAR(30) NULL AFTER latitude;
