// js/siswa.js

let siswaViewMode = 'aktif'; // aktif | nonaktif | alumni
const isSiswaReadOnly = () => ['super_admin', 'wali_kelas'].includes(appData.role || 'admin');
const siswaTableState = {
    currentPage: 1,
    rowsPerPage: 10,
    totalItems: 0
};
const selectedSiswaIds = new Set();
let siswaCurrentRows = [];

function getSiswaEffectiveRowsPerPage(totalItems) {
    return siswaTableState.rowsPerPage <= 0 ? Math.max(1, Number(totalItems || 0)) : siswaTableState.rowsPerPage;
}

async function initSiswa(mode = 'aktif') {
    if (mode === 'alumni') siswaViewMode = 'alumni';
    else if (mode === 'nonaktif') siswaViewMode = 'nonaktif';
    else siswaViewMode = 'aktif';
    selectedSiswaIds.clear();
    const titleEl = document.getElementById('siswa-page-title');
    const subEl = document.getElementById('siswa-page-subtitle');
    if (titleEl) {
        titleEl.textContent = siswaViewMode === 'alumni'
            ? 'Data Alumni'
            : (siswaViewMode === 'nonaktif' ? 'Data Siswa Nonaktif' : 'Data Siswa Aktif');
    }
    if (subEl) {
        subEl.textContent = siswaViewMode === 'alumni'
            ? 'Kelola data siswa yang sudah lulus/alumni.'
            : (siswaViewMode === 'nonaktif'
                ? 'Kelola data siswa yang sudah dinonaktifkan.'
                : 'Kelola data siswa aktif yang sedang berjalan.');
    }

    const showCreateActions = siswaViewMode === 'aktif' && !isSiswaReadOnly();
    const btnImport = document.getElementById('btn-siswa-import');
    const btnAdd = document.getElementById('btn-siswa-add');
    const modalSiswa = document.getElementById('modal-siswa');
    const modalImport = document.getElementById('modal-import');
    const modalConfirm = document.getElementById('modal-status-confirm');
    if (modalSiswa) modalSiswa.classList.add('hidden');
    if (modalImport) modalImport.classList.add('hidden');
    if (modalConfirm) modalConfirm.classList.add('hidden');
    if (btnImport) {
        btnImport.classList.toggle('hidden', !showCreateActions);
        btnImport.disabled = !showCreateActions;
        btnImport.style.pointerEvents = showCreateActions ? 'auto' : 'none';
        btnImport.onclick = () => openImportModal();
    }
    if (btnAdd) {
        btnAdd.classList.toggle('hidden', !showCreateActions);
        btnAdd.disabled = !showCreateActions;
        btnAdd.style.pointerEvents = showCreateActions ? 'auto' : 'none';
        btnAdd.onclick = () => openModalSiswa();
    }

    renderClassOptionsSiswa();
    const rowsEl = document.getElementById('siswa-rows-per-page');
    if (rowsEl) rowsEl.value = siswaTableState.rowsPerPage <= 0 ? 'all' : String(siswaTableState.rowsPerPage);
    siswaTableState.currentPage = 1;
    loadStudents();
    const templateLink = document.getElementById('download-template-link');
    if (templateLink && typeof window.sksUrl === 'function') {
        templateLink.href = window.sksUrl('/api/billing/import/template');
    }

    const statusEl = document.getElementById('siswa-status');
    if (statusEl) {
        statusEl.onchange = toggleSiswaTahunLulusField;
    }

    // Attach Import Listener
    const formImport = document.getElementById('form-import');
    if (formImport) {
        // Hapus listener lama jika ada (untuk menghindari double submit jika navigasi bolak-balik)
        const newForm = formImport.cloneNode(true);
        formImport.parentNode.replaceChild(newForm, formImport);
        newForm.onsubmit = handleImportSubmit;
    }
}

// 1. RENDER & LOAD DATA
function renderClassOptionsSiswa() {
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
    const filterSelect = document.getElementById('filter-kelas');
    const modalSelect = document.getElementById('siswa-kelas');

    const options = classes.map(c => `<option value="${c.nama_kelas}">${c.nama_kelas}</option>`).join('');
    
    if(filterSelect) filterSelect.innerHTML = '<option value="">Semua Kelas</option>' + options;
    if(modalSelect) modalSelect.innerHTML = '<option value="">-- Pilih Kelas --</option>' + options;
}

