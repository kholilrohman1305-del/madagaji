// js/tagihan.js

window.billHistoryState = { currentPage: 1, rowsPerPage: 15 };
window.billTargetMode = 'class';
window.billPendingGeneratePayload = null;
window.billStudentOptions = [];
let billStudentSearchTimer = null;
let singleBillSearchTimer = null;

async function initTagihan() {
    if (typeof window.refreshAppData === 'function') {
        await window.refreshAppData(false, { includeExistingBills: true });
    }
    updateBillStats();
    renderBillFilterOptions();
    renderHistoryTable();
    renderClassCheckboxes();
    renderSchoolYearOptions();
    await loadBillStudentOptions('');
    setBillTargetMode('class');

    const form = document.getElementById('form-generate-bill');
    if(form) form.onsubmit = handleGenerateBill;

    const formSingle = document.getElementById('form-single-bill');
    if(formSingle) formSingle.onsubmit = handleSingleBillSubmit;

    const searchInput = document.getElementById('single-search');
    if(searchInput) searchInput.addEventListener('keyup', handleSearchStudentBill);
    const bulkSearchInput = document.getElementById('bill-student-search');
    if (bulkSearchInput) {
        bulkSearchInput.oninput = () => filterBillStudentOptions();
    }
}

function renderSchoolYearOptions() {
    const select = document.getElementById('bill-school-year');
    if (!select) return;
    const years = Array.isArray(appData.schoolYears) ? appData.schoolYears : [];
    const activeName = appData.activeSchoolYear?.name || '';
    if (!years.length) {
        select.innerHTML = `<option value="${activeName || ''}">${activeName || 'Belum ada tahun ajaran'}</option>`;
        return;
    }
    select.innerHTML = years.map((y) => `<option value="${y.name}">${y.name}${Number(y.is_active) === 1 ? ' (Aktif)' : ''}</option>`).join('');
    select.value = activeName || years[0].name;
}

function updateBillStats() {
    const stats = appData.billStats || { totalKali: 0, totalSiswaTerkena: 0, totalNominal: 0 };
    document.getElementById('bill-stat-count').innerText = stats.totalKali;
    document.getElementById('bill-stat-students').innerText = stats.totalSiswaTerkena.toLocaleString('id-ID');
    document.getElementById('bill-stat-money').innerText = formatRp(stats.totalNominal);
}

function getSemesterNameFromDate(dateValue) {
    const dt = new Date(dateValue);
    if (Number.isNaN(dt.getTime())) return '';
    const month = dt.getMonth() + 1;
    return month >= 7 ? 'Ganjil' : 'Genap';
}

function renderBillFilterOptions() {
    const history = appData.existingBills || [];
    const yearSelect = document.getElementById('bill-filter-year');
    if (!yearSelect) return;
    const years = Array.from(new Set(history
        .map(h => {
            const dt = new Date(h.tanggal_buat);
            return Number.isNaN(dt.getTime()) ? null : String(dt.getFullYear());
        })
        .filter(Boolean)))
        .sort((a, b) => Number(b) - Number(a));

    yearSelect.innerHTML = '<option value="">Semua Tahun</option>' + years.map(y => `<option value="${y}">${y}</option>`).join('');
}

function getFilteredBillHistory() {
    const yearFilter = document.getElementById('bill-filter-year')?.value || '';
    const semesterFilter = document.getElementById('bill-filter-semester')?.value || '';
    const q = (document.getElementById('bill-search')?.value || '').toLowerCase().trim();
    let history = appData.existingBills || [];
    if (yearFilter) {
        history = history.filter(h => {
            const dt = new Date(h.tanggal_buat);
            return !Number.isNaN(dt.getTime()) && String(dt.getFullYear()) === yearFilter;
        });
    }
    if (semesterFilter) {
        history = history.filter(h => getSemesterNameFromDate(h.tanggal_buat) === semesterFilter);
    }
    if (q) {
        history = history.filter(h => String(h.nama_tagihan || '').toLowerCase().includes(q));
    }
    return history;
}

