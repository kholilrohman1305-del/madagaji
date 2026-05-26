// js/beasiswa.js
const isBeasiswaReadOnly = () => (appData.role || 'admin') === 'super_admin';
let _beasiswaPrograms = [];
let _recipientMode = 'class';
let _beasiswaTab = 'ringkasan';
let _planRowsCache = [];
let _recipientRemovalContext = null;
let _selectedRecipientMap = new Map();
const _beasiswaRealisasiState = {
    currentPage: 1,
    rowsPerPage: 10,
    totalItems: 0
};

function getBeasiswaEffectiveRowsPerPage(totalItems) {
    return _beasiswaRealisasiState.rowsPerPage <= 0 ? Math.max(1, Number(totalItems || 0)) : _beasiswaRealisasiState.rowsPerPage;
}

async function initBeasiswa() {
    if (typeof window.refreshAppData === 'function') {
        await window.refreshAppData(false);
    }
    setupBeasiswaPeriodFilter();
    initBeasiswaTabs();
    await loadMasterBeasiswa();
    await loadBeasiswaSummary();

    document.getElementById('form-master').onsubmit = handleMasterSubmit;
    document.getElementById('form-recipient').onsubmit = handleRecipientSubmit;
    const addProgramBtn = document.querySelector('button[onclick="openMasterModal()"]');
    if (addProgramBtn) addProgramBtn.classList.toggle('hidden', isBeasiswaReadOnly());

    const exportBtn = document.getElementById('bea-btn-export');
    if (exportBtn) exportBtn.onclick = exportBeasiswaReport;
    const openPlanBtn = document.getElementById('bea-btn-open-plan');
    if (openPlanBtn) {
        openPlanBtn.classList.toggle('hidden', isBeasiswaReadOnly());
        openPlanBtn.onclick = () => openPlanModal();
    }
    const planForm = document.getElementById('form-plan');
    if (planForm) planForm.onsubmit = handlePlanSubmit;
    const rowsEl = document.getElementById('bea-realisasi-rows');
    if (rowsEl) rowsEl.value = _beasiswaRealisasiState.rowsPerPage <= 0 ? 'all' : String(_beasiswaRealisasiState.rowsPerPage);

}

function initBeasiswaTabs() {
    setBeasiswaTab(_beasiswaTab || 'ringkasan');
}

function setBeasiswaTab(tabName) {
    _beasiswaTab = ['ringkasan', 'realisasi', 'rencana'].includes(tabName) ? tabName : 'ringkasan';
    const tabs = [
        { key: 'ringkasan', btn: document.getElementById('bea-tab-ringkasan'), section: document.getElementById('bea-section-ringkasan') },
        { key: 'realisasi', btn: document.getElementById('bea-tab-realisasi'), section: document.getElementById('bea-section-realisasi') },
        { key: 'rencana', btn: document.getElementById('bea-tab-rencana'), section: document.getElementById('bea-section-rencana') }
    ];
    tabs.forEach((item) => {
        const active = item.key === _beasiswaTab;
        if (item.section) item.section.classList.toggle('hidden', !active);
        if (item.btn) {
            item.btn.classList.toggle('bg-blue-600', active);
            item.btn.classList.toggle('text-white', active);
            item.btn.classList.toggle('text-gray-600', !active);
            item.btn.classList.toggle('hover:bg-gray-100', !active);
        }
    });

    const btnPlan = document.getElementById('bea-btn-open-plan');
    const btnProgram = document.querySelector('button[onclick="openMasterModal()"]');
    if (btnPlan) btnPlan.classList.toggle('hidden', isBeasiswaReadOnly() || _beasiswaTab !== 'rencana');
    if (btnProgram) btnProgram.classList.toggle('hidden', isBeasiswaReadOnly() || _beasiswaTab !== 'realisasi');
}

function setupBeasiswaPeriodFilter() {
    const periodEl = document.getElementById('bea-filter-period-type');
    const monthEl = document.getElementById('bea-filter-month');
    const semesterEl = document.getElementById('bea-filter-semester');
    const yearEl = document.getElementById('bea-filter-year');
    if (!periodEl || !monthEl || !yearEl || !semesterEl) return;

    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    monthEl.innerHTML = months.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('');

    const now = new Date();
    const years = [];
    for (let y = now.getFullYear() - 3; y <= now.getFullYear() + 2; y++) years.push(y);
    yearEl.innerHTML = years.map((y) => `<option value="${y}">${y}</option>`).join('');

    monthEl.value = String(now.getMonth() + 1);
    yearEl.value = String(now.getFullYear());
    semesterEl.value = now.getMonth() + 1 >= 7 ? 'ganjil' : 'genap';
    periodEl.value = 'month';

    const syncVisibility = () => {
        const mode = periodEl.value;
        monthEl.classList.toggle('hidden', mode !== 'month');
        semesterEl.classList.toggle('hidden', !(mode === 'semester' || mode === 'next_semester'));
    };
    syncVisibility();

    periodEl.onchange = () => {
        syncVisibility();
        loadBeasiswaSummary();
    };
    monthEl.onchange = () => loadBeasiswaSummary();
    semesterEl.onchange = () => loadBeasiswaSummary();
    yearEl.onchange = () => loadBeasiswaSummary();
}

function getBeasiswaPeriodQuery() {
    const periodType = document.getElementById('bea-filter-period-type')?.value || 'month';
    const month = document.getElementById('bea-filter-month')?.value;
    const semester = document.getElementById('bea-filter-semester')?.value;
    const year = document.getElementById('bea-filter-year')?.value;
    const q = new URLSearchParams();
    q.set('period_type', periodType);
    if (year) q.set('year', year);
    if (periodType === 'month' && month) q.set('month', month);
    if ((periodType === 'semester' || periodType === 'next_semester') && semester) q.set('semester', semester);
    return q.toString();
}

