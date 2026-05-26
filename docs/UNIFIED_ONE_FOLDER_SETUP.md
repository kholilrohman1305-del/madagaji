# Unified Workspace (`madagaji` + `sks`)

Target sudah diterapkan: dua sistem sekarang berada dalam satu folder kerja:

- `.` = `madagaji` (sistem utama)
- `apps/sks` = copy sinkron dari workspace `sks`

## Struktur

```text
madagaji/
  backend/
  frontend/
  apps/
    sks/
      src/
      public/
      server.js
```

## Menjalankan Lokal

### 1) MadaGaji
- Arsitektur sekarang **monolith**:
  - `backend` (4000)
  - `frontend` (5173)

Perintah:

```powershell
cd backend
npm install
npm run dev
```

```powershell
cd frontend
npm install
npm run dev
```

### 2) SKS (dalam folder yang sama)
- Masuk `apps/sks`
- Buat `.env` dari `.env.example` (jika belum)
- Jalankan:
  - `npm install`
  - `npm start`

## Catatan Sinkronisasi

- Saat ini sinkron dilakukan dari `sks` -> `madagaji/apps/sks`.
- Folder yang tidak disalin: `.git`, `node_modules`, `.env`, `package-lock.json`.
- Jika mau sinkron ulang, jalankan perintah:

```powershell
robocopy ..\sks apps\sks /E /XD node_modules .git /XF package-lock.json .env
```
