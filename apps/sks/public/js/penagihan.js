let currentPenagihanTab = 'tunggakan';

async function initPenagihan() {
    const role = appData.role || 'admin';
    const savedTab = localStorage.getItem('sks_penagihan_tab') || 'tunggakan';
    const disallowPembayaran = role === 'super_admin' || role === 'wali_kelas';
    const allowedTab = disallowPembayaran && savedTab === 'pembayaran' ? 'tunggakan' : savedTab;
    await setPenagihanTab(allowedTab);
}

async function setPenagihanTab(tabName) {
    const role = appData.role || 'admin';
    const disallowPembayaran = role === 'super_admin' || role === 'wali_kelas';
    const tab = disallowPembayaran && tabName === 'pembayaran' ? 'tunggakan' : tabName;
    currentPenagihanTab = ['tunggakan', 'pembayaran', 'detail', 'rekonsiliasi'].includes(tab) ? tab : 'tunggakan';
    localStorage.setItem('sks_penagihan_tab', currentPenagihanTab);
    togglePenagihanTabButtons(role);
    syncPenagihanSidebarState();
    await loadPenagihanTabContent(currentPenagihanTab, role);
}

function togglePenagihanTabButtons(role) {
    const tabs = ['tunggakan', 'pembayaran', 'detail', 'rekonsiliasi'];
    tabs.forEach((name) => {
        const btn = document.getElementById(`penagihan-tab-${name}`);
        if (!btn) return;
        if ((role === 'super_admin' || role === 'wali_kelas') && name === 'pembayaran') {
            btn.classList.add('hidden');
            return;
        }
        btn.classList.remove('hidden');
        const active = name === currentPenagihanTab;
        btn.classList.toggle('bg-blue-600', active);
        btn.classList.toggle('text-white', active);
        btn.classList.toggle('text-gray-600', !active);
        btn.classList.toggle('hover:bg-gray-100', !active);
    });
}

async function loadPenagihanTabContent(tabName, role) {
    const container = document.getElementById('penagihan-content');
    if (!container) return;
    container.innerHTML = '<div class="rounded-xl border border-gray-100 bg-white p-8 text-center text-gray-400">Memuat...</div>';

    if (tabName === 'tunggakan') {
        const subtab = localStorage.getItem('sks_penagihan_subtab') || 'aktif';
        const mode = subtab === 'alumni' ? 'alumni' : 'aktif';
        const html = await fetchPenagihanLegacyPage('tunggakan');
        if (!html) return;
        container.innerHTML = html;
        if (typeof initTunggakan === 'function') initTunggakan(mode);
        syncPenagihanSidebarState();
        return;
    }

    if (tabName === 'pembayaran') {
        const html = await fetchPenagihanLegacyPage('pembayaran');
        if (!html) return;
        container.innerHTML = html;
        if (typeof initPembayaran === 'function') initPembayaran();
        return;
    }

    if (tabName === 'detail') {
        container.innerHTML = renderPenagihanDetailTemplate();
        setupPenagihanDetailActions();
        return;
    }

    if (tabName === 'rekonsiliasi') {
        container.innerHTML = renderPenagihanRekonsiliasiTemplate();
        if (typeof loadRekonsiliasiData === 'function') loadRekonsiliasiData();
        return;
    }
}

function syncPenagihanSidebarState() {
    const navPayment = document.getElementById('nav-pembayaran');
    const navAktif = document.getElementById('nav-tunggakan-aktif');
    const navAlumni = document.getElementById('nav-tunggakan-alumni');
    [navPayment, navAktif, navAlumni].forEach((el) => el && el.classList.remove('active'));
    if (currentPenagihanTab === 'pembayaran') {
        if (navPayment) navPayment.classList.add('active');
        return;
    }
    if (currentPenagihanTab === 'tunggakan') {
        const sub = localStorage.getItem('sks_penagihan_subtab') || 'aktif';
        if (sub === 'alumni') {
            if (navAlumni) navAlumni.classList.add('active');
        } else if (navAktif) {
            navAktif.classList.add('active');
        }
    }
}

