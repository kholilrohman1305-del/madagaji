# Master Data Sekolah

Project ini adalah basis data utama sekolah dengan Node.js backend, React frontend, dan MySQL. Fokus MVP: Siswa (detail lengkap), Orang Tua/Wali, Guru, Mapel, plus mekanisme sinkronisasi sederhana via `change_log`.

## Struktur
- `backend/` API Express + MySQL
- `frontend/` React (Vite)
- `database/schema.sql` skema MySQL

## Setup Database
1. Buat database dan tabel:

```sql
SOURCE database/schema.sql;
```

## Setup Backend
1. Salin env contoh:

```bash
copy backend\.env.example backend\.env
```

2. Install dependency:

```bash
cd backend
npm install
```

3. Jalankan server:

```bash
npm run dev
```

Backend berjalan di `http://localhost:3001`.

## Setup Frontend
1. Salin env contoh:

```bash
copy frontend\.env.example frontend\.env
```

2. Install dependency:

```bash
cd frontend
npm install
```

3. Jalankan React:

```bash
npm run dev
```

Frontend berjalan di `http://localhost:3000`.

## API Utama
- `GET /api/students`
- `POST /api/students`
- `PUT /api/students/:id`
- `DELETE /api/students/:id`

- `GET /api/classes`
- `POST /api/classes`
- `PUT /api/classes/:id`
- `DELETE /api/classes/:id`

- `GET /api/school-years`
- `POST /api/school-years`
- `PUT /api/school-years/:id`
- `DELETE /api/school-years/:id`

- `GET /api/teachers`
- `POST /api/teachers`
- `PUT /api/teachers/:id`
- `DELETE /api/teachers/:id`

- `GET /api/subjects`
- `POST /api/subjects`
- `PUT /api/subjects/:id`
- `DELETE /api/subjects/:id`

## Sync (Push/Pull Manual)
- `GET /sync/changes?since=2026-02-04 10:00:00`
- `POST /sync/apply`

`/sync/apply` menerima array perubahan:

```json
[
  {
    "table_name": "students",
    "record_id": 1,
    "operation": "update",
    "data_json": "{\"id\":1,\"nisn\":\"123\",\"name\":\"Rani\",\"gender\":\"P\",\"birth_date\":\"2010-01-01\",\"address\":\"Bandung\",\"is_active\":1}"
  }
]
```

Semua perubahan tersimpan di `change_log` untuk keperluan sinkronisasi.
