function formatBytes(bytes) {
    const n = Number(bytes || 0);
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDateTime(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString('id-ID', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

async function initBackup() {
    await loadBackupList();
}

async function loadBackupList() {
    const tbody = document.getElementById('backup-table-body');
    if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="p-8 text-center text-slate-400">Memuat daftar backup...</td></tr>';
    const res = await apiCall('/api/backup/list');
    if (!res || res.success === false) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="4" class="p-8 text-center text-rose-500">${res?.message || 'Gagal memuat backup.'}</td></tr>`;
        return;
    }
    renderBackupRows(res.rows || []);
    const maxEl = document.getElementById('backup-max-files');
    const intervalEl = document.getElementById('backup-interval-hours');
    const totalEl = document.getElementById('backup-total-files');
    if (maxEl) maxEl.textContent = `${res.max_backups || 3} File`;
    if (intervalEl) intervalEl.textContent = `${res.interval_hours || 8} Jam`;
    if (totalEl) totalEl.textContent = String((res.rows || []).length);
}

function renderBackupRows(rows) {
    const tbody = document.getElementById('backup-table-body');
    if (!tbody) return;
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="p-8 text-center text-slate-400">Belum ada file backup.</td></tr>';
        return;
    }
    tbody.innerHTML = rows.map((row) => `
        <tr class="hover:bg-slate-50">
            <td class="px-5 py-4 font-semibold text-slate-700">${row.filename}</td>
            <td class="px-5 py-4 text-slate-600">${formatBytes(row.size)}</td>
            <td class="px-5 py-4 text-slate-600">${formatDateTime(row.updated_at)}</td>
            <td class="px-5 py-4 text-center">
                <button onclick="downloadBackupFile('${String(row.filename).replace(/'/g, "\\'")}')" class="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">
                    <i class="fas fa-download mr-1"></i> Download
                </button>
            </td>
        </tr>
    `).join('');
}

function downloadBackupFile(fileName) {
    const url = typeof window.sksUrl === 'function'
        ? window.sksUrl(`/api/backup/download/${encodeURIComponent(fileName)}`)
        : `/api/backup/download/${encodeURIComponent(fileName)}`;
    window.open(url, '_blank');
}

async function generateBackupNow() {
    const btn = document.getElementById('btn-backup-generate');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Memproses';
    }
    const res = await apiCall('/api/backup/generate', 'POST');
    if (res && res.success) {
        uiSuccess(res.message || 'Backup berhasil dibuat.');
        renderBackupRows(res.rows || []);
        const totalEl = document.getElementById('backup-total-files');
        if (totalEl) totalEl.textContent = String((res.rows || []).length);
    } else {
        uiError(res?.message || 'Gagal membuat backup.');
    }
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-plus mr-1"></i> Backup Sekarang';
    }
}