function updateBillStatsFiltered(history) {
    const list = Array.isArray(history) ? history : [];
    const totalKali = list.length;
    const totalSiswaTerkena = list.reduce((acc, curr) => acc + Number(curr.jumlah_siswa || 0), 0);
    const totalNominal = list.reduce((acc, curr) => acc + Number(curr.total_potensi || 0), 0);
    document.getElementById('bill-stat-count').innerText = totalKali;
    document.getElementById('bill-stat-students').innerText = totalSiswaTerkena.toLocaleString('id-ID');
    document.getElementById('bill-stat-money').innerText = formatRp(totalNominal);
}

function renderHistoryTable(page = 1) {
    const tbody = document.getElementById('table-history-bills');
    const infoEl = document.getElementById('bill-history-info');
    const prevBtn = document.getElementById('bill-prev-btn');
    const nextBtn = document.getElementById('bill-next-btn');
    const history = getFilteredBillHistory();
    updateBillStatsFiltered(history);

    if (history.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center p-8 text-gray-400">Belum ada riwayat pembuatan tagihan.</td></tr>';
        if (infoEl) infoEl.textContent = 'Tidak ada data.';
        if (prevBtn) prevBtn.disabled = true;
        if (nextBtn) nextBtn.disabled = true;
        return;
    }

    const totalRows = history.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / window.billHistoryState.rowsPerPage));
    const safePage = Math.min(Math.max(page, 1), totalPages);
    window.billHistoryState.currentPage = safePage;
    const start = (safePage - 1) * window.billHistoryState.rowsPerPage;
    const end = start + window.billHistoryState.rowsPerPage;
    const paginated = history.slice(start, end);

    tbody.innerHTML = paginated.map(h => {
        const safeNama = h.nama_tagihan.replace(/'/g, "\\'");
        const safeDate = h.tanggal_buat;
        
        return `
        <tr class="hover:bg-gray-50 border-b last:border-0 transition">
            <td class="px-6 py-4 text-gray-500 text-xs font-mono">
                ${h.tanggal_buat ? new Date(h.tanggal_buat).toLocaleDateString('id-ID', {day: 'numeric', month: 'short', year: 'numeric'}) : '-'}
            </td>
            <td class="px-6 py-4 font-bold text-gray-800">${h.nama_tagihan}</td>
            <td class="px-6 py-4 text-gray-600">${h.school_year_name || '-'}</td>
            <td class="px-6 py-4 text-right text-gray-600">${formatRp(h.nominal)}</td>
            <td class="px-6 py-4 text-center">
                <span class="bg-blue-50 text-blue-600 px-2 py-1 rounded text-xs font-bold">${h.jumlah_siswa} Siswa</span>
            </td>
            <td class="px-6 py-4 text-right font-bold text-emerald-600">${formatRp(h.total_potensi)}</td>
            <td class="px-6 py-4 text-center">
                <div class="flex items-center justify-center gap-2">
                    <button onclick="openSingleBillModal('${safeNama}', ${h.nominal})" 
                        class="text-blue-500 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 p-2 rounded-lg transition" 
                        title="Tambah Siswa Susulan (+)"><i class="fas fa-user-plus"></i></button>

                    <button onclick="deleteBillBatch('${safeNama}', '${safeDate}', ${h.nominal})" 
                        class="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 p-2 rounded-lg transition" 
                        title="Hapus / Rollback"><i class="fas fa-trash-alt"></i></button>
                </div>
            </td>
        </tr>
    `}).join('');

    if (infoEl) {
        infoEl.textContent = `Menampilkan ${start + 1}-${Math.min(end, totalRows)} dari ${totalRows} data`;
    }
    if (prevBtn) prevBtn.disabled = safePage <= 1;
    if (nextBtn) nextBtn.disabled = safePage >= totalPages;
}

