let expenseRows = [];
let expenseCategories = [];
let teacherRows = [];
let expenseManageItems = [];
let expenseManageSource = null;
const expenseTableState = {
    currentPage: 1,
    rowsPerPage: 10,
    totalItems: 0
};
const getExpenseRole = () => String(appData?.role || '');
const isExpenseReadOnly = () => String(appData?.role || '') === 'super_admin';
const canManageExpenseMaster = () => getExpenseRole() === 'admin';
const canManageExpenseItems = () => {
    const role = getExpenseRole();
    return role === 'admin' || role === 'wali_kelas' || role === 'guru';
};

function getExpenseEffectiveRowsPerPage(totalItems) {
    return expenseTableState.rowsPerPage <= 0 ? Math.max(1, Number(totalItems || 0)) : expenseTableState.rowsPerPage;
}

function getExpenseItemsTotal(items = []) {
    return (Array.isArray(items) ? items : []).reduce((sum, item) => sum + Number(item.nominal || 0), 0);
}

function parseRupiahInput(value) {
    const digits = String(value || '').replace(/[^\d]/g, '');
    return Number(digits || 0);
}

function formatRupiahInput(value) {
    const num = Number(value || 0);
    if (!Number.isFinite(num) || num <= 0) return '';
    return num.toLocaleString('id-ID');
}

async function initPengeluaran() {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const fromEl = document.getElementById('expense-date-from');
    const toEl = document.getElementById('expense-date-to');
    if (fromEl) fromEl.value = firstDay.toISOString().slice(0, 10);
    if (toEl) toEl.value = today.toISOString().slice(0, 10);

    const form = document.getElementById('expense-form');
    if (form) form.onsubmit = submitExpenseForm;
    const categoryForm = document.getElementById('expense-category-form');
    if (categoryForm) categoryForm.onsubmit = submitCategoryForm;
    const exportForm = document.getElementById('expense-export-form');
    if (exportForm) exportForm.onsubmit = submitExpenseExportForm;
    const rowsEl = document.getElementById('expense-rows-per-page');
    if (rowsEl) rowsEl.value = expenseTableState.rowsPerPage <= 0 ? 'all' : String(expenseTableState.rowsPerPage);

    if (isExpenseReadOnly()) {
        document.getElementById('expense-write-actions')?.classList.add('hidden');
        await setupExpenseBranchFilter();
    } else if (canManageExpenseMaster()) {
        document.getElementById('expense-write-actions')?.classList.remove('hidden');
        await loadExpenseCategories();
        await loadExpenseTeachers();
    } else {
        document.getElementById('expense-write-actions')?.classList.add('hidden');
    }
    await loadExpenses();
}

async function loadExpenses() {
    const tbody = document.getElementById('expense-table-body');
    if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="text-center py-8 text-gray-400">Memuat data...</td></tr>';

    const q = new URLSearchParams();
    const dateFrom = String(document.getElementById('expense-date-from')?.value || '').trim();
    const dateTo = String(document.getElementById('expense-date-to')?.value || '').trim();
    if (dateFrom) q.set('date_from', dateFrom);
    if (dateTo) q.set('date_to', dateTo);
    if (isExpenseReadOnly()) {
        const branchId = String(document.getElementById('expense-branch-filter')?.value || '').trim();
        if (branchId) q.set('branch_id', branchId);
    }

    const res = await apiCall(`/api/expenses?${q.toString()}`);
    if (!res || res.success === false) {
        uiError(res?.message || 'Gagal memuat data pengeluaran.');
        if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="text-center py-8 text-rose-500">Gagal memuat data.</td></tr>';
        return;
    }
    expenseRows = Array.isArray(res.rows) ? res.rows : [];
    renderExpenseTable();
    renderExpenseSummary(res.summary || {});
}


function renderExpenseSummary(summary) {
    const totalNominalEl = document.getElementById('expense-total-nominal');
    const totalItemsEl = document.getElementById('expense-total-items');
    const periodEl = document.getElementById('expense-period-label');
    const from = String(document.getElementById('expense-date-from')?.value || '').trim();
    const to = String(document.getElementById('expense-date-to')?.value || '').trim();
    if (totalNominalEl) totalNominalEl.textContent = formatRp(summary.total_nominal || 0);
    if (totalItemsEl) totalItemsEl.textContent = Number(summary.total_items || 0).toLocaleString('id-ID');
    if (periodEl) periodEl.textContent = from && to ? `${from} s/d ${to}` : 'Semua Tanggal';
}

function getFilteredExpenseRows() {
    const keyword = String(document.getElementById('expense-search')?.value || '').trim().toLowerCase();
    return expenseRows.filter((r) => {
        if (!keyword) return true;
        return String(r.kategori || '').toLowerCase().includes(keyword) || String(r.deskripsi || '').toLowerCase().includes(keyword) || String(r.penanggung_jawab_nama || '').toLowerCase().includes(keyword) || String(r.nama_cabang || '').toLowerCase().includes(keyword);
    });
}

