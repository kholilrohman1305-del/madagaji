let cashflowChart = null;

function parseFlexibleDate(value) {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    const raw = String(value).trim();
    if (!raw) return null;
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
        const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        return Number.isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateNumeric(value) {
    const d = parseFlexibleDate(value);
    if (!d) return String(value || '-');
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = d.getFullYear();
    return `${dd}/${mm}/${yy}`;
}

function formatMonthYear(value) {
    const d = parseFlexibleDate(value);
    if (!d) return '';
    return d.toLocaleDateString('id-ID', { month: 'short', year: 'numeric' });
}

function getMonthKey(value) {
    const d = parseFlexibleDate(value);
    if (!d) return '';
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${mm}`;
}

async function initArusKas() {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const fromEl = document.getElementById('cashflow-date-from');
    const toEl = document.getElementById('cashflow-date-to');
    if (fromEl) fromEl.value = firstDay.toISOString().slice(0, 10);
    if (toEl) toEl.value = today.toISOString().slice(0, 10);
    if (String(appData?.role || '') === 'super_admin') {
        await setupCashflowBranchFilter();
    }
    await loadArusKasData();
}

async function loadArusKasData() {
    const from = String(document.getElementById('cashflow-date-from')?.value || '').trim();
    const to = String(document.getElementById('cashflow-date-to')?.value || '').trim();
    const params = new URLSearchParams();
    if (from) params.set('date_from', from);
    if (to) params.set('date_to', to);
    if (String(appData?.role || '') === 'super_admin') {
        const branchId = String(document.getElementById('cashflow-branch-filter')?.value || '').trim();
        if (branchId) params.set('branch_id', branchId);
    }

    const res = await apiCall(`/api/all-laporan/summary?${params.toString()}`);
    if (!res || res.success === false) {
        uiError(res?.message || 'Gagal memuat arus kas.');
        return;
    }

    const summary = res.summary || {};
    const series = Array.isArray(res.series) ? res.series : [];
    const rows = [];
    let runningBalance = 0;
    for (const item of series) {
        const income = Number(item.income || 0);
        const expense = Number(item.expense || 0);
        const net = income - expense;
        runningBalance += net;
        rows.push({
            date: String(item.date || ''),
            income,
            expense,
            net,
            balance: runningBalance
        });
    }

    const paymentIncomeEl = document.getElementById('cashflow-payment-income');
    const otherIncomeEl = document.getElementById('cashflow-other-income');
    const incomeEl = document.getElementById('cashflow-total-income');
    const expenseEl = document.getElementById('cashflow-total-expense');
    const balanceEl = document.getElementById('cashflow-total-balance');
    if (paymentIncomeEl) paymentIncomeEl.textContent = formatRp(summary.total_payment_income || 0);
    if (otherIncomeEl) otherIncomeEl.textContent = formatRp(summary.total_other_income || 0);
    if (incomeEl) incomeEl.textContent = formatRp(summary.total_income || 0);
    if (expenseEl) expenseEl.textContent = formatRp(summary.total_expense || 0);
    if (balanceEl) balanceEl.textContent = formatRp(summary.saldo || 0);

    renderArusKasChart(rows);
    renderArusKasTable(rows);
}

function renderArusKasChart(rows) {
    const canvas = document.getElementById('cashflow-chart');
    if (!canvas || typeof Chart === 'undefined') return;
    if (cashflowChart) cashflowChart.destroy();

    const monthlyMap = new Map();
    for (const row of rows) {
        const key = getMonthKey(row.date);
        if (!key) continue;
        if (!monthlyMap.has(key)) {
            monthlyMap.set(key, { key, label: formatMonthYear(row.date), income: 0, expense: 0, net: 0, balance: 0 });
        }
        const item = monthlyMap.get(key);
        item.income += Number(row.income || 0);
        item.expense += Number(row.expense || 0);
        item.net += Number(row.net || 0);
    }
    const monthlyRows = Array.from(monthlyMap.values()).sort((a, b) => a.key.localeCompare(b.key));
    let runningBalance = 0;
    for (const item of monthlyRows) {
        runningBalance += item.net;
        item.balance = runningBalance;
    }

    cashflowChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels: monthlyRows.map((r) => r.label),
            datasets: [
                {
                    label: 'Saldo Kumulatif',
                    data: monthlyRows.map((r) => r.balance),
                    borderColor: 'rgba(79, 70, 229, 1)',
                    backgroundColor: 'rgba(79, 70, 229, 0.15)',
                    tension: 0.25,
                    pointRadius: 3,
                    fill: true
                },
                {
                    label: 'Netto Bulanan',
                    data: monthlyRows.map((r) => r.net),
                    borderColor: 'rgba(14, 165, 233, 1)',
                    backgroundColor: 'rgba(14, 165, 233, 0.08)',
                    tension: 0.25,
                    pointRadius: 2,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { position: 'top' },
                tooltip: {
                    callbacks: {
                        title: (items) => {
                            const idx = Number(items?.[0]?.dataIndex ?? -1);
                            if (idx < 0 || !monthlyRows[idx]) return '';
                            return monthlyRows[idx].label;
                        }
                    }
                }
            },
            scales: {
                y: {
                    ticks: {
                        callback: (value) => formatRp(value).replace('Rp ', 'Rp')
                    }
                },
                x: {
                    ticks: {
                        callback: function(value) { return String(this.getLabelForValue(value) || ''); }
                    }
                }
            }
        }
    });
}

function renderArusKasTable(rows) {
    const tbody = document.getElementById('cashflow-table-body');
    if (!tbody) return;
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="px-4 py-8 text-center text-slate-400">Tidak ada data arus kas pada periode ini.</td></tr>';
        return;
    }

    tbody.innerHTML = rows.map((row) => `
        <tr>
            <td class="px-4 py-3 text-slate-700">${formatDateNumeric(row.date)}</td>
            <td class="px-4 py-3 text-right font-semibold text-emerald-700">${formatRp(row.income)}</td>
            <td class="px-4 py-3 text-right font-semibold text-rose-700">${formatRp(row.expense)}</td>
            <td class="px-4 py-3 text-right font-semibold ${row.net >= 0 ? 'text-emerald-700' : 'text-rose-700'}">${formatRp(row.net)}</td>
            <td class="px-4 py-3 text-right font-bold text-indigo-700">${formatRp(row.balance)}</td>
        </tr>
    `).join('');
}

function resetArusKasFilter() {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const fromEl = document.getElementById('cashflow-date-from');
    const toEl = document.getElementById('cashflow-date-to');
    if (fromEl) fromEl.value = firstDay.toISOString().slice(0, 10);
    if (toEl) toEl.value = today.toISOString().slice(0, 10);
    if (String(appData?.role || '') === 'super_admin') {
        const branchEl = document.getElementById('cashflow-branch-filter');
        if (branchEl) branchEl.value = '';
    }
    loadArusKasData();
}

async function setupCashflowBranchFilter() {
    const select = document.getElementById('cashflow-branch-filter');
    if (!select) return;
    select.classList.remove('hidden');
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
