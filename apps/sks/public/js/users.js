// js/users.js

let _usersCache = [];
let _branchesCache = [];
let _pinRequestsCache = [];
let _editingUserId = null;

async function initUsers() {
    const form = document.getElementById('user-create-form');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await createUser();
        });
    }
    const roleEl = document.getElementById('user-new-role');
    if (roleEl) roleEl.addEventListener('change', toggleBranchFieldsByRole);
    toggleBranchFieldsByRole();

    const branchForm = document.getElementById('branch-create-form');
    if (branchForm) {
        branchForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await createBranch();
        });
    }

    const editRoleEl = document.getElementById('user-edit-role');
    if (editRoleEl) editRoleEl.addEventListener('change', toggleEditBranchFieldByRole);

    await refreshBranches();
    await refreshUsers();
    await refreshPinRequests();
    switchUserManagementTab('users');
}

function switchUserManagementTab(tab) {
    const usersPanel = document.getElementById('users-panel-users');
    const branchesPanel = document.getElementById('users-panel-branches');
    const pinRequestsPanel = document.getElementById('users-panel-pin-requests');
    const usersTab = document.getElementById('users-tab-users');
    const branchesTab = document.getElementById('users-tab-branches');
    const pinRequestsTab = document.getElementById('users-tab-pin-requests');
    const refreshUsersBtn = document.getElementById('users-refresh-users');
    const refreshBranchesBtn = document.getElementById('users-refresh-branches');
    const refreshPinRequestsBtn = document.getElementById('users-refresh-pin-requests');
    const isUsers = tab === 'users';
    const isBranches = tab === 'branches';
    const isPinRequests = tab === 'pin-requests';
    if (usersPanel) usersPanel.classList.toggle('hidden', !isUsers);
    if (branchesPanel) branchesPanel.classList.toggle('hidden', !isBranches);
    if (pinRequestsPanel) pinRequestsPanel.classList.toggle('hidden', !isPinRequests);
    if (usersTab) {
        usersTab.classList.toggle('bg-primary-600', isUsers);
        usersTab.classList.toggle('text-white', isUsers);
        usersTab.classList.toggle('border', !isUsers);
        usersTab.classList.toggle('border-gray-200', !isUsers);
        usersTab.classList.toggle('text-gray-600', !isUsers);
        usersTab.classList.toggle('hover:bg-gray-50', !isUsers);
    }
    if (branchesTab) {
        branchesTab.classList.toggle('bg-primary-600', isBranches);
        branchesTab.classList.toggle('text-white', isBranches);
        branchesTab.classList.toggle('border', !isBranches);
        branchesTab.classList.toggle('border-gray-200', !isBranches);
        branchesTab.classList.toggle('text-gray-600', !isBranches);
        branchesTab.classList.toggle('hover:bg-gray-50', !isBranches);
    }
    if (pinRequestsTab) {
        pinRequestsTab.classList.toggle('bg-primary-600', isPinRequests);
        pinRequestsTab.classList.toggle('text-white', isPinRequests);
        pinRequestsTab.classList.toggle('border', !isPinRequests);
        pinRequestsTab.classList.toggle('border-gray-200', !isPinRequests);
        pinRequestsTab.classList.toggle('text-gray-600', !isPinRequests);
        pinRequestsTab.classList.toggle('hover:bg-gray-50', !isPinRequests);
    }
    if (refreshUsersBtn) refreshUsersBtn.classList.toggle('hidden', !isUsers);
    if (refreshBranchesBtn) refreshBranchesBtn.classList.toggle('hidden', !isBranches);
    if (refreshPinRequestsBtn) refreshPinRequestsBtn.classList.toggle('hidden', !isPinRequests);
}