function renderExpenseTable() {
    const tbody = document.getElementById('expense-table-body');
    if (!tbody) return;
    const rows = getFilteredExpenseRows();

    expenseTableState.totalItems = rows.length;
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center py-8 text-gray-400">Belum ada data pengeluaran.</td></tr>';
        updateExpensePaginationInfo();
        return;
    }

    const effectiveRows = getExpenseEffectiveRowsPerPage(rows.length);
    const totalPages = Math.max(1, Math.ceil(rows.length / effectiveRows));
    if (expenseTableState.currentPage > totalPages) expenseTableState.currentPage = totalPages;
    if (expenseTableState.currentPage < 1) expenseTableState.currentPage = 1;
    const start = (expenseTableState.currentPage - 1) * effectiveRows;
    const end = start + effectiveRows;
    const pageRows = rows.slice(start, end);

    tbody.innerHTML = pageRows.map((r) => {
        const recurring = Number(r.is_recurring || 0) === 1;
        const active = Number(r.is_active || 0) === 1;
        const statusValue = String(r.report_status || 'belum');
        const statusBadge = statusValue === 'sudah'
            ? '<span class="inline-flex rounded-full px-2 py-1 text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">Sudah</span>'
            : '<span class="inline-flex rounded-full px-2 py-1 text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">Belum</span>';
        const statusCell = !canManageExpenseMaster()
            ? statusBadge
            : `<select onchange="changeExpenseReportStatus(${Number(r.id || 0)}, this.value)" class="text-xs border rounded-lg px-2 py-1 ${statusValue === 'sudah' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}">
                        <option value="belum" ${statusValue === 'belum' ? 'selected' : ''}>Belum</option>
                        <option value="sudah" ${statusValue === 'sudah' ? 'selected' : ''}>Sudah</option>
                    </select>`;
        const detailBtn = canManageExpenseItems()
            ? `<button onclick="openExpenseItemsManageModal(${Number(r.id || 0)})" class="text-emerald-600 hover:text-emerald-800 p-1" title="Tambah Rincian"><i class="fas fa-circle-plus"></i></button>`
            : `<button onclick="viewExpenseItems(${Number(r.id || 0)})" class="text-emerald-600 hover:text-emerald-800 p-1" title="Lihat Rincian Item"><i class="fas fa-list"></i></button>`;
        const actionCell = canManageExpenseMaster()
            ? `<div class="flex items-center justify-center gap-2">
                    ${detailBtn}
                    <button onclick="printExpenseReceipt(${Number(r.id || 0)})" class="text-slate-600 hover:text-slate-800 p-1" title="Print Tanda Terima"><i class="fas fa-print"></i></button>
                    <button onclick="editExpense(${Number(r.id || 0)})" class="text-blue-600 hover:text-blue-800 p-1" title="Edit"><i class="fas fa-pen-to-square"></i></button>
                    <button onclick="deleteExpense(${Number(r.id || 0)})" class="text-rose-600 hover:text-rose-800 p-1" title="Hapus"><i class="fas fa-trash"></i></button>
               </div>`
            : `<div class="flex items-center justify-center gap-2">
                    ${detailBtn}
                    <button onclick="printExpenseReceipt(${Number(r.id || 0)})" class="text-slate-600 hover:text-slate-800 p-1" title="Print Tanda Terima"><i class="fas fa-print"></i></button>
               </div>`;
        return `
            <tr class="hover:bg-gray-50">
                <td class="px-6 py-4 text-gray-700">${String(r.tanggal || '').slice(0, 10)}</td>
                <td class="px-6 py-4 text-gray-700">${escapeHtml(r.nama_cabang || '-')}</td>
                <td class="px-6 py-4 font-semibold text-gray-700">${escapeHtml(r.kategori || '-')}</td>
                <td class="px-6 py-4 text-gray-600">
                    ${escapeHtml(r.deskripsi || '-')}
                    ${Number(r.item_count || 0) > 0 ? `<div class="mt-1 text-[11px] text-emerald-600 font-semibold">${Number(r.item_count || 0)} rincian item</div>` : '<div class="mt-1 text-[11px] text-gray-400">Belum ada rincian</div>'}
                </td>
                <td class="px-6 py-4 text-center">
                    <span class="inline-flex rounded-full px-2 py-1 text-xs font-semibold ${recurring ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}">${recurring ? 'Bulanan' : 'Sekali'}</span>
                    ${recurring ? `<span class="ml-1 inline-flex rounded-full px-2 py-1 text-xs font-semibold ${active ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}">${active ? 'Aktif' : 'Nonaktif'}</span>` : ''}
                </td>
                <td class="px-6 py-4 text-gray-700">${escapeHtml(r.penanggung_jawab_nama || '-')}</td>
                <td class="px-6 py-4 text-center">${statusCell}</td>
                <td class="px-6 py-4 text-right font-bold text-rose-600">${formatRp(r.nominal || 0)}</td>
                <td class="px-6 py-4 text-center">${actionCell}</td>
            </tr>
        `;
    }).join('');

    updateExpensePaginationInfo();
}

function updateExpensePaginationInfo() {
    const infoEl = document.getElementById('expense-page-info');
    const prevEl = document.getElementById('btn-prev-expense');
    const nextEl = document.getElementById('btn-next-expense');
    const total = Number(expenseTableState.totalItems || 0);
    const effectiveRows = getExpenseEffectiveRowsPerPage(total);
    const start = total === 0 ? 0 : ((expenseTableState.currentPage - 1) * effectiveRows + 1);
    const end = total === 0 ? 0 : Math.min(start + effectiveRows - 1, total);
    if (infoEl) infoEl.textContent = `Menampilkan ${start} - ${end} dari ${total} data`;
    if (prevEl) prevEl.disabled = expenseTableState.currentPage <= 1;
    if (nextEl) nextEl.disabled = end >= total;
}

function changeExpenseRowsPerPage() {
    const raw = String(document.getElementById('expense-rows-per-page')?.value || '10').toLowerCase();
    const rows = Number(raw);
    expenseTableState.rowsPerPage = raw === 'all' ? 0 : ([10, 25, 50].includes(rows) ? rows : 10);
    expenseTableState.currentPage = 1;
    renderExpenseTable();
}

