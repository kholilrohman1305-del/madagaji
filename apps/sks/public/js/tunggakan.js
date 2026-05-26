// js/tunggakan.js

// 1. STATE MANAGEMENT
let tunggakanState = {
    data: [],
    currentPage: 1,
    rowsPerPage: 10,
    totalItems: 0,
    totalPages: 1
};
let tunggakanViewMode = 'aktif'; // aktif | alumni
let detailTunggakanSnapshot = null;

function renderBeasiswaBadges(beasiswaRaw) {
    const raw = String(beasiswaRaw || '').trim();
    if (!raw || raw.toLowerCase() === 'non beasiswa') {
        return `<span class="inline-flex items-center bg-gray-100 text-gray-500 px-2 py-1 rounded text-xs">Non Beasiswa</span>`;
    }
    const names = [...new Set(raw.split(',').map((x) => x.trim()).filter(Boolean))];
    if (!names.length) {
        return `<span class="inline-flex items-center bg-gray-100 text-gray-500 px-2 py-1 rounded text-xs">Non Beasiswa</span>`;
    }
    return `
        <div class="flex flex-wrap gap-1.5">
            ${names.map((name) => `<span class="inline-flex items-center bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-1 rounded text-xs font-semibold">${name}</span>`).join('')}
        </div>
    `;
}

