let tahunAjaranState = {
    years: [],
    semesters: [],
    activeSchoolYear: null,
    activeSemester: null
};

async function initTahunAjaran() {
    await loadTahunAjaranData();
}

async function loadTahunAjaranData() {
    const res = await apiCall('/api/academic-years');
    if (!res || res.success === false) {
        alert(res?.message || 'Gagal memuat tahun ajaran.');
        return;
    }
    tahunAjaranState = {
        years: res.years || [],
        semesters: res.semesters || [],
        activeSchoolYear: res.activeSchoolYear || null,
        activeSemester: res.activeSemester || null
    };
    renderTahunAjaranTables();
}

function renderTahunAjaranTables() {
    const yearTbody = document.getElementById('table-tahun-ajaran');
    const semTbody = document.getElementById('table-semester-ajaran');
    const statusFilter = document.getElementById('ta-status-filter')?.value || '';
    const q = (document.getElementById('ta-search')?.value || '').toLowerCase().trim();

    let years = [...(tahunAjaranState.years || [])];
    if (statusFilter) {
        const isActive = statusFilter === 'active';
        years = years.filter((y) => Number(y.is_active) === (isActive ? 1 : 0));
    }
    if (q) {
        years = years.filter((y) => String(y.name || '').toLowerCase().includes(q));
    }

    if (!years.length) {
        yearTbody.innerHTML = `<tr><td colspan="4" class="px-6 py-8 text-center text-gray-400">Tidak ada data tahun ajaran.</td></tr>`;
    } else {
        yearTbody.innerHTML = years.map((y, idx) => {
            const active = Number(y.is_active) === 1;
            return `
                <tr class="hover:bg-gray-50">
                    <td class="px-6 py-4">${idx + 1}</td>
                    <td class="px-6 py-4 font-semibold text-gray-800">${y.name}</td>
                    <td class="px-6 py-4">
                        <span class="${active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'} px-3 py-1 rounded-full text-xs font-bold">
                            ${active ? 'Aktif' : 'Nonaktif'}
                        </span>
                    </td>
                    <td class="px-6 py-4 text-center">
                        ${active ? '-' : `<button onclick="activateTahunAjaran(${y.id})" class="px-3 py-1.5 bg-white border rounded-lg hover:bg-gray-50 text-xs font-bold text-primary-600">Aktifkan</button>`}
                    </td>
                </tr>
            `;
        }).join('');
    }

    const semesters = tahunAjaranState.semesters || [];
    if (!semesters.length) {
        semTbody.innerHTML = `<tr><td colspan="4" class="px-6 py-8 text-center text-gray-400">Tidak ada data semester.</td></tr>`;
    } else {
        semTbody.innerHTML = semesters.map((s, idx) => {
            const active = Number(s.is_active) === 1;
            return `
                <tr class="hover:bg-gray-50">
                    <td class="px-6 py-4">${idx + 1}</td>
                    <td class="px-6 py-4 font-semibold text-gray-800">${s.name}</td>
                    <td class="px-6 py-4">
                        <span class="${active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'} px-3 py-1 rounded-full text-xs font-bold">
                            ${active ? 'Aktif' : 'Nonaktif'}
                        </span>
                    </td>
                    <td class="px-6 py-4 text-center">
                        ${active ? '-' : `<button onclick="activateSemesterAjaran(${s.id})" class="px-3 py-1.5 bg-white border rounded-lg hover:bg-gray-50 text-xs font-bold text-primary-600">Aktifkan</button>`}
                    </td>
                </tr>
            `;
        }).join('');
    }
}

async function addTahunAjaran() {
    const input = document.getElementById('ta-new-name');
    const name = String(input?.value || '').trim();
    if (!name) return alert('Nama tahun ajaran wajib diisi.');
    const res = await apiCall('/api/academic-years', 'POST', { name });
    if (!res || res.success === false) return alert(res?.message || 'Gagal menambah tahun ajaran.');
    input.value = '';
    await syncInitialDataPeriod();
    alert('Tahun ajaran ditambahkan.');
}

async function activateTahunAjaran(id) {
    const res = await apiCall(`/api/academic-years/${id}/activate`, 'POST');
    if (!res || res.success === false) return alert(res?.message || 'Gagal mengaktifkan tahun ajaran.');
    await syncInitialDataPeriod();
}

async function activateSemesterAjaran(id) {
    const res = await apiCall(`/api/semesters/${id}/activate`, 'POST');
    if (!res || res.success === false) return alert(res?.message || 'Gagal mengaktifkan semester.');
    await syncInitialDataPeriod();
}

async function syncInitialDataPeriod() {
    const newData = await (typeof window.refreshAppData === 'function'
        ? window.refreshAppData(true)
        : apiCall('/api/initial-data'));
    if (newData) Object.assign(appData, newData);
    if (typeof updateActivePeriodBadge === 'function') updateActivePeriodBadge();
    await loadTahunAjaranData();
}