function prevExpensePage() {
    if (expenseTableState.currentPage <= 1) return;
    expenseTableState.currentPage -= 1;
    renderExpenseTable();
}

function nextExpensePage() {
    const total = Number(expenseTableState.totalItems || 0);
    const effectiveRows = getExpenseEffectiveRowsPerPage(total);
    const totalPages = Math.max(1, Math.ceil(total / effectiveRows));
    if (expenseTableState.currentPage >= totalPages) return;
    expenseTableState.currentPage += 1;
    renderExpenseTable();
}

function openExpenseModal() {
    if (!canManageExpenseMaster()) return;
    if (!expenseCategories.length) {
        uiWarn('Kategori belum tersedia. Tambahkan kategori terlebih dahulu.');
        openCategoryModal();
        return;
    }
    const modal = document.getElementById('expense-modal');
    const form = document.getElementById('expense-form');
    const title = document.getElementById('expense-modal-title');
    if (modal) modal.classList.remove('hidden');
    if (title) title.textContent = 'Tambah Pengeluaran';
    if (form) form.reset();
    document.getElementById('expense-id').value = '';
    document.getElementById('expense-tanggal').valueAsDate = new Date();
    document.getElementById('expense-active').checked = true;
    populateCategorySelect();
    populateTeacherSelect();
}

function closeExpenseModal() {
    document.getElementById('expense-modal')?.classList.add('hidden');
}

async function editExpense(id) {
    if (!canManageExpenseMaster()) return;
    const item = expenseRows.find((x) => Number(x.id) === Number(id));
    if (!item) return uiWarn('Data tidak ditemukan.');
    populateCategorySelect();
    populateTeacherSelect();
    const modal = document.getElementById('expense-modal');
    const title = document.getElementById('expense-modal-title');
    if (title) title.textContent = 'Edit Pengeluaran';
    if (modal) modal.classList.remove('hidden');
    document.getElementById('expense-id').value = item.id;
    document.getElementById('expense-tanggal').value = String(item.tanggal || '').slice(0, 10);
    document.getElementById('expense-category-id').value = String(item.category_id || '');
    document.getElementById('expense-deskripsi').value = item.deskripsi || '';
    document.getElementById('expense-nominal').value = Number(item.nominal || 0);
    document.getElementById('expense-penanggung-jawab').value = String(item.penanggung_jawab_id || '');
    if (!document.getElementById('expense-penanggung-jawab').value && item.penanggung_jawab_nama) {
        const customValue = `name:${item.penanggung_jawab_nama}`;
        const opt = document.createElement('option');
        opt.value = customValue;
        opt.textContent = item.penanggung_jawab_nama;
        document.getElementById('expense-penanggung-jawab').appendChild(opt);
        document.getElementById('expense-penanggung-jawab').value = customValue;
    }
    document.getElementById('expense-recurring').checked = Number(item.is_recurring || 0) === 1;
    document.getElementById('expense-active').checked = Number(item.is_active || 0) === 1;
}

async function submitExpenseForm(e) {
    if (!canManageExpenseMaster()) return;
    e.preventDefault();
    const id = Number(document.getElementById('expense-id').value || 0);
    const categorySelect = document.getElementById('expense-category-id');
    const teacherSelect = document.getElementById('expense-penanggung-jawab');
    const categoryId = Number(categorySelect?.value || 0);
    const teacherValue = String(teacherSelect?.value || '').trim();
    let penanggungJawabId = null;
    let penanggungJawabNama = '';
    if (teacherValue.startsWith('name:')) {
        penanggungJawabNama = teacherValue.replace(/^name:/, '').trim();
    } else {
        penanggungJawabId = Number(teacherValue || 0) || null;
        const teacher = teacherRows.find((t) => Number(t.id) === penanggungJawabId);
        penanggungJawabNama = teacher ? String(teacher.name || '').trim() : '';
    }
    const existing = id > 0 ? expenseRows.find((x) => Number(x.id) === Number(id)) : null;
    const payload = {
        tanggal: String(document.getElementById('expense-tanggal').value || '').trim(),
        category_id: categoryId,
        deskripsi: String(document.getElementById('expense-deskripsi').value || '').trim(),
        nominal: Number(document.getElementById('expense-nominal').value || 0),
        report_status: String(existing?.report_status || 'belum'),
        penanggung_jawab_id: penanggungJawabId,
        penanggung_jawab_nama: penanggungJawabNama,
        is_recurring: document.getElementById('expense-recurring').checked ? 1 : 0,
        is_active: document.getElementById('expense-active').checked ? 1 : 0
    };
    const endpoint = id > 0 ? `/api/expenses/${id}` : '/api/expenses';
    const method = id > 0 ? 'PUT' : 'POST';
    const res = await apiCall(endpoint, method, payload);
    if (!res || res.success === false) {
        uiError(res?.message || 'Gagal menyimpan pengeluaran.');
        return;
    }
    closeExpenseModal();
    uiSuccess(res.message || 'Data pengeluaran tersimpan.');
    await loadExpenses();
}

async function deleteExpense(id) {
    if (!canManageExpenseMaster()) return;
    if (!(await uiConfirm('Hapus data pengeluaran ini?', 'Konfirmasi Hapus'))) return;
    const res = await apiCall(`/api/expenses/${id}`, 'DELETE');
    if (!res || res.success === false) {
        uiError(res?.message || 'Gagal menghapus data.');
        return;
    }
    uiSuccess(res.message || 'Data pengeluaran dihapus.');
    await loadExpenses();
}

