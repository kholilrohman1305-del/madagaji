// js/dashboard.js

async function initDashboard() {
    // 1. Tampilkan Tanggal & Salam
    setupWelcomeMessage();

    // 2. Load Data (appData sudah diisi oleh loadPage/InitialData)
    // Jika appData kosong/belum siap, ambil dari API lagi
    if (!appData.payments) {
        const newData = await (typeof window.refreshAppData === 'function'
            ? window.refreshAppData(false)
            : apiCall('/api/initial-data'));
        if (newData) Object.assign(appData, newData); // Merge data
    }

    renderDashboardStats();
    renderIncomeChart();
    renderRecentHistory();
    renderTopArrears();
    applyDashboardRoleView();
}

// Fitur: Salam & Tanggal
function setupWelcomeMessage() {
    const dateEl = document.getElementById('current-date-display');
    const welcomeEl = document.getElementById('welcome-text');
    
    // Format Tanggal: Sabtu, 17 Januari 2026
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    dateEl.innerText = now.toLocaleDateString('id-ID', options);

    // Salam
    const hour = now.getHours();
    let salam = 'Selamat Pagi';
    if (hour >= 11) salam = 'Selamat Siang';
    if (hour >= 15) salam = 'Selamat Sore';
    if (hour >= 18) salam = 'Selamat Malam';
    const tahun = appData.activeSchoolYear?.name;
    const semester = appData.activeSemester?.name;
    const periode = tahun ? ` Periode aktif: ${tahun}${semester ? ` (${semester})` : ''}.` : '';
    welcomeEl.innerText = `${salam}, Kelola keuangan sekolah dengan lebih mudah.${periode}`;
}

function renderDashboardStats() {
    const isSuperAdmin = (appData.role || 'admin') === 'super_admin';
    const month = Number(appData.dashboardTotals?.currentMonth || (new Date().getMonth() + 1));
    const year = Number(appData.dashboardTotals?.currentYear || new Date().getFullYear());
    const monthLabel = new Date(year, month - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    // A. Total Siswa
    const totals = appData.dashboardTotals || {};
    const totalStudents = Number(totals.totalSiswa ?? 0);
    const activeStudents = Number(totals.totalSiswaAktif ?? 0);
    const totalSiswaLabel = document.getElementById('dash-total-siswa-label');
    if (totalSiswaLabel) {
        totalSiswaLabel.innerText = isSuperAdmin ? 'Total Siswa Aktif (Semua Cabang)' : 'Total Siswa';
    }
    document.getElementById('dash-total-siswa').innerText = isSuperAdmin ? activeStudents : totalStudents;
    document.getElementById('dash-siswa-aktif').innerText = activeStudents;

    // B. Keuangan
    const totalPemasukanDaftarUlang = Number(appData.dashboardTotals?.monthPemasukan || 0);
    const totalPemasukanLain = Number(appData.dashboardTotals?.monthPemasukanLain || 0);
    const totalPengeluaran = Number(appData.dashboardTotals?.monthPengeluaran || 0);
    document.getElementById('dash-total-uang-daftar-ulang').innerText = formatRp(totalPemasukanDaftarUlang);
    document.getElementById('dash-total-uang-lain').innerText = formatRp(totalPemasukanLain);
    document.getElementById('dash-total-pengeluaran').innerText = formatRp(totalPengeluaran);

    // C. Tagihan & Persentase
    let totalTagihan = Number(appData.dashboardTotals?.monthPotensiTunggakan || 0);
    let totalSiswaTagihan = 0;
    const classes = appData.classes || [];
    
    // Kita harus hitung dari data classes yang dikirim server (sudah ada field tagihan/lunas)
    // Tapi server hanya kirim jumlah siswa tagihan, bukan nominal.
    // Untuk Nominal Tagihan Global, idealnya server kirim. 
    // TAPI, kita bisa estimasi atau minta server update.
    // SEMENTARA: Kita ambil dari "Bills" kalau ada, atau tampilkan jumlah siswa tagihan dulu.
    
    // Agar presisi, mari kita hitung jumlah siswa yang tagihan dari data classes
    classes.forEach(c => totalSiswaTagihan += c.nunggak);
    
    document.getElementById('dash-total-tagihan').innerText = formatRp(totalTagihan);
    const tagihanBadge = document.getElementById('dash-total-tagihan-badge');
    if (tagihanBadge) {
        const invoiceTagihan = Number(appData.dashboardTotals?.monthInvoiceNunggak || 0);
        tagihanBadge.innerText = `${monthLabel} · ${invoiceTagihan} invoice`;
    }
    const chartPeriod = document.getElementById('dash-chart-period');
    if (chartPeriod) chartPeriod.textContent = `Grafik ${monthLabel}`;
}

function applyDashboardRoleView() {
    const isSuperAdmin = (appData.role || 'admin') === 'super_admin';
    const scopeChip = document.getElementById('dash-scope-chip');
    if (scopeChip) scopeChip.classList.toggle('hidden', !isSuperAdmin);

    const quickPembayaran = document.getElementById('dash-quick-pembayaran');
    const quickTagihan = document.getElementById('dash-quick-tagihan');
    const recentSeeAll = document.getElementById('dash-recent-see-all');
    if (quickPembayaran) quickPembayaran.classList.toggle('hidden', isSuperAdmin);
    if (quickTagihan) quickTagihan.classList.toggle('hidden', isSuperAdmin);
    if (recentSeeAll) recentSeeAll.classList.toggle('hidden', isSuperAdmin);
}

function renderBranchSummary() {
    const isSuperAdmin = (appData.role || 'admin') === 'super_admin';
    const card = document.getElementById('dash-branch-summary-card');
    const tbody = document.getElementById('dash-branch-summary-table');
    if (!card || !tbody) return;

    if (!isSuperAdmin) {
        card.classList.add('hidden');
        return;
    }

    const rows = Array.isArray(appData.branchSummary) ? appData.branchSummary : [];
    card.classList.remove('hidden');

    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-6 text-center text-gray-400">Belum ada data cabang.</td></tr>';
        return;
    }

    tbody.innerHTML = rows.map((b) => `
        <tr class="hover:bg-gray-50 transition">
            <td class="px-6 py-4">
                <div class="font-semibold text-gray-700">${b.nama_cabang || '-'}</div>
                <div class="text-xs text-gray-400">${b.kode_cabang || '-'}</div>
            </td>
            <td class="px-6 py-4 font-semibold text-gray-700">${Number(b.total_siswa_aktif || 0).toLocaleString('id-ID')}</td>
            <td class="px-6 py-4 text-right font-semibold text-emerald-600">${formatRp(b.total_pemasukan || 0)}</td>
            <td class="px-6 py-4 text-right font-semibold text-rose-600">${formatRp(b.total_tagihan || 0)}</td>
            <td class="px-6 py-4 text-center">
                <span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${Number(b.is_active) === 1 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}">
                    ${Number(b.is_active) === 1 ? 'Aktif' : 'Nonaktif'}
                </span>
            </td>
        </tr>
    `).join('');
}