function openUserCreateModal() {
    const modal = document.getElementById('user-create-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    const alertEl = document.getElementById('user-create-alert');
    const okEl = document.getElementById('user-create-ok');
    if (alertEl) alertEl.classList.add('hidden');
    if (okEl) okEl.classList.add('hidden');
}

function closeUserCreateModal() {
    const modal = document.getElementById('user-create-modal');
    if (modal) modal.classList.add('hidden');
}

function openBranchCreateModal() {
    const modal = document.getElementById('branch-create-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    const alertEl = document.getElementById('branch-create-alert');
    const okEl = document.getElementById('branch-create-ok');
    if (alertEl) alertEl.classList.add('hidden');
    if (okEl) okEl.classList.add('hidden');
}

function closeBranchCreateModal() {
    const modal = document.getElementById('branch-create-modal');
    if (modal) modal.classList.add('hidden');
}

function toggleBranchFieldsByRole() {
    const roleEl = document.getElementById('user-new-role');
    const role = roleEl?.value || 'admin';
    const isBranchRole = role !== 'super_admin';
    const showWaliClass = role === 'wali_kelas';
    const homeroomWrap = document.getElementById('user-new-homeroom-wrap');
    if (homeroomWrap) homeroomWrap.classList.toggle('hidden', !showWaliClass);
    [
        'user-new-branch-existing-wrap',
        'user-new-branch-name-wrap',
        'user-new-branch-code-wrap',
        'user-new-branch-address-wrap',
        'user-new-branch-phone-wrap'
    ].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('hidden', !isBranchRole);
    });
}

function toggleEditBranchFieldByRole() {
    const roleEl = document.getElementById('user-edit-role');
    const wrap = document.getElementById('user-edit-branch-wrap');
    const homeroomWrap = document.getElementById('user-edit-homeroom-wrap');
    if (!roleEl || !wrap) return;
    const role = roleEl.value || 'super_admin';
    wrap.classList.toggle('hidden', !(role === 'admin' || role === 'wali_kelas'));
    if (homeroomWrap) homeroomWrap.classList.toggle('hidden', role !== 'wali_kelas');
}

async function refreshBranches() {
    const res = await apiCall('/api/branches');
    if (!res || res.success !== true) return;
    _branchesCache = res.branches || [];

    const branchSelect = document.getElementById('user-new-branch-existing');
    if (branchSelect) {
        branchSelect.innerHTML = '<option value="">-- Buat cabang baru di bawah --</option>' + _branchesCache
            .map((b) => `<option value="${b.id}">${escapeHtml(b.nama_cabang)} (${escapeHtml(b.kode_cabang)})${Number(b.is_active) !== 1 ? ' [Nonaktif]' : ''}</option>`)
            .join('');
    }

    const editSelect = document.getElementById('user-edit-branch-id');
    if (editSelect) {
        editSelect.innerHTML = '<option value="">-- Pilih cabang --</option>' + _branchesCache
            .map((b) => `<option value="${b.id}">${escapeHtml(b.nama_cabang)} (${escapeHtml(b.kode_cabang)})${Number(b.is_active) !== 1 ? ' [Nonaktif]' : ''}</option>`)
            .join('');
    }

    const tbody = document.getElementById('branches-tbody');
    if (tbody) {
        if (_branchesCache.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="py-8 text-center text-gray-400">Belum ada cabang.</td></tr>';
        } else {
            tbody.innerHTML = _branchesCache.map((b) => `
                <tr class="hover:bg-gray-50">
                    <td class="py-3 pr-3 font-bold text-gray-700">${b.id}</td>
                    <td class="py-3 pr-3 font-mono text-gray-700">${escapeHtml(b.kode_cabang)}</td>
                    <td class="py-3 pr-3 text-gray-700">${escapeHtml(b.nama_cabang)}</td>
                    <td class="py-3 pr-3">
                        <span class="px-2 py-1 rounded-full text-xs font-bold ${Number(b.is_active) === 1 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}">
                            ${Number(b.is_active) === 1 ? 'Aktif' : 'Nonaktif'}
                        </span>
                    </td>
                    <td class="py-3 text-right">
                        <button class="px-3 py-2 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 font-bold text-xs" onclick="toggleBranchActive(${b.id}, ${Number(b.is_active) === 1 ? 0 : 1})">
                            ${Number(b.is_active) === 1 ? 'Nonaktifkan' : 'Aktifkan'}
                        </button>
                    </td>
                </tr>
            `).join('');
        }
    }
}