function renderClassCheckboxes() {
    const container = document.getElementById('class-checkbox-container');
    const role = String(appData.role || '');
    const branchId = Number(appData?.admin?.branch_id || 0);
    const source = Array.isArray(appData.classes) ? appData.classes : [];
    const scoped = (role === 'admin' || role === 'wali_kelas') && branchId > 0
        ? source.filter((c) => Number(c?.branch_id || 0) === branchId)
        : source;
    const seen = new Set();
    const classes = scoped.filter((c) => {
        const key = String(c?.nama_kelas || '').trim().toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    if (classes.length === 0) {
        container.innerHTML = '<span class="text-red-500 text-xs col-span-3">Belum ada data kelas. Tambahkan di menu Manajemen Kelas.</span>';
    } else {
        container.innerHTML = classes.map(c => `
            <label class="flex items-center space-x-2 cursor-pointer hover:bg-blue-50 p-2 rounded transition border border-transparent hover:border-blue-100">
                <input type="checkbox" name="target_class" value="${c.nama_kelas}" class="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500">
                <span class="text-sm text-gray-700 font-medium">${c.nama_kelas}</span>
            </label>
        `).join('');
    }
}

function renderStudentCheckboxes() {
    const container = document.getElementById('student-checkbox-container');
    if (!container) return;
    const students = Array.isArray(window.billStudentOptions) ? window.billStudentOptions : [];
    if (students.length === 0) {
        container.innerHTML = '<span class="text-slate-500 text-xs">Ketik nama/NIS untuk memuat siswa aktif.</span>';
        return;
    }
    container.innerHTML = students.map((s) => `
        <label class="student-option flex items-start space-x-2 cursor-pointer hover:bg-blue-50 p-2 rounded transition border border-transparent hover:border-blue-100"
            data-name="${String(s.nama || '').toLowerCase()}" data-nis="${String(s.nis || '').toLowerCase()}">
            <input type="checkbox" name="target_student" value="${s.id}" class="mt-0.5 w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500">
            <span class="text-sm text-gray-700 font-medium">${s.nama} <span class="text-xs text-gray-500">(${s.nis || '-'} - ${s.kelas || '-'})</span></span>
        </label>
    `).join('');
}

async function fetchBillStudentOptions(keyword = '', limit = 40) {
    const query = new URLSearchParams({
        status: 'Aktif',
        limit: String(limit)
    });
    if (String(keyword || '').trim()) query.set('search', String(keyword || '').trim());
    const res = await apiCall(`/api/students/options?${query.toString()}`);
    return (res && res.success && Array.isArray(res.rows)) ? res.rows : [];
}

async function loadBillStudentOptions(keyword = '') {
    window.billStudentOptions = await fetchBillStudentOptions(keyword, 50);
    renderStudentCheckboxes();
}

function setBillTargetMode(mode) {
    window.billTargetMode = mode === 'student' ? 'student' : 'class';
    const btnClass = document.getElementById('bill-target-mode-class');
    const btnStudent = document.getElementById('bill-target-mode-student');
    const classSection = document.getElementById('bill-target-class-section');
    const studentSection = document.getElementById('bill-target-student-section');
    const isClass = window.billTargetMode === 'class';
    if (btnClass) {
        btnClass.classList.toggle('border-primary-300', isClass);
        btnClass.classList.toggle('bg-primary-50', isClass);
        btnClass.classList.toggle('text-primary-700', isClass);
        btnClass.classList.toggle('border-gray-300', !isClass);
        btnClass.classList.toggle('bg-white', !isClass);
        btnClass.classList.toggle('text-gray-700', !isClass);
    }
    if (btnStudent) {
        btnStudent.classList.toggle('border-primary-300', !isClass);
        btnStudent.classList.toggle('bg-primary-50', !isClass);
        btnStudent.classList.toggle('text-primary-700', !isClass);
        btnStudent.classList.toggle('border-gray-300', isClass);
        btnStudent.classList.toggle('bg-white', isClass);
        btnStudent.classList.toggle('text-gray-700', isClass);
    }
    if (classSection) classSection.classList.toggle('hidden', !isClass);
    if (studentSection) studentSection.classList.toggle('hidden', isClass);
}

function filterBillStudentOptions() {
    const keyword = (document.getElementById('bill-student-search')?.value || '').trim();
    if (billStudentSearchTimer) clearTimeout(billStudentSearchTimer);
    billStudentSearchTimer = setTimeout(() => {
        loadBillStudentOptions(keyword);
    }, 250);
}

// LOGIKA MODAL MASSAL
function openBillModal() {
    document.getElementById('form-generate-bill').reset();
    document.querySelectorAll('input[name="target_class"]').forEach(cb => cb.checked = false);
    document.querySelectorAll('input[name="target_student"]').forEach(cb => cb.checked = false);
    setBillTargetMode('class');
    renderSchoolYearOptions();
    resetBillPreviewPanel();
    document.getElementById('modal-bill').classList.remove('hidden');
}
function closeBillModal() {
    resetBillPreviewPanel();
    document.getElementById('modal-bill').classList.add('hidden');
}

function resetBillPreviewPanel() {
    window.billPendingGeneratePayload = null;
    const panel = document.getElementById('bill-preview-panel');
    if (panel) panel.classList.add('hidden');
    const rows = document.getElementById('bill-preview-rows');
    if (rows) rows.innerHTML = '';
    const limited = document.getElementById('bill-preview-limited');
    if (limited) limited.classList.add('hidden');
    const btnConfirm = document.getElementById('bill-confirm-generate-btn');
    if (btnConfirm) {
        btnConfirm.disabled = false;
        btnConfirm.textContent = 'Konfirmasi Terbitkan';
    }
    const btnGenerate = document.getElementById('btn-generate');
    if (btnGenerate) {
        btnGenerate.disabled = false;
        btnGenerate.innerHTML = '<i class="fas fa-paper-plane mr-2"></i> Terbitkan Tagihan';
    }
}

function renderBillGeneratePreview(previewRes) {
    const panel = document.getElementById('bill-preview-panel');
    if (!panel) return;
    const s = previewRes.summary || {};
    document.getElementById('bill-preview-total-students').textContent = Number(s.totalStudents || 0).toLocaleString('id-ID');
    document.getElementById('bill-preview-sch-students').textContent = Number(s.siswaTerbeasiswa || 0).toLocaleString('id-ID');
    document.getElementById('bill-preview-base').textContent = formatRp(s.totalNominalAwal || 0);
    document.getElementById('bill-preview-discount').textContent = formatRp(s.totalPotongan || 0);
    document.getElementById('bill-preview-net').textContent = formatRp(s.totalNominalAkhir || 0);
    const rows = Array.isArray(previewRes.previewRows) ? previewRes.previewRows : [];
    const tbody = document.getElementById('bill-preview-rows');
    if (tbody) {
        tbody.innerHTML = rows.map((row) => `
            <tr class="border-b border-blue-50 last:border-0">
                <td class="px-3 py-2 text-gray-700">
                    <div class="font-semibold">${row.nama || '-'}</div>
                    <div class="text-[11px] text-gray-500">${row.nis || '-'}</div>
                </td>
                <td class="px-3 py-2 text-gray-600">${row.kelas || '-'}</td>
                <td class="px-3 py-2 text-right text-gray-600">${formatRp(row.nominal_awal || 0)}</td>
                <td class="px-3 py-2 text-right ${Number(row.scholarship_discount || 0) > 0 ? 'text-emerald-700 font-semibold' : 'text-gray-500'}">
                    ${formatRp(row.scholarship_discount || 0)}
                    ${Number(row.scholarship_percent || 0) > 0 ? `<div class="text-[11px] text-blue-700">${Number(row.scholarship_percent)}%</div>` : ''}
                </td>
                <td class="px-3 py-2 text-right font-semibold text-indigo-700">${formatRp(row.nominal_akhir || 0)}</td>
            </tr>
        `).join('');
    }
    const limited = document.getElementById('bill-preview-limited');
    if (limited) limited.classList.toggle('hidden', !previewRes.previewLimited);
    panel.classList.remove('hidden');
}

let isAllSelected = false;
function toggleSelectAllClasses() {
    const checkboxes = document.querySelectorAll('input[name="target_class"]');
    isAllSelected = !isAllSelected;
    checkboxes.forEach(cb => cb.checked = isAllSelected);
}

function toggleSelectAllStudents() {
    const checkboxes = Array.from(document.querySelectorAll('input[name="target_student"]'))
        .filter((cb) => !cb.closest('.student-option')?.classList.contains('hidden'));
    if (!checkboxes.length) return;
    const allChecked = checkboxes.every((cb) => cb.checked);
    checkboxes.forEach((cb) => { cb.checked = !allChecked; });
}

async function handleGenerateBill(e) {
    e.preventDefault();
    const billName = document.getElementById('bill-name').value;
    const amount = document.getElementById('bill-amount').value;
    const schoolYear = document.getElementById('bill-school-year')?.value || '';
    const classChecks = document.querySelectorAll('input[name="target_class"]:checked');
    const studentChecks = document.querySelectorAll('input[name="target_student"]:checked');
    const targetClasses = Array.from(classChecks).map(cb => cb.value);
    const targetStudentIds = Array.from(studentChecks).map(cb => Number(cb.value)).filter((x) => Number.isFinite(x) && x > 0);

    if (!billName || !amount) return alert("Nama dan Nominal wajib diisi.");
    if (!schoolYear) return alert("Tahun ajaran wajib dipilih.");
    if (window.billTargetMode === 'class' && targetClasses.length === 0) return alert("Pilih minimal satu kelas target.");
    if (window.billTargetMode === 'student' && targetStudentIds.length === 0) return alert("Pilih minimal satu siswa target.");

    const payload = {
        billName,
        amount: Number(amount),
        schoolYear,
        targetClasses: window.billTargetMode === 'class' ? targetClasses : [],
        targetStudentIds: window.billTargetMode === 'student' ? targetStudentIds : []
    };

    try {
        const btn = document.getElementById('btn-generate');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = 'Memproses preview...';
        }
        const previewRes = await apiCall('/api/bills/generate-preview', 'POST', payload);
        if (!previewRes || previewRes.success === false) {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-paper-plane mr-2"></i> Terbitkan Tagihan';
            }
            return alert(previewRes?.message || 'Gagal membuat preview tagihan.');
        }
        renderBillGeneratePreview(previewRes);
        window.billPendingGeneratePayload = payload;
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-sync-alt mr-2"></i> Refresh Preview';
        }
    } catch (previewErr) {
        const btn = document.getElementById('btn-generate');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-paper-plane mr-2"></i> Terbitkan Tagihan';
        }
        return alert('Gagal membuat preview tagihan.');
    }
}

