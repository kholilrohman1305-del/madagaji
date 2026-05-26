let kelasState = {
    currentPage: 1,
    rowsPerPage: 10,
    filteredData: [],
    classes: [],
    waliUsers: [],
    teacherRows: [],
    teacherFiltered: [],
    submenu: 'data'
};
let kelasOutsideClickBound = false;

const isReadOnlySuperAdminKelas = () => (appData.role || 'admin') === 'super_admin';

function showMsg(message, title = 'Informasi') {
    if (typeof uiAlert === 'function') return uiAlert(message, title);
    alert(message);
}

function showSuccess(message, title = 'Berhasil') {
    if (typeof uiSuccess === 'function') return uiSuccess(message, title);
    return showMsg(message, title);
}

async function initKelas() {
    const periodEl = document.getElementById('kelas-active-period');
    if (periodEl) {
        const tahun = appData.activeSchoolYear?.name || '-';
        const semester = appData.activeSemester?.name ? ` (${appData.activeSemester.name})` : '';
        periodEl.textContent = `Periode aktif: ${tahun}${semester}`;
    }

    const addButton = document.querySelector('button[onclick="openKelasModal()"]');
    if (addButton) addButton.classList.toggle('hidden', isReadOnlySuperAdminKelas());

    const waliTab = document.getElementById('kelas-tab-wali');
    if (waliTab) waliTab.classList.toggle('hidden', isReadOnlySuperAdminKelas());

    await Promise.all([loadClassData(), loadWaliUsers(), loadTeacherRows()]);
    switchKelasSubmenu('data');

    const form = document.getElementById('form-kelas');
    if (form) {
        const clone = form.cloneNode(true);
        form.parentNode.replaceChild(clone, form);
        clone.addEventListener('submit', handleKelasSubmit);
    }

    if (!kelasOutsideClickBound) {
        document.addEventListener('click', handleKelasOutsideClick);
        kelasOutsideClickBound = true;
    }
}

async function loadClassData() {
    const res = await apiCall('/api/classes');
    let rows = Array.isArray(res?.rows) ? res.rows : [];
    kelasState.classes = rows;
    kelasState.filteredData = [...kelasState.classes];
    kelasState.currentPage = 1;
    renderClassTable();
}

async function loadWaliUsers() {
    const res = await apiCall('/api/classes/wali');
    kelasState.waliUsers = Array.isArray(res?.rows) ? res.rows : [];
    renderWaliTable();
}

async function loadTeacherRows() {
    const res = await apiCall('/api/classes/wali/teachers');
    kelasState.teacherRows = Array.isArray(res?.rows) ? res.rows : [];
    kelasState.teacherFiltered = [...kelasState.teacherRows];
}

function switchKelasSubmenu(mode) {
    kelasState.submenu = mode === 'wali' ? 'wali' : 'data';

    const panelData = document.getElementById('kelas-panel-data');
    const panelWali = document.getElementById('kelas-panel-wali');
    const tabData = document.getElementById('kelas-tab-data');
    const tabWali = document.getElementById('kelas-tab-wali');

    if (panelData) panelData.classList.toggle('hidden', kelasState.submenu !== 'data');
    if (panelWali) panelWali.classList.toggle('hidden', kelasState.submenu !== 'wali');

    if (tabData) {
        tabData.classList.toggle('bg-primary-600', kelasState.submenu === 'data');
        tabData.classList.toggle('text-white', kelasState.submenu === 'data');
        tabData.classList.toggle('border', kelasState.submenu !== 'data');
        tabData.classList.toggle('border-gray-200', kelasState.submenu !== 'data');
        tabData.classList.toggle('text-gray-600', kelasState.submenu !== 'data');
    }
    if (tabWali) {
        tabWali.classList.toggle('bg-primary-600', kelasState.submenu === 'wali');
        tabWali.classList.toggle('text-white', kelasState.submenu === 'wali');
        tabWali.classList.toggle('border', kelasState.submenu !== 'wali');
        tabWali.classList.toggle('border-gray-200', kelasState.submenu !== 'wali');
        tabWali.classList.toggle('text-gray-600', kelasState.submenu !== 'wali');
    }
}

