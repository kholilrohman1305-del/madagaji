// js/kenaikan.js

async function initKenaikan() {
    if (typeof window.refreshAppData === 'function') {
        await window.refreshAppData(false);
    }
    renderClassOptions();
    const yearInput = document.getElementById('target-tahun-lulus');
    if (yearInput && !yearInput.value) yearInput.value = new Date().getFullYear();
    
    // Listener Form Submit
    document.getElementById('form-promote').onsubmit = handlePromoteSubmit;

    // Listener Dropdown Status (Otomatis set status jika pilih ALUMNI)
    document.getElementById('target-class').addEventListener('change', (e) => {
        const statusSelect = document.getElementById('target-status');
        if (e.target.value === 'ALUMNI') {
            statusSelect.value = 'Lulus';
        } else {
            statusSelect.value = 'Aktif';
        }
        toggleKenaikanTahunLulusField();
    });
    document.getElementById('target-status').addEventListener('change', toggleKenaikanTahunLulusField);
    toggleKenaikanTahunLulusField();
}

function toggleKenaikanTahunLulusField() {
    const group = document.getElementById('tahun-lulus-group');
    const targetClass = document.getElementById('target-class')?.value || '';
    const targetStatus = document.getElementById('target-status')?.value || '';
    const show = targetStatus === 'Lulus' || targetClass === 'ALUMNI';
    if (group) group.classList.toggle('hidden', !show);
}

// 1. Render Dropdown Kelas (Asal & Tujuan)
function renderClassOptions() {
    const classes = appData.classes || [];
    const sourceSelect = document.getElementById('source-class');
    const targetSelect = document.getElementById('target-class');

    // Simpan opsi ALUMNI agar tidak hilang saat dirender ulang
    const alumniOption = '<option value="ALUMNI" class="font-bold text-red-600">-- SET SEBAGAI ALUMNI --</option>';
    const defaultOption = '<option value="">-- Pilih Kelas --</option>';

    const optionsHTML = classes.map(c => `<option value="${c.nama_kelas}">${c.nama_kelas}</option>`).join('');

    sourceSelect.innerHTML = defaultOption + optionsHTML;
    targetSelect.innerHTML = defaultOption + alumniOption + optionsHTML;
}

// 2. Load Siswa berdasarkan Kelas Asal
async function loadStudentsByClass() {
    const className = document.getElementById('source-class').value;
    const tbody = document.getElementById('promote-student-list');
    
    if (!className) {
        tbody.innerHTML = '<tr><td colspan="4" class="p-8 text-center text-gray-400 italic">Silakan pilih kelas asal.</td></tr>';
        document.getElementById('selected-count').innerText = "0 Siswa";
        return;
    }

    tbody.innerHTML = '<tr><td colspan="4" class="p-8 text-center"><i class="fas fa-spinner fa-spin"></i> Memuat...</td></tr>';

    // Ambil siswa aktif by class dari API (server-side filter)
    const studentRes = await apiCall(`/api/students/list?page=1&limit=100&status=Aktif&kelas=${encodeURIComponent(className)}`);
    const students = (studentRes && studentRes.success && Array.isArray(studentRes.rows)) ? studentRes.rows : [];

    if (students.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="p-8 text-center text-red-400">Tidak ada siswa aktif di kelas ini.</td></tr>';
        return;
    }

    // Kita butuh data tagihan untuk ditampilkan sebagai info
    // (Opsional, tapi bagus untuk pertimbangan sebelum meluluskan)
    const arrearsRes = await apiCall(`/api/arrears?page=1&limit=100&status=aktif&class=${encodeURIComponent(className)}`);
    const arrearsMap = {};
    const arrearsRows = Array.isArray(arrearsRes?.rows) ? arrearsRes.rows : [];
    if(arrearsRows.length) arrearsRows.forEach(a => arrearsMap[a.nama] = a.sisa);

    tbody.innerHTML = students.map(s => {
        const sisaUtang = arrearsMap[s.nama] || 0;
        const utangColor = sisaUtang > 0 ? 'text-red-600 font-bold' : 'text-gray-400';
        
        return `
        <tr class="hover:bg-gray-50">
            <td class="p-3 text-center">
                <input type="checkbox" name="promote_check" value="${s.id}" class="w-4 h-4 rounded text-primary-600 focus:ring-primary-500" onchange="updateCount()">
            </td>
            <td class="p-3 font-medium text-gray-700">${s.nama}</td>
            <td class="p-3 text-gray-500">${s.nis}</td>
            <td class="p-3 text-right ${utangColor}">${formatRp(sisaUtang)}</td>
        </tr>
    `}).join('');
    
    // Reset Check All
    document.getElementById('check-all').checked = false;
    updateCount();
}

// 3. Helper: Select All & Count
let isAllChecked = false;
function toggleSelectAll() {
    const checkboxes = document.querySelectorAll('input[name="promote_check"]');
    isAllChecked = !isAllChecked;
    checkboxes.forEach(cb => cb.checked = isAllChecked);
    document.getElementById('check-all').checked = isAllChecked;
    updateCount();
}

function updateCount() {
    const count = document.querySelectorAll('input[name="promote_check"]:checked').length;
    document.getElementById('selected-count').innerText = `${count} Siswa`;
}

// 4. Handle Submit (Proses Pindah)
async function handlePromoteSubmit(e) {
    e.preventDefault();
    
    const targetClass = document.getElementById('target-class').value;
    const targetStatus = document.getElementById('target-status').value;
    const tahunLulus = document.getElementById('target-tahun-lulus').value;
    const sourceClass = document.getElementById('source-class').value;

    // Ambil ID siswa yang dicentang
    const checkboxes = document.querySelectorAll('input[name="promote_check"]:checked');
    const studentIds = Array.from(checkboxes).map(cb => cb.value);

    if (!targetClass) return alert("Pilih kelas tujuan!");
    if (sourceClass === targetClass) return alert("Kelas asal dan tujuan tidak boleh sama.");
    if (studentIds.length === 0) return alert("Pilih minimal satu siswa untuk dipindahkan.");
    if ((targetStatus === 'Lulus' || targetClass === 'ALUMNI') && !tahunLulus) return alert("Tahun lulus wajib diisi.");

    // Konfirmasi
    const msg = targetStatus === 'Lulus' 
        ? `Apakah Anda yakin ingin MELULUSKAN ${studentIds.length} siswa ini?`
        : `Apakah Anda yakin memindahkan ${studentIds.length} siswa dari ${sourceClass} ke ${targetClass}?`;

    if (!(await uiConfirm(msg, 'Konfirmasi Kenaikan'))) return;

    const btn = document.getElementById('btn-promote');
    btn.disabled = true; btn.innerHTML = "Memproses...";

    try {
        const res = await apiCall('/api/students/promote', 'POST', {
            studentIds,
            targetClass,
            targetStatus,
            tahunLulus
        });

        if (res.success) {
            alert(res.message);
            
            // Refresh Data Global
            const newData = await (typeof window.refreshAppData === 'function'
                ? window.refreshAppData(true)
                : apiCall('/api/initial-data'));
            if (newData) appData.classes = newData.classes;
            
            // Reset UI
            loadStudentsByClass(); // Refresh list (siswa yang pindah akan hilang dari list ini)
        } else {
            alert(res.message);
        }
    } catch (err) {
        console.error(err);
        alert("Gagal memproses data.");
    } finally {
        btn.disabled = false; 
        btn.innerHTML = "Proses Pindah / Lulus";
    }
}