async function loadStudents() {
    const kelas = document.getElementById('filter-kelas')?.value || '';
    const search = (document.getElementById('search-siswa')?.value || '').trim();
    const status = siswaViewMode === 'alumni' ? 'Lulus' : (siswaViewMode === 'nonaktif' ? 'Nonaktif' : 'Aktif');
    const limit = siswaTableState.rowsPerPage <= 0 ? 100 : siswaTableState.rowsPerPage;
    const query = new URLSearchParams({
        page: String(siswaTableState.currentPage),
        limit: String(limit),
        status
    });
    if (kelas) query.set('kelas', kelas);
    if (search) query.set('search', search);
    const res = await apiCall(`/api/students/list?${query.toString()}`);
    if (res && res.success) {
        siswaCurrentRows = Array.isArray(res.rows) ? res.rows : [];
        const pg = res.pagination || {};
        siswaTableState.currentPage = Number(pg.page || siswaTableState.currentPage || 1);
        siswaTableState.totalItems = Number(pg.total || 0);
        if (!siswaTableState.rowsPerPage || siswaTableState.rowsPerPage <= 0) {
            siswaTableState.rowsPerPage = Number(pg.limit || limit || 10);
        }
    } else {
        siswaCurrentRows = [];
        siswaTableState.totalItems = 0;
    }
    renderSiswaTable();
}

function toggleSiswaTahunLulusField() {
    const group = document.getElementById('siswa-tahun-lulus-group');
    const status = document.getElementById('siswa-status')?.value || '';
    const isEdit = Boolean(document.getElementById('siswa-id')?.value);
    if (!group) return;
    if (!isEdit) {
        group.classList.add('hidden');
        return;
    }
    if (String(status).toLowerCase() === 'lulus') group.classList.remove('hidden');
    else group.classList.add('hidden');
}

