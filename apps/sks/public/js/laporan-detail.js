let reportDetailRows = [];
let reportDetailSummary = null;
let reportDetailTab = 'kelas';
let reportClassDetailSnapshot = null;

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderRincianTagihanList(raw, mode = 'web') {
    const text = String(raw || '').trim();
    if (!text || text === '-') return '-';
    const items = text.split(';').map((s) => s.trim()).filter(Boolean);
    if (!items.length) return '-';
    if (mode === 'print') {
        return `<ul class="rincian-list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
    }
    return `<ul class="list-disc pl-4 space-y-1">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function initLaporanDetail() {
    const searchEl = document.getElementById('report-detail-search');
    const statusEl = document.getElementById('report-detail-status');
    const branchEl = document.getElementById('report-detail-branch');
    const isSuper = (appData.role || 'admin') === 'super_admin';

    if (isSuper && branchEl) {
        branchEl.classList.remove('hidden');
    }

    searchEl?.addEventListener('input', renderReportDetailKelasTable);
    statusEl?.addEventListener('change', renderReportDetailKelasTable);
    branchEl?.addEventListener('change', renderReportDetailKelasTable);

    switchReportDetailTab('kelas');
    loadReportDetailData();
}

function switchReportDetailTab(tab) {
    reportDetailTab = tab === 'rincian' ? 'rincian' : 'kelas';
    const paneKelas = document.getElementById('report-pane-kelas');
    const paneRincian = document.getElementById('report-pane-rincian');
    const btnKelas = document.getElementById('report-tab-kelas');
    const btnRincian = document.getElementById('report-tab-rincian');
    if (paneKelas) paneKelas.classList.toggle('hidden', reportDetailTab !== 'kelas');
    if (paneRincian) paneRincian.classList.toggle('hidden', reportDetailTab !== 'rincian');
    if (btnKelas) {
        btnKelas.className = reportDetailTab === 'kelas'
            ? 'rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white'
            : 'rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600';
    }
    if (btnRincian) {
        btnRincian.className = reportDetailTab === 'rincian'
            ? 'rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white'
            : 'rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600';
    }
}

async function loadReportDetailData() {
    const res = await apiCall('/api/report/detail');
    if (!res || res.success === false) {
        uiError(res?.message || 'Gagal memuat detail laporan.');
        return;
    }
    reportDetailRows = Array.isArray(res.classRows) ? res.classRows : [];
    reportDetailSummary = res.summary || null;
    renderReportDetailBranchFilter();
    renderReportDetailKelasTable();
    renderReportDetailRincian();
}

function renderReportDetailBranchFilter() {
    const branchEl = document.getElementById('report-detail-branch');
    const thBranch = document.getElementById('report-detail-th-branch');
    if (!branchEl || !thBranch) return;
    const isSuper = (appData.role || 'admin') === 'super_admin';
    thBranch.classList.toggle('hidden', !isSuper);
    if (!isSuper) return;

    const options = [...new Set(reportDetailRows.map((r) => r.nama_cabang).filter(Boolean))];
    branchEl.innerHTML = `<option value="">Semua Cabang</option>${options.map((name) => `<option value="${name}">${name}</option>`).join('')}`;
}

function getFilteredReportRows() {
    const q = String(document.getElementById('report-detail-search')?.value || '').trim().toLowerCase();
    const status = document.getElementById('report-detail-status')?.value || 'all';
    const branch = document.getElementById('report-detail-branch')?.value || '';
    const isSuper = (appData.role || 'admin') === 'super_admin';
    const isWali = (appData.role || 'admin') === 'wali_kelas';
    const waliClass = String(appData?.admin?.homeroom_class || appData?.admin?.homeroomClass || '').trim();

    return reportDetailRows.filter((row) => {
        const kelas = String(row.kelas || '').toLowerCase();
        const cabang = String(row.nama_cabang || '').toLowerCase();
        const sisa = Number(row.total_sisa || 0);
        const byQuery = !q || kelas.includes(q) || cabang.includes(q);
        const byStatus = status === 'all' || (status === 'lunas' ? sisa <= 0 : sisa > 0);
        const byBranch = !isSuper || !branch || row.nama_cabang === branch;
        const byWaliClass = !isWali || !waliClass || String(row.kelas || '') === waliClass;
        return byQuery && byStatus && byBranch && byWaliClass;
    });
}

function renderReportDetailKelasTable() {
    const tbody = document.getElementById('report-detail-kelas-body');
    const isSuper = (appData.role || 'admin') === 'super_admin';
    if (!tbody) return;
    const rows = getFilteredReportRows();
    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="${isSuper ? 11 : 10}" class="p-8 text-center text-slate-400">Tidak ada data.</td></tr>`;
        return;
    }

    tbody.innerHTML = rows.map((row) => {
        const sisa = Number(row.total_sisa || 0);
        const jumlahSiswa = Number(row.jumlah_siswa || 0);
        const siswaBeasiswa = Number(row.siswa_beasiswa || 0);
        const siswaLunas = Number(row.siswa_lunas || 0);
        const siswaBelumLunas = Number(row.siswa_belum_lunas || 0);
        const lunasPercent = Number(row.persen_lunas || 0);
        return `
            <tr class="hover:bg-slate-50">
                <td class="px-5 py-4 font-semibold text-slate-700">${row.kelas || '-'}</td>
                ${isSuper ? `<td class="px-5 py-4 text-slate-600">${row.nama_cabang || '-'}</td>` : ''}
                <td class="px-5 py-4 text-right font-semibold text-slate-700">${jumlahSiswa.toLocaleString('id-ID')}</td>
                <td class="px-5 py-4 text-right font-semibold text-indigo-700">${siswaBeasiswa.toLocaleString('id-ID')}</td>
                <td class="px-5 py-4 text-right font-semibold text-emerald-700">${siswaLunas.toLocaleString('id-ID')}</td>
                <td class="px-5 py-4 text-right font-semibold text-rose-700">${siswaBelumLunas.toLocaleString('id-ID')}</td>
                <td class="px-5 py-4 text-right font-semibold text-slate-700">${formatRp(row.total_tagihan || 0)}</td>
                <td class="px-5 py-4 text-right font-semibold text-emerald-700">${formatRp(row.total_terbayar || 0)}</td>
                <td class="px-5 py-4 text-right font-semibold ${sisa <= 0 ? 'text-emerald-700' : 'text-rose-700'}">${formatRp(sisa)}</td>
                <td class="px-5 py-4 text-center">
                    <span class="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${lunasPercent >= 80 ? 'bg-emerald-50 text-emerald-700' : lunasPercent >= 50 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'}">${lunasPercent.toFixed(1)}%</span>
                </td>
                <td class="px-5 py-4 text-center">
                    <button onclick="openReportClassDetailModal('${String(row.kelas || '').replace(/'/g, "\\'")}', ${Number(row.branch_id || 0)}, '${String(row.nama_cabang || '').replace(/'/g, "\\'")}')" class="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700">Detail</button>
                </td>
            </tr>
        `;
    }).join('');
}

function renderReportDetailRincian() {
    const s = reportDetailSummary || {};
    const setText = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };
    setText('report-rinci-siswa-aktif', Number(s.totalSiswaAktif || 0).toLocaleString('id-ID'));
    setText('report-rinci-penerima', Number(s.totalPenerimaBeasiswa || 0).toLocaleString('id-ID'));
    setText('report-rinci-siswa-lunas', Number(s.totalSiswaLunas || 0).toLocaleString('id-ID'));
    setText('report-rinci-siswa-belum-lunas', Number(s.totalSiswaBelumLunas || 0).toLocaleString('id-ID'));
    setText('report-rinci-beasiswa-all', formatRp(s.totalNominalBeasiswa || 0));
    setText('report-rinci-pemasukan', formatRp(s.totalPemasukan || 0));
    setText('report-rinci-tagihan', formatRp(s.totalTagihan || 0));

    const tbody = document.getElementById('report-rinci-beasiswa-body');
    const list = Array.isArray(s.beasiswaDetail) ? s.beasiswaDetail : [];
    if (!tbody) return;
    if (!list.length) {
        tbody.innerHTML = '<tr><td colspan="3" class="p-8 text-center text-slate-400">Belum ada data beasiswa.</td></tr>';
        return;
    }
    tbody.innerHTML = list.map((item) => `
        <tr class="hover:bg-slate-50">
            <td class="px-5 py-4 font-semibold text-slate-700">${item.nama_beasiswa || '-'}</td>
            <td class="px-5 py-4 text-right text-slate-700">${Number(item.jumlah_penerima || 0).toLocaleString('id-ID')}</td>
            <td class="px-5 py-4 text-right font-semibold text-fuchsia-700">${formatRp(item.nominal_tersalur || 0)}</td>
        </tr>
    `).join('');
}

function sanitizeSheetName(name) {
    const base = String(name || 'Kelas')
        .replace(/[:\\/?*\[\]]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return (base || 'Kelas').slice(0, 31);
}

async function fetchClassDetailRows(kelas, branchId) {
    const branchPart = Number(branchId || 0) > 0 ? `&branch_id=${encodeURIComponent(String(branchId))}` : '';
    const res = await apiCall(`/api/report/detail/class-students?kelas=${encodeURIComponent(kelas || '')}${branchPart}`);
    if (!res || res.success === false) return [];
    return Array.isArray(res.rows) ? res.rows : [];
}

async function exportReportDetailExcel() {
    const rows = getFilteredReportRows();
    if (!rows.length) {
        uiWarn('Tidak ada data untuk diexport.');
        return;
    }

    const wb = XLSX.utils.book_new();
    const summaryRows = rows.map((row) => ({
        kelas: row.kelas || '-',
        cabang: row.nama_cabang || '-',
        jumlah_siswa: Number(row.jumlah_siswa || 0),
        siswa_beasiswa: Number(row.siswa_beasiswa || 0),
        siswa_lunas: Number(row.siswa_lunas || 0),
        siswa_belum_lunas: Number(row.siswa_belum_lunas || 0),
        persen_lunas: `${Number(row.persen_lunas || 0).toFixed(1)}%`,
        total_tagihan: Number(row.total_tagihan || 0),
        total_terbayar: Number(row.total_terbayar || 0),
        sisa: Number(row.total_sisa || 0)
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Ringkasan Kelas');

    const usedSheetNames = new Set(['Ringkasan Kelas']);
    for (const row of rows) {
        const detailRows = await fetchClassDetailRows(row.kelas, row.branch_id);
        const data = detailRows.map((d) => {
            const sisa = Number(d.total_sisa || 0);
            return {
                nama_siswa: d.nama || '-',
                nis: d.nis || '-',
                beasiswa: d.beasiswa || 'Non Beasiswa',
                total_tagihan: Number(d.total_tagihan || 0),
                total_terbayar: Number(d.total_terbayar || 0),
                sisa,
                status: sisa <= 0 ? 'Lunas' : 'Belum Lunas'
            };
        });
        const sheetBase = sanitizeSheetName(`${row.kelas || 'Kelas'}${row.nama_cabang ? ` - ${row.nama_cabang}` : ''}`);
        let sheetName = sheetBase;
        let idx = 1;
        while (usedSheetNames.has(sheetName)) {
            const suffix = ` (${idx++})`;
            sheetName = `${sheetBase.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`;
        }
        usedSheetNames.add(sheetName);
        XLSX.utils.book_append_sheet(
            wb,
            XLSX.utils.json_to_sheet(data.length ? data : [{ info: 'Tidak ada siswa aktif di kelas ini.' }]),
            sheetName
        );
    }

    XLSX.writeFile(wb, `Detail_Laporan_Kelas_${new Date().toISOString().slice(0, 10)}.xlsx`);
    uiSuccess('Export Excel berhasil.');
}

async function exportReportDetailPdf() {
    const rows = getFilteredReportRows();
    if (!rows.length) {
        uiWarn('Tidak ada data untuk diexport.');
        return;
    }
    const isSuper = (appData.role || 'admin') === 'super_admin';

    const summaryRowsHtml = rows.map((row) => `
        <tr>
            <td>${row.kelas || '-'}</td>
            ${isSuper ? `<td>${row.nama_cabang || '-'}</td>` : ''}
            <td class="tr">${Number(row.jumlah_siswa || 0).toLocaleString('id-ID')}</td>
            <td class="tr">${Number(row.siswa_beasiswa || 0).toLocaleString('id-ID')}</td>
            <td class="tr">${Number(row.siswa_lunas || 0).toLocaleString('id-ID')}</td>
            <td class="tr">${Number(row.siswa_belum_lunas || 0).toLocaleString('id-ID')}</td>
            <td class="tr">${formatRp(row.total_tagihan || 0)}</td>
            <td class="tr">${formatRp(row.total_terbayar || 0)}</td>
            <td class="tr">${formatRp(row.total_sisa || 0)}</td>
            <td class="tr">${Number(row.persen_lunas || 0).toFixed(1)}%</td>
        </tr>
    `).join('');

    const detailSections = [];
    for (const row of rows) {
        const detailRows = await fetchClassDetailRows(row.kelas, row.branch_id);
        const tableBody = detailRows.length
            ? detailRows.map((d) => {
                const sisa = Number(d.total_sisa || 0);
                const status = sisa <= 0 ? 'Lunas' : 'Belum Lunas';
                const cls = sisa <= 0 ? 'ok' : 'bad';
                return `
                    <tr>
                        <td>${d.nama || '-'}</td>
                        <td>${d.nis || '-'}</td>
                        <td>${d.beasiswa || 'Non Beasiswa'}</td>
                        <td>${renderRincianTagihanList(d.rincian_tagihan, 'print')}</td>
                        <td class="tr">${formatRp(d.total_tagihan || 0)}</td>
                        <td class="tr">${formatRp(d.total_terbayar || 0)}</td>
                        <td class="tr">${formatRp(sisa)}</td>
                        <td class="tr"><span class="pill ${cls}">${status}</span></td>
                    </tr>
                `;
            }).join('')
            : '<tr><td colspan="8" class="empty">Tidak ada siswa aktif di kelas ini.</td></tr>';

        detailSections.push(`
            <section class="page">
                <div class="header">
                    <h2>Detail Kelas ${row.kelas || '-'}</h2>
                    <p>${isSuper ? `Cabang: ${row.nama_cabang || '-'}` : 'Rincian siswa per kelas'}</p>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>Nama Siswa</th>
                            <th>NIS</th>
                            <th>Beasiswa</th>
                            <th>Rincian Tagihan</th>
                            <th class="tr">Total Tagihan</th>
                            <th class="tr">Terbayar</th>
                            <th class="tr">Sisa</th>
                            <th class="tr">Status</th>
                        </tr>
                    </thead>
                    <tbody>${tableBody}</tbody>
                </table>
            </section>
        `);
    }

    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
        <html>
            <head>
                <title>Detail Laporan Kelas</title>
                <style>
                    *{box-sizing:border-box}
                    body{margin:0;background:#f1f5f9;color:#0f172a;font-family:Segoe UI,Arial,sans-serif}
                    .page{width:210mm;min-height:297mm;margin:0 auto;background:#fff;padding:14mm 12mm;page-break-after:always}
                    .page:last-child{page-break-after:auto}
                    .header{border:1px solid #e2e8f0;background:linear-gradient(135deg,#eef2ff,#f8fafc);padding:12px 14px;border-radius:12px;margin-bottom:12px}
                    .header h1,.header h2{margin:0;font-size:18px}
                    .header p{margin:6px 0 0;color:#64748b;font-size:12px}
                    table{width:100%;border-collapse:collapse}
                    th,td{padding:8px 9px;border-bottom:1px solid #e2e8f0;font-size:11px;vertical-align:top}
                    th{background:#f8fafc;color:#475569;text-transform:uppercase;letter-spacing:.3px;font-size:10px}
                    .tr{text-align:right}
                    .pill{display:inline-block;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700}
                    .pill.ok{background:#dcfce7;color:#166534}
                    .pill.bad{background:#fee2e2;color:#991b1b}
                    .empty{text-align:center;color:#94a3b8;padding:16px}
                    .rincian-list{margin:0;padding-left:14px}
                    .rincian-list li{margin:0 0 2px}
                    @media print{
                        body{background:#fff}
                        .page{margin:0;width:auto;min-height:auto;box-shadow:none}
                    }
                </style>
            </head>
            <body>
                <section class="page">
                    <div class="header">
                        <h1>Ringkasan Data Kelas</h1>
                        <p>Dicetak: ${new Date().toLocaleString('id-ID')}</p>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>Kelas</th>
                                ${isSuper ? '<th>Cabang</th>' : ''}
                                <th class="tr">Jumlah Siswa</th>
                                <th class="tr">Siswa Beasiswa</th>
                                <th class="tr">Siswa Lunas</th>
                                <th class="tr">Siswa Belum Lunas</th>
                                <th class="tr">Total Tagihan</th>
                                <th class="tr">Total Terbayar</th>
                                <th class="tr">Sisa</th>
                                <th class="tr">% Lunas</th>
                            </tr>
                        </thead>
                        <tbody>${summaryRowsHtml}</tbody>
                    </table>
                </section>
                ${detailSections.join('')}
            </body>
        </html>
    `);
    win.document.close();
    win.focus();
    win.print();
}