async function createBranch() {
    const codeEl = document.getElementById('branch-new-code');
    const nameEl = document.getElementById('branch-new-name');
    const addrEl = document.getElementById('branch-new-address');
    const phoneEl = document.getElementById('branch-new-phone');
    const alertEl = document.getElementById('branch-create-alert');
    const okEl = document.getElementById('branch-create-ok');
    if (!nameEl) return;

    alertEl.classList.add('hidden');
    okEl.classList.add('hidden');

    const nama_cabang = (nameEl.value || '').trim();
    if (!nama_cabang) {
        alertEl.textContent = 'Nama cabang wajib diisi.';
        alertEl.classList.remove('hidden');
        return;
    }

    const res = await apiCall('/api/branches', 'POST', {
        kode_cabang: (codeEl?.value || '').trim() || null,
        nama_cabang,
        alamat: (addrEl?.value || '').trim() || null,
        telepon: (phoneEl?.value || '').trim() || null
    });

    if (!res || res.success !== true) {
        alertEl.textContent = res?.message || 'Gagal menambah cabang.';
        alertEl.classList.remove('hidden');
        return;
    }

    okEl.textContent = 'Cabang berhasil ditambahkan.';
    okEl.classList.remove('hidden');
    if (codeEl) codeEl.value = '';
    if (nameEl) nameEl.value = '';
    if (addrEl) addrEl.value = '';
    if (phoneEl) phoneEl.value = '';
    await refreshBranches();
    setTimeout(() => {
        closeBranchCreateModal();
        switchUserManagementTab('branches');
    }, 350);
}

async function toggleBranchActive(branchId, targetState) {
    const b = _branchesCache.find((x) => x.id === branchId);
    if (!b) return;
    if (!(await uiConfirm(`${targetState === 1 ? 'Aktifkan' : 'Nonaktifkan'} cabang ${b.nama_cabang}?`, 'Konfirmasi Cabang'))) return;
    const res = await apiCall(`/api/branches/${branchId}`, 'PUT', {
        kode_cabang: b.kode_cabang,
        nama_cabang: b.nama_cabang,
        alamat: b.alamat,
        telepon: b.telepon,
        is_active: targetState
    });
    if (!res || res.success !== true) return uiAlert(res?.message || 'Gagal mengubah status cabang.', 'Gagal');
    await refreshBranches();
    await refreshUsers();
}

