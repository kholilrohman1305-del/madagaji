const paymentTableState = {
    currentPage: 1,
    rowsPerPage: 10,
    totalItems: 0
};
let paymentSearchTimer = null;
let paymentStudentOptions = [];

function getPaymentEffectiveRowsPerPage(totalItems) {
    return paymentTableState.rowsPerPage <= 0 ? Math.max(1, Number(totalItems || 0)) : paymentTableState.rowsPerPage;
}

async function syncPaymentHistoryFromServer() {
    const res = await apiCall('/api/payments/export');
    if (res && res.success && Array.isArray(res.rows)) {
        appData.payments = res.rows;
    } else {
        appData.payments = Array.isArray(appData.payments) ? appData.payments : [];
    }
}

async function initPembayaran() {
    if (typeof window.refreshAppData === 'function') {
        await window.refreshAppData(false);
    }
    await syncPaymentHistoryFromServer();
    // 1. Setup Tanggal Filter (Default: Hari ini)
    // Optional: Kosongkan jika ingin menampilkan semua history di awal
    // document.getElementById('filter-date-start').valueAsDate = new Date();
    // document.getElementById('filter-date-end').valueAsDate = new Date();
    
    const rowsEl = document.getElementById('payment-rows-per-page');
    if (rowsEl) rowsEl.value = paymentTableState.rowsPerPage <= 0 ? 'all' : String(paymentTableState.rowsPerPage);

    // 2. Render Tabel History Awal
    renderPaymentHistory();

    // 3. Listener Search Siswa di Modal
    document.getElementById('pay-search-input').addEventListener('keyup', function(e) {
        filterStudentDropdown(e.target.value);
    });

    // 4. Listener Submit Form
    document.getElementById('form-pembayaran').addEventListener('submit', handlePaymentSubmit);
}

let latestCreatedPaymentId = null;

// --- FUNGSI MODAL ---
function openPaymentModal(isEdit = false) {
    const modal = document.getElementById('modal-payment');
    const title = document.getElementById('modal-pay-title');
    const form = document.getElementById('form-pembayaran');
    const submitLabel = document.getElementById('pay-submit-label');
    const submitBtn = document.getElementById('pay-submit-btn');

    modal.classList.remove('hidden');
    const reasonWrap = document.getElementById('pay-revision-reason-wrap');
    if (reasonWrap) reasonWrap.classList.toggle('hidden', !isEdit);

    if (!isEdit) {
        title.textContent = "Input Pembayaran Baru";
        if (submitLabel) submitLabel.textContent = 'Lakukan Pembayaran';
        if (submitBtn) submitBtn.className = "w-full py-3 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition";
        form.reset();
        document.getElementById('pay-id').value = '';
        document.getElementById('pay-tanggal').valueAsDate = new Date();
        const defaultPenerima =
            (window.appData && window.appData.admin && window.appData.admin.nama_lengkap)
                ? String(window.appData.admin.nama_lengkap).trim()
                : 'Admin';
        document.getElementById('pay-penerima').value = defaultPenerima;
        if (typeof window.getCurrentOperatorName === 'function') {
            window.getCurrentOperatorName().then((name) => {
                if (!document.getElementById('pay-id').value) {
                    document.getElementById('pay-penerima').value = name || defaultPenerima;
                }
            }).catch(() => {});
        }
        document.getElementById('pay-pin').value = '';
        const reasonEl = document.getElementById('pay-revision-reason');
        if (reasonEl) reasonEl.value = '';
        
        // Reset Kolom Kanan
        resetInfoPanel();
    } else {
        title.textContent = "Edit Transaksi";
        if (submitLabel) submitLabel.textContent = 'Simpan Revisi';
        if (submitBtn) submitBtn.className = "w-full py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 transition";
    }
}

function closePaymentModal() {
    document.getElementById('modal-payment').classList.add('hidden');
}

function resetInfoPanel() {
    document.getElementById('info-empty-state').classList.remove('hidden');
    document.getElementById('info-content-state').classList.add('hidden');
    document.getElementById('pay-tagihan').innerHTML = '<option value="">-- Deposit / Bebas --</option>';
}