function renderSiswaTable() {
    const tbody = document.getElementById('table-siswa');
    const head = document.getElementById('siswa-table-head');
    let students = Array.isArray(siswaCurrentRows) ? [...siswaCurrentRows] : [];
    const readOnly = isSiswaReadOnly();
    const canBulk = !readOnly && (siswaViewMode === 'aktif' || siswaViewMode === 'nonaktif');

    if (siswaViewMode === 'aktif') {
        students = students.filter(s => String(s.status || '').toLowerCase() === 'aktif');
        if (head) {
            head.innerHTML = `
                ${canBulk ? '<th class="px-4 py-4 w-10 text-center"><input id="siswa-check-all" type="checkbox" class="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"></th>' : ''}
                <th class="px-6 py-4">NIS</th>
                <th class="px-6 py-4">Nama Siswa</th>
                <th class="px-6 py-4">Kelas</th>
                <th class="px-6 py-4">Tahun Masuk</th>
                <th class="px-6 py-4">Asal Sekolah</th>
                <th class="px-6 py-4">Status</th>
                <th class="px-6 py-4 text-center">Aksi</th>
            `;
        }
    } else if (siswaViewMode === 'nonaktif') {
        students = students.filter(s => String(s.status || '').toLowerCase() === 'nonaktif');
        if (head) {
            head.innerHTML = `
                ${canBulk ? '<th class="px-4 py-4 w-10 text-center"><input id="siswa-check-all" type="checkbox" class="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"></th>' : ''}
                <th class="px-6 py-4">NIS</th>
                <th class="px-6 py-4">Nama Siswa</th>
                <th class="px-6 py-4">Kelas Terakhir</th>
                <th class="px-6 py-4">Tahun Masuk</th>
                <th class="px-6 py-4">Asal Sekolah</th>
                <th class="px-6 py-4">Status</th>
                <th class="px-6 py-4 text-center">Aksi</th>
            `;
        }
    } else if (siswaViewMode === 'alumni') {
        students = students.filter(s => String(s.status || '').toLowerCase() === 'lulus');
        if (head) {
            head.innerHTML = `
                <th class="px-6 py-4">NIS</th>
                <th class="px-6 py-4">Nama Siswa</th>
                <th class="px-6 py-4">Kelas Terakhir</th>
                <th class="px-6 py-4">Asal Sekolah</th>
                <th class="px-6 py-4">Status Siswa</th>
                <th class="px-6 py-4">Tahun Lulus</th>
                <th class="px-6 py-4 text-center">Aksi</th>
            `;
        }
    }

    const visibleIds = new Set(students.map((s) => Number(s.id)));
    Array.from(selectedSiswaIds).forEach((id) => {
        if (!visibleIds.has(Number(id))) selectedSiswaIds.delete(Number(id));
    });

    const compareText = (a, b) => String(a || '').localeCompare(String(b || ''), 'id', { numeric: true, sensitivity: 'base' });
    const compareYearMasuk = (a, b) => {
        const ay = Number(a?.tahun_masuk || 0);
        const by = Number(b?.tahun_masuk || 0);
        if (ay !== by) return ay - by;
        const kelasCmp = compareText(a?.kelas, b?.kelas);
        if (kelasCmp !== 0) return kelasCmp;
        return compareText(a?.nama, b?.nama);
    };

    if (siswaViewMode === 'aktif') {
        students.sort((a, b) => {
            const kelasCmp = compareText(a?.kelas, b?.kelas);
            if (kelasCmp !== 0) return kelasCmp;
            const namaCmp = compareText(a?.nama, b?.nama);
            if (namaCmp !== 0) return namaCmp;
            return compareYearMasuk(a, b);
        });
    } else {
        students.sort(compareYearMasuk);
    }

    const displayData = students;

    if (students.length === 0) {
        const colSpan = canBulk ? 8 : 7;
        tbody.innerHTML = `<tr><td colspan="${colSpan}" class="p-10 text-center text-slate-400">Tidak ada data siswa.</td></tr>`;
        updateSiswaPageInfo();
        updateSiswaBulkActions();
        return;
    }

    const rowsHtml = [];
    displayData.forEach((s) => {
        let statusBadge = '';
        if (siswaViewMode === 'alumni') {
            statusBadge = '<span class="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 ring-1 ring-indigo-100"><i class="fas fa-user-graduate text-[10px]"></i>Alumni</span>';
        } else if (String(s.status || '').toLowerCase() === 'nonaktif') {
            statusBadge = '<span class="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-100"><i class="fas fa-circle text-[8px]"></i>Nonaktif</span>';
        } else if (s.status === 'Aktif') {
            statusBadge = '<span class="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100"><i class="fas fa-circle text-[8px]"></i>Aktif</span>';
        } else if (s.status === 'Lulus') {
            statusBadge = '<span class="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-100"><i class="fas fa-circle text-[8px]"></i>Lulus</span>';
        } else {
            statusBadge = '<span class="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-rose-100"><i class="fas fa-circle text-[8px]"></i>' + s.status + '</span>';
        }

        rowsHtml.push(`
        <tr class="transition hover:bg-slate-50/80">
            ${canBulk ? `<td class="px-4 py-4 text-center"><input type="checkbox" class="siswa-row-check h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" data-id="${Number(s.id)}" ${selectedSiswaIds.has(Number(s.id)) ? 'checked' : ''}></td>` : ''}
            <td class="px-6 py-4 font-mono text-[13px] font-semibold text-slate-600">${s.nis || '-'}</td>
            <td class="px-6 py-4">
                <div class="flex items-center gap-3">
                    <div class="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                        <i class="fas fa-user-graduate text-xs"></i>
                    </div>
                    <div class="font-semibold text-slate-700">${s.nama || '-'}</div>
                </div>
            </td>
            <td class="px-6 py-4"><span class="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">${s.kelas || '-'}</span></td>
            ${
                siswaViewMode === 'alumni'
                    ? `<td class="px-6 py-4 text-sm font-medium text-slate-600">${s.asal_sekolah || '-'}</td><td class="px-6 py-4">${statusBadge}</td><td class="px-6 py-4 text-sm font-medium text-slate-600">${s.tahun_lulus || '-'}</td>`
                    : `<td class="px-6 py-4 text-sm font-medium text-slate-600">${s.tahun_masuk || '-'}</td><td class="px-6 py-4 text-sm font-medium text-slate-600">${s.asal_sekolah || '-'}</td><td class="px-6 py-4">${statusBadge}</td>`
            }
            <td class="px-6 py-4">
                ${
                    readOnly
                        ? '<div class="flex items-center justify-center gap-2"><span class="text-xs font-semibold text-slate-400">Read only</span></div>'
                        : `<div class="flex items-center justify-center gap-2">
                            ${siswaViewMode === 'aktif' ? `
                            <button onclick="editSiswa(${s.id})" title="Edit data" class="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 transition hover:-translate-y-0.5 hover:bg-blue-100">
                                <i class="fas fa-pen-to-square text-sm"></i>
                            </button>` : ''}
                            ${siswaViewMode === 'aktif' ? `
                            <button onclick="nonaktifkanSiswa(${s.id})" title="Nonaktifkan siswa" class="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600 transition hover:-translate-y-0.5 hover:bg-amber-100">
                                <i class="fas fa-user-slash text-sm"></i>
                            </button>` : ''}
                            ${siswaViewMode === 'nonaktif' ? `
                            <button onclick="aktifkanSiswa(${s.id})" title="Aktifkan siswa" class="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 transition hover:-translate-y-0.5 hover:bg-emerald-100">
                                <i class="fas fa-user-check text-sm"></i>
                            </button>` : ''}
                            <button onclick="deleteSiswa(${s.id})" title="Hapus data" class="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-600 transition hover:-translate-y-0.5 hover:bg-rose-100">
                                <i class="fas fa-trash-can text-sm"></i>
                            </button>
                        </div>`
                }
            </td>
        </tr>
    `);
    });
    tbody.innerHTML = rowsHtml.join('');
    bindSiswaBulkCheckboxes(displayData);
    updateSiswaBulkActions();
    updateSiswaPageInfo();
}

