# Phase 3-6 Implementation Status

## Phase 3 - Extend Academic
Status: `in progress`

Deliverables:
- `app-academic/` scaffold
- shared JWT validation from `shared-lib`
- health endpoint and protected sample route
- schedule read endpoint: `GET /api/schedule`
- attendance endpoints:
  - `GET /api/attendance/day?date=YYYY-MM-DD`
  - `POST /api/attendance/bulk`
  - `GET|POST|DELETE /api/attendance/holiday`

Next coding:
- migrate remaining scheduler/statistics APIs to `app-academic`
- connect frontend menu to `app-academic` base URL

## Phase 4 - Extend Finance
Status: `in progress`

Deliverables:
- `app-finance/` scaffold
- shared JWT validation from `shared-lib`
- health endpoint and protected sample route
- expenses APIs:
  - `GET /api/expenses?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`
  - `POST /api/expenses`
  - `PUT /api/expenses/:id`
  - `DELETE /api/expenses/:id`

Next coding:
- migrate bisyaroh/SPP/kas endpoints fully into `app-finance`
- connect finance frontend menus to app-finance base URL

## Phase 5 - Administration App
Status: `bootstrap done`

Deliverables:
- `app-administration/` scaffold
- shared JWT validation from `shared-lib`
- health endpoint and protected sample route

Next coding:
- surat masuk/keluar module
- inventaris and peminjaman module

## Phase 6 - Testing & Launch
Status: `ops checklist prepared`

Deliverables:
- `deploy/nginx/sekolah.conf` reverse proxy template
- health contract across apps (core + domain apps)

Go-live checklist:
1. Set same JWT env on all apps (`JWT_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE`)
2. Set per-app CORS `FRONTEND_ORIGIN`
3. Build/deploy each app
4. Verify:
   - `/api/health` every app
   - login in core, access other apps with same token
   - role restriction works
5. Enable monitoring and backup schedule
