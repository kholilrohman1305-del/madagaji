let execIncomeChart = null;
let execArrearsChart = null;

function initLaporanEksekutif() {
    if ((appData.role || 'admin') !== 'super_admin') {
        const container = document.getElementById('page-container');
        if (container) {
            container.innerHTML = '<div class="rounded-xl border border-rose-100 bg-rose-50 p-6 text-sm font-semibold text-rose-700">Akses ditolak. Halaman ini hanya untuk super admin.</div>';
        }
        return;
    }
    setupExecFilters();
    loadExecutiveReport();
}

function setupExecFilters() {
    const monthEl = document.getElementById('exec-filter-month');
    const yearEl = document.getElementById('exec-filter-year');
    const btn = document.getElementById('exec-filter-btn');
    if (!monthEl || !yearEl || !btn) return;

    const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    monthEl.innerHTML = monthNames.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('');
    const now = new Date();
    const years = [];
    for (let y = now.getFullYear() - 3; y <= now.getFullYear() + 2; y++) years.push(y);
    yearEl.innerHTML = years.map((y) => `<option value="${y}">${y}</option>`).join('');
    monthEl.value = String(now.getMonth() + 1);
    yearEl.value = String(now.getFullYear());
    btn.onclick = loadExecutiveReport;
}

async function loadExecutiveReport() {
    const month = Number(document.getElementById('exec-filter-month')?.value || new Date().getMonth() + 1);
    const year = Number(document.getElementById('exec-filter-year')?.value || new Date().getFullYear());
    const res = await apiCall(`/api/executive-report?month=${month}&year=${year}`);
    if (!res || res.success === false) {
        alert(res?.message || 'Gagal memuat laporan eksekutif.');
        return;
    }
    renderExecCards(res.kpi || {});
    renderExecIncomeChart(res.topPemasukan || []);
    renderExecArrearsChart(res.topTunggakan || []);
}

function renderExecCards(kpi) {
    const set = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };
    set('exec-total-cabang', Number(kpi.totalCabang || 0).toLocaleString('id-ID'));
    set('exec-total-siswa', Number(kpi.totalSiswaAktif || 0).toLocaleString('id-ID'));
    set('exec-total-pemasukan', formatRp(kpi.totalPemasukan || 0));
    set('exec-total-tagihan', formatRp(kpi.totalTunggakan || 0));
}

function renderExecIncomeChart(rows) {
    const canvas = document.getElementById('execIncomeChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (execIncomeChart) execIncomeChart.destroy();
    execIncomeChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: rows.map((r, idx) => r.nama_cabang || `Cabang ${idx + 1}`),
            datasets: [{
                label: 'Pemasukan',
                data: rows.map((r) => Number(r.total_pemasukan || 0)),
                backgroundColor: 'rgba(16, 185, 129, 0.5)',
                borderColor: 'rgba(5, 150, 105, 1)',
                borderWidth: 1,
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, ticks: { callback: (v) => `Rp ${Number(v).toLocaleString('id-ID')}` } }
            }
        }
    });
}

function renderExecArrearsChart(rows) {
    const canvas = document.getElementById('execArrearsChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (execArrearsChart) execArrearsChart.destroy();
    execArrearsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: rows.map((r, idx) => r.nama_cabang || `Cabang ${idx + 1}`),
            datasets: [{
                label: 'Tagihan',
                data: rows.map((r) => Number(r.total_tunggakan || 0)),
                backgroundColor: 'rgba(244, 63, 94, 0.5)',
                borderColor: 'rgba(225, 29, 72, 1)',
                borderWidth: 1,
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, ticks: { callback: (v) => `Rp ${Number(v).toLocaleString('id-ID')}` } }
            }
        }
    });
}