async function fetchPenagihanLegacyPage(pageFile) {
    try {
        const response = await fetch(sksUrl(`/pages/${pageFile}.html`));
        if (!response.ok) throw new Error('Gagal memuat halaman.');
        return await response.text();
    } catch (e) {
        const container = document.getElementById('penagihan-content');
        if (container) {
            container.innerHTML = `<div class="rounded-xl border border-red-100 bg-red-50 p-6 text-red-600 text-sm">${e.message}</div>`;
        }
        return null;
    }
}

function renderPenagihanDetailTemplate() {
    return `
        <div class="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
            <h3 class="font-bold text-gray-800">Detail Siswa</h3>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div class="md:col-span-2">
                    <input id="detail-penagihan-nama" list="detail-penagihan-suggestions" type="text" placeholder="Cari nama siswa..." class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                    <datalist id="detail-penagihan-suggestions"></datalist>
                    <p class="mt-1 text-xs text-gray-500">Ketik nama, lalu pilih siswa dari daftar. Kelas akan terdeteksi otomatis.</p>
                </div>
                <button id="btn-detail-penagihan-load" type="button" class="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold">Tampilkan Timeline</button>
            </div>
            <div id="detail-penagihan-result" class="rounded-lg border border-gray-100 p-4 text-sm text-gray-500">Masukkan nama siswa lalu klik "Tampilkan Timeline".</div>
        </div>
    `;
}

