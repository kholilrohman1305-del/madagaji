/* eslint-disable no-console */
const core = process.env.CORE_URL || 'http://127.0.0.1:4100';
const academic = process.env.ACADEMIC_URL || 'http://127.0.0.1:4200';
const finance = process.env.FINANCE_URL || 'http://127.0.0.1:4300';
const admin = process.env.ADMIN_URL || 'http://127.0.0.1:4400';

async function hit(name, url) {
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    const data = await r.json().catch(() => ({}));
    return { name, ok: r.ok, status: r.status, data };
  } catch (e) {
    return { name, ok: false, status: 0, error: e.message };
  }
}

async function main() {
  const results = await Promise.all([
    hit('core', `${core}/api/health`),
    hit('academic', `${academic}/api/health`),
    hit('finance', `${finance}/api/health`),
    hit('administration', `${admin}/api/health`)
  ]);

  for (const r of results) {
    if (r.ok) {
      console.log(`[OK] ${r.name} (${r.status})`, r.data);
    } else {
      console.log(`[FAIL] ${r.name} (${r.status})`, r.error || r.data);
    }
  }

  const allOk = results.every(r => r.ok);
  if (!allOk) process.exit(1);
}

main();