function renderClassTable() {
    const tbody = document.getElementById('table-kelas');
    if (!tbody) return;
    const isReadOnly = isReadOnlySuperAdminKelas();

    const start = (kelasState.currentPage - 1) * kelasState.rowsPerPage;
    const end = start + kelasState.rowsPerPage;
    const pageItems = kelasState.filteredData.slice(start, end);

    if (!pageItems.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-400">Tidak ada data kelas</td></tr>';
        updatePaginationInfo(0);
        return;
    }

    tbody.innerHTML = pageItems.map((c) => {
        const selectedWali = Number(c.wali_admin_id || 0);
        const waliLabel = selectedWali > 0
            ? `${String(c.wali_nama || '').trim()} (${String(c.wali_username || '').trim()})`
            : '';

        const waliEditor = isReadOnly
            ? `<span class="text-xs text-gray-500">${c.wali_nama ? `${escapeHtml(c.wali_nama)} (${escapeHtml(c.wali_username || '-')})` : '-'}</span>`
            : `
                <div class="relative">
                    <input id="wali-input-${c.id}" type="text" value="${escapeHtml(waliLabel)}" placeholder="Cari wali kelas..." class="w-full px-2 py-1 border border-gray-200 rounded text-xs" oninput="filterClassWaliOptions(${c.id}, this.value)" autocomplete="off">
                    <div id="wali-list-${c.id}" class="hidden absolute left-0 right-0 z-20 mt-1 max-h-48 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg"></div>
                </div>
            `;

        return `
            <tr class="hover:bg-gray-50 transition-colors align-top">
                <td class="p-4 font-bold text-gray-700">${escapeHtml(c.nama_kelas || '-')}</td>
                <td class="p-4 text-center"><span class="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-bold">${Number(c.jumlahSiswa || 0)} Siswa</span></td>
                <td class="p-4 text-center"><span class="bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full text-xs font-bold">${Number(c.lunas || 0)} Lunas</span></td>
                <td class="p-4 text-center"><span class="bg-red-100 text-red-800 px-3 py-1 rounded-full text-xs font-bold">${Number(c.nunggak || 0)} Tagihan</span></td>
                <td class="p-4">${waliEditor}</td>
                <td class="p-4 text-center">
                    ${isReadOnly
                        ? '<span class="text-xs font-semibold text-slate-400">Read only</span>'
                        : `<button onclick="editKelas(${c.id}, '${String(c.nama_kelas || '').replace(/'/g, "\\'")}')" class="text-blue-600 hover:bg-blue-100 p-2 rounded-lg transition-all" title="Edit"><i class="fas fa-edit"></i></button>
                           <button onclick="deleteKelas(${c.id})" class="text-red-600 hover:bg-red-100 p-2 rounded-lg ml-1 transition-all" title="Hapus"><i class="fas fa-trash"></i></button>`}
                </td>
            </tr>
        `;
    }).join('');

    updatePaginationInfo(kelasState.filteredData.length);
}

function renderWaliTable() {
    const tbody = document.getElementById('table-wali-kelas');
    if (!tbody) return;
    if (!kelasState.waliUsers.length) {
        tbody.innerHTML = '<tr><td colspan="3" class="p-4 text-center text-gray-400">Belum ada data wali kelas.</td></tr>';
        return;
    }
    tbody.innerHTML = kelasState.waliUsers.map((w) => `
        <tr>
            <td class="p-4 font-semibold text-gray-700">${escapeHtml(w.nama_lengkap || '-')}</td>
            <td class="p-4 text-gray-600">${escapeHtml(w.username || '-')}</td>
            <td class="p-4 text-gray-600">${escapeHtml(w.homeroom_class || '-')}</td>
        </tr>
    `).join('');
}

function hideTeacherAutocomplete() {
    const list = document.getElementById('wali-teacher-list');
    if (list) list.classList.add('hidden');
}

function handleKelasOutsideClick(e) {
    const teacherInput = document.getElementById('wali-teacher-input');
    const teacherList = document.getElementById('wali-teacher-list');
    if (teacherInput && teacherList && !teacherInput.contains(e.target) && !teacherList.contains(e.target)) {
        teacherList.classList.add('hidden');
    }
    (kelasState.filteredData || []).forEach((c) => {
        const input = document.getElementById(`wali-input-${c.id}`);
        const list = document.getElementById(`wali-list-${c.id}`);
        if (!input || !list) return;
        if (!input.contains(e.target) && !list.contains(e.target)) list.classList.add('hidden');
    });
}