function cancelBillPreview() {
    resetBillPreviewPanel();
}

async function confirmGenerateBillFromPreview() {
    if (!window.billPendingGeneratePayload) return alert('Preview belum tersedia. Klik Terbitkan/Refresh Preview terlebih dahulu.');
    const btnConfirm = document.getElementById('bill-confirm-generate-btn');
    if (btnConfirm) {
        btnConfirm.disabled = true;
        btnConfirm.textContent = 'Memproses...';
    }
    try {
        const res = await apiCall('/api/bills/generate', 'POST', window.billPendingGeneratePayload);
        if (res.success) {
            const newData = await (typeof window.refreshAppData === 'function'
                ? window.refreshAppData(true, { includeExistingBills: true })
                : apiCall('/api/initial-data'));
            appData.existingBills = newData.existingBills;
            appData.billStats = newData.billStats;
            updateBillStats();
            renderBillFilterOptions();
            renderHistoryTable(1);
            closeBillModal();
            alert(res.message);
        } else {
            alert(res.message || 'Gagal menerbitkan tagihan.');
            if (btnConfirm) {
                btnConfirm.disabled = false;
                btnConfirm.textContent = 'Konfirmasi Terbitkan';
            }
        }
    } catch (error) {
        alert("Error koneksi.");
        if (btnConfirm) {
            btnConfirm.disabled = false;
            btnConfirm.textContent = 'Konfirmasi Terbitkan';
        }
    }
}