// --- LOGIKA FORM SISWA & INFO TUNGGAKAN ---

async function fetchPaymentStudentOptions(keyword = '', limit = 8) {
    const query = new URLSearchParams({
        status: 'Aktif',
        limit: String(limit)
    });
    if (String(keyword || '').trim()) query.set('search', String(keyword || '').trim());
    const res = await apiCall(`/api/students/options?${query.toString()}`);
    return (res && res.success && Array.isArray(res.rows)) ? res.rows : [];
}

function filterStudentDropdown(keyword) {
    const list = document.getElementById('pay-student-list');
    if (!list) return;

    // 1. Jika input kosong, sembunyikan dropdown
    if (!keyword || keyword.length < 1) { 
        list.classList.add('hidden');
        list.style.display = 'none'; 
        return; 
    }
    
    if (paymentSearchTimer) clearTimeout(paymentSearchTimer);
    paymentSearchTimer = setTimeout(async () => {
        paymentStudentOptions = await fetchPaymentStudentOptions(keyword, 8);
        if (paymentStudentOptions.length > 0) {
            list.innerHTML = paymentStudentOptions.map(s => `
                <div class="px-4 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0 transition-colors" 
                     onclick="selectStudent('${String(s.nama || '').replace(/'/g, "\\'")}', '${String(s.kelas || '').replace(/'/g, "\\'")}')">
                    <div class="font-bold text-gray-800 text-sm">${s.nama}</div>
                    <div class="flex items-center gap-2 mt-0.5">
                        <span class="text-xs font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">${s.kelas}</span>
                        ${s.nis ? `<span class="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">NIS: ${s.nis}</span>` : ''}
                    </div>
                </div>
            `).join('');
        } else {
            list.innerHTML = '<div class="px-4 py-3 text-gray-500 text-sm italic text-center">Siswa tidak ditemukan</div>';
        }
        list.classList.remove('hidden');
        list.style.display = 'block';
    }, 250);
}
async function selectStudent(nama, kelas) {
    // 1. Isi Form Kiri
    document.getElementById('pay-nama').value = nama;
    document.getElementById('pay-kelas').value = kelas;
    document.getElementById('pay-search-input').value = nama;
    document.getElementById('pay-student-list').style.display = 'none';

    // 2. UI Loading State
    document.getElementById('info-empty-state').classList.add('hidden');
    document.getElementById('info-content-state').classList.remove('hidden');
    document.getElementById('info-total-arrears').innerHTML = '<i class="fas fa-spinner fa-spin text-sm"></i> Loading...';
    document.getElementById('info-bill-list').innerHTML = '<li class="text-center text-gray-400">Sedang memuat data...</li>';

    try {
        console.log(`ðŸ” Mengambil data untuk: ${nama} (${kelas})`);

        // Encode URI agar spasi tidak membuat error URL
        const qNama = encodeURIComponent(nama);
        const qKelas = encodeURIComponent(kelas);

        // 3. Fetch Data (Dipisah agar satu error tidak mematikan yang lain)
        let totalVal = 0;
        let billsData = [];

        // Call A: Total Tagihan
        try {
            const resTotal = await apiCall(`/api/student/tunggakan_total?nama=${qNama}&kelas=${qKelas}`);
            console.log("âœ… API Total Res:", resTotal);
            // Cek berbagai kemungkinan format response
            totalVal = resTotal.totalSisa || resTotal.total || 0;
        } catch (err) {
            console.error("âŒ Gagal load total:", err);
            totalVal = 0;
        }

        // Call B: Rincian Tagihan
        try {
            const resBills = await apiCall(`/api/bills/student?nama=${qNama}&kelas=${qKelas}`);
            console.log("âœ… API Bills Res:", resBills);
            billsData = Array.isArray(resBills) ? resBills : (resBills.data || []);
        } catch (err) {
            console.error("âŒ Gagal load bills:", err);
        }

        // 4. Update UI Kanan
        document.getElementById('info-total-arrears').textContent = formatRp(totalVal);

        const billListEl = document.getElementById('info-bill-list');
        const selectTagihan = document.getElementById('pay-tagihan');
        
        // Reset Dropdown
        selectTagihan.innerHTML = '<option value="">-- Deposit / Bebas --</option>';

        if (billsData.length > 0) {
            // Render List Info
            billListEl.innerHTML = billsData.map(b => `
                <li class="bg-white p-3 rounded border border-gray-200 text-sm flex justify-between items-center shadow-sm">
                    <div>
                        <span class="font-semibold text-gray-700 block">${b.namaTagihan}</span>
                        <span class="text-xs text-gray-400">Total: ${formatRp(b.nominal)}</span>
                    </div>
                    <div class="text-right">
                        <span class="text-red-600 font-bold text-xs bg-red-50 px-2 py-1 rounded">Sisa: ${formatRp(b.sisa)}</span>
                    </div>
                </li>
            `).join('');

            // Isi Dropdown Tagihan
            billsData.forEach(b => {
                selectTagihan.innerHTML += `<option value="${b.rowId}">${b.namaTagihan} (Sisa: ${formatRp(b.sisa)})</option>`;
            });
        } else {
            billListEl.innerHTML = '<li class="text-center text-sm text-green-600 py-4 bg-green-50 rounded"><i class="fas fa-check-circle mr-1"></i> Tidak ada tagihan.</li>';
        }

    } catch (globalError) {
        console.error("Critical Error:", globalError);
        document.getElementById('info-total-arrears').textContent = "Rp 0";
        document.getElementById('info-bill-list').innerHTML = '<li class="text-red-500 text-sm">Gagal koneksi ke server.</li>';
    }
}