async function changeExpenseReportStatus(id, status) {
    if (!canManageExpenseMaster()) return;
    const value = String(status || '').trim().toLowerCase();
    if (!['belum', 'sudah'].includes(value)) return;
    const res = await apiCall(`/api/expenses/${id}/report-status`, 'PUT', { report_status: value });
    if (!res || res.success === false) {
        uiError(res?.message || 'Gagal mengubah status laporan.');
        await loadExpenses();
        return;
    }
    const row = expenseRows.find((x) => Number(x.id) === Number(id));
    if (row) row.report_status = value;
    uiSuccess(res.message || 'Status laporan diperbarui.');
    renderExpenseTable();
}

function resetExpenseFilter() {
    document.getElementById('expense-search').value = '';
    document.getElementById('expense-date-from').value = '';
    document.getElementById('expense-date-to').value = '';
    if (isExpenseReadOnly()) {
        const branchEl = document.getElementById('expense-branch-filter');
        if (branchEl) branchEl.value = '';
    }
    expenseTableState.currentPage = 1;
    loadExpenses();
}

async function setupExpenseBranchFilter() {
    const wrap = document.getElementById('expense-branch-filter-wrap');
    const select = document.getElementById('expense-branch-filter');
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
        ...branches.map((b) => `<option value="${Number(b.id || 0)}">${escapeHtml(b.nama_cabang || '-')}</option>`)
    ].join('');
}

async function loadExpenseCategories() {
    if (!canManageExpenseMaster()) return;
    const res = await apiCall('/api/expense-categories');
    if (!res || res.success === false) {
        uiError(res?.message || 'Gagal memuat kategori pengeluaran.');
        expenseCategories = [];
        populateCategorySelect();
        return;
    }
    expenseCategories = Array.isArray(res.rows) ? res.rows.filter((r) => Number(r.is_active || 0) === 1) : [];
    populateCategorySelect();
}

function populateCategorySelect() {
    const select = document.getElementById('expense-category-id');
    if (!select) return;
    if (!expenseCategories.length) {
        select.innerHTML = '<option value="">Belum ada kategori. Tambahkan dulu.</option>';
        return;
    }
    select.innerHTML = [
        '<option value="">-- Pilih Kategori --</option>',
        ...expenseCategories.map((r) => `<option value="${Number(r.id || 0)}">${escapeHtml(r.category_name || '-')}</option>`)
    ].join('');
}

function openCategoryModal() {
    if (!canManageExpenseMaster()) return;
    document.getElementById('expense-category-modal')?.classList.remove('hidden');
    document.getElementById('expense-category-name').value = '';
}

function closeCategoryModal() {
    document.getElementById('expense-category-modal')?.classList.add('hidden');
}

async function submitCategoryForm(e) {
    if (!canManageExpenseMaster()) return;
    e.preventDefault();
    const categoryName = String(document.getElementById('expense-category-name')?.value || '').trim();
    if (!categoryName) {
        uiWarn('Nama kategori wajib diisi.');
        return;
    }
    const res = await apiCall('/api/expense-categories', 'POST', { category_name: categoryName });
    if (!res || res.success === false) {
        uiError(res?.message || 'Gagal menyimpan kategori.');
        return;
    }
    uiSuccess(res.message || 'Kategori tersimpan.');
    closeCategoryModal();
    await loadExpenseCategories();
}

async function loadExpenseTeachers() {
    if (!canManageExpenseMaster()) return;
    const res = await apiCall('/api/expenses/teachers');
    if (!res || res.success === false) {
        teacherRows = [];
        populateTeacherSelect();
        uiWarn(res?.message || 'Data guru PDMADA tidak tersedia.');
        return;
    }
    teacherRows = Array.isArray(res.rows) ? res.rows : [];
    populateTeacherSelect();
    if (res.warning) uiWarn(res.warning);
}

function populateTeacherSelect() {
    const select = document.getElementById('expense-penanggung-jawab');
    if (!select) return;
    if (!teacherRows.length) {
        select.innerHTML = '<option value="">Guru tidak tersedia</option>';
        return;
    }
    select.innerHTML = [
        '<option value="">-- Pilih Penanggung Jawab --</option>',
        ...teacherRows.map((t) => `<option value="${Number(t.id || 0)}">${escapeHtml(t.name || '-')} ${t.niy ? `(${escapeHtml(t.niy)})` : ''}</option>`)
    ].join('');
}