async function deleteBillBatch(nama, date, nominal) {
    if(!(await uiConfirm(`Yakin hapus tagihan "${nama}"? Hanya siswa yang belum bayar yang akan dihapus.`, 'Konfirmasi Hapus Tagihan'))) return;
    try {
        const res = await apiCall(`/api/bills/batch?nama=${encodeURIComponent(nama)}&date=${encodeURIComponent(date)}&nominal=${nominal}`, 'DELETE');
        if (res.success) {
            alert(res.message);
            const newData = await (typeof window.refreshAppData === 'function'
                ? window.refreshAppData(true, { includeExistingBills: true })
                : apiCall('/api/initial-data'));
            appData.existingBills = newData.existingBills;
            appData.billStats = newData.billStats;
            updateBillStats();
            renderBillFilterOptions();
            renderHistoryTable(1);
        } else { alert(res.message); }
    } catch (e) { alert("Gagal menghapus."); }
}

// LOGIKA MODAL SINGLE (SUSULAN)
function openSingleBillModal(billName, nominal) {
    document.getElementById('single-bill-name').textContent = billName;
    document.getElementById('single-bill-nominal-display').textContent = formatRp(nominal);
    document.getElementById('single-bill-nominal-value').value = nominal;
    document.getElementById('form-single-bill').reset();
    resetSelectedStudent();
    document.getElementById('modal-single-bill').classList.remove('hidden');
}
function closeSingleBillModal() { document.getElementById('modal-single-bill').classList.add('hidden'); }