function filterTeacherAutocomplete(keyword) {
    const input = document.getElementById('wali-teacher-input');
    const list = document.getElementById('wali-teacher-list');
    if (!input || !list) return;

    const key = String(keyword || '').trim().toLowerCase();
    if (!key) {
        list.classList.add('hidden');
        list.innerHTML = '';
        return;
    }

    const rows = kelasState.teacherRows.filter((t) => {
        const text = `${String(t.name || '').toLowerCase()} ${String(t.niy || '').toLowerCase()}`;
        return text.includes(key);
    }).slice(0, 8);

    if (!rows.length) {
        list.innerHTML = '<div class="px-3 py-2 text-xs text-gray-400">Guru tidak ditemukan</div>';
        list.classList.remove('hidden');
        return;
    }

    list.innerHTML = rows.map((t) => {
        const label = `${String(t.name || '').trim()}${t.niy ? ` (${String(t.niy).trim()})` : ''}`;
        return `
            <button type="button" class="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0" onclick="selectTeacherSuggestion(${Number(t.id || 0)}, '${String(label).replace(/'/g, "\\'")}')">
                ${escapeHtml(label)}
            </button>
        `;
    }).join('');

    list.classList.remove('hidden');
}

function selectTeacherSuggestion(teacherId, label) {
    const input = document.getElementById('wali-teacher-input');
    if (!input) return;
    input.value = label;
    input.dataset.teacherId = String(teacherId);
    hideTeacherAutocomplete();
}

function findTeacherByInput() {
    const input = document.getElementById('wali-teacher-input');
    const teacherId = Number(input?.dataset?.teacherId || 0);
    const val = String(input?.value || '').trim().toLowerCase();
    if (teacherId > 0) {
        const byId = kelasState.teacherRows.find((t) => Number(t.id || 0) === teacherId);
        if (byId) return byId;
    }
    return kelasState.teacherRows.find((t) => {
        const label = `${String(t.name || '').trim()}${t.niy ? ` (${String(t.niy).trim()})` : ''}`.toLowerCase();
        return label === val || String(t.name || '').trim().toLowerCase() === val;
    }) || null;
}

async function createWaliFromTeacher() {
    if (isReadOnlySuperAdminKelas()) return showMsg('Super admin tidak bisa menambah wali kelas.', 'Read Only');
    const teacher = findTeacherByInput();
    if (!teacher) return showMsg('Pilih guru dari hasil pencarian.', 'Validasi');

    const res = await apiCall('/api/classes/wali', 'POST', { teacher_id: Number(teacher.id || 0), teacher_name: teacher.name });
    if (!res || res.success === false) {
        return showMsg(res?.message || 'Gagal menambah wali kelas.', 'Gagal');
    }

    const credentialWrap = document.getElementById('wali-create-credential');
    if (credentialWrap) {
        credentialWrap.classList.remove('hidden');
        credentialWrap.innerHTML = `
            <div class="font-semibold mb-1">Wali kelas berhasil ditambahkan</div>
            <div>Nama: <b>${escapeHtml(res.data?.nama_lengkap || '-')}</b></div>
            <div>Username: <b>${escapeHtml(res.data?.username || '-')}</b></div>
            <div>Password: <b>${escapeHtml(res.data?.password || '-')}</b></div>
        `;
    }

    await Promise.all([loadWaliUsers(), loadClassData()]);
    const input = document.getElementById('wali-teacher-input');
    if (input) {
        input.value = '';
        delete input.dataset.teacherId;
    }
    hideTeacherAutocomplete();
    showSuccess('Wali kelas berhasil ditambahkan. Simpan credential untuk login.', 'Berhasil');
}

function filterClassWaliOptions(classId, keyword) {
    const list = document.getElementById(`wali-list-${classId}`);
    if (!list) return;
    const key = String(keyword || '').trim().toLowerCase();

    if (!key) {
        list.classList.add('hidden');
        list.innerHTML = '';
        return;
    }

    const rows = kelasState.waliUsers.filter((w) => {
        const text = `${String(w.nama_lengkap || '').toLowerCase()} ${String(w.username || '').toLowerCase()}`;
        return text.includes(key);
    }).slice(0, 8);

    if (!rows.length) {
        list.innerHTML = '<div class="px-3 py-2 text-xs text-gray-400">Wali kelas tidak ditemukan</div>';
        list.classList.remove('hidden');
        return;
    }

    list.innerHTML = rows.map((w) => {
        const label = `${String(w.nama_lengkap || '').trim()} (${String(w.username || '').trim()})`;
        return `
            <button type="button" class="block w-full text-left px-3 py-2 text-xs hover:bg-gray-50 border-b border-gray-100 last:border-0" onclick="selectClassWaliSuggestion(${classId}, ${Number(w.id || 0)}, '${String(label).replace(/'/g, "\\'")}')">
                ${escapeHtml(label)}
            </button>
        `;
    }).join('');

    list.classList.remove('hidden');
}