function populateTunggakanClassFilter() {
    const select = document.getElementById('tunggakan-filter-kelas');
    if (!select) return;
    const previous = select.value || '';
    const classes = [...new Set((appData.classes || []).map((c) => String(c.nama_kelas || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'id'));

    select.innerHTML = '<option value="">Semua Kelas</option>' + classes.map((k) => `<option value="${k}">${k}</option>`).join('');
    if (previous && classes.includes(previous)) {
        select.value = previous;
    }
}

// 2. INITIALIZATION
async function initTunggakan(mode = 'aktif') {
    tunggakanViewMode = mode === 'alumni' ? 'alumni' : 'aktif';
    const titleEl = document.getElementById('tunggakan-title');
    if (titleEl) {
        titleEl.innerHTML = tunggakanViewMode === 'alumni'
            ? '<i class="fas fa-list-ul text-primary-600"></i> Data Tagihan Alumni'
            : '<i class="fas fa-list-ul text-primary-600"></i> Data Tagihan Siswa Aktif';
    }
    const headRow = document.getElementById('tunggakan-head-row');
    if (headRow) {
        if (tunggakanViewMode === 'alumni') {
            headRow.innerHTML = `
                <th class="px-6 py-4">Nama Siswa</th>
                <th class="px-6 py-4">Kelas Terakhir</th>
                <th class="px-6 py-4">Beasiswa</th>
                <th class="px-6 py-4">Tahun Masuk</th>
                <th class="px-6 py-4">Tahun Lulus</th>
                <th class="px-6 py-4 text-right">Total Tagihan</th>
                <th class="px-6 py-4 text-right">Terbayar</th>
                <th class="px-6 py-4 text-right">Sisa Tagihan</th>
                <th class="px-6 py-4 text-center">Status</th>
                <th class="px-6 py-4 text-center">Aksi</th>
            `;
        } else {
            headRow.innerHTML = `
                <th class="px-6 py-4">Nama Siswa</th>
                <th class="px-6 py-4">Kelas</th>
                <th class="px-6 py-4">Beasiswa</th>
                <th class="px-6 py-4 text-right">Total Tagihan</th>
                <th class="px-6 py-4 text-right">Terbayar</th>
                <th class="px-6 py-4 text-right">Sisa Tagihan</th>
                <th class="px-6 py-4 text-center">Status</th>
                <th class="px-6 py-4 text-center">Aksi</th>
            `;
        }
    }
    loadTunggakanData(1);
}

// 3. DATA LOADING
async function loadTunggakanData(page = 1) {
    const tbody = document.getElementById('table-tunggakan');
    const search = String(document.getElementById('tunggakan-search')?.value || '').trim();
    const selectedClass = String(document.getElementById('tunggakan-filter-kelas')?.value || '').trim();
    const status = tunggakanViewMode === 'alumni' ? 'lulus' : 'aktif';
    
    tbody.innerHTML = `
        <tr>
            <td colspan="${tunggakanViewMode === 'alumni' ? 10 : 8}" class="text-center py-12">
                <div class="flex flex-col items-center justify-center text-primary-600">
                    <i class="fas fa-circle-notch fa-spin text-3xl mb-3"></i>
                    <span class="text-sm font-medium">Sedang memuat data tagihan...</span>
                </div>
            </td>
        </tr>
    `;

    try {
        const params = new URLSearchParams();
        params.set('page', String(page));
        params.set('limit', String(tunggakanState.rowsPerPage));
        params.set('status', status);
        if (search) params.set('search', search);
        if (selectedClass) params.set('class', selectedClass);
        const data = await apiCall(`/api/arrears?${params.toString()}`);
        if (!data || data.success === false || !Array.isArray(data.rows)) {
            const msg = (data && (data.message || data.error)) ? (data.message || data.error) : 'Format data tagihan tidak valid.';
            throw new Error(msg);
        }
        tunggakanState.data = data.rows;
        tunggakanState.currentPage = Number(data.pagination?.page || page);
        tunggakanState.totalItems = Number(data.pagination?.total || 0);
        tunggakanState.totalPages = Number(data.pagination?.totalPages || 1);
        populateTunggakanClassFilter();
        updateSummaryCards(data.summary || {});
        renderTunggakanTable(tunggakanState.currentPage);
    } catch (error) {
        console.error("Gagal memuat tagihan:", error);
        const message = error?.message || 'Gagal memuat data.';
        tbody.innerHTML = `<tr><td colspan="${tunggakanViewMode === 'alumni' ? 10 : 8}" class="text-center py-8 text-red-500">${message}</td></tr>`;
    }
}

// 4. SUMMARY CARDS
function updateSummaryCards(summary = {}) {
    const total = Number(summary.total_siswa || 0);
    const lunas = Number(summary.siswa_lunas || 0);
    const tagihan = Number(summary.siswa_tagihan || 0);
    document.getElementById('card-total-siswa').textContent = total.toLocaleString('id-ID');
    document.getElementById('card-lunas').textContent = lunas.toLocaleString('id-ID');
    document.getElementById('card-nunggak').textContent = tagihan.toLocaleString('id-ID');
}

// 5. TABLE RENDERING
function renderTunggakanTable(page = 1) {
    const targetPage = Math.max(1, Number(page || 1));
    if (targetPage !== tunggakanState.currentPage) {
        return loadTunggakanData(targetPage);
    }

    const tbody = document.getElementById('table-tunggakan');
    const paginated = tunggakanState.data || [];
    const totalRows = Number(tunggakanState.totalItems || 0);
    const totalPages = Math.max(1, Number(tunggakanState.totalPages || 1));
    const start = totalRows === 0 ? 0 : ((tunggakanState.currentPage - 1) * tunggakanState.rowsPerPage);
    const end = totalRows === 0 ? 0 : (start + paginated.length);
    
    if (totalRows === 0) {
        tbody.innerHTML = `<tr><td colspan="${tunggakanViewMode === 'alumni' ? 10 : 8}" class="text-center py-10 text-gray-400">Tidak ada data ditemukan</td></tr>`;
    } else {
        tbody.innerHTML = paginated.map(t => {
            const sisaNum = Number(t.sisa) || 0;
            const sisaSafe = Math.max(0, sisaNum);
            const isLunas = sisaNum <= 0;
            const beasiswaCell = renderBeasiswaBadges(t.beasiswa);
            
            const statusBadge = isLunas 
                ? `<span class="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full text-xs font-bold border border-emerald-200"><i class="fas fa-check-circle"></i> Lunas</span>`
                : `<span class="inline-flex items-center gap-1 bg-red-100 text-red-700 px-2.5 py-1 rounded-full text-xs font-bold border border-red-200"><i class="fas fa-clock"></i> Belum Lunas</span>`;

            const safeNama = t.nama.replace(/'/g, "\\'");
            const studentId = Number(t.id || 0);

            if (tunggakanViewMode === 'alumni') {
                return `
                <tr class="hover:bg-gray-50 border-b transition">
                    <td class="px-6 py-4 font-bold text-gray-700">${t.nama}</td>
                    <td class="px-6 py-4"><span class="bg-gray-100 border border-gray-200 text-gray-600 px-2 py-1 rounded text-xs font-mono font-bold">${t.kelas}</span></td>
                    <td class="px-6 py-4 text-sm">${beasiswaCell}</td>
                    <td class="px-6 py-4 text-sm text-gray-600">${t.tahun_masuk || '-'}</td>
                    <td class="px-6 py-4 text-sm text-gray-600">${t.tahun_lulus || '-'}</td>
                    <td class="px-6 py-4 text-right text-gray-500 font-medium">${formatRp(t.totalTagihan || 0)}</td>
                    <td class="px-6 py-4 text-right text-emerald-600 font-medium">${formatRp(t.terbayar || 0)}</td>
                    <td class="px-6 py-4 text-right"><span class="${isLunas ? 'text-gray-400' : 'text-red-600 font-bold'}">${formatRp(sisaSafe)}</span></td>
                    <td class="px-6 py-4 text-center">${statusBadge}</td>
                    <td class="px-6 py-4 text-center">
                        <button onclick="openDetailTunggakan(${studentId}, '${safeNama}', '${t.kelas}')" class="group bg-white border border-primary-200 text-primary-600 hover:bg-primary-600 hover:text-white px-3 py-1.5 rounded-lg text-xs shadow-sm font-medium transition-all flex items-center justify-center gap-2 mx-auto">
                            <i class="fas fa-eye"></i> Detail
                        </button>
                    </td>
                </tr>
            `;
            }
            return `
                <tr class="hover:bg-gray-50 border-b transition">
                    <td class="px-6 py-4 font-bold text-gray-700">${t.nama}</td>
                    <td class="px-6 py-4"><span class="bg-gray-100 border border-gray-200 text-gray-600 px-2 py-1 rounded text-xs font-mono font-bold">${t.kelas}</span></td>
                    <td class="px-6 py-4 text-sm">${beasiswaCell}</td>
                    <td class="px-6 py-4 text-right text-gray-500 font-medium">${formatRp(t.totalTagihan || 0)}</td>
                    <td class="px-6 py-4 text-right text-emerald-600 font-medium">${formatRp(t.terbayar || 0)}</td>
                    <td class="px-6 py-4 text-right"><span class="${isLunas ? 'text-gray-400' : 'text-red-600 font-bold'}">${formatRp(sisaSafe)}</span></td>
                    <td class="px-6 py-4 text-center">${statusBadge}</td>
                    <td class="px-6 py-4 text-center">
                        <button onclick="openDetailTunggakan(${studentId}, '${safeNama}', '${t.kelas}')" class="group bg-white border border-primary-200 text-primary-600 hover:bg-primary-600 hover:text-white px-3 py-1.5 rounded-lg text-xs shadow-sm font-medium transition-all flex items-center justify-center gap-2 mx-auto">
                            <i class="fas fa-eye"></i> Detail
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // Pagination Controls
    const infoEl = document.getElementById('tunggakan-info');
    const controlsEl = document.getElementById('tunggakan-controls');

    if (totalRows > 0) {
        infoEl.innerText = `Menampilkan ${start + 1} - ${Math.min(end, totalRows)} dari ${totalRows} siswa`;
        controlsEl.innerHTML = `
            <button onclick="renderTunggakanTable(${tunggakanState.currentPage - 1})" ${tunggakanState.currentPage === 1 ? 'disabled class="px-3 py-1 text-gray-300"' : 'class="px-3 py-1 bg-white border hover:bg-gray-100 text-gray-600"'}><i class="fas fa-chevron-left"></i></button>
            <span class="px-3 py-1 bg-primary-50 text-primary-700 font-bold border border-primary-100 rounded text-sm">${tunggakanState.currentPage} / ${totalPages}</span>
            <button onclick="renderTunggakanTable(${tunggakanState.currentPage + 1})" ${tunggakanState.currentPage >= totalPages ? 'disabled class="px-3 py-1 text-gray-300"' : 'class="px-3 py-1 bg-white border hover:bg-gray-100 text-gray-600"'}><i class="fas fa-chevron-right"></i></button>
        `;
    } else {
        infoEl.innerText = '';
        controlsEl.innerHTML = '';
    }
}

// 6. MODAL & DETAIL LOGIC (INI YANG DIPERBAIKI)
async function openDetailTunggakan(studentId, nama, kelas) {
    const modal = document.getElementById('modal-detail-tunggakan');
    
    // Set Header
    document.getElementById('detail-nama').textContent = nama;
    document.getElementById('detail-kelas').textContent = kelas;
    
    // Reset Loading State
    document.getElementById('detail-total-sisa').innerHTML = '<i class="fas fa-spinner fa-spin text-gray-400"></i>';
    document.getElementById('detail-list-bills').innerHTML = '<tr><td colspan="5" class="text-center p-4 text-gray-400">Memuat tagihan...</td></tr>';
    document.getElementById('detail-list-history').innerHTML = '<tr><td colspan="3" class="text-center p-4 text-gray-400">Memuat riwayat...</td></tr>';
    document.getElementById('detail-beasiswa').textContent = '...';
    document.getElementById('detail-beasiswa-ket').textContent = '...';

    modal.classList.remove('hidden');

    try {
        const [billsRes, detailRes] = await Promise.all([
            apiCall(`/api/bills/student?student_id=${encodeURIComponent(studentId || 0)}&nama=${encodeURIComponent(nama)}&kelas=${encodeURIComponent(kelas)}&include_all=1`),
            apiCall(`/api/student/details?student_id=${encodeURIComponent(studentId || 0)}&nama=${encodeURIComponent(nama)}&kelas=${encodeURIComponent(kelas)}`)
        ]);

        // --- A. TABEL TAGIHAN & HITUNG TOTAL SISA (PERBAIKAN RpNaN) ---
        const bills = billsRes || [];
        const tbodyBills = document.getElementById('detail-list-bills');
        
        if (bills.length === 0) {
            tbodyBills.innerHTML = `<tr><td colspan="5" class="text-center p-6 bg-emerald-50/50 text-emerald-600 font-bold">Tidak ada data tagihan.</td></tr>`;
            document.getElementById('detail-total-sisa').textContent = "LUNAS";
            document.getElementById('detail-total-sisa').className = "text-3xl font-extrabold mt-2 text-emerald-500";
        } else {
            let totalSisaCalc = 0;
            
            tbodyBills.innerHTML = bills.map(b => {
                // Konversi Paksa ke Number agar tidak error "RpNaN"
                const sisaVal = Math.max(0, Number(b.sisa) || 0);
                totalSisaCalc += sisaVal; 

                return `
                <tr class="hover:bg-gray-50 border-b border-gray-100 last:border-0">
                    <td class="p-3 text-gray-700 font-medium whitespace-nowrap">${b.namaTagihan}</td>
                    <td class="p-3 text-gray-600 text-xs whitespace-nowrap">${b.school_year_name || '-'}</td>
                    <td class="p-3 text-gray-600 text-xs whitespace-nowrap">${b.semester || '-'}</td>
                    <td class="p-3 text-right text-gray-500 text-xs whitespace-nowrap">${formatRp(b.nominal)}</td>
                    <td class="p-3 text-right ${sisaVal <= 0 ? 'text-emerald-600' : 'text-red-600'} font-bold whitespace-nowrap">${sisaVal <= 0 ? 'LUNAS' : formatRp(sisaVal)}</td>
                </tr>`;
            }).join('');
            
            if (totalSisaCalc <= 0) {
                document.getElementById('detail-total-sisa').textContent = "LUNAS";
                document.getElementById('detail-total-sisa').className = "text-3xl font-extrabold mt-2 text-emerald-500";
            } else {
                document.getElementById('detail-total-sisa').textContent = formatRp(totalSisaCalc);
                document.getElementById('detail-total-sisa').className = "text-3xl font-extrabold mt-2 text-red-600";
            }
        }

        // --- B. RIWAYAT PEMBAYARAN ---
        const payments = detailRes.payments || [];
        const tbodyHist = document.getElementById('detail-list-history');
        
        if (payments.length === 0) {
            tbodyHist.innerHTML = '<tr><td colspan="3" class="text-center p-6 text-gray-400 italic">Belum ada riwayat pembayaran.</td></tr>';
        } else {
            tbodyHist.innerHTML = payments.map(p => `
                <tr class="hover:bg-gray-50 border-b border-gray-100 last:border-0">
                    <td class="p-3 text-gray-700 text-xs font-mono">${p.tanggal ? p.tanggal.split('T')[0] : '-'}</td>
                    <td class="p-3 text-gray-500 text-xs">${p.penerima || 'Sistem'}</td>
                    <td class="p-3 text-right text-emerald-600 font-bold">+${formatRp(p.jumlah_bayar)}</td>
                </tr>`).join('');
        }

        // --- C. INFO BEASISWA ---
        const beasiswas = Array.isArray(detailRes.beasiswas)
            ? detailRes.beasiswas
            : (detailRes.beasiswa ? [detailRes.beasiswa] : []);

        const beasiswaEl = document.getElementById('detail-beasiswa');
        const beasiswaKetEl = document.getElementById('detail-beasiswa-ket');

        if (beasiswas.length > 0) {
             const labels = beasiswas.map((item) => {
                 const dt = item?.tanggal_terima ? String(item.tanggal_terima).split('T')[0] : '-';
                 return `${item?.nama_beasiswa || '-'} (${dt})`;
             });
             beasiswaEl.textContent = labels.join(', ');
             beasiswaEl.className = "text-lg font-bold text-purple-600 mt-2";
             beasiswaKetEl.textContent = `Total program: ${beasiswas.length}`;
        } else {
             beasiswaEl.textContent = "Non-Beasiswa";
             beasiswaEl.className = "text-xl font-bold text-gray-400 mt-2";
             beasiswaKetEl.textContent = "Siswa Reguler";
        }

        detailTunggakanSnapshot = {
            nama,
            kelas,
            beasiswas,
            bills,
            payments
        };

    } catch (e) {
        console.error("Error Detail Modal:", e);
        alert("Gagal memuat detail data siswa.");
        closeDetailModal();
    }
}

function closeDetailModal() {
    document.getElementById('modal-detail-tunggakan').classList.add('hidden');
}

function onTunggakanClassFilterChange() {
    loadTunggakanData(1);
}

async function printDetailTunggakan() {
    if (!detailTunggakanSnapshot) return alert('Data detail belum tersedia.');
    const { nama, kelas, beasiswas, bills, payments } = detailTunggakanSnapshot;
    const totalSisa = (bills || []).reduce((acc, b) => acc + Math.max(0, (Number(b.sisa) || 0)), 0);
    const adminName = (typeof window.getCurrentOperatorName === 'function')
        ? await window.getCurrentOperatorName()
        : ((window.appData && window.appData.admin && window.appData.admin.nama_lengkap) ? window.appData.admin.nama_lengkap : 'Admin');
    const today = new Date();
    const cetakDate = today.toLocaleDateString('id-ID');

    const billsRows = (bills || []).map((b) => {
        const sisa = Math.max(0, Number(b.sisa) || 0);
        return `
            <tr>
                <td>${b.namaTagihan || '-'}</td>
                <td>${b.school_year_name || '-'}</td>
                <td>${b.semester || '-'}</td>
                <td class="num">${formatRp(b.nominal || 0)}</td>
                <td class="num ${sisa <= 0 ? 'ok' : 'due'}">${sisa <= 0 ? 'LUNAS' : formatRp(sisa)}</td>
            </tr>
        `;
    }).join('');

    const paymentRows = (payments || []).map((p) => `
        <tr>
            <td>${p.tanggal ? p.tanggal.split('T')[0] : '-'}</td>
            <td>${p.penerima || '-'}</td>
            <td class="num ok">+${formatRp(p.jumlah_bayar || 0)}</td>
        </tr>
    `).join('');

    const html = `
        <html>
        <head>
            <title>Template Detail Pembayaran - ${nama}</title>
            <style>
                body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; margin: 24px; }
                .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; margin-bottom: 14px; }
                .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; }
                .title { font-size: 22px; font-weight: 700; }
                .meta { color: #6b7280; font-size: 12px; }
                .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
                .amount { font-size: 28px; font-weight: 800; color: ${totalSisa <= 0 ? '#059669' : '#dc2626'}; }
                table { width: 100%; border-collapse: collapse; font-size: 12px; }
                th, td { border: 1px solid #e5e7eb; padding: 8px; text-align: left; }
                th { background: #f9fafb; font-weight: 700; text-transform: uppercase; font-size: 11px; color: #374151; }
                .num { text-align: right; }
                .ok { color: #059669; font-weight: 700; }
                .due { color: #dc2626; font-weight: 700; }
                .section-title { font-weight: 700; margin-bottom: 8px; }
                .ttd { margin-top: 40px; display: flex; justify-content: flex-end; }
                .ttd-box { text-align: center; min-width: 220px; }
                .ttd-line { margin-top: 56px; border-top: 1px solid #111827; padding-top: 6px; font-weight: 700; }
            </style>
        </head>
        <body>
            <div class="header">
                <div>
                    <div class="title">Template Detail Pembayaran Siswa</div>
                    <div class="meta">Dicetak: ${cetakDate}</div>
                </div>
                <div class="meta">Sistem Keuangan Sekolah</div>
            </div>

            <div class="grid">
                <div class="card">
                    <div><b>Nama:</b> ${nama}</div>
                    <div><b>Kelas:</b> ${kelas}</div>
                    <div><b>Status Beasiswa:</b> ${Array.isArray(beasiswas) && beasiswas.length > 0 ? beasiswas.map((x) => x.nama_beasiswa).join(', ') : 'Non-Beasiswa'}</div>
                </div>
                <div class="card">
                    <div class="meta">Total Kewajiban Tersisa</div>
                    <div class="amount">${totalSisa <= 0 ? 'LUNAS' : formatRp(totalSisa)}</div>
                </div>
            </div>

            <div class="card">
                <div class="section-title">Rincian Tagihan</div>
                <table>
                    <thead>
                        <tr>
                            <th>Nama Tagihan</th>
                            <th>Tahun Ajaran</th>
                            <th>Semester</th>
                            <th>Nominal</th>
                            <th>Sisa</th>
                        </tr>
                    </thead>
                    <tbody>${billsRows || '<tr><td colspan="5">Tidak ada data.</td></tr>'}</tbody>
                </table>
            </div>

            <div class="card">
                <div class="section-title">Riwayat Pembayaran</div>
                <table>
                    <thead>
                        <tr><th>Tanggal</th><th>Penerima</th><th>Jumlah</th></tr>
                    </thead>
                    <tbody>${paymentRows || '<tr><td colspan="3">Belum ada pembayaran.</td></tr>'}</tbody>
                </table>
            </div>

            <div class="ttd">
                <div class="ttd-box">
                    <div class="meta">Mengetahui,</div>
                    <div class="meta">Admin Keuangan</div>
                    <div class="ttd-line">${adminName}</div>
                </div>
            </div>
        </body>
        </html>
    `;

    const w = window.open('', '_blank', 'width=1100,height=800');
    if (!w) return alert('Popup diblokir browser. Izinkan popup untuk print.');
    w.document.open();
    w.document.write(html);
    w.document.close();
    setTimeout(() => {
        w.focus();
        w.print();
    }, 300);
}

// Backward compatibility: tombol di HTML masih memanggil nama lama.
function printDetailTagihan() {
    return printDetailTunggakan();
}