async function loadMasterBeasiswa() {
    const tbody = document.getElementById('table-master-beasiswa');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" class="text-center p-4"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';

    try {
        const data = await apiCall('/api/scholarships/types');
        _beasiswaPrograms = Array.isArray(data) ? data : [];
        _beasiswaRealisasiState.totalItems = _beasiswaPrograms.length;
        renderMasterBeasiswaRows();
    } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-red-500">Gagal memuat data.</td></tr>';
        _beasiswaRealisasiState.totalItems = 0;
        updateBeasiswaRealisasiPageInfo();
    }
}

function renderMasterBeasiswaRows() {
    const tbody = document.getElementById('table-master-beasiswa');
    if (!tbody) return;
    const readOnly = isBeasiswaReadOnly();
    const total = _beasiswaPrograms.length;
    if (!total) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center p-8 text-gray-400">Belum ada program beasiswa. Buat baru!</td></tr>';
        _beasiswaRealisasiState.totalItems = 0;
        updateBeasiswaRealisasiPageInfo();
        return;
    }
    const effectiveRows = getBeasiswaEffectiveRowsPerPage(total);
    const totalPages = Math.max(1, Math.ceil(total / effectiveRows));
    if (_beasiswaRealisasiState.currentPage > totalPages) _beasiswaRealisasiState.currentPage = totalPages;
    if (_beasiswaRealisasiState.currentPage < 1) _beasiswaRealisasiState.currentPage = 1;
    const start = (_beasiswaRealisasiState.currentPage - 1) * effectiveRows;
    const end = start + effectiveRows;
    const rows = _beasiswaPrograms.slice(start, end);

    tbody.innerHTML = rows.map((d) => {
        const isActive = Number(d.is_active ?? 1) === 1;
        const typeText = String(d.jenis_nilai || 'nominal') === 'persen' ? '%' : 'Rp';
        return `
            <tr class="hover:bg-gray-50 border-b last:border-0 transition">
                <td class="px-6 py-4">
                    <span class="font-bold text-gray-800">${d.nama_beasiswa}</span>
                    <div class="mt-1 text-[11px] text-gray-500">
                        <span class="${isActive ? 'text-emerald-700' : 'text-slate-500'} font-semibold">${isActive ? 'Aktif' : 'Nonaktif'}</span>
                        ${d.start_date ? ` • ${String(d.start_date).slice(0, 10)}` : ''}
                        ${d.end_date ? ` s/d ${String(d.end_date).slice(0, 10)}` : ''}
                    </div>
                </td>
                <td class="px-6 py-4 text-right font-mono text-gray-600">${typeText === '%' ? `${Number(d.nominal_per_siswa)}%` : formatRp(d.nominal_per_siswa)}</td>
                <td class="px-6 py-4 text-center">
                    <span class="bg-blue-50 text-blue-600 px-2 py-1 rounded font-bold text-xs">${d.jumlah_penerima} Siswa</span>
                </td>
                <td class="px-6 py-4 text-right font-bold text-emerald-600">${formatRp(d.total_anggaran)}</td>
                <td class="px-6 py-4 text-center flex justify-center gap-2">
                    ${readOnly ? '' : `
                    <button onclick="openAddRecipient(${d.id}, '${String(d.nama_beasiswa).replaceAll("'", "\\'")}')" class="bg-blue-600 text-white p-2 rounded hover:bg-blue-700 text-xs flex items-center gap-1" title="Tambah Penerima">
                        <i class="fas fa-user-plus"></i> Tambah
                    </button>
                    <button onclick="toggleProgramActive(${d.id})" class="${isActive ? 'bg-amber-500 hover:bg-amber-600' : 'bg-emerald-600 hover:bg-emerald-700'} text-white p-2 rounded text-xs" title="Ubah status">
                        ${isActive ? 'Nonaktifkan' : 'Aktifkan'}
                    </button>
                    <button onclick="deleteProgramBeasiswa(${d.id}, '${String(d.nama_beasiswa).replaceAll("'", "\\'")}')" class="bg-rose-600 hover:bg-rose-700 text-white p-2 rounded text-xs" title="Hapus program">
                        Hapus
                    </button>`}
                    <button onclick="openDetailList(${d.id}, '${String(d.nama_beasiswa).replaceAll("'", "\\'")}')" class="bg-gray-100 text-gray-600 p-2 rounded hover:bg-gray-200 text-xs flex items-center gap-1 border" title="Lihat Daftar Siswa">
                        <i class="fas fa-list"></i> Detail
                    </button>
                </td>
            </tr>
        `;
    }).join('');
    _beasiswaRealisasiState.totalItems = total;
    updateBeasiswaRealisasiPageInfo();
}

function updateBeasiswaRealisasiPageInfo() {
    const infoEl = document.getElementById('bea-realisasi-page-info');
    const prevEl = document.getElementById('bea-realisasi-prev');
    const nextEl = document.getElementById('bea-realisasi-next');
    const total = Number(_beasiswaRealisasiState.totalItems || 0);
    const effectiveRows = getBeasiswaEffectiveRowsPerPage(total);
    const start = total === 0 ? 0 : ((_beasiswaRealisasiState.currentPage - 1) * effectiveRows + 1);
    const end = total === 0 ? 0 : Math.min(start + effectiveRows - 1, total);
    if (infoEl) infoEl.textContent = `Menampilkan ${start} - ${end} dari ${total} program`;
    if (prevEl) prevEl.disabled = _beasiswaRealisasiState.currentPage <= 1;
    if (nextEl) nextEl.disabled = end >= total;
}

function changeBeasiswaRealisasiRows() {
    const raw = String(document.getElementById('bea-realisasi-rows')?.value || '10').toLowerCase();
    const rows = Number(raw);
    _beasiswaRealisasiState.rowsPerPage = raw === 'all' ? 0 : ([10, 25, 50].includes(rows) ? rows : 10);
    _beasiswaRealisasiState.currentPage = 1;
    renderMasterBeasiswaRows();
}

