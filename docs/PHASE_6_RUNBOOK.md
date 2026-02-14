# Phase 6 Runbook (Go-Live)

## 1) Install Dependencies

```bash
cd app-core && npm install
cd ../app-academic && npm install
cd ../app-finance && npm install
cd ../app-administration && npm install
cd ../shared-lib && npm install
```

## 2) Environment

Set the same values on all apps:
- `JWT_SECRET`
- `JWT_ISSUER=mada-core`
- `JWT_AUDIENCE=mada-apps`

Set per app:
- DB credentials (`DB1_*`, `DB2_*`)
- `FRONTEND_ORIGIN`

Frontend env (`frontend/.env`):
```env
VITE_CORE_API_BASE_URL=/api
VITE_ACADEMIC_API_BASE_URL=/academic/api
VITE_FINANCE_API_BASE_URL=/finance/api
VITE_ADMIN_API_BASE_URL=/admin/api
```

`app-core` optional:
- `ACADEMIC_BASE_URL`
- `FINANCE_BASE_URL`
- `ADMIN_BASE_URL`

## 3) Database Migration

Run on DB1:
- `sql/migration_administration_phase5.sql`

## 4) Start Services

```bash
cd app-core && npm run start
cd app-academic && npm run start
cd app-finance && npm run start
cd app-administration && npm run start
```

## 5) Verify

Health checks:
- `GET app-core/api/health`
- `GET app-academic/api/health`
- `GET app-finance/api/health`
- `GET app-administration/api/health`

Platform aggregate (admin only):
- `GET app-core/api/platform/health`

Auth flow:
1. Login in app-core.
2. Use same cookie/token to call:
   - `app-academic/api/me`
   - `app-finance/api/me`
   - `app-administration/api/me`

Role check:
- call admin route with guru token => must return `403`.
