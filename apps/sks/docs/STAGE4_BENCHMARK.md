# Stage 4 Benchmark

Script ini dipakai untuk mengukur endpoint paling berat setelah optimasi tahap 1-3.

## Endpoint yang diukur
- `/api/initial-data`
- `/api/arrears?page=1&limit=10&status=aktif`
- `/api/report/detail`
- `/api/report/detail/class-students?kelas=...`

## Cara jalan
Jalankan server SKS dulu, lalu:

```bash
cd apps/sks
npm run perf:stage4
```

## Environment opsional
- `SKS_BASE_URL` default: `http://localhost:3000`
- `SKS_USERNAME` default: `admin_sl25_a`
- `SKS_PASSWORD` default: `admin123`
- `SKS_BRANCH_ID` default: `0` (semua branch sesuai scope user)
- `SKS_CLASS_NAME` default: auto-detect dari `/api/initial-data`
- `SKS_BENCH_WARMUP` default: `1`
- `SKS_BENCH_RUNS` default: `5`

Contoh:

```bash
SKS_BASE_URL=http://localhost:3000/sks SKS_USERNAME=admin_sl25_a SKS_PASSWORD=admin123 SKS_BENCH_RUNS=10 npm run perf:stage4
```

PowerShell:

```powershell
$env:SKS_BASE_URL = "http://localhost:3000/sks"
$env:SKS_USERNAME = "admin_sl25_a"
$env:SKS_PASSWORD = "admin123"
$env:SKS_BENCH_RUNS = "10"
npm run perf:stage4
```

## Output
- Ringkasan latency ditampilkan di console (`avg`, `p50`, `p95`, `min`, `max`, status).
- File JSON disimpan ke `apps/sks/logs/stage4-benchmark-<timestamp>.json`.
