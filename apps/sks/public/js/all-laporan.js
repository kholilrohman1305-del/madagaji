let allReportChart = null;

async function initAllLaporan() {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const fromEl = document.getElementById('all-report-date-from');
    const toEl = document.getElementById('all-report-date-to');
    if (fromEl) fromEl.value = firstDay.toISOString().slice(0, 10);
    if (toEl) toEl.value = today.toISOString().slice(0, 10);
    if (String(appData?.role || '') === 'super_admin') {
        await setupAllReportBranchFilter();
    }
    await loadAllLaporanData();
}

async function loadAllLaporanData() {
    const from = String(document.getElementById('all-report-date-from')?.value || '').trim();
    const to = String(document.getElementById('all-report-date-to')?.value || '').trim();
    const params = new URLSearchParams();
    if (from) params.set('date_from', from);
    if (to) params.set('date_to', to);
    if (String(appData?.role || '') === 'super_admin') {
        const branchId = String(document.getElementById('all-report-branch-filter')?.value || '').trim();
        if (branchId) params.set('branch_id', branchId);
    }
    const res = await apiCall(`/api/all-laporan/summary?${params.toString()}`);
    if (!res || res.success === false) {
        uiError(res?.message || 'Gagal memuat data all laporan.');
        return;
    }
    const summary = res.summary || {};
    const paymentIncomeEl = document.getElementById('all-report-income-payment');
    const otherIncomeEl = document.getElementById('all-report-income-other');
    const expenseEl = document.getElementById('all-report-expense');
    const balanceEl = document.getElementById('all-report-balance');
    if (paymentIncomeEl) paymentIncomeEl.textContent = formatRp(summary.total_payment_income || 0);
    if (otherIncomeEl) otherIncomeEl.textContent = formatRp(summary.total_other_income || 0);
    if (expenseEl) expenseEl.textContent = formatRp(summary.total_expense || 0);
    if (balanceEl) balanceEl.textContent = formatRp(summary.saldo || 0);
    renderAllReportChart(Array.isArray(res.series) ? res.series : []);
}

function renderAllReportChart(series) {
    const canvas = document.getElementById('all-report-chart');
    if (!canvas || typeof Chart === 'undefined') return;
    const labels = series.map((row) => String(row.date || '').slice(5, 10));
    const incomeData = series.map((row) => Number(row.income || 0));
    const expenseData = series.map((row) => Number(row.expense || 0));
    if (allReportChart) allReportChart.destroy();
    allReportChart = new Chart(canvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'Pemasukan',
                    data: incomeData,
                    borderRadius: 8,
                    backgroundColor: 'rgba(16, 185, 129, 0.7)'
                },
                {
                    label: 'Pengeluaran',
                    data: expenseData,
                    borderRadius: 8,
                    backgroundColor: 'rgba(244, 63, 94, 0.7)'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top' }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: (value) => formatRp(value).replace('Rp ', 'Rp')
                    }
                }
            }
        }
    });
}

function resetAllLaporanFilter() {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const fromEl = document.getElementById('all-report-date-from');
    const toEl = document.getElementById('all-report-date-to');
    if (fromEl) fromEl.value = firstDay.toISOString().slice(0, 10);
    if (toEl) toEl.value = today.toISOString().slice(0, 10);
    if (String(appData?.role || '') === 'super_admin') {
        const branchEl = document.getElementById('all-report-branch-filter');
        if (branchEl) branchEl.value = '';
    }
    loadAllLaporanData();
}

async function setupAllReportBranchFilter() {
    const wrap = document.getElementById('all-report-branch-filter-wrap');
    const select = document.getElementById('all-report-branch-filter');
    if (!wrap || !select) return;
    wrap.classList.remove('hidden');
    const res = await apiCall('/api/branches');
    if (!res || res.success === false) {
        select.innerHTML = '<option value="">Semua Cabang</option>';
        return;
    }
    const branches = Array.isArray(res.branches) ? res.branches : [];
    select.innerHTML = [
        '<option value="">Semua Cabang</option>',
        ...branches.map((b) => `<option value="${Number(b.id || 0)}">${String(b.nama_cabang || '-')}</option>`)
    ].join('');
}