function renderExpenseManageItemRows() {
    const tbody = document.getElementById('expense-items-manage-body');
    const emptyEl = document.getElementById('expense-items-manage-empty');
    const totalEl = document.getElementById('expense-items-manage-total');
    if (!tbody || !emptyEl || !totalEl) return;
    tbody.innerHTML = expenseManageItems.map((item, index) => `
        <tr class="border-t border-gray-100">
            <td class="px-2 py-2 text-center text-gray-500 font-semibold">${index + 1}</td>
            <td class="px-2 py-2">
                <input type="text" value="${escapeHtml(item.item_name || '')}" class="w-full border rounded px-2 py-1 text-xs" placeholder="Nama item" oninput="updateManageExpenseItemField(${index}, 'item_name', this.value)">
            </td>
            <td class="px-2 py-2">
                <input type="text" value="${escapeHtml(item.item_description || '')}" class="w-full border rounded px-2 py-1 text-xs" placeholder="Keterangan (opsional)" oninput="updateManageExpenseItemField(${index}, 'item_description', this.value)">
            </td>
            <td class="px-2 py-2">
                <input type="text" inputmode="numeric" value="${formatRupiahInput(item.nominal)}" class="w-full border rounded px-2 py-1 text-xs text-right" placeholder="0" oninput="updateManageExpenseItemNominal(${index}, this)">
            </td>
            <td class="px-2 py-2 text-center">
                <button type="button" onclick="removeManageExpenseItemRow(${index})" class="text-rose-600 hover:text-rose-800" title="Hapus baris">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
    emptyEl.classList.toggle('hidden', expenseManageItems.length > 0);
    totalEl.textContent = formatRp(getExpenseItemsTotal(expenseManageItems));
}

async function openExpenseItemsManageModal(id) {
    if (!canManageExpenseItems()) return;
    const row = expenseRows.find((x) => Number(x.id) === Number(id));
    if (!row) return uiWarn('Data pengeluaran tidak ditemukan.');
    const res = await apiCall(`/api/expenses/${Number(id || 0)}/items`);
    if (!res || res.success === false) {
        uiError(res?.message || 'Gagal memuat rincian pengeluaran.');
        return;
    }
    expenseManageSource = row;
    expenseManageItems = (Array.isArray(res.items) ? res.items : []).map((it) => ({
        item_name: String(it.item_name || '').trim(),
        item_description: String(it.item_description || '').trim(),
        nominal: Number(it.nominal || 0)
    }));
    const headEl = document.getElementById('expense-items-manage-head');
    if (headEl) {
        headEl.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div class="rounded-lg border border-gray-100 p-2"><span class="font-semibold">Tanggal:</span> ${escapeHtml(String(row.tanggal || '').slice(0, 10))}</div>
                <div class="rounded-lg border border-gray-100 p-2"><span class="font-semibold">Kategori:</span> ${escapeHtml(row.kategori || '-')}</div>
                <div class="rounded-lg border border-gray-100 p-2 md:col-span-2"><span class="font-semibold">Deskripsi:</span> ${escapeHtml(row.deskripsi || '-')}</div>
                <div class="rounded-lg border border-gray-100 p-2"><span class="font-semibold">Nominal Parent:</span> ${formatRp(row.nominal || 0)}</div>
                <div class="rounded-lg border border-gray-100 p-2"><span class="font-semibold">Status Laporan:</span> ${escapeHtml(String(row.report_status || '-'))}</div>
            </div>
        `;
    }
    renderExpenseManageItemRows();
    document.getElementById('expense-items-manage-modal')?.classList.remove('hidden');
}

function closeExpenseItemsManageModal() {
    document.getElementById('expense-items-manage-modal')?.classList.add('hidden');
    expenseManageSource = null;
    expenseManageItems = [];
}

function addManageExpenseItemRow() {
    expenseManageItems.push({ item_name: '', item_description: '', nominal: 0 });
    renderExpenseManageItemRows();
}

function removeManageExpenseItemRow(index) {
    if (index < 0 || index >= expenseManageItems.length) return;
    expenseManageItems.splice(index, 1);
    renderExpenseManageItemRows();
}

function updateManageExpenseItemField(index, key, value) {
    if (!expenseManageItems[index]) return;
    expenseManageItems[index][key] = String(value || '');
    const totalEl = document.getElementById('expense-items-manage-total');
    if (totalEl) totalEl.textContent = formatRp(getExpenseItemsTotal(expenseManageItems));
}

function updateManageExpenseItemNominal(index, inputEl) {
    if (!expenseManageItems[index] || !inputEl) return;
    const nominal = parseRupiahInput(inputEl.value);
    expenseManageItems[index].nominal = nominal;
    inputEl.value = formatRupiahInput(nominal);
    const totalEl = document.getElementById('expense-items-manage-total');
    if (totalEl) totalEl.textContent = formatRp(getExpenseItemsTotal(expenseManageItems));
}

function getManageExpenseExportRows() {
    return expenseManageItems
        .map((item, index) => ({
            no: index + 1,
            item: String(item.item_name || '').trim(),
            deskripsi: String(item.item_description || '').trim(),
            nominal: Number(item.nominal || 0)
        }))
        .filter((row) => row.item && Number.isFinite(row.nominal) && row.nominal > 0);
}

