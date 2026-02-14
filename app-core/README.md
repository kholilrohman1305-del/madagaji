# App Core (Sprint 1 Scaffold)

## Scope saat ini

- Auth API:
  - `POST /api/auth/login`
  - `POST /api/auth/logout`
  - `GET /api/auth/me`
- User API (admin only):
  - `GET /api/users`
  - `POST /api/users`
  - `PUT /api/users/:id`
- Master API:
  - `GET /api/master/teachers`
  - `GET /api/master/classes`
  - `GET /api/master/subjects`
- Health:
  - `GET /api/health` (cek DB1 + DB2)

## Run

1. Copy `.env.example` -> `.env`
2. Install:
```bash
npm install
```
3. Start:
```bash
npm run dev
```

## Notes

- DB1 dipakai untuk `users` (auth).
- DB2 dipakai untuk master data (`teachers`, `classes`, `subjects`).
- JWT issuer/audience sudah disiapkan agar bisa dipakai lintas app.