function bindSiswaBulkCheckboxes(displayData = []) {
    const master = document.getElementById('siswa-check-all');
    const checks = Array.from(document.querySelectorAll('.siswa-row-check'));
    checks.forEach((el) => {
        el.onchange = () => {
            const id = Number(el.dataset.id || 0);
            if (!id) return;
            if (el.checked) selectedSiswaIds.add(id);
            else selectedSiswaIds.delete(id);
            updateSiswaBulkActions(displayData);
        };
    });

    if (master) {
        const ids = displayData.map((s) => Number(s.id)).filter(Boolean);
        const selectedOnPage = ids.filter((id) => selectedSiswaIds.has(id)).length;
        master.checked = ids.length > 0 && selectedOnPage === ids.length;
        master.indeterminate = selectedOnPage > 0 && selectedOnPage < ids.length;
        master.onchange = () => {
            ids.forEach((id) => {
                if (master.checked) selectedSiswaIds.add(id);
                else selectedSiswaIds.delete(id);
            });
            renderSiswaTable();
        };
    }
}

function updateSiswaBulkActions(displayData = []) {
    const wrap = document.getElementById('siswa-bulk-actions');
    const countEl = document.getElementById('siswa-bulk-count');
    const btnNonaktif = document.getElementById('btn-bulk-nonaktif');
    const btnAktif = document.getElementById('btn-bulk-aktif');
    const btnHapus = document.getElementById('btn-bulk-hapus');
    const readOnly = isSiswaReadOnly();
    const canBulk = !readOnly && (siswaViewMode === 'aktif' || siswaViewMode === 'nonaktif');
    if (!wrap) return;
    if (!canBulk) {
        wrap.classList.add('hidden');
        return;
    }
    wrap.classList.remove('hidden');
    wrap.classList.add('flex');
    const total = selectedSiswaIds.size;
    if (countEl) countEl.textContent = `${total} siswa dipilih`;
    if (btnNonaktif) btnNonaktif.classList.toggle('hidden', siswaViewMode !== 'aktif');
    if (btnAktif) btnAktif.classList.toggle('hidden', siswaViewMode !== 'nonaktif');
    if (btnHapus) btnHapus.disabled = total === 0;
    if (btnNonaktif) btnNonaktif.disabled = total === 0;
    if (btnAktif) btnAktif.disabled = total === 0;
}

function clearSiswaSelection() {
    selectedSiswaIds.clear();
    renderSiswaTable();
}

async function bulkNonaktifkanSelectedSiswa() {
    if (selectedSiswaIds.size === 0) return;
    if (!(await uiConfirm(`Nonaktifkan ${selectedSiswaIds.size} siswa terpilih?`, 'Konfirmasi Operasi Massal'))) return;
    let success = 0;
    let fail = 0;
    for (const id of Array.from(selectedSiswaIds)) {
        try {
            const res = await apiCall(`/api/students/${id}/deactivate`, 'POST');
            if (res && res.success) success++;
            else fail++;
        } catch (_) {
            fail++;
        }
    }
    if (typeof uiSuccess === 'function') uiSuccess(`Berhasil: ${success}, gagal: ${fail}`);
    selectedSiswaIds.clear();
    loadStudents();
}

async function bulkAktifkanSelectedSiswa() {
    if (selectedSiswaIds.size === 0) return;
    if (!(await uiConfirm(`Aktifkan ${selectedSiswaIds.size} siswa terpilih?`, 'Konfirmasi Operasi Massal'))) return;
    let success = 0;
    let fail = 0;
    for (const id of Array.from(selectedSiswaIds)) {
        try {
            const res = await apiCall(`/api/students/${id}/activate`, 'POST');
            if (res && res.success) success++;
            else fail++;
        } catch (_) {
            fail++;
        }
    }
    if (typeof uiSuccess === 'function') uiSuccess(`Berhasil: ${success}, gagal: ${fail}`);
    selectedSiswaIds.clear();
    loadStudents();
}