async function openReportClassDetailModal(kelas, branchId, namaCabang) {
    const modal = document.getElementById('report-class-detail-modal');
    const body = document.getElementById('report-class-detail-body');
    const title = document.getElementById('report-class-detail-title');
    const subtitle = document.getElementById('report-class-detail-subtitle');
    if (!modal || !body) return;
    title.textContent = `Detail Kelas ${kelas || '-'}`;
    subtitle.textContent = namaCabang ? `Cabang: ${namaCabang}` : 'Daftar siswa dan status tagihan';
    body.innerHTML = '<tr><td colspan="8" class="p-8 text-center text-slate-400">Memuat data...</td></tr>';
    modal.classList.remove('hidden');
    reportClassDetailSnapshot = {
        kelas: kelas || '-',
        namaCabang: namaCabang || '',
        rows: []
    };

    const branchPart = branchId > 0 ? `&branch_id=${encodeURIComponent(String(branchId))}` : '';
    const res = await apiCall(`/api/report/detail/class-students?kelas=${encodeURIComponent(kelas || '')}${branchPart}`);
    if (!res || res.success === false) {
        body.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-rose-500">${res?.message || 'Gagal memuat detail kelas.'}</td></tr>`;
        return;
    }
    const rows = Array.isArray(res.rows) ? res.rows : [];
    reportClassDetailSnapshot.rows = rows;
    if (!rows.length) {
        body.innerHTML = '<tr><td colspan="8" class="p-8 text-center text-slate-400">Tidak ada siswa aktif di kelas ini.</td></tr>';
        return;
    }
    body.innerHTML = rows.map((row) => {
        const sisa = Number(row.total_sisa || 0);
        const lunas = sisa <= 0;
        return `
            <tr>
                <td class="px-4 py-3 font-semibold text-slate-700">${row.nama || '-'}</td>
                <td class="px-4 py-3 text-slate-500">${row.nis || '-'}</td>
                <td class="px-4 py-3 text-slate-600">${row.beasiswa || 'Non Beasiswa'}</td>
                <td class="px-4 py-3 text-slate-600">${renderRincianTagihanList(row.rincian_tagihan, 'web')}</td>
                <td class="px-4 py-3 text-right text-slate-700">${formatRp(row.total_tagihan || 0)}</td>
                <td class="px-4 py-3 text-right text-emerald-700">${formatRp(row.total_terbayar || 0)}</td>
                <td class="px-4 py-3 text-right ${lunas ? 'text-emerald-700' : 'text-rose-700'}">${formatRp(sisa)}</td>
                <td class="px-4 py-3 text-center">
                    <span class="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${lunas ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}">${lunas ? 'Lunas' : 'Belum Lunas'}</span>
                </td>
            </tr>
        `;
    }).join('');
}

