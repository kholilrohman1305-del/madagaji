let otherIncomeRows = [];
const otherIncomeTableState = {
    currentPage: 1,
    rowsPerPage: 10,
    totalItems: 0
};
const isOtherIncomeReadOnly = () => String(appData?.role || '') === 'super_admin';

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getOtherIncomeEffectiveRowsPerPage(totalItems) {
    return otherIncomeTableState.rowsPerPage <= 0 ? Math.max(1, Number(totalItems || 0)) : otherIncomeTableState.rowsPerPage;
}

async function initPemasukanLain() {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const fromEl = document.getElementById('other-income-date-from');
    const toEl = document.getElementById('other-income-date-to');
    if (fromEl) fromEl.value = firstDay.toISOString().slice(0, 10);
    if (toEl) toEl.value = today.toISOString().slice(0, 10);

    const form = document.getElementById('other-income-form');
    if (form) form.onsubmit = submitOtherIncomeForm;
    const rowsEl = document.getElementById('other-income-rows-per-page');
    if (rowsEl) rowsEl.value = otherIncomeTableState.rowsPerPage <= 0 ? 'all' : String(otherIncomeTableState.rowsPerPage);

    if (isOtherIncomeReadOnly()) {
        document.getElementById('other-income-action-wrap')?.classList.add('hidden');
        await setupOtherIncomeBranchFilter();
    } else {
        document.getElementById('other-income-action-wrap')?.classList.remove('hidden');
    }
    await loadOtherIncomes();
}

async function loadOtherIncomes() {
    const tbody = document.getElementById('other-income-table-body');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-400">Memuat data...</td></tr>';

    const q = new URLSearchParams();
    const dateFrom = String(document.getElementById('other-income-date-from')?.value || '').trim();
    const dateTo = String(document.getElementById('other-income-date-to')?.value || '').trim();
    if (dateFrom) q.set('date_from', dateFrom);
    if (dateTo) q.set('date_to', dateTo);
    if (isOtherIncomeReadOnly()) {
        const branchId = String(document.getElementById('other-income-branch-filter')?.value || '').trim();
        if (branchId) q.set('branch_id', branchId);
    }

    const res = await apiCall(`/api/other-incomes?${q.toString()}`);
    if (!res || res.success === false) {
        uiError(res?.message || 'Gagal memuat data pemasukan lain.');
        if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-rose-500">Gagal memuat data.</td></tr>';
        return;
    }
    otherIncomeRows = Array.isArray(res.rows) ? res.rows : [];
    renderOtherIncomeTable();
    renderOtherIncomeSummary(res.summary || {});
}

function renderOtherIncomeSummary(summary) {
    const totalNominalEl = document.getElementById('other-income-total-nominal');
    const totalItemsEl = document.getElementById('other-income-total-items');
    const periodEl = document.getElementById('other-income-period-label');
    const from = String(document.getElementById('other-income-date-from')?.value || '').trim();
    const to = String(document.getElementById('other-income-date-to')?.value || '').trim();
    if (totalNominalEl) totalNominalEl.textContent = formatRp(summary.total_nominal || 0);
    if (totalItemsEl) totalItemsEl.textContent = Number(summary.total_items || 0).toLocaleString('id-ID');
    if (periodEl) periodEl.textContent = from && to ? `${from} s/d ${to}` : 'Semua Tanggal';
}