// --- LOGIKA TABEL & FILTER ---

function resetPaymentFilter() {
    document.getElementById('filter-pay-search').value = '';
    document.getElementById('filter-date-start').value = '';
    document.getElementById('filter-date-end').value = '';
    paymentTableState.currentPage = 1;
    renderPaymentHistory();
}

function onPaymentFilterChanged() {
    paymentTableState.currentPage = 1;
    renderPaymentHistory();
}

function renderPaymentHistory() {
    const tbody = document.getElementById('table-history');
    if(!tbody) return;

    const keyword = document.getElementById('filter-pay-search').value.toLowerCase();
    const startDateVal = document.getElementById('filter-date-start').value;
    const endDateVal = document.getElementById('filter-date-end').value;

    const startDate = startDateVal ? new Date(startDateVal) : null;
    const endDate = endDateVal ? new Date(endDateVal) : null;

    const list = (appData.payments || []).filter((x) => Number(x.is_reversed || 0) !== 1);
    const filtered = list.filter(p => {
        const matchName = p.nama.toLowerCase().includes(keyword) ||
                          p.trans_id.toLowerCase().includes(keyword);

        let matchDate = true;
        if (p.tanggal) {
            const pDate = new Date(p.tanggal);
            pDate.setHours(0,0,0,0);
            if(startDate) startDate.setHours(0,0,0,0);
            if(endDate) endDate.setHours(0,0,0,0);

            if (startDate && pDate < startDate) matchDate = false;
            if (endDate && pDate > endDate) matchDate = false;
        }

        return matchName && matchDate;
    }).sort((a, b) => {
        // Urutan "terbaru" berdasarkan waktu transaksi dibuat, bukan tanggal efektif bayar.
        const ca = new Date(a.created_at || 0).getTime();
        const cb = new Date(b.created_at || 0).getTime();
        if (cb !== ca) return cb - ca;

        // Fallback ke tanggal bayar bila created_at kosong.
        const ta = new Date(a.tanggal || 0).getTime();
        const tb = new Date(b.tanggal || 0).getTime();
        if (tb !== ta) return tb - ta;

        return Number(b.id || 0) - Number(a.id || 0);
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-gray-400 bg-white">Tidak ada data transaksi ditemukan</td></tr>`;
        paymentTableState.totalItems = 0;
        updatePaymentPaginationInfo();
        return;
    }

    paymentTableState.totalItems = filtered.length;
    const effectiveRows = getPaymentEffectiveRowsPerPage(filtered.length);
    const totalPages = Math.max(1, Math.ceil(filtered.length / effectiveRows));
    if (paymentTableState.currentPage > totalPages) paymentTableState.currentPage = totalPages;
    if (paymentTableState.currentPage < 1) paymentTableState.currentPage = 1;
    const start = (paymentTableState.currentPage - 1) * effectiveRows;
    const end = start + effectiveRows;
    const pagedRows = filtered.slice(start, end);

    tbody.innerHTML = pagedRows.map(p => `
        <tr class="bg-white hover:bg-gray-50 border-b transition group">
            <td class="px-6 py-4 font-mono text-xs text-gray-500">${p.trans_id}</td>
            <td class="px-6 py-4 text-gray-700">${p.tanggal ? p.tanggal.split('T')[0] : '-'}</td>
            <td class="px-6 py-4">
                <div class="font-medium text-gray-800">${p.nama}</div>
                <div class="text-xs text-gray-500">${p.kelas}</div>
            </td>
            <td class="px-6 py-4 text-xs text-gray-600">${p.tagihan_note || 'Deposit / Bebas'}</td>
            <td class="px-6 py-4 text-right font-bold text-emerald-600">${formatRp(p.jumlah_bayar)}</td>
            <td class="px-6 py-4 text-center">
                <div class="flex justify-center gap-2">
                    <button onclick="printReceipt(${p.id})" class="text-gray-500 hover:text-gray-700 p-1" title="Cetak Struk">
                        <i class="fas fa-print"></i>
                    </button>
                    <button onclick="editPayment('${p.trans_id}')" class="text-blue-500 hover:text-blue-700 p-1" title="Revisi">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="deletePayment('${p.trans_id}')" class="text-red-500 hover:text-red-700 p-1" title="Hapus">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');

    updatePaymentPaginationInfo();
}

function updatePaymentPaginationInfo() {
    const infoEl = document.getElementById('payment-page-info');
    const prevEl = document.getElementById('btn-prev-payment');
    const nextEl = document.getElementById('btn-next-payment');
    const total = Number(paymentTableState.totalItems || 0);
    const effectiveRows = getPaymentEffectiveRowsPerPage(total);
    const start = total === 0 ? 0 : ((paymentTableState.currentPage - 1) * effectiveRows + 1);
    const end = total === 0 ? 0 : Math.min(start + effectiveRows - 1, total);
    if (infoEl) infoEl.textContent = `Menampilkan ${start} - ${end} dari ${total} transaksi`;
    if (prevEl) prevEl.disabled = paymentTableState.currentPage <= 1;
    if (nextEl) nextEl.disabled = end >= total;
}

function changePaymentRowsPerPage() {
    const raw = String(document.getElementById('payment-rows-per-page')?.value || '10').toLowerCase();
    const rows = Number(raw);
    paymentTableState.rowsPerPage = raw === 'all' ? 0 : ([10, 25, 50].includes(rows) ? rows : 10);
    paymentTableState.currentPage = 1;
    renderPaymentHistory();
}

function prevPagePayment() {
    if (paymentTableState.currentPage <= 1) return;
    paymentTableState.currentPage -= 1;
    renderPaymentHistory();
}

function nextPagePayment() {
    const total = Number(paymentTableState.totalItems || 0);
    const effectiveRows = getPaymentEffectiveRowsPerPage(total);
    const totalPages = Math.max(1, Math.ceil(total / effectiveRows));
    if (paymentTableState.currentPage >= totalPages) return;
    paymentTableState.currentPage += 1;
    renderPaymentHistory();
}

// --- ACTION HANDLERS ---

async function handlePaymentSubmit(e) {
    e.preventDefault();
    const penerimaInput = (document.getElementById('pay-penerima').value || '').trim();
    const autoPenerima = (typeof window.getCurrentOperatorName === 'function')
        ? await window.getCurrentOperatorName()
        : ((window.appData && window.appData.admin && window.appData.admin.nama_lengkap)
            ? String(window.appData.admin.nama_lengkap).trim()
            : 'Admin');
    const isEdit = Boolean(document.getElementById('pay-id').value);
    const pinPromptMessage = isEdit
        ? 'Masukkan PIN transaksi (6 digit) untuk menyimpan revisi:'
        : 'Masukkan PIN transaksi (6 digit) untuk melakukan pembayaran:';
    const pinFromPrompt = await uiPrompt(pinPromptMessage, 'Verifikasi PIN', '######', '');
    if (pinFromPrompt === null) return;
    if (!/^\d{6}$/.test(String(pinFromPrompt || ''))) {
        uiWarn('PIN transaksi harus 6 digit angka.');
        return;
    }

    const data = {
        id: document.getElementById('pay-id').value, // Jika ada ID, berarti edit
        nama: document.getElementById('pay-nama').value,
        kelas: document.getElementById('pay-kelas').value,
        jumlahBayar: document.getElementById('pay-jumlah').value,
        tanggal: document.getElementById('pay-tanggal').value,
        penerima: penerimaInput || autoPenerima,
        billRowId: document.getElementById('pay-tagihan').value,
        pinTransaksi: String(pinFromPrompt || '').trim()
    };

    if(!data.nama) return uiWarn("Silakan pilih siswa terlebih dahulu.");

    // Tentukan URL & Method
    const method = 'POST';
    const url = isEdit ? `/api/payments/${data.id}/revise` : '/api/payments';
    if (isEdit) {
        data.reason = (document.getElementById('pay-revision-reason')?.value || '').trim();
        if (!data.reason) return uiWarn('Alasan revisi wajib diisi.');
    }

    try {
        const res = await apiCall(url, method, data);
        if(res.success) {
            let createdPayment = null;
            if (!isEdit && res.paymentId) {
                try {
                    const fetched = await apiCall(`/api/payments/${res.paymentId}`);
                    if (fetched && fetched.id) createdPayment = fetched;
                } catch (_) {}
            }

            // Refresh Data
            const newData = await (typeof window.refreshAppData === 'function'
                ? window.refreshAppData(true)
                : apiCall('/api/initial-data'));
            if (newData) {
                Object.assign(appData, newData);
            }
            await syncPaymentHistoryFromServer();

            // Pastikan transaksi baru tetap muncul walau tidak ikut batch /api/initial-data (mis. LIMIT dataset).
            if (!isEdit && createdPayment && createdPayment.id) {
                appData.payments = Array.isArray(appData.payments) ? appData.payments : [];
                appData.payments = appData.payments.filter((x) => Number(x.id || 0) !== Number(createdPayment.id || 0));
                appData.payments.unshift(createdPayment);
            } else if (!isEdit && !newData && res.paymentId) {
                const created = await apiCall(`/api/payments/${res.paymentId}`);
                if (created && created.id) {
                    appData.payments = Array.isArray(appData.payments) ? appData.payments : [];
                    appData.payments = appData.payments.filter((x) => Number(x.id || 0) !== Number(created.id || 0));
                    appData.payments.unshift(created);
                }
            }
            paymentTableState.currentPage = 1;

            closePaymentModal();
            renderPaymentHistory();
            if (!isEdit) {
                latestCreatedPaymentId = Number(res.paymentId || 0) || null;
                openPaymentResultModal({
                    transId: res.transId || '-',
                    nama: data.nama || '-',
                    jumlahBayar: Number(data.jumlahBayar || 0)
                });
            } else {
                uiSuccess('Revisi transaksi berhasil disimpan.');
            }
        } else {
            uiError(res.message || 'Gagal menyimpan transaksi.');
        }
    } catch (error) {
        console.error(error);
        uiError('Gagal menyimpan transaksi.');
    }
}

async function deletePayment(id) {
    const ok = await uiConfirm(`Yakin hapus transaksi ${id}? Ini akan membatalkan pembayaran dan mengembalikan tagihan siswa.`, 'Konfirmasi Hapus Transaksi');
    if (!ok) return;
    try {
        const res = await apiCall(`/api/payments/${id}`, 'DELETE');
        if(res.success) {
            const newData = await (typeof window.refreshAppData === 'function'
                ? window.refreshAppData(true)
                : apiCall('/api/initial-data'));
            if (newData) Object.assign(appData, newData);
            await syncPaymentHistoryFromServer();
            renderPaymentHistory();
        } else {
            alert(res.message);
        }
    } catch (e) {
        alert('Gagal menghapus data');
    }
}

function openPaymentResultModal(payment) {
    const modal = document.getElementById('modal-payment-result');
    if (!modal) return;
    const transEl = document.getElementById('pay-result-trans');
    const namaEl = document.getElementById('pay-result-nama');
    const jumlahEl = document.getElementById('pay-result-jumlah');
    if (transEl) transEl.textContent = payment?.transId || '-';
    if (namaEl) namaEl.textContent = payment?.nama || '-';
    if (jumlahEl) jumlahEl.textContent = formatRp(payment?.jumlahBayar || 0);
    modal.classList.remove('hidden');
}

function closePaymentResultModal() {
    document.getElementById('modal-payment-result')?.classList.add('hidden');
}

function printLatestPaymentReceipt() {
    const paymentId = Number(latestCreatedPaymentId || 0);
    if (!paymentId) {
        uiWarn('Data bukti pembayaran belum tersedia.');
        return;
    }
    printReceipt(paymentId);
}

function printStruk(transId) {
    const p = appData.payments.find(x => x.trans_id == transId);
    if (!p) return alert('Data transaksi tidak ditemukan.');
    printReceipt(p.id);
}

function editPayment(transId) {
    // Cari data lokal
    const p = appData.payments.find(x => x.trans_id == transId);
    if(!p) return alert("Data tidak ditemukan");

    openPaymentModal(true); // Mode Edit

    // Isi Form
    document.getElementById('pay-id').value = p.id; // Gunakan ID database, bukan Trans ID string
    document.getElementById('pay-nama').value = p.nama;
    document.getElementById('pay-kelas').value = p.kelas;
    document.getElementById('pay-jumlah').value = p.jumlah_bayar;
    document.getElementById('pay-tanggal').value = p.tanggal.split('T')[0];
    document.getElementById('pay-penerima').value = p.penerima || '';
    const reasonEl = document.getElementById('pay-revision-reason');
    if (reasonEl) reasonEl.value = '';
    
    // Trigger Select Student manual untuk memuat ulang rincian tagihan di panel kanan
    selectStudent(p.nama, p.kelas).then(() => {
        const selectTagihan = document.getElementById('pay-tagihan');
        if (selectTagihan && p.bill_id) selectTagihan.value = String(p.bill_id);
    });
    
    // Catatan: Dropdown tagihan mungkin perlu logika khusus saat edit 
    // untuk 'select' tagihan yang sedang diedit. 
    // Tapi untuk kesederhanaan, kita load ulang list tagihan siswa.
}

async function exportPaymentHistory() {
    const keyword = (document.getElementById('filter-pay-search')?.value || '').trim();
    const dateFrom = (document.getElementById('filter-date-start')?.value || '').trim();
    const dateTo = (document.getElementById('filter-date-end')?.value || '').trim();
    if (!dateFrom || !dateTo) {
        alert('Isi rentang tanggal (Dari & Sampai) sebelum export.');
        return;
    }
    const q = new URLSearchParams();
    q.set('date_from', dateFrom);
    q.set('date_to', dateTo);
    if (keyword) q.set('search', keyword);
    const res = await apiCall(`/api/payments/export?${q.toString()}`);
    if (!res || res.success === false) {
        alert(res?.message || 'Gagal export riwayat pembayaran.');
        return;
    }
    const rows = Array.isArray(res.rows) ? res.rows : [];
    if (!rows.length) {
        alert('Tidak ada data pembayaran pada range tersebut.');
        return;
    }
    const exportRows = rows.map((r) => ({
        tanggal: r.tanggal ? String(r.tanggal).slice(0, 10) : '',
        trans_id: r.trans_id,
        siswa: r.nama,
        kelas: r.kelas,
        tagihan: r.tagihan || 'Deposit / Bebas',
        nominal: Number(r.jumlah_bayar || 0),
        penerima: r.penerima || '',
        keterangan: r.keterangan || ''
    }));
    const meta = [{
        date_from: dateFrom,
        date_to: dateTo,
        search: keyword || '-',
        generated_at: new Date().toLocaleString('id-ID')
    }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(meta), 'Metadata');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(exportRows), 'Riwayat');
    XLSX.writeFile(wb, `riwayat_pembayaran_${dateFrom}_${dateTo}.xlsx`);
}

function getBillingImportApiUrl(pathname) {
    return (typeof window.sksUrl === 'function')
        ? window.sksUrl(pathname)
        : pathname;
}

async function downloadBillingImportTemplate() {
    try {
        const url = getBillingImportApiUrl('/api/billing/import/template');
        const res = await fetch(url, { method: 'GET', credentials: 'include' });
        if (!res.ok) {
            let msg = 'Gagal mengunduh template import.';
            try {
                const json = await res.json();
                if (json?.message) msg = String(json.message);
            } catch (_) {}
            throw new Error(msg);
        }
        const blob = await res.blob();
        const href = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = href;
        a.download = 'Template_Import_Tagihan_Pembayaran.xlsx';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(href);
    } catch (err) {
        if (typeof uiError === 'function') uiError(err?.message || 'Gagal mengunduh template import.');
        else alert(err?.message || 'Gagal mengunduh template import.');
    }
}

function triggerBillingImportFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx';
    input.onchange = async () => {
        const file = input.files && input.files[0];
        if (!file) return;
        await uploadBillingImportFile(file);
    };
    input.click();
}

async function callBillingImportApi(file, dryRun = false) {
    const formData = new FormData();
    formData.append('file', file);
    const base = getBillingImportApiUrl('/api/billing/import');
    const url = dryRun ? `${base}?dry_run=1` : base;
    const res = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        body: formData
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.success === false) {
        throw new Error(json?.message || (dryRun ? 'Preview import gagal.' : 'Import gagal.'));
    }
    return json;
}

async function uploadBillingImportFile(file) {
    try {
        const preview = await callBillingImportApi(file, true);
        const previewSummary = preview?.summary || {};
        const previewBills = Number(previewSummary.importedBills || 0);
        const previewPays = Number(previewSummary.importedPayments || 0);
        const previewFailed = Number(previewSummary.failedRows || 0);
        const previewErrors = Array.isArray(preview?.errors) ? preview.errors : [];

        if (previewBills <= 0) {
            const msg = previewErrors.slice(0, 10).join('\n') || 'Tidak ada baris valid untuk diimport.';
            if (typeof uiWarn === 'function') uiWarn(msg);
            else alert(msg);
            return;
        }

        const ok = await uiConfirm(
            `Preview: ${previewBills} tagihan, ${previewPays} pembayaran, ${previewFailed} baris gagal.\nLanjutkan import final?`,
            'Konfirmasi Import Pembayaran'
        );
        if (!ok) return;

        const json = await callBillingImportApi(file, false);

        if (typeof window.refreshAppData === 'function') {
            const refreshed = await window.refreshAppData(true);
            if (refreshed) Object.assign(appData, refreshed);
        }
        await syncPaymentHistoryFromServer();
        paymentTableState.currentPage = 1;
        renderPaymentHistory();

        const failedRows = Number(json?.summary?.failedRows || 0);
        const errList = Array.isArray(json?.errors) ? json.errors : [];
        if (failedRows > 0 && errList.length) {
            const preview = errList.slice(0, 10).join('\n');
            const message = `${json.message}\n\nBaris gagal: ${failedRows}\n\nContoh error:\n${preview}${errList.length > 10 ? '\n...' : ''}`;
            if (typeof uiWarn === 'function') uiWarn(message);
            else alert(message);
            return;
        }

        if (typeof uiSuccess === 'function') uiSuccess(json?.message || 'Import berhasil.');
        else alert(json?.message || 'Import berhasil.');
    } catch (err) {
        if (typeof uiError === 'function') uiError(err?.message || 'Import gagal.');
        else alert(err?.message || 'Import gagal.');
    }
}