async function bulkDeleteSelectedSiswa() {
    if (selectedSiswaIds.size === 0) return;
    if (!(await uiConfirm(`Hapus ${selectedSiswaIds.size} siswa terpilih? Data akan dihapus permanen.`, 'Konfirmasi Hapus Massal'))) return;
    let success = 0;
    let fail = 0;
    let blocked = 0;
    for (const id of Array.from(selectedSiswaIds)) {
        try {
            const preview = await apiCall(`/api/students/${id}/delete-preview`, 'GET');
            if (!preview || preview.success === false || Number(preview.totalSisa || 0) > 0) {
                blocked++;
                continue;
            }
            const res = await apiCall(`/api/students/${id}`, 'DELETE');
            if (res && res.success) success++;
            else fail++;
        } catch (_) {
            fail++;
        }
    }
    if (typeof uiSuccess === 'function') uiSuccess(`Dihapus: ${success}, tertahan tagihan: ${blocked}, gagal: ${fail}`);
    selectedSiswaIds.clear();
    loadStudents();
}

function onSiswaFilterChanged() {
    siswaTableState.currentPage = 1;
    loadStudents();
}

function updateSiswaPageInfo() {
    const infoEl = document.getElementById('siswa-page-info');
    const prevEl = document.getElementById('btn-prev-siswa');
    const nextEl = document.getElementById('btn-next-siswa');
    const total = Number(siswaTableState.totalItems || 0);
    const effectiveRows = getSiswaEffectiveRowsPerPage(total);
    const start = total === 0 ? 0 : ((siswaTableState.currentPage - 1) * effectiveRows + 1);
    const end = total === 0 ? 0 : Math.min(start + effectiveRows - 1, total);
    if (infoEl) infoEl.textContent = `Menampilkan ${start} - ${end} dari ${total} data`;
    if (prevEl) prevEl.disabled = siswaTableState.currentPage <= 1;
    if (nextEl) nextEl.disabled = end >= total;
}

function changeSiswaRowsPerPage() {
    const raw = String(document.getElementById('siswa-rows-per-page')?.value || '10').toLowerCase();
    const rows = Number(raw);
    siswaTableState.rowsPerPage = raw === 'all' ? 100 : ([10, 25, 50].includes(rows) ? rows : 10);
    siswaTableState.currentPage = 1;
    loadStudents();
}

function prevPageSiswa() {
    if (siswaTableState.currentPage <= 1) return;
    siswaTableState.currentPage -= 1;
    loadStudents();
}

function nextPageSiswa() {
    const total = Number(siswaTableState.totalItems || 0);
    const effectiveRows = Math.max(1, Number(siswaTableState.rowsPerPage || 10));
    const totalPages = Math.max(1, Math.ceil(total / effectiveRows));
    if (siswaTableState.currentPage >= totalPages) return;
    siswaTableState.currentPage += 1;
    loadStudents();
}

// 2. MODAL LOGIC (CRUD MANUAL)
function openModalSiswa() {
    if (isSiswaReadOnly()) return alert('Super admin hanya bisa melihat data siswa.');
    const modal = document.getElementById('modal-siswa');
    if (!modal) return;
    document.getElementById('form-siswa').reset();
    document.getElementById('siswa-id').value = '';
    document.getElementById('modal-siswa-title').innerText = "Tambah Siswa";
    const tahunLulusGroup = document.getElementById('siswa-tahun-lulus-group');
    if (tahunLulusGroup) tahunLulusGroup.classList.add('hidden');
    const statusEl = document.getElementById('siswa-status');
    if (statusEl) statusEl.value = 'Aktif';
    toggleSiswaTahunLulusField();
    modal.classList.remove('hidden');
}

function closeModalSiswa() {
    document.getElementById('modal-siswa').classList.add('hidden');
}