function renderOtherIncomeTable() {
    const tbody = document.getElementById('other-income-table-body');
    if (!tbody) return;
    const keyword = String(document.getElementById('other-income-search')?.value || '').trim().toLowerCase();
    const rows = otherIncomeRows.filter((r) => {
        if (!keyword) return true;
        return String(r.sumber || '').toLowerCase().includes(keyword)
            || String(r.deskripsi || '').toLowerCase().includes(keyword)
            || String(r.nama_cabang || '').toLowerCase().includes(keyword);
    });

    otherIncomeTableState.totalItems = rows.length;
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-400">Belum ada data pemasukan lain.</td></tr>';
        updateOtherIncomePaginationInfo();
        return;
    }

    const effectiveRows = getOtherIncomeEffectiveRowsPerPage(rows.length);
    const totalPages = Math.max(1, Math.ceil(rows.length / effectiveRows));
    if (otherIncomeTableState.currentPage > totalPages) otherIncomeTableState.currentPage = totalPages;
    if (otherIncomeTableState.currentPage < 1) otherIncomeTableState.currentPage = 1;
    const start = (otherIncomeTableState.currentPage - 1) * effectiveRows;
    const end = start + effectiveRows;
    const pageRows = rows.slice(start, end);

    tbody.innerHTML = pageRows.map((r) => {
        const statusValue = String(r.report_status || 'belum');
        const statusBadge = statusValue === 'sudah'
            ? '<span class="inline-flex rounded-full px-2 py-1 text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">Sudah</span>'
            : '<span class="inline-flex rounded-full px-2 py-1 text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">Belum</span>';
        const statusCell = isOtherIncomeReadOnly()
            ? statusBadge
            : `<select onchange="changeOtherIncomeReportStatus(${Number(r.id || 0)}, this.value)" class="text-xs border rounded-lg px-2 py-1 ${statusValue === 'sudah' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}">
                    <option value="belum" ${statusValue === 'belum' ? 'selected' : ''}>Belum</option>
                    <option value="sudah" ${statusValue === 'sudah' ? 'selected' : ''}>Sudah</option>
               </select>`;
        const actionCell = isOtherIncomeReadOnly()
            ? '<span class="text-xs text-gray-400">Read only</span>'
            : `<div class="flex items-center justify-center gap-2">
                    <button onclick="editOtherIncome(${Number(r.id || 0)})" class="text-blue-600 hover:text-blue-800 p-1" title="Edit"><i class="fas fa-pen-to-square"></i></button>
                    <button onclick="deleteOtherIncome(${Number(r.id || 0)})" class="text-rose-600 hover:text-rose-800 p-1" title="Hapus"><i class="fas fa-trash"></i></button>
               </div>`;
        return `
            <tr class="hover:bg-gray-50">
                <td class="px-6 py-4 text-gray-700">${String(r.tanggal || '').slice(0, 10)}</td>
                <td class="px-6 py-4 text-gray-700">${escapeHtml(r.nama_cabang || '-')}</td>
                <td class="px-6 py-4 font-semibold text-gray-700">${escapeHtml(r.sumber || '-')}</td>
                <td class="px-6 py-4 text-gray-600">${escapeHtml(r.deskripsi || '-')}</td>
                <td class="px-6 py-4 text-center">${statusCell}</td>
                <td class="px-6 py-4 text-right font-bold text-emerald-600">${formatRp(r.nominal || 0)}</td>
                <td class="px-6 py-4 text-center">${actionCell}</td>
            </tr>
        `;
    }).join('');

    updateOtherIncomePaginationInfo();
}

function updateOtherIncomePaginationInfo() {
    const infoEl = document.getElementById('other-income-page-info');
    const prevEl = document.getElementById('btn-prev-other-income');
    const nextEl = document.getElementById('btn-next-other-income');
    const total = Number(otherIncomeTableState.totalItems || 0);
    const effectiveRows = getOtherIncomeEffectiveRowsPerPage(total);
    const start = total === 0 ? 0 : ((otherIncomeTableState.currentPage - 1) * effectiveRows + 1);
    const end = total === 0 ? 0 : Math.min(start + effectiveRows - 1, total);
    if (infoEl) infoEl.textContent = `Menampilkan ${start} - ${end} dari ${total} data`;
    if (prevEl) prevEl.disabled = otherIncomeTableState.currentPage <= 1;
    if (nextEl) nextEl.disabled = end >= total;
}

function changeOtherIncomeRowsPerPage() {
    const raw = String(document.getElementById('other-income-rows-per-page')?.value || '10').toLowerCase();
    const rows = Number(raw);
    otherIncomeTableState.rowsPerPage = raw === 'all' ? 0 : ([10, 25, 50].includes(rows) ? rows : 10);
    otherIncomeTableState.currentPage = 1;
    renderOtherIncomeTable();
}

function prevOtherIncomePage() {
    if (otherIncomeTableState.currentPage <= 1) return;
    otherIncomeTableState.currentPage -= 1;
    renderOtherIncomeTable();
}

function nextOtherIncomePage() {
    const total = Number(otherIncomeTableState.totalItems || 0);
    const effectiveRows = getOtherIncomeEffectiveRowsPerPage(total);
    const totalPages = Math.max(1, Math.ceil(total / effectiveRows));
    if (otherIncomeTableState.currentPage >= totalPages) return;
    otherIncomeTableState.currentPage += 1;
    renderOtherIncomeTable();
}

