let branchSummaryChart = null;

function initRingkasanCabang() {
    if ((appData.role || 'admin') !== 'super_admin') {
        const container = document.getElementById('page-container');
        if (container) {
            container.innerHTML = '<div class="rounded-xl border border-rose-100 bg-rose-50 p-6 text-sm font-semibold text-rose-700">Akses ditolak. Halaman ini hanya untuk super admin.</div>';
        }
        return;
    }

    setupBranchSummaryFilters();
    loadBranchSummary();
}

function setupBranchSummaryFilters() {
    const fromEl = document.getElementById('branch-summary-date-from');
    const toEl = document.getElementById('branch-summary-date-to');
    const btn = document.getElementById('branch-summary-filter-btn');
    if (!fromEl || !toEl || !btn) return;
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    fromEl.value = first.toISOString().slice(0, 10);
    toEl.value = now.toISOString().slice(0, 10);

    btn.onclick = () => loadBranchSummary();
}

async function loadBranchSummary() {
    const from = String(document.getElementById('branch-summary-date-from')?.value || '').trim();
    const to = String(document.getElementById('branch-summary-date-to')?.value || '').trim();
    const tbody = document.getElementById('branch-summary-table');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-slate-400">Memuat data...</td></tr>';
    const q = new URLSearchParams();
    if (from) q.set('date_from', from);
    if (to) q.set('date_to', to);
    const res = await apiCall(`/api/branch-summary?${q.toString()}`);
    if (!res || res.success === false) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-rose-500">${res?.message || 'Gagal memuat data.'}</td></tr>`;
        return;
    }

    const rows = res.rows || [];
    renderBranchSummaryCards(res.totals || {});
    renderBranchSummaryTable(rows);
    renderBranchSummaryChart(rows);
    renderBranchSummaryPeriod(res.period || { date_from: from, date_to: to });
}

function renderBranchSummaryCards(totals) {
    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };
    setText('branch-summary-total-cabang', Number(totals.totalCabang || 0).toLocaleString('id-ID'));
    setText('branch-summary-total-siswa', Number(totals.totalSiswaAktif || 0).toLocaleString('id-ID'));
    setText('branch-summary-total-pemasukan', formatRp(totals.totalPemasukan || 0));
    setText('branch-summary-total-tagihan', formatRp(totals.totalTunggakan || 0));
}

function renderBranchSummaryPeriod(period) {
    const el = document.getElementById('branch-summary-period-label');
    if (!el) return;
    const from = String(period?.date_from || '').slice(0, 10);
    const to = String(period?.date_to || '').slice(0, 10);
    if (from && to) {
        el.textContent = `${from} s/d ${to}`;
        return;
    }
    el.textContent = '-';
}

function renderBranchSummaryTable(rows) {
    const tbody = document.getElementById('branch-summary-table');
    if (!tbody) return;
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-slate-400">Belum ada data cabang pada periode ini.</td></tr>';
        return;
    }

    tbody.innerHTML = rows.map((row) => `
        <tr class="hover:bg-slate-50/80">
            <td class="px-6 py-4">
                <div class="font-semibold text-slate-700">${row.nama_cabang || '-'}</div>
                <div class="text-xs text-slate-400">${row.kode_cabang || '-'}</div>
            </td>
            <td class="px-6 py-4 font-semibold text-slate-700">${Number(row.total_siswa_aktif || 0).toLocaleString('id-ID')}</td>
            <td class="px-6 py-4 font-semibold text-slate-700">${Number(row.total_transaksi || 0).toLocaleString('id-ID')}</td>
            <td class="px-6 py-4 text-right font-semibold text-emerald-600">${formatRp(row.total_pemasukan || 0)}</td>
            <td class="px-6 py-4 text-right font-semibold text-rose-600">${formatRp(row.total_tunggakan || 0)}</td>
            <td class="px-6 py-4 text-center">
                <span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${Number(row.is_active) === 1 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}">
                    ${Number(row.is_active) === 1 ? 'Aktif' : 'Nonaktif'}
                </span>
            </td>
        </tr>
    `).join('');
}

function renderBranchSummaryChart(rows) {
    const canvas = document.getElementById('branchSummaryChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (branchSummaryChart) branchSummaryChart.destroy();

    const labels = rows.map((r, idx) => r.nama_cabang || `Cabang ${idx + 1}`);
    const pemasukan = rows.map((r) => Number(r.total_pemasukan || 0));
    const tagihan = rows.map((r) => Number(r.total_tunggakan || 0));

    branchSummaryChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'Pemasukan',
                    data: pemasukan,
                    backgroundColor: 'rgba(16, 185, 129, 0.5)',
                    borderColor: 'rgba(5, 150, 105, 1)',
                    borderWidth: 1,
                    borderRadius: 8
                },
                {
                    label: 'Tagihan',
                    data: tagihan,
                    backgroundColor: 'rgba(244, 63, 94, 0.45)',
                    borderColor: 'rgba(225, 29, 72, 1)',
                    borderWidth: 1,
                    borderRadius: 8
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'top' } },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: (value) => `Rp ${Number(value).toLocaleString('id-ID')}`
                    }
                }
            }
        }
    });
}