function editSiswa(id) {
    if (isSiswaReadOnly()) return alert('Super admin hanya bisa melihat data siswa.');
    const s = siswaCurrentRows.find(x => x.id === id);
    if(!s) return;

    document.getElementById('siswa-id').value = s.id;
    document.getElementById('siswa-nis').value = s.nis;
    document.getElementById('siswa-nisn').value = s.nisn;
    document.getElementById('siswa-nama').value = s.nama;
    document.getElementById('siswa-kelas').value = s.kelas;
    document.getElementById('siswa-status').value = s.status;
    document.getElementById('siswa-tahun-masuk').value = s.tahun_masuk || '';
    document.getElementById('siswa-tahun-lulus').value = s.tahun_lulus || '';
    document.getElementById('siswa-jk').value = s.jenis_kelamin;
    document.getElementById('siswa-tgl').value = s.tanggal_lahir ? s.tanggal_lahir.split('T')[0] : '';
    document.getElementById('siswa-wali').value = s.nama_wali;
    document.getElementById('siswa-asal-sekolah').value = s.asal_sekolah || '';

    document.getElementById('modal-siswa-title').innerText = "Edit Data Siswa";
    toggleSiswaTahunLulusField();
    document.getElementById('modal-siswa').classList.remove('hidden');
}

async function handleSiswaSubmit() {
    if (isSiswaReadOnly()) return alert('Super admin hanya bisa melihat data siswa.');
    const id = document.getElementById('siswa-id').value;
    const body = {
        nis: document.getElementById('siswa-nis').value,
        nisn: document.getElementById('siswa-nisn').value,
        nama: document.getElementById('siswa-nama').value,
        kelas: document.getElementById('siswa-kelas').value,
        status: document.getElementById('siswa-status').value,
        tahun_masuk: document.getElementById('siswa-tahun-masuk').value,
        tahun_lulus: document.getElementById('siswa-tahun-lulus').value,
        jenis_kelamin: document.getElementById('siswa-jk').value,
        tanggal_lahir: document.getElementById('siswa-tgl').value,
        nama_wali: document.getElementById('siswa-wali').value,
        asal_sekolah: document.getElementById('siswa-asal-sekolah').value
    };

    if(!body.nis || !body.nama || !body.kelas) return alert("NIS, Nama, dan Kelas wajib diisi.");

    const url = id ? `/api/students/${id}` : '/api/students';
    const method = id ? 'PUT' : 'POST';

    try {
        const res = await apiCall(url, method, body);
        if(res.success) {
            alert("Data berhasil disimpan.");
            closeModalSiswa();
            loadStudents();
        } else {
            alert("Gagal: " + res.message);
        }
    } catch(e) { console.error(e); alert("Terjadi kesalahan."); }
}

async function deleteSiswa(id) {
    if (isSiswaReadOnly()) return alert('Super admin hanya bisa melihat data siswa.');
    try {
        const preview = await apiCall(`/api/students/${id}/delete-preview`, 'GET');
        if (!preview || preview.success === false) {
            alert(preview?.message || 'Gagal memeriksa tagihan siswa.');
            return;
        }
        if (Number(preview.totalSisa || 0) > 0) {
            await showStatusConfirmModal(
                `Siswa tidak bisa dihapus karena masih memiliki tagihan sebesar ${formatRp(preview.totalSisa)}.`,
                { confirmText: 'Tutup', hideCancel: true }
            );
            return;
        }
    } catch (e) {
        alert('Gagal memeriksa tagihan siswa.');
        return;
    }

    if(!(await uiConfirm("Yakin hapus siswa ini? Data siswa akan dihapus permanen.", "Konfirmasi Hapus Siswa"))) return;
    try {
        const res = await apiCall(`/api/students/${id}`, 'DELETE');
        if(res.success) {
            alert("Siswa dihapus.");
            loadStudents();
        } else {
            alert(res?.message || 'Gagal hapus.');
        }
    } catch(e) { alert("Gagal hapus."); }
}

// 3. LOGIC IMPORT EXCEL
function resetImportFeedback() {
    const resultBox = document.getElementById('import-result');
    const progressWrap = document.getElementById('import-progress-wrap');
    const progressBar = document.getElementById('import-progress-bar');
    const progressText = document.getElementById('import-progress-text');
    const progressPercent = document.getElementById('import-progress-percent');
    if (resultBox) {
        resultBox.classList.add('hidden');
        resultBox.innerHTML = '';
    }
    if (progressWrap) progressWrap.classList.add('hidden');
    if (progressBar) progressBar.style.width = '0%';
    if (progressText) progressText.textContent = 'Menunggu upload...';
    if (progressPercent) progressPercent.textContent = '0%';
}

function setImportProgress(percent, text) {
    const progressWrap = document.getElementById('import-progress-wrap');
    const progressBar = document.getElementById('import-progress-bar');
    const progressText = document.getElementById('import-progress-text');
    const progressPercent = document.getElementById('import-progress-percent');
    const safePercent = Math.max(0, Math.min(100, Number(percent || 0)));
    if (progressWrap) progressWrap.classList.remove('hidden');
    if (progressBar) progressBar.style.width = `${safePercent}%`;
    if (progressText) progressText.textContent = text || 'Memproses upload...';
    if (progressPercent) progressPercent.textContent = `${Math.round(safePercent)}%`;
}