function exportManageExpenseItemsExcel() {
    const src = expenseManageSource;
    if (!src) return uiWarn('Buka rincian pengeluaran terlebih dahulu.');
    const rows = getManageExpenseExportRows();
    if (!rows.length) return uiWarn('Tidak ada rincian item untuk di-export.');
    const exportRows = rows.map((row) => ({
        no: row.no,
        item: row.item,
        deskripsi: row.deskripsi || '-',
        nominal: row.nominal
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportRows);
    XLSX.utils.book_append_sheet(wb, ws, 'Rincian');
    const datePart = String(src.tanggal || '').slice(0, 10) || 'tanpa-tanggal';
    const fileName = `rincian-pengeluaran-${Number(src.id || 0)}-${datePart}.xlsx`;
    XLSX.writeFile(wb, fileName);
    uiSuccess('Rincian pengeluaran berhasil di-export ke Excel.');
}

function exportManageExpenseItemsPdf() {
    const src = expenseManageSource;
    if (!src) return uiWarn('Buka rincian pengeluaran terlebih dahulu.');
    const rows = getManageExpenseExportRows();
    if (!rows.length) return uiWarn('Tidak ada rincian item untuk di-export.');
    const total = rows.reduce((sum, row) => sum + Number(row.nominal || 0), 0);
    const w = window.open('', '', 'width=1000,height=700');
    if (!w) return uiWarn('Popup diblokir browser. Izinkan popup untuk export PDF.');
    const htmlRows = rows.map((row) => `
        <tr>
            <td>${row.no}</td>
            <td>${escapeHtml(row.item)}</td>
            <td>${escapeHtml(row.deskripsi || '-')}</td>
            <td style="text-align:right">${formatRp(row.nominal)}</td>
        </tr>
    `).join('');
    const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Rincian Pengeluaran #${Number(src.id || 0)}</title>
<style>
  body { font-family: Arial, sans-serif; margin: 20px; color: #111827; }
  h1 { font-size: 18px; margin: 0 0 8px; }
  .meta { font-size: 12px; margin-bottom: 10px; color: #4b5563; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #d1d5db; padding: 6px 8px; }
  th { background: #f3f4f6; text-align: left; }
  .total { margin-top: 10px; font-weight: 700; text-align: right; }
</style>
</head>
<body>
  <h1>Rincian Pengeluaran</h1>
  <div class="meta">Tanggal: ${escapeHtml(String(src.tanggal || '').slice(0, 10) || '-')} | Kategori: ${escapeHtml(src.kategori || '-')} | Deskripsi: ${escapeHtml(src.deskripsi || '-')}</div>
  <table>
    <thead>
      <tr><th style="width:50px">No</th><th>Item</th><th>Deskripsi</th><th style="width:140px;text-align:right">Nominal</th></tr>
    </thead>
    <tbody>${htmlRows}</tbody>
  </table>
  <div class="total">Total Rincian: ${formatRp(total)}</div>
  <script>window.onload = function(){ window.print(); };</script>
</body>
</html>`;
    w.document.open();
    w.document.write(html);
    w.document.close();
}

async function saveExpenseItemsDetail() {
    if (!canManageExpenseItems()) return;
    const src = expenseManageSource;
    if (!src || !Number(src.id)) return uiWarn('Data sumber tidak ditemukan.');
    const items = expenseManageItems
        .map((it) => ({
            item_name: String(it.item_name || '').trim(),
            item_description: String(it.item_description || '').trim(),
            nominal: Number(it.nominal || 0)
        }))
        .filter((it) => it.item_name && Number.isFinite(it.nominal) && it.nominal > 0);
    const payload = {
        tanggal: String(src.tanggal || '').slice(0, 10),
        category_id: Number(src.category_id || 0),
        deskripsi: String(src.deskripsi || '').trim(),
        nominal: items.length ? getExpenseItemsTotal(items) : Number(src.nominal || 0),
        report_status: String(src.report_status || 'belum'),
        penanggung_jawab_id: Number(src.penanggung_jawab_id || 0) || null,
        penanggung_jawab_nama: String(src.penanggung_jawab_nama || '').trim(),
        is_recurring: Number(src.is_recurring || 0) === 1 ? 1 : 0,
        is_active: Number(src.is_active || 0) === 1 ? 1 : 0,
        items
    };
    const res = await apiCall(`/api/expenses/${Number(src.id)}`, 'PUT', payload);
    if (!res || res.success === false) {
        uiError(res?.message || 'Gagal menyimpan rincian.');
        return;
    }
    closeExpenseItemsManageModal();
    uiSuccess(res.message || 'Rincian pengeluaran berhasil disimpan.');
    await loadExpenses();
}

function openExpenseExportModal() {
    document.getElementById('expense-export-modal')?.classList.remove('hidden');
}

function closeExpenseExportModal() {
    document.getElementById('expense-export-modal')?.classList.add('hidden');
}

function getSelectedExpenseExportType() {
    const checked = document.querySelector('input[name="expense_export_type"]:checked');
    return String(checked?.value || 'summary');
}

function toCsv(rows = []) {
    if (!Array.isArray(rows) || !rows.length) return '';
    const headers = Object.keys(rows[0]);
    const escapeCell = (value) => {
        const raw = value == null ? '' : String(value);
        if (/[",\n]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
        return raw;
    };
    const lines = [
        headers.join(','),
        ...rows.map((row) => headers.map((key) => escapeCell(row[key])).join(','))
    ];
    return lines.join('\n');
}

function downloadCsv(filename, csvContent) {
    const blob = new Blob(['\uFEFF', csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function getExpenseExportBaseName(type) {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    if (type === 'detail_items') return `laporan-pengeluaran-rincian-${stamp}.csv`;
    if (type === 'detail') return `laporan-pengeluaran-detail-${stamp}.csv`;
    return `laporan-pengeluaran-ringkasan-${stamp}.csv`;
}

async function submitExpenseExportForm(e) {
    e.preventDefault();
    const type = getSelectedExpenseExportType();
    const rows = getFilteredExpenseRows();
    if (!rows.length) {
        uiWarn('Tidak ada data untuk di-export.');
        return;
    }

    if (type === 'summary') {
        const summaryMap = new Map();
        rows.forEach((row) => {
            const key = String(row.kategori || '-');
            if (!summaryMap.has(key)) summaryMap.set(key, { kategori: key, jumlah_transaksi: 0, total_nominal: 0, total_rincian_item: 0 });
            const item = summaryMap.get(key);
            item.jumlah_transaksi += 1;
            item.total_nominal += Number(row.nominal || 0);
            item.total_rincian_item += Number(row.item_count || 0);
        });
        const exportRows = Array.from(summaryMap.values())
            .sort((a, b) => a.kategori.localeCompare(b.kategori))
            .map((row) => ({
                kategori: row.kategori,
                jumlah_transaksi: row.jumlah_transaksi,
                total_rincian_item: row.total_rincian_item,
                total_nominal: row.total_nominal
            }));
        const csv = toCsv(exportRows);
        downloadCsv(getExpenseExportBaseName(type), csv);
        closeExpenseExportModal();
        uiSuccess('Laporan ringkasan berhasil di-download.');
        return;
    }

    if (type === 'detail') {
        const exportRows = rows.map((row, idx) => ({
            no: idx + 1,
            tanggal: String(row.tanggal || '').slice(0, 10),
            bendahara: row.nama_cabang || '-',
            kategori: row.kategori || '-',
            deskripsi: row.deskripsi || '-',
            penanggung_jawab: row.penanggung_jawab_nama || '-',
            tipe: Number(row.is_recurring || 0) === 1 ? 'Bulanan' : 'Sekali',
            status_laporan: row.report_status || 'belum',
            jumlah_rincian: Number(row.item_count || 0),
            nominal: Number(row.nominal || 0)
        }));
        const csv = toCsv(exportRows);
        downloadCsv(getExpenseExportBaseName(type), csv);
        closeExpenseExportModal();
        uiSuccess('Laporan detail berhasil di-download.');
        return;
    }

    const flatRows = [];
    for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        const detailRes = await apiCall(`/api/expenses/${Number(row.id || 0)}/items`);
        const items = detailRes?.success && Array.isArray(detailRes.items) ? detailRes.items : [];
        if (!items.length) {
            flatRows.push({
                no: flatRows.length + 1,
                tanggal: String(row.tanggal || '').slice(0, 10),
                bendahara: row.nama_cabang || '-',
                kategori: row.kategori || '-',
                deskripsi_transaksi: row.deskripsi || '-',
                item: '-',
                deskripsi_item: '-',
                nominal_item: 0,
                nominal_parent: Number(row.nominal || 0),
                status_laporan: row.report_status || 'belum'
            });
            continue;
        }
        items.forEach((item) => {
            flatRows.push({
                no: flatRows.length + 1,
                tanggal: String(row.tanggal || '').slice(0, 10),
                bendahara: row.nama_cabang || '-',
                kategori: row.kategori || '-',
                deskripsi_transaksi: row.deskripsi || '-',
                item: item.item_name || '-',
                deskripsi_item: item.item_description || '-',
                nominal_item: Number(item.nominal || 0),
                nominal_parent: Number(row.nominal || 0),
                status_laporan: row.report_status || 'belum'
            });
        });
    }
    const csv = toCsv(flatRows);
    downloadCsv(getExpenseExportBaseName(type), csv);
    closeExpenseExportModal();
    uiSuccess('Laporan detail + rincian berhasil di-download.');
}

async function viewExpenseItems(id) {
    const res = await apiCall(`/api/expenses/${Number(id || 0)}/items`);
    if (!res || res.success === false) {
        uiError(res?.message || 'Gagal memuat rincian pengeluaran.');
        return;
    }
    const expense = res.expense || {};
    const items = Array.isArray(res.items) ? res.items : [];
    const headEl = document.getElementById('expense-items-view-head');
    const bodyEl = document.getElementById('expense-items-view-body');
    const totalEl = document.getElementById('expense-items-view-total');
    if (!headEl || !bodyEl || !totalEl) return;

    headEl.innerHTML = `
        <div><span class="font-semibold">Tanggal:</span> ${escapeHtml(String(expense.tanggal || '').slice(0, 10) || '-')}</div>
        <div><span class="font-semibold">Kategori:</span> ${escapeHtml(expense.kategori || '-')}</div>
        <div><span class="font-semibold">Deskripsi:</span> ${escapeHtml(expense.deskripsi || '-')}</div>
    `;
    if (!items.length) {
        bodyEl.innerHTML = '<tr><td colspan="3" class="px-3 py-6 text-center text-gray-400">Belum ada rincian item.</td></tr>';
        totalEl.textContent = formatRp(expense.nominal || 0);
    } else {
        bodyEl.innerHTML = items.map((it) => `
            <tr class="border-t border-gray-100">
                <td class="px-3 py-2">${escapeHtml(it.item_name || '-')}</td>
                <td class="px-3 py-2">${escapeHtml(it.item_description || '-')}</td>
                <td class="px-3 py-2 text-right font-semibold text-rose-600">${formatRp(it.nominal || 0)}</td>
            </tr>
        `).join('');
        totalEl.textContent = formatRp(items.reduce((sum, it) => sum + Number(it.nominal || 0), 0));
    }
    document.getElementById('expense-items-view-modal')?.classList.remove('hidden');
}

function closeExpenseItemsViewModal() {
    document.getElementById('expense-items-view-modal')?.classList.add('hidden');
}

async function printExpenseReceipt(id) {
    const res = await apiCall(`/api/expenses/${id}/receipt`);
    if (!res || res.success === false || !res.data) {
        uiError(res?.message || 'Gagal memuat data tanda terima.');
        return;
    }
    const d = res.data;
    const nominalAngka = Number(d.nominal || 0);
    const nominal = formatRp(nominalAngka);
    const tglRaw = String(d.tanggal || '').slice(0, 10);
    const tgl = tglRaw ? new Date(tglRaw).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '-';
    let settings = appData.settings || null;
    if (!settings) settings = await apiCall('/api/settings');
    const kontak = [settings?.telepon, settings?.email].filter(Boolean).join(' | ');
    const footerNote = settings?.footer_kwitansi || 'Simpan tanda terima ini sebagai bukti pengeluaran yang sah.';
    const terbilang = (typeof katakan === 'function' ? katakan(nominalAngka) : String(nominalAngka)) + ' Rupiah';
    const qrPayload = `SKS-EXP|NO:${d.receipt_no}|DATE:${tgl}|CAT:${d.kategori}|AMOUNT:${Number(d.nominal || 0)}|RESP:${d.penerima_nama}`;
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(qrPayload)}`;
    const w = window.open('', '', 'width=1024,height=720');
    if (!w) {
        uiWarn('Popup diblokir browser. Izinkan popup untuk mencetak.');
        return;
    }
    const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Tanda Terima Pengeluaran</title>
<style>
  @page { size: 20cm 9cm; margin: 0; }
  body { font-family: 'Courier New', Courier, monospace; margin: 0; padding: 0; color: #000; width: 20cm; height: 9cm; }
  .print-wrap { width: 20cm; height: 9cm; padding: 6mm; box-sizing: border-box; }
  .container { border: 2px solid #333; padding: 10px; position: relative; width: 100%; height: 100%; box-sizing: border-box; overflow: hidden; }
  .watermark { position: absolute; top: 52%; left: 50%; transform: translate(-50%, -50%) rotate(-16deg); font-size: 48px; color: rgba(0,0,0,0.03); font-weight: 700; border: 4px solid rgba(0,0,0,0.03); padding: 4px 18px; z-index: -1; white-space: nowrap; }
  .layout { display: grid; grid-template-columns: 1fr 96px; gap: 10px; height: 100%; }
  .left { display: flex; flex-direction: column; min-width: 0; }
  .right { display: flex; flex-direction: column; align-items: center; justify-content: space-between; padding-left: 4px; border-left: 1px dashed #999; }
  .header { text-align: center; border-bottom: 2px double #333; padding-bottom: 4px; margin-bottom: 6px; }
  .school-name { font-size: 16px; font-weight: bold; text-transform: uppercase; letter-spacing: .8px; line-height: 1.1; }
  .address { font-size: 8px; margin-top: 2px; line-height: 1.2; }
  .title { text-align: center; font-size: 11px; font-weight: bold; text-decoration: underline; margin: 4px 0 6px; letter-spacing: .4px; }
  .row { display: flex; margin-bottom: 3px; font-size: 9px; line-height: 1.2; }
  .label { width: 98px; font-weight: bold; }
  .sep { width: 8px; text-align: center; }
  .value { flex: 1; border-bottom: 1px dotted #ccc; text-transform: uppercase; min-width: 0; }
  .amount-box { margin-top: 5px; padding: 6px 8px; border: 2px solid #000; font-weight: bold; font-size: 14px; display: inline-block; background: #f0f0f0; box-shadow: 1px 1px 0px #ccc; }
  .footer { margin-top: 6px; display: flex; gap: 8px; align-items: flex-end; }
  .signature-left { text-align: left; font-size: 8px; flex: 1; line-height: 1.25; }
  .signature-right { text-align: center; width: 160px; font-size: 8px; }
  .sign-line { margin-top: 18px; border-bottom: 1px solid #000; }
  .qr-box { text-align: center; }
  .qr-box img { width: 74px; height: 74px; border: 1px solid #ddd; padding: 3px; background: #fff; }
  .qr-caption { font-size: 8px; margin-top: 2px; text-align: center; line-height: 1.15; word-break: break-word; }
  @media print { html, body { width: 20cm; height: 9cm; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
  <div class="print-wrap">
    <div class="container">
      <div class="watermark">MA ABU DARRIN</div>
      <div class="layout">
        <div class="left">
          <div class="header">
            <div class="school-name">${escapeHtml(d.school_name || 'SKS')}</div>
            <div class="address">${escapeHtml(d.school_address || '-')}${kontak ? `<br>${escapeHtml(kontak)}` : ''}</div>
          </div>
          <div class="title">TANDA TERIMA PENGELUARAN</div>

          <div class="row"><div class="label">No. Dokumen</div><div class="sep">:</div><div class="value">${escapeHtml(d.receipt_no)}</div></div>
          <div class="row"><div class="label">Cabang</div><div class="sep">:</div><div class="value">${escapeHtml(d.branch_name || '-')}</div></div>
          <div class="row"><div class="label">Terima Oleh</div><div class="sep">:</div><div class="value"><b>${escapeHtml(d.penerima_nama || '-')}</b></div></div>
          <div class="row"><div class="label">Kategori</div><div class="sep">:</div><div class="value">${escapeHtml(d.kategori || '-')}</div></div>
          <div class="row"><div class="label">Deskripsi</div><div class="sep">:</div><div class="value">${escapeHtml(d.deskripsi || '-')}</div></div>
          <div class="row"><div class="label">Uang Sejumlah</div><div class="sep">:</div><div class="value" style="font-style:italic; text-transform: capitalize;"># ${escapeHtml(terbilang)} #</div></div>

          <div class="amount-box">${escapeHtml(nominal)}</div>

          <div class="footer">
            <div class="signature-left"><b>Catatan:</b><br>${escapeHtml(footerNote)}</div>
            <div class="signature-right">${escapeHtml(tgl)}<br>Admin Keuangan,<br><br><div class="sign-line"></div>${escapeHtml(d.admin_keuangan_nama || '-')}</div>
          </div>
        </div>
        <div class="right">
          <div class="qr-box"><img src="${qrImageUrl}" alt="QR ${escapeHtml(d.receipt_no)}"><div class="qr-caption">${escapeHtml(d.receipt_no)}</div></div>
          <div class="signature-right" style="width:100%;">Penerima,<br><br><div class="sign-line"></div>${escapeHtml(d.penerima_nama || '-')}</div>
          <div class="qr-caption">${escapeHtml(tgl)}</div>
        </div>
      </div>
    </div>
  </div>
  <script>window.onload = function(){ window.print(); };</script>
</body>
</html>`;
    w.document.open();
    w.document.write(html);
    w.document.close();
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
