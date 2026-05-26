let currentDeviceSessionId = null;

function fmtDateTime(v) {
    if (!v) return '-';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleString('id-ID');
}

async function initDeviceSessions() {
    await loadDeviceSessions();
}

async function loadDeviceSessions() {
    const tbody = document.getElementById('device-sessions-table');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="8" class="px-4 py-6 text-center text-gray-400">Memuat...</td></tr>';
    const res = await apiCall('/api/device-sessions');
    if (!res || res.success === false) {
        tbody.innerHTML = `<tr><td colspan="8" class="px-4 py-6 text-center text-red-500">${res?.message || 'Gagal memuat data.'}</td></tr>`;
        return;
    }
    currentDeviceSessionId = Number(res.current_device_session_id || 0) || null;
    const rows = Array.isArray(res.rows) ? res.rows : [];
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="px-4 py-6 text-center text-gray-400">Belum ada sesi perangkat.</td></tr>';
        return;
    }
    tbody.innerHTML = rows.map((r) => {
        const isCurrent = currentDeviceSessionId && Number(r.id) === currentDeviceSessionId;
        return `
            <tr>
                <td class="px-4 py-3 font-semibold text-gray-700">${r.username || '-'}</td>
                <td class="px-4 py-3 text-gray-600">${r.role || '-'}</td>
                <td class="px-4 py-3 text-gray-500">${r.ip_address || '-'}</td>
                <td class="px-4 py-3 text-gray-500 max-w-[260px] truncate" title="${r.user_agent || ''}">${r.user_agent || '-'}</td>
                <td class="px-4 py-3 text-gray-500">${fmtDateTime(r.login_at)}</td>
                <td class="px-4 py-3 text-gray-500">${fmtDateTime(r.last_seen_at)}</td>
                <td class="px-4 py-3">${Number(r.is_active) === 1 ? '<span class="text-emerald-600 font-semibold">Aktif</span>' : '<span class="text-gray-400 font-semibold">Nonaktif</span>'}${isCurrent ? ' <span class="text-xs text-blue-600">(Perangkat ini)</span>' : ''}</td>
                <td class="px-4 py-3 text-center">
                    ${Number(r.is_active) === 1 ? `<button onclick="revokeDeviceSession(${r.id})" class="px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 text-xs font-semibold">Paksa Logout</button>` : '-'}
                </td>
            </tr>
        `;
    }).join('');
}

async function revokeDeviceSession(id) {
    const ok = await uiConfirm('Paksa logout sesi perangkat ini?', 'Konfirmasi');
    if (!ok) return;
    const res = await apiCall(`/api/device-sessions/${id}/revoke`, 'POST');
    if (!res || res.success === false) {
        uiError(res?.message || 'Gagal mencabut sesi.');
        return;
    }
    uiSuccess('Sesi berhasil dicabut.');
    await loadDeviceSessions();
}

async function initAuditLog() {
    await loadAuditLogs();
}

async function loadAuditLogs() {
    const tbody = document.getElementById('audit-log-table');
    if (!tbody) return;
    const params = new URLSearchParams();
    const userId = document.getElementById('audit-user-id')?.value;
    const role = document.getElementById('audit-role')?.value;
    const branchId = document.getElementById('audit-branch-id')?.value;
    const action = document.getElementById('audit-action')?.value;
    const dateFrom = document.getElementById('audit-date-from')?.value;
    const dateTo = document.getElementById('audit-date-to')?.value;
    if (userId) params.set('user_id', userId);
    if (role) params.set('role', role);
    if (branchId) params.set('branch_id', branchId);
    if (action) params.set('action', action);
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    params.set('limit', '20');

    tbody.innerHTML = '<tr><td colspan="7" class="px-4 py-6 text-center text-gray-400">Memuat...</td></tr>';
    const res = await apiCall(`/api/audit-logs?${params.toString()}`);
    if (!res || res.success === false) {
        tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-6 text-center text-red-500">${res?.message || 'Gagal memuat audit log.'}</td></tr>`;
        return;
    }
    const rows = Array.isArray(res.rows) ? res.rows : [];
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="px-4 py-6 text-center text-gray-400">Belum ada data audit.</td></tr>';
        return;
    }
    tbody.innerHTML = rows.map((r) => `
        <tr>
            <td class="px-4 py-3 text-gray-500">${fmtDateTime(r.created_at)}</td>
            <td class="px-4 py-3 text-gray-700 font-medium">${r.actor_username || '-'}${r.actor_user_id ? ` (#${r.actor_user_id})` : ''}</td>
            <td class="px-4 py-3 text-gray-600">${r.actor_role || '-'}</td>
            <td class="px-4 py-3 text-gray-600">${r.branch_id || '-'}</td>
            <td class="px-4 py-3 text-gray-700">${r.action || '-'}</td>
            <td class="px-4 py-3 text-gray-500 max-w-[260px] truncate" title="${r.path || ''}">${r.path || '-'}</td>
            <td class="px-4 py-3 text-gray-600">${r.status_code || '-'}</td>
        </tr>
    `).join('');
}