function showImportError(message, rowErrors = []) {
    const resultBox = document.getElementById('import-result');
    if (!resultBox) return;
    const list = Array.isArray(rowErrors) ? rowErrors : [];
    const rowsHtml = list.length
        ? `<ul class="list-disc pl-4 mt-1 space-y-1">${list.map((e) => `<li>${String(e)}</li>`).join('')}</ul>`
        : '';
    resultBox.innerHTML = `<strong>Import gagal:</strong><div class="mt-1">${String(message || 'Terjadi kendala saat import.')}</div>${rowsHtml}`;
    resultBox.classList.remove('hidden');
}

function goToMasterImportTarget(page) {
    closeImportModal();
    if (typeof loadPage === 'function') loadPage(page);
}

function showImportMasterSummary(message, summary = {}, rowErrors = []) {
    const resultBox = document.getElementById('import-result');
    if (!resultBox) return;
    const failedRows = Number(summary.failedRows || 0);
    const rowsHtml = failedRows > 0
        ? `<div class="mt-2 text-xs"><strong>Contoh baris gagal:</strong><ul class="list-disc pl-4 mt-1 space-y-1">${(rowErrors || []).slice(0, 8).map((e) => `<li>${String(e)}</li>`).join('')}</ul></div>`
        : '';
    resultBox.className = 'p-3 bg-emerald-50 text-emerald-800 text-xs rounded border border-emerald-200 max-h-72 overflow-y-auto';
    resultBox.innerHTML = `
        <div class="font-bold">Import Data Master Selesai</div>
        <div class="mt-1">${String(message || 'Import berhasil.')}</div>
        <div class="mt-2 grid grid-cols-2 gap-2 text-[11px]">
            <div class="rounded bg-white border border-emerald-100 px-2 py-1">Beasiswa: <strong>${Number(summary.importedScholarshipRecipients || 0)}</strong></div>
            <div class="rounded bg-white border border-emerald-100 px-2 py-1">Tagihan: <strong>${Number(summary.importedBills || 0)}</strong></div>
            <div class="rounded bg-white border border-emerald-100 px-2 py-1">Pembayaran: <strong>${Number(summary.importedPayments || 0)}</strong></div>
            <div class="rounded bg-white border border-emerald-100 px-2 py-1">Baris gagal: <strong>${failedRows}</strong></div>
        </div>
        ${rowsHtml}
        <div class="mt-3 flex flex-wrap gap-2">
            <button type="button" onclick="goToMasterImportTarget('siswa-aktif')" class="rounded bg-indigo-600 px-2 py-1 text-white text-[11px]">Lihat Siswa</button>
            <button type="button" onclick="goToMasterImportTarget('kelas')" class="rounded bg-sky-600 px-2 py-1 text-white text-[11px]">Lihat Kelas</button>
            <button type="button" onclick="goToMasterImportTarget('beasiswa')" class="rounded bg-purple-600 px-2 py-1 text-white text-[11px]">Lihat Beasiswa</button>
            <button type="button" onclick="goToMasterImportTarget('tagihan')" class="rounded bg-amber-600 px-2 py-1 text-white text-[11px]">Lihat Tagihan</button>
            <button type="button" onclick="goToMasterImportTarget('pembayaran')" class="rounded bg-emerald-600 px-2 py-1 text-white text-[11px]">Lihat Pembayaran</button>
        </div>
    `;
    resultBox.classList.remove('hidden');
}

function openImportModal() {
    if (isSiswaReadOnly()) return alert('Super admin hanya bisa melihat data siswa.');
    const form = document.getElementById('form-import');
    if (form) form.reset();
    resetImportFeedback();
    document.getElementById('modal-import').classList.remove('hidden');
}

function closeImportModal() {
    document.getElementById('modal-import').classList.add('hidden');
}

