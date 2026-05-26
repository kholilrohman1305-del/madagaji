let arrearsAgingChart = null;

function initMonitoringTunggakan() {
    if ((appData.role || 'admin') !== 'super_admin') {
        const container = document.getElementById('page-container');
        if (container) {
            container.innerHTML = '<div class="rounded-xl border border-rose-100 bg-rose-50 p-6 text-sm font-semibold text-rose-700">Akses ditolak. Halaman ini hanya untuk super admin.</div>';
        }
        return;
    }
    setupArrearsFilters();
    loadMonitoringArrears();
}

function setupArrearsFilters() {
    const monthEl = document.getElementById('arrears-filter-month');
    const yearEl = document.getElementById('arrears-filter-year');
    const btn = document.getElementById('arrears-filter-btn');
    if (!monthEl || !yearEl || !btn) return;

    const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    monthEl.innerHTML = monthNames.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('');
    const now = new Date();
    const years = [];
    for (let y = now.getFullYear() - 3; y <= now.getFullYear() + 2; y++) years.push(y);
    yearEl.innerHTML = years.map((y) => `<option value="${y}">${y}</option>`).join('');
    monthEl.value = String(now.getMonth() + 1);
    yearEl.value = String(now.getFullYear());
    btn.onclick = loadMonitoringArrears;
}

async function loadMonitoringArrears() {
    const month = Number(document.getElementById('arrears-filter-month')?.value || new Date().getMonth() + 1);
    const year = Number(document.getElementById('arrears-filter-year')?.value || new Date().getFullYear());
    const table = document.getElementById('arrears-table');
    if (table) table.innerHTML = '<tr><td colspan="6" class="p-10 text-center text-slate-400">Memuat data...</td></tr>';

    const res = await apiCall(`/api/monitoring-arrears?month=${month}&year=${year}`);
    if (!res || res.success === false) {
        if (table) table.innerHTML = `<tr><td colspan="6" class="p-10 text-center text-rose-500">${res?.message || 'Gagal memuat data.'}</td></tr>`;
        return;
    }
    renderArrearsCards(res.totals || {});
    renderArrearsTable(res.rows || []);
    renderArrearsChart(res.rows || []);
}

function renderArrearsCards(t) {
    const set = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };
    set('arrears-total', formatRp(t.totalTunggakan || 0));
    set('arrears-aging-0-30', formatRp(t.aging0_30 || 0));
    set('arrears-aging-31-60', formatRp(t.aging31_60 || 0));
    set('arrears-aging-over-60', formatRp(t.agingOver60 || 0));
}

function renderArrearsTable(rows) {
    const table = document.getElementById('arrears-table');
    if (!table) return;
    if (!rows.length) {
        table.innerHTML = '<tr><td colspan="6" class="p-10 text-center text-slate-400">Belum ada data tagihan pada periode ini.</td></tr>';
        return;
    }
    table.innerHTML = rows.map((r) => `
        <tr class="hover:bg-slate-50/80">
            <td class="px-6 py-4">
                <div class="font-semibold text-slate-700">${r.nama_cabang || '-'}</div>
                <div class="text-xs text-slate-400">${r.kode_cabang || '-'}</div>
            </td>
            <td class="px-6 py-4 text-right font-semibold text-amber-600">${formatRp(r.aging_0_30 || 0)}</td>
            <td class="px-6 py-4 text-right font-semibold text-orange-600">${formatRp(r.aging_31_60 || 0)}</td>
            <td class="px-6 py-4 text-right font-semibold text-red-600">${formatRp(r.aging_over_60 || 0)}</td>
            <td class="px-6 py-4 text-right font-bold text-rose-700">${formatRp(r.total_tunggakan || 0)}</td>
            <td class="px-6 py-4 font-semibold text-slate-700">${Number(r.total_invoice_nunggak || 0).toLocaleString('id-ID')}</td>
        </tr>
    `).join('');
}

function renderArrearsChart(rows) {
    const canvas = document.getElementById('arrearsAgingChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (arrearsAgingChart) arrearsAgingChart.destroy();
    const labels = rows.map((r, idx) => r.nama_cabang || `Cabang ${idx + 1}`);
    arrearsAgingChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label: '0-30 hari', data: rows.map((r) => Number(r.aging_0_30 || 0)), backgroundColor: 'rgba(245, 158, 11, 0.5)', borderColor: 'rgba(217, 119, 6, 1)', borderWidth: 1 },
                { label: '31-60 hari', data: rows.map((r) => Number(r.aging_31_60 || 0)), backgroundColor: 'rgba(249, 115, 22, 0.5)', borderColor: 'rgba(234, 88, 12, 1)', borderWidth: 1 },
                { label: '>60 hari', data: rows.map((r) => Number(r.aging_over_60 || 0)), backgroundColor: 'rgba(239, 68, 68, 0.5)', borderColor: 'rgba(220, 38, 38, 1)', borderWidth: 1 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'top' } },
            scales: {
                y: { beginAtZero: true, ticks: { callback: (v) => `Rp ${Number(v).toLocaleString('id-ID')}` } }
            }
        }
    });
}
