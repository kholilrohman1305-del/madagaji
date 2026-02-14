# Phase 3-6 Implementation Status

## Phase 3 - Extend Academic
Status: `done`

Deliverables:
- `app-academic/` scaffold
- shared JWT validation from `shared-lib`
- health endpoint and protected sample route
- schedule read endpoint: `GET /api/schedule`
- attendance endpoints:
  - `GET /api/attendance/day?date=YYYY-MM-DD`
  - `POST /api/attendance/bulk`
  - `GET|POST|DELETE /api/attendance/holiday`

Completed:
- scheduler APIs migrated to `app-academic` (`/api/scheduler/*`)
- frontend routing for `/schedule`, `/attendance`, `/scheduler` mapped to academic base URL

## Phase 4 - Extend Finance
Status: `done`

Deliverables:
- `app-finance/` scaffold
- shared JWT validation from `shared-lib`
- health endpoint and protected sample route
- expenses APIs:
  - `GET /api/expenses?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`
  - `POST /api/expenses`
  - `PUT /api/expenses/:id`
  - `DELETE /api/expenses/:id`

Completed:
- payroll compatibility APIs available in `app-finance` under `/api/payroll/*`
- frontend routing for all `/payroll/*` mapped to finance base URL

## Phase 5 - Administration App
Status: `done`

Deliverables:
- `app-administration/` scaffold
- shared JWT validation from `shared-lib`
- health endpoint and protected sample route
- APIs added:
  - `GET|POST|PUT|DELETE /api/letters`
  - `GET|POST|PUT|DELETE /api/inventory`
  - `GET|POST /api/borrowing`
  - `POST /api/borrowing/:id/return`
- DB migration file:
  - `sql/migration_administration_phase5.sql`

Completed:
- administration routes already mapped via frontend base URL
- summary report endpoint added: `GET /api/reports/summary`

## Phase 6 - Testing & Launch
Status: `done`

Deliverables:
- `deploy/nginx/sekolah.conf` reverse proxy template
- health contract across apps (core + domain apps)
- `app-core` aggregate health endpoint:
  - `GET /api/platform/health` (admin)
- runbook:
  - `docs/PHASE_6_RUNBOOK.md`

Go-live checklist:
1. Set same JWT env on all apps (`JWT_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE`)
2. Set per-app CORS `FRONTEND_ORIGIN`
3. Build/deploy each app
4. Verify:
   - `/api/health` every app
   - login in core, access other apps with same token
   - role restriction works
5. Enable monitoring and backup schedule