function prevBeasiswaRealisasiPage() {
    if (_beasiswaRealisasiState.currentPage <= 1) return;
    _beasiswaRealisasiState.currentPage -= 1;
    renderMasterBeasiswaRows();
}

function nextBeasiswaRealisasiPage() {
    const total = Number(_beasiswaRealisasiState.totalItems || 0);
    const effectiveRows = getBeasiswaEffectiveRowsPerPage(total);
    const totalPages = Math.max(1, Math.ceil(total / effectiveRows));
    if (_beasiswaRealisasiState.currentPage >= totalPages) return;
    _beasiswaRealisasiState.currentPage += 1;
    renderMasterBeasiswaRows();
}

async function loadBeasiswaSummary() {
    const query = getBeasiswaPeriodQuery();
    const res = await apiCall(`/api/scholarships/summary?${query}`);
    if (!res || res.success === false) return;
    document.getElementById('bea-total-program').innerText = Number(res.kpi?.totalProgram || 0);
    document.getElementById('bea-total-siswa').innerText = Number(res.kpi?.totalPenerima || 0);
    document.getElementById('bea-total-anggaran').innerText = formatRp(res.kpi?.totalTerserap || 0);
    const targetPenerimaEl = document.getElementById('bea-target-penerima');
    const targetNominalEl = document.getElementById('bea-target-nominal');
    if (targetPenerimaEl) targetPenerimaEl.innerText = Number(res.kpi?.targetPenerima || 0);
    if (targetNominalEl) targetNominalEl.innerText = formatRp(res.kpi?.targetNominal || 0);

    const tbody = document.getElementById('table-plan-by-program');
    if (tbody) {
        const rows = Array.isArray(res.planByProgram) ? res.planByProgram : [];
        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="3" class="text-center p-6 text-gray-400">Belum ada data rencana pada periode ini.</td></tr>';
        } else {
            tbody.innerHTML = rows.map((r) => `
                <tr class="border-b border-gray-100">
                    <td class="px-6 py-4 font-semibold text-gray-700">${r.nama_beasiswa}</td>
                    <td class="px-6 py-4 text-center"><span class="px-2 py-1 rounded bg-sky-50 text-sky-700 text-xs font-bold">${Number(r.target_recipients || 0)} siswa</span></td>
                    <td class="px-6 py-4 text-right font-bold text-indigo-600">${formatRp(r.target_nominal || 0)}</td>
                </tr>
            `).join('');
        }
    }
    await loadPlanList();
}

function openMasterModal() {
    if (isBeasiswaReadOnly()) return alert('Super admin hanya bisa melihat data beasiswa.');
    const form = document.getElementById('form-master');
    if (form) form.reset();
    document.getElementById('modal-master').classList.remove('hidden');
}
function closeMasterModal() {
    document.getElementById('modal-master').classList.add('hidden');
}

