# App Administration

Fungsi fase ini:
- Endpoint health + DB check
- Validasi JWT shared
- Modul Surat:
  - `GET|POST|PUT|DELETE /api/letters`
- Modul Inventaris:
  - `GET|POST|PUT|DELETE /api/inventory`
- Modul Peminjaman:
  - `GET|POST /api/borrowing`
  - `POST /api/borrowing/:id/return`

Run:
```bash
npm install
npm run dev
```