function handleSearchStudentBill(e) {
    const keyword = String(e.target.value || '').trim();
    const resultBox = document.getElementById('single-search-results');
    if(keyword.length < 1) { resultBox.classList.add('hidden'); return; }
    if (singleBillSearchTimer) clearTimeout(singleBillSearchTimer);
    singleBillSearchTimer = setTimeout(async () => {
        const filtered = await fetchBillStudentOptions(keyword, 8);
        if(filtered.length === 0) { resultBox.innerHTML = '<div class="p-3 text-sm text-gray-500 text-center">Tidak ditemukan</div>'; } 
        else {
            resultBox.innerHTML = filtered.map(s => `
                <div class="p-2 hover:bg-gray-100 cursor-pointer border-b flex justify-between items-center" onclick="selectStudentBill(${s.id}, '${String(s.nama || '').replace(/'/g, "\\'")}', '${String(s.kelas || '').replace(/'/g, "\\'")}')">
                    <div><div class="font-bold text-sm text-gray-800">${s.nama}</div><div class="text-xs text-gray-500">${s.kelas} | NIS: ${s.nis}</div></div>
                    <i class="fas fa-plus-circle text-primary-600"></i>
                </div>
            `).join('');
        }
        resultBox.classList.remove('hidden');
    }, 250);
}

function selectStudentBill(id, nama, kelas) {
    document.getElementById('single-search').value = '';
    document.getElementById('single-search-results').classList.add('hidden');
    document.getElementById('selected-student-id').value = id;
    document.getElementById('selected-student-nama').textContent = nama;
    document.getElementById('selected-student-kelas').textContent = kelas;
    document.getElementById('selected-student-container').classList.remove('hidden');
    document.getElementById('single-search').classList.add('hidden');
}

function resetSelectedStudent() {
    document.getElementById('selected-student-id').value = '';
    document.getElementById('selected-student-container').classList.add('hidden');
    document.getElementById('single-search').classList.remove('hidden');
    document.getElementById('single-search').value = '';
}

async function handleSingleBillSubmit(e) {
    e.preventDefault();
    const billName = document.getElementById('single-bill-name').textContent;
    const amount = document.getElementById('single-bill-nominal-value').value;
    const studentId = document.getElementById('selected-student-id').value;
    const schoolYear = appData.activeSchoolYear?.name || '';

    if(!studentId) return alert("Pilih siswa terlebih dahulu.");

    try {
        const res = await apiCall('/api/bills/single', 'POST', { billName, amount: Number(amount), studentId, schoolYear });
        if(res.success) {
            alert(res.message);
            closeSingleBillModal();
            const newData = await (typeof window.refreshAppData === 'function'
                ? window.refreshAppData(true, { includeExistingBills: true })
                : apiCall('/api/initial-data'));
            appData.existingBills = newData.existingBills;
            appData.billStats = newData.billStats;
            updateBillStats();
            renderBillFilterOptions();
            renderHistoryTable(1);
        } else { alert(res.message); }
    } catch (err) { alert("Gagal menyimpan."); }
}