async function handleMasterSubmit(e) {
    if (isBeasiswaReadOnly()) return alert('Super admin hanya bisa melihat data beasiswa.');
    e.preventDefault();
    const body = {
        nama: document.getElementById('master-nama').value,
        nominal: document.getElementById('master-nominal').value,
        jenis_nilai: document.getElementById('master-jenis').value,
        is_active: Number(document.getElementById('master-active').value),
        start_date: document.getElementById('master-start-date').value || null,
        end_date: document.getElementById('master-end-date').value || null,
        min_arrears: Number(document.getElementById('master-min-arrears').value || 0),
        max_recipients: document.getElementById('master-max-recipients').value ? Number(document.getElementById('master-max-recipients').value) : null,
        description: document.getElementById('master-description').value || null
    };

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerHTML = 'Menyimpan...';

    try {
        const res = await apiCall('/api/scholarships/types', 'POST', body);
        if (res && res.success) {
            closeMasterModal();
            await loadMasterBeasiswa();
            await loadBeasiswaSummary();
            alert('Program beasiswa berhasil dibuat!');
        } else {
            alert(res?.message || 'Gagal menyimpan program.');
        }
    } catch (_) {
        alert('Gagal menyimpan.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Simpan Program';
    }
}

async function toggleProgramActive(typeId) {
    if (isBeasiswaReadOnly()) return;
    const target = _beasiswaPrograms.find((x) => Number(x.id) === Number(typeId));
    if (!target) return;
    const nextState = Number(target.is_active ?? 1) === 1 ? 0 : 1;
    const ok = await uiConfirm(`${nextState === 1 ? 'Aktifkan' : 'Nonaktifkan'} program ${target.nama_beasiswa}?`, 'Konfirmasi Program');
    if (!ok) return;
    const payload = {
        nama: target.nama_beasiswa,
        nominal: target.nominal_per_siswa,
        jenis_nilai: target.jenis_nilai || 'nominal',
        is_active: nextState,
        start_date: target.start_date || null,
        end_date: target.end_date || null,
        min_arrears: target.min_arrears || 0,
        max_recipients: target.max_recipients || null,
        description: target.description || null
    };
    const res = await apiCall(`/api/scholarships/types/${typeId}`, 'PUT', payload);
    if (!res || res.success === false) return alert(res?.message || 'Gagal ubah status program.');
    await loadMasterBeasiswa();
}

function openAddRecipient(typeId, typeName) {
    if (isBeasiswaReadOnly()) return alert('Super admin hanya bisa melihat data beasiswa.');
    document.getElementById('form-recipient').reset();
    document.getElementById('recipient-type-id').value = typeId;
    document.getElementById('recipient-title').innerText = 'Tambah Penerima Beasiswa';
    document.getElementById('recipient-subtitle').innerText = typeName;
    document.getElementById('recipient-date').valueAsDate = new Date();
    const preview = document.getElementById('recipient-preview-box');
    if (preview) {
        preview.classList.add('hidden');
        preview.innerHTML = '';
    }
    _selectedRecipientMap = new Map();
    _recipientMode = 'class';
    setRecipientMode('class');
    renderRecipientClassOptions();
    renderRecipientStudentOptions();
    document.getElementById('modal-add-recipient').classList.remove('hidden');
}

function setRecipientMode(mode) {
    _recipientMode = mode === 'student' ? 'student' : 'class';
    const btnClass = document.getElementById('recipient-mode-class');
    const btnStudent = document.getElementById('recipient-mode-student');
    const byClass = document.getElementById('recipient-by-class');
    const byStudent = document.getElementById('recipient-by-student');
    const isClass = _recipientMode === 'class';
    if (btnClass) {
        btnClass.classList.toggle('border-blue-300', isClass);
        btnClass.classList.toggle('bg-blue-50', isClass);
        btnClass.classList.toggle('text-blue-700', isClass);
        btnClass.classList.toggle('border-gray-300', !isClass);
        btnClass.classList.toggle('bg-white', !isClass);
        btnClass.classList.toggle('text-gray-700', !isClass);
    }
    if (btnStudent) {
        btnStudent.classList.toggle('border-blue-300', !isClass);
        btnStudent.classList.toggle('bg-blue-50', !isClass);
        btnStudent.classList.toggle('text-blue-700', !isClass);
        btnStudent.classList.toggle('border-gray-300', isClass);
        btnStudent.classList.toggle('bg-white', isClass);
        btnStudent.classList.toggle('text-gray-700', isClass);
    }
    if (byClass) byClass.classList.toggle('hidden', !isClass);
    if (byStudent) byStudent.classList.toggle('hidden', isClass);
    renderRecipientStudentOptions();
}

function renderRecipientClassOptions() {
    const select = document.getElementById('recipient-class-select');
    if (!select) return;
    const classes = [...new Set((appData.classes || []).map((x) => x.nama_kelas).filter(Boolean))];
    select.innerHTML = '<option value="">-- Pilih Kelas --</option>' + classes.map((c) => `<option value="${c}">${c}</option>`).join('');
}

async function fetchBeasiswaStudentOptions({ kelas = '', search = '', limit = 100 } = {}) {
    const query = new URLSearchParams({
        status: 'Aktif',
        limit: String(limit)
    });
    if (kelas) query.set('kelas', kelas);
    if (search) query.set('search', search);
    const res = await apiCall(`/api/students/options?${query.toString()}`);
    return (res && res.success && Array.isArray(res.rows)) ? res.rows : [];
}

async function renderRecipientStudentOptions() {
    const list = document.getElementById('recipient-student-list');
    if (!list) return;
    // Simpan yang sedang tercentang sebelum list diganti.
    captureCheckedRecipientsFromCurrentList();
    let filtered = [];
    if (_recipientMode === 'class') {
        const kelas = document.getElementById('recipient-class-select')?.value || '';
        filtered = kelas ? await fetchBeasiswaStudentOptions({ kelas, limit: 200 }) : [];
    } else {
        const keyword = (document.getElementById('recipient-student-search')?.value || '').trim();
        filtered = await fetchBeasiswaStudentOptions({ search: keyword, limit: 100 });
    }
    if (!filtered.length) {
        list.innerHTML = '<p class="text-xs text-gray-400">Tidak ada siswa sesuai filter.</p>';
        return;
    }
    list.innerHTML = filtered.map((s) => `
        <label class="recipient-student-option flex items-start gap-2 rounded border border-transparent hover:border-blue-100 hover:bg-blue-50 p-2 cursor-pointer">
            <input type="checkbox" name="recipient_student" value="${s.id}" data-nama="${String(s.nama || '').replaceAll('"', '&quot;')}" data-kelas="${String(s.kelas || '').replaceAll('"', '&quot;')}" data-nis="${String(s.nis || '').replaceAll('"', '&quot;')}" class="mt-0.5" ${_selectedRecipientMap.has(Number(s.id)) ? 'checked' : ''} onchange="toggleRecipientSelection(this)">
            <span class="text-sm text-gray-700"><b>${s.nama}</b> <span class="text-xs text-gray-500">(${s.nis || '-'} • ${s.kelas || '-'})</span></span>
        </label>
    `).join('');
}

function toggleSelectAllRecipientStudents() {
    const checkboxes = document.querySelectorAll('#recipient-student-list input[name="recipient_student"]');
    if (!checkboxes.length) return;
    const allChecked = Array.from(checkboxes).every((cb) => cb.checked);
    checkboxes.forEach((cb) => {
        const checked = !allChecked;
        cb.checked = checked;
        const studentId = Number(cb.value || 0);
        if (!Number.isFinite(studentId) || studentId <= 0) return;
        const recipientPayload = {
            id: studentId,
            nama: cb.dataset.nama || '',
            kelas: cb.dataset.kelas || '',
            nis: cb.dataset.nis || ''
        };
        if (checked && recipientPayload.nis) _selectedRecipientMap.set(studentId, recipientPayload);
        if (!checked) _selectedRecipientMap.delete(studentId);
    });
}

function getSelectedRecipients() {
    captureCheckedRecipientsFromCurrentList();
    return Array.from(_selectedRecipientMap.values()).filter((x) => x.nis);
}

function syncRecipientSelectionFromRenderedList() {
    const checks = Array.from(document.querySelectorAll('#recipient-student-list input[name="recipient_student"]'));
    checks.forEach((cb) => {
        const studentId = Number(cb.value || 0);
        if (!Number.isFinite(studentId) || studentId <= 0) return;
        const payload = {
            id: studentId,
            nama: cb.dataset.nama || '',
            kelas: cb.dataset.kelas || '',
            nis: cb.dataset.nis || ''
        };
        if (cb.checked && payload.nis) {
            _selectedRecipientMap.set(studentId, payload);
        } else {
            _selectedRecipientMap.delete(studentId);
        }
    });
}

function captureCheckedRecipientsFromCurrentList() {
    const checks = Array.from(document.querySelectorAll('#recipient-student-list input[name="recipient_student"]:checked'));
    checks.forEach((cb) => {
        const studentId = Number(cb.value || 0);
        if (!Number.isFinite(studentId) || studentId <= 0) return;
        const payload = {
            id: studentId,
            nama: cb.dataset.nama || '',
            kelas: cb.dataset.kelas || '',
            nis: cb.dataset.nis || ''
        };
        if (payload.nis) _selectedRecipientMap.set(studentId, payload);
    });
}

function toggleRecipientSelection(inputEl) {
    if (!inputEl) return;
    const studentId = Number(inputEl.value || 0);
    if (!Number.isFinite(studentId) || studentId <= 0) return;
    const payload = {
        id: studentId,
        nama: inputEl.dataset.nama || '',
        kelas: inputEl.dataset.kelas || '',
        nis: inputEl.dataset.nis || ''
    };
    if (inputEl.checked && payload.nis) _selectedRecipientMap.set(studentId, payload);
    if (!inputEl.checked) _selectedRecipientMap.delete(studentId);
}

async function previewRecipientScholarship() {
    const typeId = document.getElementById('recipient-type-id').value;
    const selected = getSelectedRecipients();
    if (!typeId || !selected.length) return alert('Pilih minimal satu siswa terlebih dahulu.');
    const res = await apiCall('/api/scholarships/preview', 'POST', { typeId, nis: selected[0].nis });
    const box = document.getElementById('recipient-preview-box');
    if (!box) return;
    if (!res || res.success === false) {
        box.classList.remove('hidden');
        box.classList.remove('border-blue-100', 'bg-blue-50', 'text-blue-800');
        box.classList.add('border-rose-100', 'bg-rose-50', 'text-rose-800');
        box.textContent = res?.message || 'Gagal preview.';
        return;
    }
    const p = res.preview || {};
    box.classList.remove('hidden');
    box.classList.remove('border-rose-100', 'bg-rose-50', 'text-rose-800');
    box.classList.add('border-blue-100', 'bg-blue-50', 'text-blue-800');
    box.innerHTML = `
        <div class="font-bold mb-1">Preview Potongan</div>
        <div>Nama: ${p.nama_siswa || '-'} (${p.nis || '-'})</div>
        <div>Kelas: ${p.kelas || '-'}</div>
        <div>Total Tagihan: ${formatRp((p.total_tagihan ?? p.total_tunggakan) || 0)}</div>
        <div>Nilai Program: ${p.jenis_nilai === 'persen' ? `${p.nominal_program}%` : formatRp(p.nominal_program || 0)}</div>
        <div>Estimasi Potongan: <b>${formatRp(p.estimasi_potongan || 0)}</b></div>
        <div>Sisa Setelah Potongan: ${formatRp(p.sisa_setelah_potongan || 0)}</div>
    `;
}

async function handleRecipientSubmit(e) {
    if (isBeasiswaReadOnly()) return alert('Super admin hanya bisa melihat data beasiswa.');
    e.preventDefault();
    const typeId = document.getElementById('recipient-type-id').value;
    const tanggal = document.getElementById('recipient-date').value;
    const selected = getSelectedRecipients();
    if (!selected.length) return alert('Pilih minimal satu siswa.');

    const failures = [];
    let successCount = 0;
    for (const s of selected) {
        const body = { typeId, nama: s.nama, kelas: s.kelas, nis: s.nis, tanggal };
        const res = await apiCall('/api/scholarships/recipients', 'POST', body);
        if (res && res.success) successCount += 1;
        else failures.push(`${s.nama} (${s.nis}): ${res?.message || 'Gagal'}`);
    }

    await loadMasterBeasiswa();
    await loadBeasiswaSummary();
    if (failures.length) {
        alert(`Berhasil: ${successCount}\nGagal: ${failures.length}\n\n${failures.slice(0, 5).join('\n')}`);
    } else {
        alert(`${successCount} siswa berhasil ditambahkan sebagai penerima.`);
        document.getElementById('modal-add-recipient').classList.add('hidden');
    }
}

async function openDetailList(typeId, typeName) {
    const modal = document.getElementById('modal-detail-list');
    document.getElementById('detail-list-title').innerText = `Penerima: ${typeName}`;
    const tbody = document.getElementById('table-detail-list');
    const historyBody = document.getElementById('table-detail-history');
    tbody.innerHTML = '<tr><td colspan="5" class="text-center p-4">Loading...</td></tr>';
    if (historyBody) historyBody.innerHTML = '<tr><td colspan="4" class="text-center p-4 text-gray-400">Memuat riwayat...</td></tr>';
    modal.classList.remove('hidden');

    const buildQuery = () => {
        const params = new URLSearchParams();
        const q = (document.getElementById('detail-filter-search')?.value || '').trim();
        const kelas = (document.getElementById('detail-filter-kelas')?.value || '').trim();
        const month = (document.getElementById('detail-filter-month')?.value || '').trim();
        const year = (document.getElementById('detail-filter-year')?.value || '').trim();
        const status = (document.getElementById('detail-filter-status')?.value || '').trim();
        if (q) params.set('q', q);
        if (kelas) params.set('kelas', kelas);
        if (month) params.set('month', month);
        if (year) params.set('year', year);
        if (status) params.set('status', status);
        return params.toString();
    };

    const loadRecipients = async () => {
        const qs = buildQuery();
        const list = await apiCall(`/api/scholarships/${typeId}/recipients${qs ? `?${qs}` : ''}`);
        const readOnly = isBeasiswaReadOnly();
        if (!Array.isArray(list) || list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center p-4 text-gray-400">Belum ada penerima.</td></tr>';
            return;
        }
        tbody.innerHTML = list.map((item) => `
            <tr class="border-b hover:bg-gray-50">
                <td class="p-4 font-bold text-gray-700">${item.nama_siswa}</td>
                <td class="p-4 text-gray-600 text-xs">${item.kelas}</td>
                <td class="p-4 text-xs">
                    <span class="px-2 py-1 rounded-full font-semibold ${String(item.student_status || '').toLowerCase() === 'aktif' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}">${item.student_status || '-'}</span>
                </td>
                <td class="p-4 text-gray-500 text-xs">${item.tanggal_terima ? item.tanggal_terima.split('T')[0] : '-'}</td>
                <td class="p-4 text-center">
                    ${readOnly
                        ? '<span class="text-xs font-semibold text-slate-400">Read only</span>'
                        : `<button onclick="deleteRecipient(${item.id}, ${typeId}, '${String(typeName).replaceAll("'", "\\'")}')" class="text-red-500 hover:text-red-700"><i class="fas fa-trash"></i></button>`}
                </td>
            </tr>
        `).join('');
    };

    await loadRecipients();

    const history = await apiCall(`/api/scholarships/${typeId}/history`);
    if (historyBody) {
        if (!Array.isArray(history) || history.length === 0) {
            historyBody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-gray-400">Belum ada riwayat.</td></tr>';
        } else {
            historyBody.innerHTML = history.map((h) => {
                const detail = safeParseJSON(h.detail_json);
                const actor = h.actor_username ? `${h.actor_username} (${h.actor_role || '-'})` : (h.actor_role || '-');
                const actionText = h.action === 'add_recipient' ? 'Tambah Penerima' : 'Batal Penerima';
                const detailText = `${detail.nama_siswa || '-'} / ${detail.nis || '-'} / ${detail.kelas || '-'}${detail.reason ? ` / alasan: ${detail.reason}` : ''}`;
                return `
                    <tr>
                        <td class="p-3 text-xs text-gray-500">${h.created_at ? new Date(h.created_at).toLocaleString('id-ID') : '-'}</td>
                        <td class="p-3 text-xs font-semibold ${h.action === 'add_recipient' ? 'text-emerald-700' : 'text-rose-700'}">${actionText}</td>
                        <td class="p-3 text-xs text-gray-700">${actor}</td>
                        <td class="p-3 text-xs text-gray-600">${detailText}</td>
                    </tr>
                `;
            }).join('');
        }
    }

    const btnApply = document.getElementById('detail-filter-apply');
    const btnReset = document.getElementById('detail-filter-reset');
    if (btnApply) btnApply.onclick = () => loadRecipients();
    if (btnReset) {
        btnReset.onclick = () => {
            ['detail-filter-search', 'detail-filter-kelas', 'detail-filter-month', 'detail-filter-year'].forEach((id) => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            const statusEl = document.getElementById('detail-filter-status');
            if (statusEl) statusEl.value = '';
            loadRecipients();
        };
    }
}

async function deleteRecipient(id, typeId, typeName) {
    if (isBeasiswaReadOnly()) return alert('Super admin hanya bisa melihat data beasiswa.');
    const reason = await uiPrompt('Masukkan alasan pembatalan beasiswa:', 'Pembatalan Beasiswa', 'Alasan...', '');
    if (!reason || !String(reason).trim()) return;
    const preview = await apiCall(`/api/scholarships/recipients/${id}/removal-preview`);
    if (!preview || preview.success === false) return alert(preview?.message || 'Gagal memuat daftar tagihan.');
    openRecipientRemoveModal(preview, {
        recipientId: Number(id),
        typeId: Number(typeId),
        typeName: String(typeName || ''),
        reason: String(reason).trim()
    });
}

function openRecipientRemoveModal(preview, context = {}) {
    const modal = document.getElementById('modal-recipient-remove');
    const subtitleEl = document.getElementById('recipient-remove-subtitle');
    const infoEl = document.getElementById('recipient-remove-info');
    if (!modal) return;
    _recipientRemovalContext = {
        recipientId: Number(context.recipientId || 0),
        typeId: Number(context.typeId || 0),
        typeName: String(context.typeName || ''),
        reason: String(context.reason || '').trim(),
        recipient: preview?.recipient || {},
        bills: Array.isArray(preview?.bills) ? preview.bills : []
    };
    const recipient = _recipientRemovalContext.recipient || {};
    if (subtitleEl) {
        subtitleEl.textContent = `${recipient.nama_siswa || '-'} (${recipient.kelas || '-'}) • ${recipient.nama_beasiswa || '-'}`;
    }
    if (infoEl) {
        infoEl.textContent = `Pilih tagihan yang ingin dibatalkan. Total pembayaran beasiswa saat ini: ${formatRp(recipient.nominal_beasiswa || 0)}.`;
    }
    renderRecipientRemovalBills();
    modal.classList.remove('hidden');
}

function renderRecipientRemovalBills() {
    const listEl = document.getElementById('recipient-remove-bills');
    if (!listEl) return;
    const bills = Array.isArray(_recipientRemovalContext?.bills) ? _recipientRemovalContext.bills : [];
    if (!bills.length) {
        listEl.innerHTML = '<div class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">Tidak ada tagihan terbayar yang bisa dipilih.</div>';
        recalcRecipientRemovalTotal();
        return;
    }
    listEl.innerHTML = bills.map((bill) => `
        <label class="flex items-start gap-3 rounded-lg border border-gray-200 p-3 hover:bg-gray-50 cursor-pointer">
            <input type="checkbox" class="mt-1 recipient-remove-bill" value="${bill.id}" checked onchange="recalcRecipientRemovalTotal()">
            <div class="min-w-0 flex-1">
                <div class="text-sm font-semibold text-gray-700 truncate">${bill.nama_tagihan || '-'}</div>
                <div class="text-xs text-gray-500 truncate">${bill.id_tagihan_code || '-'} • ${bill.tanggal_buat ? String(bill.tanggal_buat).slice(0, 10) : '-'}</div>
                <div class="text-xs text-gray-600 mt-1">
                    Terbayar: <span class="font-semibold text-emerald-700">${formatRp(bill.terbayar || 0)}</span>
                </div>
            </div>
        </label>
    `).join('');
    recalcRecipientRemovalTotal();
}

function recalcRecipientRemovalTotal() {
    const totalEl = document.getElementById('recipient-remove-total');
    const submitEl = document.getElementById('recipient-remove-submit');
    const context = _recipientRemovalContext || {};
    const bills = Array.isArray(context.bills) ? context.bills : [];
    const selectedIds = Array.from(document.querySelectorAll('.recipient-remove-bill:checked'))
        .map((el) => Number(el.value))
        .filter((id) => Number.isFinite(id) && id > 0);
    const selectedMap = new Set(selectedIds);
    const selectedNominal = bills
        .filter((b) => selectedMap.has(Number(b.id)))
        .reduce((sum, b) => sum + Number(b.terbayar || 0), 0);
    const paymentNominal = Number(context.recipient?.nominal_beasiswa || 0);
    const estimatedRefund = Math.min(selectedNominal, paymentNominal);

    if (totalEl) {
        totalEl.textContent = `Tagihan dipilih: ${selectedIds.length} • Estimasi refund: ${formatRp(estimatedRefund)}.`;
    }
    if (submitEl) submitEl.disabled = selectedIds.length === 0;
}

function closeRecipientRemoveModal() {
    const modal = document.getElementById('modal-recipient-remove');
    if (modal) modal.classList.add('hidden');
    _recipientRemovalContext = null;
}

async function submitRecipientRemoval() {
    const ctx = _recipientRemovalContext;
    if (!ctx || !ctx.recipientId) return;
    const selectedBillIds = Array.from(document.querySelectorAll('.recipient-remove-bill:checked'))
        .map((el) => Number(el.value))
        .filter((id) => Number.isFinite(id) && id > 0);
    if (!selectedBillIds.length) {
        alert('Pilih minimal 1 tagihan.');
        return;
    }
    if (!(await uiConfirm('Proses pembatalan beasiswa untuk tagihan yang dipilih?', 'Konfirmasi Pembatalan'))) return;
    const submitEl = document.getElementById('recipient-remove-submit');
    const oldText = submitEl?.textContent || '';
    if (submitEl) {
        submitEl.disabled = true;
        submitEl.textContent = 'Memproses...';
    }
    try {
        const res = await apiCall(`/api/scholarships/recipients/${ctx.recipientId}`, 'DELETE', {
            reason: ctx.reason,
            bill_ids: selectedBillIds
        });
        if (!res || res.success === false) return alert(res?.message || 'Gagal membatalkan beasiswa.');
        closeRecipientRemoveModal();
        await openDetailList(ctx.typeId, ctx.typeName);
        await loadMasterBeasiswa();
        await loadBeasiswaSummary();
        alert(res.message || 'Pembatalan beasiswa berhasil diproses.');
    } finally {
        if (submitEl) {
            submitEl.disabled = false;
            submitEl.textContent = oldText || 'Hapus dari Beasiswa';
        }
    }
}

async function exportBeasiswaReport() {
    const report = document.getElementById('bea-export-report')?.value || 'realisasi_operasional';
    const query = getBeasiswaPeriodQuery();
    const res = await apiCall(`/api/scholarships/export?report=${encodeURIComponent(report)}&${query}`);
    if (!res || res.success === false) return alert(res?.message || 'Gagal export laporan.');
    const rows = Array.isArray(res.rows) ? res.rows : [];
    _planRowsCache = rows;
    if (!rows.length) return alert('Tidak ada data untuk diexport.');
    const wb = XLSX.utils.book_new();
    const metadata = [{
        laporan: res.report_label || report,
        periode: res.period?.label || '-',
        filter_status: res.filters?.student_scope || '-',
        generated_at: new Date().toLocaleString('id-ID')
    }];
    const wsMeta = XLSX.utils.json_to_sheet(metadata);
    const wsData = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, wsMeta, 'Metadata');
    XLSX.utils.book_append_sheet(wb, wsData, 'Data');
    XLSX.writeFile(wb, `laporan_beasiswa_${String(res.report || report).replace(/[^a-z0-9_]+/gi, '_')}_${Date.now()}.xlsx`);
}

function safeParseJSON(jsonText) {
    try {
        if (!jsonText) return {};
        return typeof jsonText === 'string' ? JSON.parse(jsonText) : jsonText;
    } catch (_) {
        return {};
    }
}
async function deleteProgramBeasiswa(typeId, programName) {
    if (isBeasiswaReadOnly()) return alert('Super admin hanya bisa melihat data beasiswa.');
    if (!(await uiConfirm(`Hapus program "${programName}"?`, 'Konfirmasi Hapus Program'))) return;
    const res = await apiCall(`/api/scholarships/types/${typeId}`, 'DELETE');
    if (!res || res.success === false) {
        alert(res?.message || 'Gagal menghapus program beasiswa.');
        return;
    }
    alert(res.message || 'Program beasiswa dihapus.');
    await loadMasterBeasiswa();
    await loadBeasiswaSummary();
}

function openPlanModal() {
    if (isBeasiswaReadOnly()) return alert('Super admin hanya bisa melihat data beasiswa.');
    const modal = document.getElementById('modal-plan');
    const form = document.getElementById('form-plan');
    const typeSelect = document.getElementById('plan-type-id');
    if (!modal || !form || !typeSelect) return;
    form.reset();
    const planIdEl = document.getElementById('plan-id');
    if (planIdEl) planIdEl.value = '';
    const titleEl = modal.querySelector('h3');
    if (titleEl) titleEl.textContent = 'Tambah Rencana Beasiswa';
    const submitBtn = document.getElementById('btn-plan-submit');
    if (submitBtn) submitBtn.textContent = 'Simpan Rencana';
    const activePrograms = (_beasiswaPrograms || []).filter((x) => Number(x.is_active ?? 1) === 1);
    typeSelect.innerHTML = activePrograms.length
        ? activePrograms.map((x) => `<option value="${x.id}">${x.nama_beasiswa}</option>`).join('')
        : '<option value="">-- Tidak ada program aktif --</option>';
    const now = new Date();
    const monthEl = document.getElementById('plan-target-month');
    const yearEl = document.getElementById('plan-target-year');
    const activeEl = document.getElementById('plan-active');
    if (monthEl) monthEl.value = String(now.getMonth() + 1);
    if (yearEl) yearEl.value = String(now.getFullYear());
    if (activeEl) activeEl.value = '1';
    modal.classList.remove('hidden');
}

function closePlanModal() {
    const modal = document.getElementById('modal-plan');
    if (modal) modal.classList.add('hidden');
}

async function handlePlanSubmit(e) {
    if (isBeasiswaReadOnly()) return alert('Super admin hanya bisa melihat data beasiswa.');
    e.preventDefault();
    const planId = Number(document.getElementById('plan-id')?.value || 0);
    const body = {
        type_id: Number(document.getElementById('plan-type-id')?.value || 0),
        target_month: Number(document.getElementById('plan-target-month')?.value || 0),
        target_year: Number(document.getElementById('plan-target-year')?.value || 0),
        target_recipients: Number(document.getElementById('plan-target-recipients')?.value || 0),
        target_nominal: Number(document.getElementById('plan-target-nominal')?.value || 0),
        notes: document.getElementById('plan-notes')?.value || null,
        is_active: Number(document.getElementById('plan-active')?.value || 1)
    };
    const url = planId > 0 ? `/api/scholarships/plans/${planId}` : '/api/scholarships/plans';
    const method = planId > 0 ? 'PUT' : 'POST';
    const res = await apiCall(url, method, body);
    if (!res || res.success === false) return alert(res?.message || 'Gagal menyimpan rencana.');
    alert(res.message || 'Rencana beasiswa disimpan.');
    closePlanModal();
    await loadBeasiswaSummary();
}

async function loadPlanList() {
    const tbody = document.getElementById('table-plan-list');
    if (!tbody) return;
    const query = getBeasiswaPeriodQuery();
    const res = await apiCall(`/api/scholarships/plans?${query}`);
    if (!res || res.success === false) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center p-6 text-rose-500">Gagal memuat detail rencana.</td></tr>';
        return;
    }
    const rows = Array.isArray(res.rows) ? res.rows : [];
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center p-6 text-gray-400">Belum ada detail rencana pada periode ini.</td></tr>';
        return;
    }
    const readOnly = isBeasiswaReadOnly();
    tbody.innerHTML = rows.map((r) => `
        <tr>
            <td class="px-6 py-4 text-gray-700">${r.target_month}/${r.target_year}</td>
            <td class="px-6 py-4 font-semibold text-gray-700">${r.nama_beasiswa}</td>
            <td class="px-6 py-4 text-center">${Number(r.target_recipients || 0)}</td>
            <td class="px-6 py-4 text-right font-bold text-indigo-600">${formatRp(r.target_nominal || 0)}</td>
            <td class="px-6 py-4 text-gray-500">${r.notes || '-'}</td>
            <td class="px-6 py-4 text-center">
                ${readOnly ? '<span class="text-xs text-slate-400">Read only</span>' : `
                    <button onclick="editPlanById(${r.id})" class="px-2 py-1 text-xs rounded bg-blue-50 text-blue-600 hover:bg-blue-100">Edit</button>
                    <button onclick="deletePlan(${r.id})" class="px-2 py-1 text-xs rounded bg-rose-50 text-rose-600 hover:bg-rose-100 ml-1">Hapus</button>
                `}
            </td>
        </tr>
    `).join('');
}