function closeReportClassDetailModal() {
    document.getElementById('report-class-detail-modal')?.classList.add('hidden');
    reportClassDetailSnapshot = null;
}

function exportReportClassDetailPdf() {
    if (!reportClassDetailSnapshot || !Array.isArray(reportClassDetailSnapshot.rows) || !reportClassDetailSnapshot.rows.length) {
        uiWarn('Belum ada data detail kelas untuk diexport.');
        return;
    }
    const { kelas, namaCabang, rows } = reportClassDetailSnapshot;
    const tableBody = rows.map((row) => {
        const sisa = Number(row.total_sisa || 0);
        const lunas = sisa <= 0;
        return `
            <tr>
                <td>${row.nama || '-'}</td>
                <td>${row.nis || '-'}</td>
                <td>${row.beasiswa || 'Non Beasiswa'}</td>
                <td>${renderRincianTagihanList(row.rincian_tagihan, 'print')}</td>
                <td class="tr">${formatRp(row.total_tagihan || 0)}</td>
                <td class="tr">${formatRp(row.total_terbayar || 0)}</td>
                <td class="tr">${formatRp(sisa)}</td>
                <td class="tr"><span class="pill ${lunas ? 'ok' : 'bad'}">${lunas ? 'Lunas' : 'Belum Lunas'}</span></td>
            </tr>
        `;
    }).join('');

    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
        <html>
        <head>
            <title>Detail Kelas ${kelas}</title>
            <style>
                body{font-family:Segoe UI,Arial,sans-serif;color:#0f172a;padding:20px}
                h2{margin:0 0 4px}
                .sub{margin:0 0 14px;color:#64748b;font-size:12px}
                table{width:100%;border-collapse:collapse;font-size:11px}
                th,td{border:1px solid #e2e8f0;padding:8px;vertical-align:top}
                th{background:#f8fafc;text-transform:uppercase;font-size:10px;color:#475569}
                .tr{text-align:right}
                .pill{display:inline-block;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700}
                .pill.ok{background:#dcfce7;color:#166534}
                .pill.bad{background:#fee2e2;color:#991b1b}
                .rincian-list{margin:0;padding-left:14px}
                .rincian-list li{margin:0 0 2px}
            </style>
        </head>
        <body>
            <h2>Detail Kelas ${kelas || '-'}</h2>
            <p class="sub">${namaCabang ? `Cabang: ${namaCabang}` : ''} | Dicetak: ${new Date().toLocaleString('id-ID')}</p>
            <table>
                <thead>
                    <tr>
                        <th>Nama Siswa</th>
                        <th>NIS</th>
                        <th>Beasiswa</th>
                        <th>Rincian Tagihan</th>
                        <th class="tr">Total Tagihan</th>
                        <th class="tr">Terbayar</th>
                        <th class="tr">Sisa</th>
                        <th class="tr">Status</th>
                    </tr>
                </thead>
                <tbody>${tableBody}</tbody>
            </table>
        </body>
        </html>
    `);
    win.document.close();
    win.focus();
    win.print();
}
