let guruRows = [];

function canWriteGuruAccount() {
    return String(appData?.role || '') === 'admin';
}

async function initGuru() {
    await loadGuruAccounts();
}

async function loadGuruAccounts(forceRefresh = false) {
    const tbody = document.getElementById('guru-table-body');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="6" class="px-6 py-10 text-center text-gray-400">Memuat data guru...</td></tr>';
    }
    const res = await apiCall(`/api/teachers/accounts${forceRefresh ? `?_=${Date.now()}` : ''}`);
    if (!res || res.success === false) {
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="6" class="px-6 py-10 text-center text-rose-500">Gagal memuat data guru.</td></tr>';
        }
        uiError(res?.message || 'Gagal memuat data guru.');
        return;
    }
    guruRows = Array.isArray(res.rows) ? res.rows : [];
    renderGuruTable();
}

function getFilteredGuruRows() {
    const keyword = String(document.getElementById('guru-search')?.value || '').trim().toLowerCase();
    const accountFilter = String(document.getElementById('guru-filter-account')?.value || 'all').trim();
    return guruRows.filter((row) => {
        const hasAccount = Boolean(row?.has_account);
        if (accountFilter === 'yes' && !hasAccount) return false;
        if (accountFilter === 'no' && hasAccount) return false;
        if (!keyword) return true;
        const bucket = [
            String(row?.teacher_name || ''),
            String(row?.teacher_niy || ''),
            String(row?.username || '')
        ].join(' ').toLowerCase();
        return bucket.includes(keyword);
    });
}

function renderGuruTable() {
    const tbody = document.getElementById('guru-table-body');
    if (!tbody) return;
    const rows = getFilteredGuruRows();
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="px-6 py-10 text-center text-gray-400">Tidak ada data guru.</td></tr>';
        return;
    }

    tbody.innerHTML = rows.map((row) => {
        const hasAccount = Boolean(row?.has_account);
        const statusBadge = hasAccount
            ? '<span class="inline-flex rounded-full px-2 py-1 text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">Aktif</span>'
            : '<span class="inline-flex rounded-full px-2 py-1 text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200">Belum Ada</span>';
        let actions = '<span class="text-xs text-gray-400">Read only</span>';
        if (canWriteGuruAccount()) {
            actions = hasAccount
                ? `<button onclick="resetGuruPassword(${Number(row.account_id || 0)})" class="px-3 py-1.5 rounded-lg border border-amber-200 text-amber-700 hover:bg-amber-50 text-xs font-semibold">
                        <i class="fas fa-key mr-1"></i> Reset Password
                   </button>`
                : `<button onclick="createGuruAccountByTeacherId(${Number(row.teacher_id || 0)})" class="px-3 py-1.5 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 text-xs font-semibold">
                        <i class="fas fa-user-plus mr-1"></i> Buat Akun
                   </button>`;
        }
        return `
            <tr class="hover:bg-gray-50">
                <td class="px-6 py-4 font-semibold text-gray-700">${escapeHtml(row.teacher_name || '-')}</td>
                <td class="px-6 py-4 text-gray-600">${escapeHtml(row.teacher_niy || '-')}</td>
                <td class="px-6 py-4 text-gray-700">${escapeHtml(row.username || '-')}</td>
                <td class="px-6 py-4 text-gray-400">${hasAccount ? '••••••••' : '-'}</td>
                <td class="px-6 py-4 text-center">${statusBadge}</td>
                <td class="px-6 py-4 text-center">${actions}</td>
            </tr>
        `;
    }).join('');
}

async function createGuruAccountByTeacherId(teacherId) {
    if (!canWriteGuruAccount()) return;
    const id = Number(teacherId || 0);
    if (!id) {
        uiWarn('Guru dari PDMADA belum valid.');
        return;
    }
    const selected = guruRows.find((row) => Number(row.teacher_id || 0) === id);
    const teacherName = String(selected?.teacher_name || '').trim() || 'Guru';
    const confirmed = await uiConfirm(`Buat akun untuk ${teacherName}?`, 'Buat Akun Guru');
    if (!confirmed) return;
    const res = await apiCall('/api/teachers/accounts', 'POST', {
        teacher_id: id,
        teacher_name: String(teacherName || '').trim()
    });
    if (!res || res.success === false) {
        uiError(res?.message || 'Gagal membuat akun guru.');
        return;
    }
    const username = String(res?.data?.username || '-');
    const password = String(res?.data?.password || '-');
    await uiAlert(`Username: ${username}\nPassword: ${password}\n\nSimpan kredensial ini sekarang, password hanya ditampilkan sekali.`, 'Akun Guru Dibuat');
    await loadGuruAccounts(true);
}

async function resetGuruPassword(accountId) {
    if (!canWriteGuruAccount()) return;
    const id = Number(accountId || 0);
    if (!id) return;
    const confirmed = await uiConfirm('Reset password akun guru ini?', 'Konfirmasi Reset Password');
    if (!confirmed) return;
    const res = await apiCall(`/api/teachers/accounts/${id}/reset-password`, 'PUT', {});
    if (!res || res.success === false) {
        uiError(res?.message || 'Gagal reset password akun guru.');
        return;
    }
    const username = String(res?.data?.username || '-');
    const password = String(res?.data?.password || '-');
    await uiAlert(`Username: ${username}\nPassword baru: ${password}\n\nSimpan password baru ini sekarang.`, 'Password Guru Direset');
    await loadGuruAccounts(true);
}