function editPlanById(planId) {
    if (isBeasiswaReadOnly()) return;
    const plan = (_planRowsCache || []).find((x) => Number(x.id) === Number(planId));
    if (!plan) return;
    openPlanModal();
    document.getElementById('plan-id').value = plan.id || '';
    document.getElementById('plan-type-id').value = plan.type_id || '';
    document.getElementById('plan-target-month').value = plan.target_month || '';
    document.getElementById('plan-target-year').value = plan.target_year || '';
    document.getElementById('plan-target-recipients').value = plan.target_recipients || 0;
    document.getElementById('plan-target-nominal').value = plan.target_nominal || 0;
    document.getElementById('plan-notes').value = plan.notes || '';
    document.getElementById('plan-active').value = Number(plan.is_active ?? 1) === 1 ? '1' : '0';
    const modal = document.getElementById('modal-plan');
    const titleEl = modal?.querySelector('h3');
    if (titleEl) titleEl.textContent = 'Edit Rencana Beasiswa';
    const submitBtn = document.getElementById('btn-plan-submit');
    if (submitBtn) submitBtn.textContent = 'Update Rencana';
}

async function deletePlan(id) {
    if (isBeasiswaReadOnly()) return;
    if (!(await uiConfirm('Hapus rencana beasiswa ini?', 'Konfirmasi Hapus Rencana'))) return;
    const res = await apiCall(`/api/scholarships/plans/${id}`, 'DELETE');
    if (!res || res.success === false) return alert(res?.message || 'Gagal menghapus rencana.');
    alert(res.message || 'Rencana dihapus.');
    await loadBeasiswaSummary();
}