function setupPenagihanDetailActions() {
    let studentOptions = [];

    function timelineDate(dateValue) {
        if (!dateValue) return '-';
        const d = new Date(dateValue);
        if (Number.isNaN(d.getTime())) return String(dateValue).split('T')[0];
        return d.toLocaleDateString('id-ID');
    }

    function renderTimeline(events) {
        if (!events.length) {
            return '<div class="text-gray-400 italic">Belum ada aktivitas siswa.</div>';
        }
        return `
            <div class="space-y-3">
                ${events.map((evt) => `
                    <div class="flex gap-3">
                        <div class="mt-1 h-2.5 w-2.5 rounded-full ${evt.dotClass}"></div>
                        <div class="flex-1">
                            <div class="flex items-center justify-between gap-2">
                                <p class="text-sm font-semibold text-gray-800">${evt.title}</p>
                                <span class="text-xs text-gray-500">${timelineDate(evt.date)}</span>
                            </div>
                            <p class="text-xs text-gray-600">${evt.desc}</p>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    function resolveStudentIdentity(rawName) {
        const value = String(rawName || '').trim().toLowerCase();
        if (!value) return null;
        const exactLabel = studentOptions.find((s) => s.label.toLowerCase() === value);
        if (exactLabel) return exactLabel;

        const exactName = studentOptions.filter((s) => s.nama.toLowerCase() === value);
        if (exactName.length === 1) return exactName[0];

        return null;
    }

    async function preloadStudentSuggestions() {
        const data = await apiCall('/api/arrears');
        const rows = Array.isArray(data) ? data : [];
        studentOptions = [];
        const seen = new Set();
        for (const row of rows) {
            const nama = String(row.nama || '').trim();
            const kelas = String(row.kelas || '').trim();
            if (!nama || !kelas) continue;
            const key = `${nama}__${kelas}`.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            studentOptions.push({
                nama,
                kelas,
                label: `${nama} - ${kelas}`
            });
        }

        const datalist = document.getElementById('detail-penagihan-suggestions');
        if (!datalist) return;
        datalist.innerHTML = studentOptions
            .sort((a, b) => a.label.localeCompare(b.label, 'id'))
            .map((s) => `<option value="${s.label}"></option>`)
            .join('');
    }

    const btn = document.getElementById('btn-detail-penagihan-load');
    const inputNama = document.getElementById('detail-penagihan-nama');
    if (!btn) return;
    preloadStudentSuggestions().catch(() => {});

    btn.onclick = async () => {
        const selected = resolveStudentIdentity(inputNama?.value || '');
        const result = document.getElementById('detail-penagihan-result');
        if (!selected) {
            result.innerHTML = '<span class="text-red-500">Pilih nama siswa dari daftar agar kelas terdeteksi otomatis.</span>';
            return;
        }
        result.innerHTML = 'Memuat...';
        const detail = await apiCall(`/api/student/details?nama=${encodeURIComponent(selected.nama)}&kelas=${encodeURIComponent(selected.kelas)}`);
        const bills = await apiCall(`/api/bills/student?nama=${encodeURIComponent(selected.nama)}&kelas=${encodeURIComponent(selected.kelas)}&include_all=1`);
        const payments = Array.isArray(detail?.payments) ? detail.payments : [];
        const billRows = Array.isArray(bills) ? bills : [];
        const events = [];
        billRows.forEach((b) => {
            events.push({
                date: b.tanggal_tagihan || null,
                title: `Tagihan: ${b.namaTagihan || '-'}`,
                desc: `Nominal ${formatRp(b.nominal || 0)} | Sisa ${Math.max(0, Number(b.sisa || 0)) <= 0 ? 'LUNAS' : formatRp(Math.max(0, Number(b.sisa || 0)))}`,
                dotClass: 'bg-rose-500'
            });
        });
        payments.forEach((p) => {
            events.push({
                date: p.tanggal || null,
                title: `Pembayaran Masuk`,
                desc: `${formatRp(p.jumlah_bayar || 0)} oleh ${p.penerima || 'Sistem'}`,
                dotClass: 'bg-emerald-500'
            });
        });
        const beasiswas = Array.isArray(detail?.beasiswas)
            ? detail.beasiswas
            : (detail?.beasiswa ? [detail.beasiswa] : []);
        beasiswas.forEach((b) => {
            events.push({
                date: b?.tanggal_terima || null,
                title: `Beasiswa Aktif`,
                desc: b?.nama_beasiswa || '-',
                dotClass: 'bg-violet-500'
            });
        });
        events.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

        const totalSisa = billRows.reduce((a, b) => a + Math.max(0, Number(b.sisa || 0)), 0);
        result.innerHTML = `
            <div class="space-y-4">
                <div class="rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm">
                    <div><b>Siswa:</b> ${detail?.student?.nama || selected.nama} (${detail?.student?.nis || '-'})</div>
                    <div><b>Kelas:</b> ${detail?.student?.kelas || selected.kelas}</div>
                    <div><b>Beasiswa:</b> ${beasiswas.length > 0 ? beasiswas.map((b) => b.nama_beasiswa).join(', ') : 'Tidak ada'}</div>
                    <div><b>Total Sisa:</b> ${totalSisa <= 0 ? 'LUNAS' : formatRp(totalSisa)}</div>
                </div>
                <div>
                    <h4 class="mb-2 text-sm font-bold text-gray-800">Timeline Aktivitas</h4>
                    ${renderTimeline(events)}
                </div>
            </div>
        `;
    };
}

function renderPenagihanRekonsiliasiTemplate() {
    return `
        <div class="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
            <div class="flex items-center justify-between">
                <h3 class="font-bold text-gray-800">Rekonsiliasi Data</h3>
                <button type="button" onclick="loadRekonsiliasiData()" class="px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-sm">Refresh</button>
            </div>
            <div id="rekonsiliasi-result" class="rounded-lg border border-gray-100 p-4 text-sm text-gray-500">Memuat...</div>
        </div>
    `;
}

async function loadRekonsiliasiData() {
    const target = document.getElementById('rekonsiliasi-result');
    if (!target) return;
    target.innerHTML = 'Memuat...';
    const res = await apiCall('/api/bills/reconciliation');
    if (!res || res.success === false) {
        target.innerHTML = `<span class="text-red-500">${res?.message || 'Gagal memuat data rekonsiliasi.'}</span>`;
        return;
    }
    const data = res.data || {};
    target.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div class="rounded-lg border border-gray-100 p-3"><p class="text-xs text-gray-500">Pembayaran tanpa bill</p><p class="text-lg font-bold text-amber-700">${Number(data.paymentsWithoutBill || 0)}</p></div>
            <div class="rounded-lg border border-gray-100 p-3"><p class="text-xs text-gray-500">Pembayaran orphan</p><p class="text-lg font-bold text-rose-700">${Number(data.orphanPayments || 0)}</p></div>
            <div class="rounded-lg border border-gray-100 p-3"><p class="text-xs text-gray-500">Bill negatif</p><p class="text-lg font-bold text-rose-700">${Number(data.negativeBills || 0)}</p></div>
            <div class="rounded-lg border border-gray-100 p-3"><p class="text-xs text-gray-500">Bill overpaid</p><p class="text-lg font-bold text-indigo-700">${Number(data.overpaidBills || 0)}</p></div>
        </div>
    `;
}
