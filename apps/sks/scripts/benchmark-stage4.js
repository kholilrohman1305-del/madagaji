#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

const BASE_URL = String(process.env.SKS_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const USERNAME = String(process.env.SKS_USERNAME || 'admin_sl25_a').trim();
const PASSWORD = String(process.env.SKS_PASSWORD || 'admin123').trim();
const RUNS = Math.max(1, Number.parseInt(process.env.SKS_BENCH_RUNS || '5', 10));
const WARMUP = Math.max(0, Number.parseInt(process.env.SKS_BENCH_WARMUP || '1', 10));
const BRANCH_ID = Number.parseInt(process.env.SKS_BRANCH_ID || '0', 10) || 0;
const CLASS_NAME = String(process.env.SKS_CLASS_NAME || '').trim();

let sessionCookie = '';

function withBase(p) {
    return `${BASE_URL}${p.startsWith('/') ? p : `/${p}`}`;
}

function parseCookieFromSetCookie(setCookieValue) {
    if (!setCookieValue) return '';
    const first = String(setCookieValue).split(';')[0];
    return first.includes('=') ? first : '';
}

async function requestJson(url, options = {}) {
    const headers = {
        Accept: 'application/json',
        ...(options.headers || {})
    };
    if (sessionCookie) headers.Cookie = sessionCookie;

    const started = performance.now();
    const res = await fetch(url, { ...options, headers });
    const elapsedMs = performance.now() - started;

    if (!sessionCookie) {
        const cookie = parseCookieFromSetCookie(res.headers.get('set-cookie'));
        if (cookie) sessionCookie = cookie;
    }

    let data = null;
    try {
        data = await res.json();
    } catch (_) {
        data = null;
    }

    return {
        ok: res.ok,
        status: res.status,
        elapsedMs,
        data
    };
}

function percentile(sortedValues, pct) {
    if (!sortedValues.length) return 0;
    const idx = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil((pct / 100) * sortedValues.length) - 1));
    return sortedValues[idx];
}

function summarizeTimings(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((acc, v) => acc + v, 0);
    return {
        count: values.length,
        min_ms: sorted[0] || 0,
        p50_ms: percentile(sorted, 50),
        p95_ms: percentile(sorted, 95),
        max_ms: sorted[sorted.length - 1] || 0,
        avg_ms: values.length ? (sum / values.length) : 0
    };
}

async function login() {
    const res = await requestJson(withBase('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: USERNAME, password: PASSWORD })
    });
    if (!res.ok || !res.data?.success) {
        throw new Error(`Login gagal ke ${withBase('/api/auth/login')}. status=${res.status} message=${res.data?.message || 'unknown'}`);
    }
}

async function detectClassName() {
    if (CLASS_NAME) return CLASS_NAME;
    const query = BRANCH_ID > 0 ? `?branch_id=${BRANCH_ID}` : '';
    const res = await requestJson(withBase(`/api/initial-data${query}`));
    if (!res.ok || !res.data?.success) return '';
    const classes = Array.isArray(res.data.classes) ? res.data.classes : [];
    return String(classes[0]?.nama_kelas || classes[0]?.kelas || '').trim();
}

async function runEndpointBenchmark(name, pathBuilder) {
    const timings = [];
    const statuses = new Map();

    for (let i = 0; i < WARMUP + RUNS; i += 1) {
        const path = pathBuilder();
        const res = await requestJson(withBase(path));
        const key = String(res.status);
        statuses.set(key, (statuses.get(key) || 0) + 1);
        if (i >= WARMUP) timings.push(Number(res.elapsedMs.toFixed(2)));
    }

    return {
        endpoint: name,
        stats: summarizeTimings(timings),
        statuses: Object.fromEntries(statuses.entries())
    };
}

function printSummary(results) {
    console.log('=== Stage 4 Benchmark Summary ===');
    results.forEach((r) => {
        const s = r.stats;
        console.log(
            `${r.endpoint.padEnd(36)} avg=${s.avg_ms.toFixed(2)}ms p50=${s.p50_ms.toFixed(2)}ms p95=${s.p95_ms.toFixed(2)}ms min=${s.min_ms.toFixed(2)}ms max=${s.max_ms.toFixed(2)}ms status=${JSON.stringify(r.statuses)}`
        );
    });
}

async function main() {
    await login();
    const kelas = await detectClassName();
    if (!kelas) {
        throw new Error('Tidak bisa menentukan kelas untuk benchmark /api/report/detail/class-students. Set SKS_CLASS_NAME.');
    }

    const branchQuery = BRANCH_ID > 0 ? `&branch_id=${BRANCH_ID}` : '';
    const branchQueryStart = BRANCH_ID > 0 ? `?branch_id=${BRANCH_ID}` : '';

    const results = [];
    results.push(await runEndpointBenchmark('/api/initial-data', () => `/api/initial-data${branchQueryStart}`));
    results.push(await runEndpointBenchmark('/api/arrears?page=1&limit=10&status=aktif', () => `/api/arrears?page=1&limit=10&status=aktif${branchQuery}`));
    results.push(await runEndpointBenchmark('/api/report/detail', () => `/api/report/detail${branchQueryStart}`));
    results.push(await runEndpointBenchmark('/api/report/detail/class-students', () => `/api/report/detail/class-students?kelas=${encodeURIComponent(kelas)}${branchQuery}`));

    printSummary(results);

    const report = {
        generated_at: new Date().toISOString(),
        base_url: BASE_URL,
        username: USERNAME,
        runs: RUNS,
        warmup: WARMUP,
        branch_id: BRANCH_ID || null,
        kelas,
        results
    };

    const outDir = path.join(__dirname, '..', 'logs');
    fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, `stage4-benchmark-${Date.now()}.json`);
    fs.writeFileSync(outFile, JSON.stringify(report, null, 2), 'utf8');
    console.log(`Report tersimpan: ${outFile}`);
}

main().catch((err) => {
    const cause = err?.cause?.message ? ` | cause=${err.cause.message}` : '';
    console.error('[stage4 benchmark] failed:', `${err.message}${cause}`);
    console.error('[stage4 benchmark] hint:', `pastikan server aktif dan BASE URL benar. current=${BASE_URL}`);
    console.error('[stage4 benchmark] hint:', 'PowerShell contoh: $env:SKS_BASE_URL="http://localhost:3000/sks"; npm run perf:stage4');
    process.exit(1);
});