async function refreshUsers() {
    const tbody = document.getElementById('users-tbody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="7" class="py-10 text-center text-gray-400">Memuat...</td></tr>`;

    const res = await apiCall('/api/users');
    if (!res || res.success !== true) {
        tbody.innerHTML = `<tr><td colspan="7" class="py-10 text-center text-red-500 font-bold">Gagal memuat user.</td></tr>`;
        return;
    }

    _usersCache = res.users || [];
    if (_usersCache.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="py-10 text-center text-gray-400">Belum ada user.</td></tr>`;
        return;
    }

    tbody.innerHTML = _usersCache
        .map((u) => {
            const created = u.created_at ? new Date(u.created_at).toLocaleString('id-ID') : '-';
            const name = u.nama_lengkap ? escapeHtml(u.nama_lengkap) : '<span class="text-gray-300">-</span>';
            const branch = u.role === 'super_admin'
                ? '<span class="text-xs text-gray-400">Pusat</span>'
                : `<span class="text-xs font-semibold text-gray-700">${escapeHtml(u.nama_cabang || '-')}</span><br><span class="text-[11px] text-gray-400">${escapeHtml(u.kode_cabang || '')}</span>`;
            const roleText = u.role === 'wali_kelas' && u.homeroom_class
                ? `${escapeHtml(u.role)} (${escapeHtml(u.homeroom_class)})`
                : escapeHtml(u.role || 'super_admin');
            return `
                <tr class="hover:bg-gray-50">
                    <td class="py-3 pr-3 font-bold text-gray-700">${u.id}</td>
                    <td class="py-3 pr-3 font-mono text-gray-800">${escapeHtml(u.username)}</td>
                    <td class="py-3 pr-3 text-gray-600">${name}</td>
                    <td class="py-3 pr-3">${branch}</td>
                    <td class="py-3 pr-3"><span class="px-2 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700">${roleText}</span></td>
                    <td class="py-3 pr-3 text-gray-500">${escapeHtml(created)}</td>
                    <td class="py-3 text-right">
                        <button class="px-3 py-2 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 font-bold text-xs" onclick="openUserEdit(${u.id})">
                            <i class="fas fa-pen-to-square mr-2"></i> Edit
                        </button>
                    </td>
                </tr>
            `;
        })
        .join('');
}

async function refreshPinRequests() {
    const tbody = document.getElementById('pin-requests-tbody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="6" class="py-10 text-center text-gray-400">Memuat...</td></tr>`;
    const res = await apiCall('/api/pin-change-requests?status=all');
    if (!res || res.success !== true) {
        tbody.innerHTML = `<tr><td colspan="6" class="py-10 text-center text-red-500 font-bold">Gagal memuat permintaan PIN.</td></tr>`;
        return;
    }
    _pinRequestsCache = Array.isArray(res.rows) ? res.rows : [];
    if (!_pinRequestsCache.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="py-10 text-center text-gray-400">Belum ada permintaan perubahan PIN.</td></tr>`;
        return;
    }
    tbody.innerHTML = _pinRequestsCache.map((r) => {
        const status = String(r.status || 'pending').toLowerCase();
        const statusClass = status === 'approved'
            ? 'bg-emerald-50 text-emerald-700'
            : status === 'rejected'
                ? 'bg-rose-50 text-rose-700'
                : 'bg-amber-50 text-amber-700';
        const requestedAt = r.requested_at ? new Date(r.requested_at).toLocaleString('id-ID') : '-';
        const adminText = `${escapeHtml(r.admin_name || '-') } (${escapeHtml(r.admin_username || '-')})`;
        const branchText = `${escapeHtml(r.nama_cabang || '-') } (${escapeHtml(r.kode_cabang || '-')})`;
        return `
            <tr class="hover:bg-gray-50">
                <td class="py-3 pr-3 font-bold text-gray-700">${r.id}</td>
                <td class="py-3 pr-3 text-gray-700">${adminText}</td>
                <td class="py-3 pr-3 text-gray-700">${branchText}</td>
                <td class="py-3 pr-3"><span class="px-2 py-1 rounded-full text-xs font-bold ${statusClass}">${escapeHtml(status)}</span></td>
                <td class="py-3 pr-3 text-gray-500">${escapeHtml(requestedAt)}</td>
                <td class="py-3 text-right">
                    ${status === 'pending'
                        ? `<button class="px-3 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 font-bold text-xs mr-2" onclick="approvePinRequest(${r.id})">Setujui</button>
                           <button class="px-3 py-2 rounded-xl bg-rose-600 text-white hover:bg-rose-700 font-bold text-xs" onclick="rejectPinRequest(${r.id})">Tolak</button>`
                        : `<span class="text-xs text-gray-400">Sudah diproses</span>`
                    }
                </td>
            </tr>
        `;
    }).join('');
}

async function approvePinRequest(id) {
    const note = (await uiPrompt('Catatan approval (opsional):', 'Setujui Permintaan PIN', 'Catatan...', '')) || '';
    const res = await apiCall(`/api/pin-change-requests/${id}/approve`, 'POST', { note });
    if (!res || res.success !== true) return uiAlert(res?.message || 'Gagal menyetujui permintaan PIN.', 'Gagal');
    uiNotify('Permintaan perubahan PIN disetujui.', 'success');
    await refreshPinRequests();
}

async function rejectPinRequest(id) {
    const note = (await uiPrompt('Alasan penolakan (opsional):', 'Tolak Permintaan PIN', 'Alasan...', '')) || '';
    const res = await apiCall(`/api/pin-change-requests/${id}/reject`, 'POST', { note });
    if (!res || res.success !== true) return uiAlert(res?.message || 'Gagal menolak permintaan PIN.', 'Gagal');
    uiNotify('Permintaan perubahan PIN ditolak.', 'warn');
    await refreshPinRequests();
}

async function createUser() {
    const usernameEl = document.getElementById('user-new-username');
    const nameEl = document.getElementById('user-new-name');
    const passEl = document.getElementById('user-new-password');
    const roleEl = document.getElementById('user-new-role');
    const branchNameEl = document.getElementById('user-new-branch-name');
    const branchCodeEl = document.getElementById('user-new-branch-code');
    const branchAddrEl = document.getElementById('user-new-branch-address');
    const branchPhoneEl = document.getElementById('user-new-branch-phone');
    const alertEl = document.getElementById('user-create-alert');
    const okEl = document.getElementById('user-create-ok');

    if (!usernameEl || !passEl) return;

    const username = (usernameEl.value || '').trim();
    const nama_lengkap = (nameEl ? nameEl.value : '').trim();
    const password = (passEl.value || '').trim();
    const role = (roleEl?.value || 'admin').trim();
    const branchExistingEl = document.getElementById('user-new-branch-existing');
    const branch_name = (branchNameEl?.value || '').trim();
    const branch_code = (branchCodeEl?.value || '').trim();
    const branch_address = (branchAddrEl?.value || '').trim();
    const branch_phone = (branchPhoneEl?.value || '').trim();
    const homeroomClass = (document.getElementById('user-new-homeroom-class')?.value || '').trim();

    alertEl.classList.add('hidden');
    okEl.classList.add('hidden');

    if (!username || !password) {
        alertEl.textContent = 'Username dan password wajib diisi.';
        alertEl.classList.remove('hidden');
        return;
    }
    if (password.length < 6) {
        alertEl.textContent = 'Password minimal 6 karakter.';
        alertEl.classList.remove('hidden');
        return;
    }
    const branch_id = Number(branchExistingEl?.value || 0);
    if (role !== 'super_admin' && branch_id <= 0 && !branch_name) {
        alertEl.textContent = 'Nama cabang wajib diisi untuk role berbasis cabang.';
        alertEl.classList.remove('hidden');
        return;
    }
    if (role === 'wali_kelas' && !homeroomClass) {
        alertEl.textContent = 'Kelas wali wajib diisi untuk role wali_kelas.';
        alertEl.classList.remove('hidden');
        return;
    }

    const res = await apiCall('/api/users', 'POST', {
        username,
        password,
        nama_lengkap: nama_lengkap || null,
        role,
        homeroom_class: role === 'wali_kelas' ? homeroomClass : null,
        branch_id: branch_id > 0 ? branch_id : null,
        branch_name: branch_name || null,
        branch_code: branch_code || null,
        branch_address: branch_address || null,
        branch_phone: branch_phone || null
    });
    if (res && res.success) {
        okEl.textContent = 'User berhasil ditambahkan.';
        okEl.classList.remove('hidden');
        usernameEl.value = '';
        if (nameEl) nameEl.value = '';
        passEl.value = '';
        if (branchNameEl) branchNameEl.value = '';
        if (branchCodeEl) branchCodeEl.value = '';
        if (branchAddrEl) branchAddrEl.value = '';
        if (branchPhoneEl) branchPhoneEl.value = '';
        const homeroomEl = document.getElementById('user-new-homeroom-class');
        if (homeroomEl) homeroomEl.value = '';
        if (branchExistingEl) branchExistingEl.value = '';
        await refreshUsers();
        await refreshBranches();
        setTimeout(() => {
            closeUserCreateModal();
            switchUserManagementTab('users');
        }, 350);
        return;
    }

    alertEl.textContent = (res && res.message) ? res.message : 'Gagal menambahkan user.';
    alertEl.classList.remove('hidden');
}

function openUserEdit(id) {
    const u = _usersCache.find((x) => x.id === id);
    if (!u) return;

    _editingUserId = id;
    document.getElementById('user-edit-id').textContent = `ID: ${u.id}`;
    document.getElementById('user-edit-username').value = u.username || '';
    document.getElementById('user-edit-name').value = u.nama_lengkap || '';
    document.getElementById('user-edit-role').value = u.role || 'super_admin';
    document.getElementById('user-edit-branch-id').value = u.branch_id || '';
    document.getElementById('user-edit-homeroom-class').value = u.homeroom_class || '';
    document.getElementById('user-edit-password').value = '';
    toggleEditBranchFieldByRole();

    document.getElementById('user-edit-alert').classList.add('hidden');
    document.getElementById('user-edit-ok').classList.add('hidden');

    const modal = document.getElementById('user-edit-modal');
    modal.classList.remove('hidden');

    const form = document.getElementById('user-edit-form');
    form.onsubmit = async (e) => {
        e.preventDefault();
        await saveUserEdit();
    };
}

function closeUserEdit() {
    const modal = document.getElementById('user-edit-modal');
    if (modal) modal.classList.add('hidden');
    _editingUserId = null;
}

async function saveUserEdit() {
    const alertEl = document.getElementById('user-edit-alert');
    const okEl = document.getElementById('user-edit-ok');
    alertEl.classList.add('hidden');
    okEl.classList.add('hidden');

    const username = (document.getElementById('user-edit-username').value || '').trim();
    const nama_lengkap = (document.getElementById('user-edit-name').value || '').trim();
    const role = (document.getElementById('user-edit-role').value || 'super_admin').trim();
    const branchId = Number(document.getElementById('user-edit-branch-id').value || 0);
    const homeroomClass = (document.getElementById('user-edit-homeroom-class').value || '').trim();
    const password = (document.getElementById('user-edit-password').value || '').trim();

    if (!username) {
        alertEl.textContent = 'Username wajib diisi.';
        alertEl.classList.remove('hidden');
        return;
    }
    if (password && password.length < 6) {
        alertEl.textContent = 'Password minimal 6 karakter.';
        alertEl.classList.remove('hidden');
        return;
    }
    if ((role === 'admin' || role === 'wali_kelas') && branchId <= 0) {
        alertEl.textContent = 'Role berbasis cabang wajib memilih cabang.';
        alertEl.classList.remove('hidden');
        return;
    }
    if (role === 'wali_kelas' && !homeroomClass) {
        alertEl.textContent = 'Kelas wali wajib diisi untuk role wali_kelas.';
        alertEl.classList.remove('hidden');
        return;
    }

    const payload = { username, nama_lengkap: nama_lengkap || null };
    if (password) payload.password = password;

    const roleRes = await apiCall(`/api/users/${_editingUserId}/assign-branch`, 'POST', {
        role,
        branch_id: (role === 'admin' || role === 'wali_kelas') ? branchId : null,
        homeroom_class: role === 'wali_kelas' ? homeroomClass : null
    });
    if (!roleRes || roleRes.success !== true) {
        alertEl.textContent = (roleRes && roleRes.message) ? roleRes.message : 'Gagal mengubah role/cabang.';
        alertEl.classList.remove('hidden');
        return;
    }

    const res = await apiCall(`/api/users/${_editingUserId}`, 'PUT', payload);
    if (res && res.success) {
        okEl.textContent = 'Perubahan tersimpan.';
        okEl.classList.remove('hidden');
        await refreshUsers();
        await refreshBranches();
        setTimeout(() => closeUserEdit(), 400);
        return;
    }

    alertEl.textContent = (res && res.message) ? res.message : 'Gagal menyimpan perubahan.';
    alertEl.classList.remove('hidden');
}

function escapeHtml(str) {
    return String(str)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}