async function selectClassWaliSuggestion(classId, waliAdminId, label) {
    const input = document.getElementById(`wali-input-${classId}`);
    const list = document.getElementById(`wali-list-${classId}`);
    if (!input) return;
    input.value = label;
    input.dataset.waliAdminId = String(waliAdminId);
    if (list) list.classList.add('hidden');

    const res = await apiCall(`/api/classes/${classId}/wali`, 'PUT', { wali_admin_id: Number(waliAdminId || 0) || null });
    if (!res || res.success === false) {
        return showMsg(res?.message || 'Gagal mengatur wali kelas.', 'Gagal');
    }
    await Promise.all([loadWaliUsers(), loadClassData()]);
    showSuccess('Wali kelas berhasil diatur.', 'Berhasil');
}

function updatePaginationInfo(totalItems) {
    const start = (kelasState.currentPage - 1) * kelasState.rowsPerPage + 1;
    const end = Math.min(start + kelasState.rowsPerPage - 1, totalItems);

    document.getElementById('page-info-start').textContent = totalItems === 0 ? 0 : start;
    document.getElementById('page-info-end').textContent = end;
    document.getElementById('page-info-total').textContent = totalItems;

    document.getElementById('btn-prev-kelas').disabled = kelasState.currentPage === 1;
    document.getElementById('btn-next-kelas').disabled = end >= totalItems;
}

function prevPageKelas() {
    if (kelasState.currentPage > 1) {
        kelasState.currentPage -= 1;
        renderClassTable();
    }
}

function nextPageKelas() {
    const maxPage = Math.ceil(kelasState.filteredData.length / kelasState.rowsPerPage);
    if (kelasState.currentPage < maxPage) {
        kelasState.currentPage += 1;
        renderClassTable();
    }
}

function handleSearchKelas() {
    const keyword = String(document.getElementById('kelas-search')?.value || '').toLowerCase();
    kelasState.filteredData = kelasState.classes.filter((c) => String(c.nama_kelas || '').toLowerCase().includes(keyword));
    kelasState.currentPage = 1;
    renderClassTable();
}

function openKelasModal() {
    if (isReadOnlySuperAdminKelas()) return showMsg('Super admin hanya bisa melihat data kelas.', 'Read Only');
    document.getElementById('modal-kelas').classList.remove('hidden');
    document.getElementById('form-kelas').reset();
    document.getElementById('kelas-id').value = '';
    document.getElementById('modal-title').textContent = 'Tambah Kelas Baru';
}

function closeKelasModal() {
    document.getElementById('modal-kelas').classList.add('hidden');
}

function editKelas(id, nama) {
    if (isReadOnlySuperAdminKelas()) return showMsg('Super admin hanya bisa melihat data kelas.', 'Read Only');
    document.getElementById('modal-kelas').classList.remove('hidden');
    document.getElementById('kelas-id').value = id;
    document.getElementById('kelas-nama').value = nama;
    document.getElementById('modal-title').textContent = 'Edit Kelas';
}

async function handleKelasSubmit(e) {
    e.preventDefault();
    if (isReadOnlySuperAdminKelas()) return showMsg('Super admin hanya bisa melihat data kelas.', 'Read Only');

    const id = Number(document.getElementById('kelas-id').value || 0);
    const nama = String(document.getElementById('kelas-nama').value || '').trim();
    if (!nama) return showMsg('Nama kelas tidak boleh kosong.', 'Validasi');

    const res = await apiCall(id > 0 ? `/api/classes/${id}` : '/api/classes', id > 0 ? 'PUT' : 'POST', { nama_kelas: nama });
    if (!res || res.success === false) return showMsg(res?.message || 'Gagal menyimpan kelas.', 'Gagal');

    closeKelasModal();
    await loadClassData();
    document.getElementById('kelas-search').value = '';
    showSuccess('Data kelas berhasil disimpan.', 'Berhasil');
}

async function deleteKelas(id) {
    if (isReadOnlySuperAdminKelas()) return showMsg('Super admin hanya bisa melihat data kelas.', 'Read Only');
    const ok = typeof uiConfirm === 'function'
        ? await uiConfirm('Hapus kelas ini? Kelas yang masih dipakai siswa aktif atau tagihan aktif tidak bisa dihapus.', 'Konfirmasi Hapus Kelas')
        : confirm('Hapus kelas ini?');
    if (!ok) return;

    const res = await apiCall(`/api/classes/${id}`, 'DELETE');
    if (!res || res.success === false) return showMsg(res?.message || 'Gagal menghapus kelas.', 'Gagal');

    await loadClassData();
    showSuccess('Kelas berhasil dihapus.', 'Berhasil');
}