function openOtherIncomeModal() {
    if (isOtherIncomeReadOnly()) return;
    const modal = document.getElementById('other-income-modal');
    const form = document.getElementById('other-income-form');
    const title = document.getElementById('other-income-modal-title');
    if (modal) modal.classList.remove('hidden');
    if (title) title.textContent = 'Tambah Pemasukan Lain';
    if (form) form.reset();
    document.getElementById('other-income-id').value = '';
    document.getElementById('other-income-tanggal').valueAsDate = new Date();
    document.getElementById('other-income-active').checked = true;
}

function closeOtherIncomeModal() {
    document.getElementById('other-income-modal')?.classList.add('hidden');
}

function editOtherIncome(id) {
    if (isOtherIncomeReadOnly()) return;
    const item = otherIncomeRows.find((x) => Number(x.id) === Number(id));
    if (!item) return uiWarn('Data tidak ditemukan.');
    const modal = document.getElementById('other-income-modal');
    const title = document.getElementById('other-income-modal-title');
    if (title) title.textContent = 'Edit Pemasukan Lain';
    if (modal) modal.classList.remove('hidden');
    document.getElementById('other-income-id').value = item.id;
    document.getElementById('other-income-tanggal').value = String(item.tanggal || '').slice(0, 10);
    document.getElementById('other-income-sumber').value = item.sumber || '';
    document.getElementById('other-income-deskripsi').value = item.deskripsi || '';
    document.getElementById('other-income-nominal').value = Number(item.nominal || 0);
    document.getElementById('other-income-active').checked = Number(item.is_active || 0) === 1;
}

async function submitOtherIncomeForm(e) {
    if (isOtherIncomeReadOnly()) return;
    e.preventDefault();
    const id = Number(document.getElementById('other-income-id').value || 0);
    const existing = id > 0 ? otherIncomeRows.find((x) => Number(x.id) === Number(id)) : null;
    const payload = {
        tanggal: String(document.getElementById('other-income-tanggal').value || '').trim(),
        sumber: String(document.getElementById('other-income-sumber').value || '').trim(),
        deskripsi: String(document.getElementById('other-income-deskripsi').value || '').trim(),
        nominal: Number(document.getElementById('other-income-nominal').value || 0),
        report_status: String(existing?.report_status || 'belum'),
        is_active: document.getElementById('other-income-active').checked ? 1 : 0
    };
    const endpoint = id > 0 ? `/api/other-incomes/${id}` : '/api/other-incomes';
    const method = id > 0 ? 'PUT' : 'POST';
    const res = await apiCall(endpoint, method, payload);
    if (!res || res.success === false) {
        uiError(res?.message || 'Gagal menyimpan pemasukan lain.');
        return;
    }
    closeOtherIncomeModal();
    uiSuccess(res.message || 'Data pemasukan lain tersimpan.');
    await loadOtherIncomes();
}

async function deleteOtherIncome(id) {
    if (isOtherIncomeReadOnly()) return;
    if (!(await uiConfirm('Hapus data pemasukan lain ini?', 'Konfirmasi Hapus'))) return;
    const res = await apiCall(`/api/other-incomes/${id}`, 'DELETE');
    if (!res || res.success === false) {
        uiError(res?.message || 'Gagal menghapus data.');
        return;
    }
    uiSuccess(res.message || 'Data pemasukan lain dihapus.');
    await loadOtherIncomes();
}

async function changeOtherIncomeReportStatus(id, status) {
    if (isOtherIncomeReadOnly()) return;
    const value = String(status || '').trim().toLowerCase();
    if (!['belum', 'sudah'].includes(value)) return;
    const res = await apiCall(`/api/other-incomes/${id}/report-status`, 'PUT', { report_status: value });
    if (!res || res.success === false) {
        uiError(res?.message || 'Gagal mengubah status laporan.');
        await loadOtherIncomes();
        return;
    }
    const row = otherIncomeRows.find((x) => Number(x.id) === Number(id));
    if (row) row.report_status = value;
    uiSuccess(res.message || 'Status laporan diperbarui.');
    renderOtherIncomeTable();
}

function resetOtherIncomeFilter() {
    document.getElementById('other-income-search').value = '';
    document.getElementById('other-income-date-from').value = '';
    document.getElementById('other-income-date-to').value = '';
    if (isOtherIncomeReadOnly()) {
        const branchEl = document.getElementById('other-income-branch-filter');
        if (branchEl) branchEl.value = '';
    }
    otherIncomeTableState.currentPage = 1;
    loadOtherIncomes();
}

async function setupOtherIncomeBranchFilter() {
    const wrap = document.getElementById('other-income-branch-filter-wrap');
    const select = document.getElementById('other-income-branch-filter');
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
