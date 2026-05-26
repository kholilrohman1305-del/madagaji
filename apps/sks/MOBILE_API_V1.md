# SKS Mobile API v1

Base URL: `/api/mobile/v1`

Semua response memakai envelope:

- Sukses:
```json
{ "success": true, "data": {}, "meta": {} }
```
- Gagal:
```json
{ "success": false, "code": "ERR_CODE", "message": "Pesan error" }
```

## Auth

- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`
- `GET /auth/pin/status` (admin cabang)
- `POST /auth/pin/verify` (admin cabang)

## Dashboard

- `GET /dashboard`
  - `super_admin`: agregat global
  - `admin`: agregat cabang
  - `siswa`: ringkasan akun siswa

## Billing & Payment

- `GET /billing/students?search=&kelas=&status=&page=&limit=`
- `GET /billing/student/:studentId/summary`
- `GET /billing/student/:studentId/bills?include_all=true|false`
- `GET /billing/student/:studentId/timeline`
- `GET /payments/history?date_from=&date_to=&search=&page=&limit=`
- `POST /payments` (admin cabang + verifikasi PIN)

Request body `POST /payments`:
```json
{
  "student_id": 12,
  "bill_id": 155,
  "amount": 250000,
  "tanggal": "2026-02-25",
  "penerima": "Nama Admin",
  "keterangan": "Pembayaran bulan ini",
  "pin": "123456"
}
```

## Catatan Implementasi

- API mobile masih memakai session cookie yang sama dengan web.
- Pastikan client mobile mengaktifkan cookie jar/persist cookie.
- Role `super_admin` tetap read-only untuk pembayaran.
- Role `siswa` hanya bisa akses data milik sendiri.

## Siap Dites (Postman)

File yang disediakan:

- `apps/sks/postman/SKS_Mobile_API_v1.postman_collection.json`
- `apps/sks/postman/SKS_Mobile_API_v1.postman_environment.json`

Urutan test cepat:

1. Import collection + environment.
2. Jalankan request `Auth/Login`.
3. Jalankan `Auth/Me`.
4. (Admin cabang) jalankan `Auth/PIN Status` lalu `Auth/PIN Verify`.
5. Jalankan endpoint Dashboard/Billing/Payments.