async function handleImportSubmit(e) {
    if (isSiswaReadOnly()) return alert('Super admin hanya bisa melihat data siswa.');
    e.preventDefault();

    const fileInput = document.getElementById('file-import');
    if (fileInput.files.length === 0) return alert('Pilih file terlebih dahulu.');

    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append('file', file);

    const btn = document.getElementById('btn-import-submit');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memproses...';
    resetImportFeedback();
    setImportProgress(0, 'Menyiapkan upload...');

    try {
        const branchId = Number(window?.appData?.admin?.branch_id || 0);
        const uploadPath = branchId > 0 ? `/api/billing/import?branch_id=${branchId}` : '/api/billing/import';
        const uploadUrl = typeof window.sksUrl === 'function' ? window.sksUrl(uploadPath) : uploadPath;
        const res = await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', uploadUrl, true);
            xhr.upload.onprogress = (evt) => {
                if (!evt.lengthComputable) return;
                const percent = (evt.loaded / evt.total) * 100;
                setImportProgress(percent, 'Mengunggah file...');
            };
            xhr.onload = () => {
                setImportProgress(100, 'Upload selesai, memvalidasi...');
                let parsed;
                try {
                    parsed = JSON.parse(xhr.responseText || '{}');
                } catch (_) {
                    parsed = null;
                }
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(parsed || { success: false, message: 'Respons server tidak valid.' });
                } else {
                    reject(new Error(parsed?.message || `Upload gagal (HTTP ${xhr.status}).`));
                }
            };
            xhr.onerror = () => reject(new Error('Koneksi gagal saat upload. Periksa server/jaringan.'));
            xhr.onabort = () => reject(new Error('Upload dibatalkan.'));
            xhr.send(formData);
        });

        if (res.success) {
            setImportProgress(100, 'Import selesai.');
            const summary = res.summary || {};
            const summaryMsg = `${res.message || 'Import berhasil.'}\nSiswa/Kelas: auto jika diperlukan\nBeasiswa: ${Number(summary.importedScholarshipRecipients || 0)}\nTagihan: ${Number(summary.importedBills || 0)}\nPembayaran: ${Number(summary.importedPayments || 0)}\nBaris gagal: ${Number(summary.failedRows || 0)}`;
            if (typeof uiSuccess === 'function') uiSuccess(summaryMsg);
            else alert(summaryMsg);
            if (typeof window.refreshAppData === 'function') {
                await window.refreshAppData(true);
            }
            loadStudents();
            showImportMasterSummary(res.message || 'Import berhasil.', summary, res.errors || []);
        } else {
            setImportProgress(100, 'Validasi gagal.');
            showImportError(res.message || 'Data tidak bisa diproses.', res.errors || []);
        }
    } catch (err) {
        setImportProgress(100, 'Upload gagal.');
        showImportError(err?.message || 'Gagal upload file.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

async function nonaktifkanSiswa(id) {
    if (isSiswaReadOnly()) return alert('Super admin hanya bisa melihat data siswa.');
    try {
        const preview = await apiCall(`/api/students/${id}/deactivate-preview`, 'GET');
        if (!preview || preview.success === false) {
            alert(preview?.message || 'Gagal memeriksa tagihan siswa.');
            return;
        }

        let confirmed = true;
        if (Number(preview.totalSisa || 0) > 0) {
            confirmed = await showStatusConfirmModal(
                `Siswa masih memiliki tagihan sebesar ${formatRp(preview.totalSisa)}. Lanjut nonaktifkan siswa?`
            );
        } else {
            confirmed = await uiConfirm(
                'Nonaktifkan siswa ini? Siswa akan dipindah ke menu Siswa Nonaktif.',
                'Konfirmasi Nonaktifkan'
            );
        }
        if (!confirmed) return;

        const res = await apiCall(`/api/students/${id}/deactivate`, 'POST');
        if (res && res.success) {
            alert('Siswa berhasil dinonaktifkan.');
            loadStudents();
        } else {
            alert(res?.message || 'Gagal menonaktifkan siswa.');
        }
    } catch (e) {
        alert('Gagal menonaktifkan siswa.');
    }
}

async function aktifkanSiswa(id) {
    if (isSiswaReadOnly()) return alert('Super admin hanya bisa melihat data siswa.');
    if (!(await uiConfirm('Aktifkan kembali siswa ini?', 'Konfirmasi Aktifkan'))) return;
    try {
        const res = await apiCall(`/api/students/${id}/activate`, 'POST');
        if (res && res.success) {
            alert('Siswa berhasil diaktifkan kembali.');
            loadStudents();
        } else {
            alert(res?.message || 'Gagal mengaktifkan siswa.');
        }
    } catch (e) {
        alert('Gagal mengaktifkan siswa.');
    }
}

function showStatusConfirmModal(message, options = {}) {
    const hideCancel = Boolean(options.hideCancel);
    if (hideCancel) {
        return uiAlert(message, 'Informasi').then(() => false);
    }
    return uiConfirm(message, 'Konfirmasi');
}