// Fitur: Grafik Batang (Chart.js)
let myChart = null;
function renderIncomeChart() {
    const ctx = document.getElementById('incomeChart').getContext('2d');
    const chartData = appData.chartData || {}; // { "10 IPA": 500000, ... }
    
    const labels = Object.keys(chartData);
    const dataValues = Object.values(chartData);

    // Hancurkan chart lama jika ada (saat refresh)
    if (myChart) myChart.destroy();

    // Gradient Warna Biru
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(37, 99, 235, 0.5)'); // Blue 600
    gradient.addColorStop(1, 'rgba(37, 99, 235, 0.0)');

    myChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Pemasukan (Rp)',
                data: dataValues,
                backgroundColor: gradient,
                borderColor: '#2563EB',
                borderWidth: 2,
                borderRadius: 5,
                barPercentage: 0.6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: '#f3f4f6' },
                    ticks: { callback: function(value) { return 'Rp ' + (value/1000) + 'k'; } }
                },
                x: {
                    grid: { display: false }
                }
            }
        }
    });
}

function renderRecentHistory() {
    const tbody = document.getElementById('dash-history-table');
    const maxRows = 5;
    const list = (appData.payments || []).slice(0, maxRows);

    if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="p-6 text-center text-gray-400">Belum ada transaksi.</td></tr>';
        return;
    }

    tbody.innerHTML = list.map(p => `
        <tr class="hover:bg-gray-50 transition">
            <td class="px-6 py-4 text-gray-500 font-mono text-xs">
                ${p.tanggal ? p.tanggal.split('T')[0] : '-'}
            </td>
            <td class="px-6 py-4 font-bold text-gray-700">${p.nama}</td>
            <td class="px-6 py-4 text-xs">
                <span class="bg-gray-100 text-gray-600 px-2 py-1 rounded border">${p.kelas}</span>
            </td>
            <td class="px-6 py-4 text-right font-bold text-emerald-600">+${formatRp(p.jumlah_bayar)}</td>
            <td class="px-6 py-4 text-center text-xs text-gray-500">${p.penerima || 'Sistem'}</td>
        </tr>
    `).join('');
}

function renderTopArrears() {
    // Mencari kelas dengan tagihan (siswa tagihan) terbanyak
    const role = String(appData.role || '').toLowerCase();
    const classes = (appData.classes || []).filter((c) => {
        if (role === 'admin' || role === 'wali_kelas') return Number(c?.jumlahSiswa || 0) > 0;
        return true;
    });
    // Sort descending by 'nunggak'
    const sorted = [...classes].sort((a, b) => b.nunggak - a.nunggak).slice(0, 4);
    
    const container = document.getElementById('top-arrears-list');
    
    if (sorted.length === 0) {
        container.innerHTML = '<p class="text-sm text-gray-400">Tidak ada data kelas.</p>';
        return;
    }

    container.innerHTML = sorted.map(c => {
        // Hitung persentase tagihan visual
        const total = c.jumlahSiswa || 1;
        const persenTagihan = Math.round((c.nunggak / total) * 100);
        
        return `
        <div>
            <div class="flex justify-between text-sm mb-1">
                <span class="font-bold text-gray-700">${c.nama_kelas}</span>
                <span class="text-rose-500 font-bold">${c.nunggak} Siswa Tagihan</span>
            </div>
            <div class="w-full bg-gray-100 rounded-full h-2">
                <div class="bg-rose-500 h-2 rounded-full" style="width: ${persenTagihan}%"></div>
            </div>
        </div>
        `;
    }).join('');
}
