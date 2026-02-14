# Strategic Modular Implementation (4 Apps + 1 DB)

Dokumen ini menerapkan strategi arsitektur yang sudah disepakati ke level eksekusi teknis.

## 1) Domain Split

1. `app-core`
- Auth/Login/Session
- Master data (guru, siswa, kelas, user, role)
- Konfigurasi global

2. `app-academic`
- Jadwal
- Absensi siswa
- Nilai/Rapor

3. `app-finance`
- Penggajian/Bisyaroh
- Pembayaran SPP
- Kas/Laporan keuangan

4. `app-administration`
- Surat masuk/keluar
- Inventaris
- Peminjaman

## 2) Data Boundary Rules

- Semua app pakai database terpusat.
- Setiap app **write** hanya pada tabel domain sendiri.
- Cross-domain akses diprioritaskan lewat API, bukan join bebas.
- ID lintas domain diseragamkan (`teacher_id`, `student_id`, `class_id`).

## 3) Auth Contract

- JWT diterbitkan oleh `app-core`.
- Semua app validasi token yang sama (`JWT_SECRET` konsisten).
- Cookie auth: `httpOnly`, `secure` di production.
- `AUTH_BYPASS` hanya untuk local/dev, tidak aktif di production.

## 4) Env Standard

Gunakan pola:

```env
DB1_NAME=...          # DB utama modul app ini
DB1_USER=...
DB1_PASSWORD=...

DB2_NAME=...          # DB master/reference (jika dipakai)
DB2_USER=...
DB2_PASSWORD=...
```

Catatan:
- Untuk app saat ini, query master data (`teachers/subjects/classes`) diarahkan ke koneksi DB2.
- `FRONTEND_ORIGIN` wajib URL penuh tanpa slash penutup.

## 5) Operational Minimum

- Health check wajib cek:
  - koneksi DB utama
  - koneksi DB master
- Request ID aktif untuk tracing log.
- Backup DB harian + uji restore berkala.

## 6) Migration Sequence (Pragmatis)

1. Stabilkan `app-core` (auth + master data).
2. Stabilkan `app-finance` (operasional harian).
3. Perluas `app-academic`.
4. Tambah `app-administration`.
5. Pasang reverse proxy (Nginx) untuk 1 domain gateway.

## 7) Done in This Repo

- Query master data sudah dipindah ke pool DB2.
- Auth bypass dibatasi agar tidak aktif pada production.
- Health endpoint cek DB utama + DB master.
- CORS origin dibuat strict dengan whitelist.
