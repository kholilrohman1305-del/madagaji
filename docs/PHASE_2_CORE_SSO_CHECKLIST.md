# Phase 2 - Integrasi App Existing ke App Core (SSO)

## Tujuan
- Login terpusat dari app-core.
- App existing menerima JWT yang sama (issuer/audience konsisten).
- Role tetap berlaku di app existing.

## Perubahan Kode yang Sudah Diterapkan
- `backend/src/services/authService.js`
  - JWT sekarang menyertakan `issuer` + `audience`.
- `backend/src/middleware/auth.js`
  - Verifikasi JWT sekarang strict: secret + issuer + audience.
  - Tambah mode `AUTH_TRUST_TOKEN_USER=true` agar user diambil dari claim token (tanpa query `users` lokal).
  - Tetap fallback ke mode lama jika `AUTH_TRUST_TOKEN_USER=false`.

## Env yang Diperlukan (App Existing)
```env
JWT_SECRET=...
JWT_ISSUER=mada-core
JWT_AUDIENCE=mada-apps
AUTH_TRUST_TOKEN_USER=true
AUTH_BYPASS=false
```

## Env yang Diperlukan (App Core)
```env
JWT_SECRET=...              # harus sama
JWT_ISSUER=mada-core
JWT_AUDIENCE=mada-apps
```

## Urutan Rollout
1. Deploy app-core.
2. Set env app-core + restart.
3. Set env app existing (`AUTH_TRUST_TOKEN_USER=true`).
4. Build frontend app existing + deploy `backend/public`.
5. Test:
   - login di app-core
   - akses endpoint app existing
   - role restriction (`admin/guru`)

## Verifikasi Cepat
- `GET /api/health` (app existing) => `ok:true`
- `GET /api/auth/me` (app existing, setelah login core) => user terdeteksi
- Akses route admin dengan role guru => `403 Forbidden`
