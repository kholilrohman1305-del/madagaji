let laporanChart = null;
let laporanState = { labels: [], pemasukan: [], tagihan: [], range: { start: '', end: '' } };

function monthInputValue(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}

function getDefaultRange() {
    const end = new Date();
    const start = new Date(end.getFullYear(), end.getMonth() - 5, 1);
    return { start: monthInputValue(start), end: monthInputValue(end) };
}

function initLaporan() {
    const defaults = getDefaultRange();
    const startEl = document.getElementById('report-start-month');
    const endEl = document.getElementById('report-end-month');
    if (startEl) startEl.value = defaults.start;
    if (endEl) endEl.value = defaults.end;
    loadLaporanData();
}

async function loadLaporanData() {
    const start = document.getElementById('report-start-month')?.value;
    const end = document.getElementById('report-end-month')?.value;
    if (!start || !end) {
        uiWarn('Periode bulan wajib diisi.');
        return;
    }

    const res = await apiCall(`/api/report/monthly?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
    if (!res || res.success === false) {
        uiError(res?.message || 'Gagal memuat data laporan.');
        return;
    }

    laporanState = {
        labels: Array.isArray(res.labels) ? res.labels : [],
        pemasukan: Array.isArray(res.datasets?.pemasukan) ? res.datasets.pemasukan : [],
        tagihan: Array.isArray(res.datasets?.tunggakan) ? res.datasets.tunggakan : [],
        range: res.range || { start, end }
    };
    renderLaporanSummary(res.totals || {});
    renderLaporanChart();
}

function renderLaporanSummary(totals) {
    const totalPemasukan = Number(totals.totalPemasukan || 0);
    const totalTagihan = Number(totals.totalTunggakan || 0);
    const pemasukanEl = document.getElementById('laporan-total-pemasukan');
    const tagihanEl = document.getElementById('laporan-total-tagihan');
    const periodBadge = document.getElementById('laporan-period-badge');
    if (pemasukanEl) pemasukanEl.textContent = formatRp(totalPemasukan);
    if (tagihanEl) tagihanEl.textContent = formatRp(totalTagihan);
    if (periodBadge) {
        const start = laporanState.range?.start || '-';
        const end = laporanState.range?.end || '-';
        periodBadge.textContent = `${start} s/d ${end}`;
    }
}

function renderLaporanChart() {
    const canvas = document.getElementById('laporan-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (laporanChart) laporanChart.destroy();
    laporanChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: laporanState.labels,
            datasets: [
                {
                    label: 'Pemasukan',
                    data: laporanState.pemasukan,
                    backgroundColor: 'rgba(16, 185, 129, 0.28)',
                    borderColor: '#10b981',
                    borderWidth: 1.4,
                    borderRadius: 8
                },
                {
                    label: 'Potensi Tagihan',
                    data: laporanState.tagihan,
                    backgroundColor: 'rgba(244, 63, 94, 0.24)',
                    borderColor: '#f43f5e',
                    borderWidth: 1.4,
                    borderRadius: 8
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
                        callback: (value) => formatRp(value)
                    }
                }
            }
        }
    });
}

function downloadExcel() {
    if (!laporanState.labels.length) {
        uiWarn('Belum ada data untuk diexport.');
        return;
    }
    const rows = laporanState.labels.map((label, index) => ({
        periode: label,
        pemasukan: Number(laporanState.pemasukan[index] || 0),
        potensi_tagihan: Number(laporanState.tagihan[index] || 0)
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Laporan Grafik');
    const filename = `Laporan_Grafik_${laporanState.range.start || 'start'}_${laporanState.range.end || 'end'}.xlsx`;
    XLSX.writeFile(wb, filename);
    uiSuccess('File laporan berhasil didownload.');
}
