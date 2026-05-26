// js/pengaturan.js

async function initPengaturan() {
    loadSettings();
}

async function loadSettings() {
    // Tampilkan loading di form (opsional, atau biarkan kosong dulu)
    try {
        const settings = await apiCall('/api/settings');
        if (settings) {
            document.getElementById('set-nama').value = settings.nama_sekolah || '';
            document.getElementById('set-alamat').value = settings.alamat_sekolah || '';
            document.getElementById('set-telepon').value = settings.telepon || '';
            document.getElementById('set-email').value = settings.email || '';
            document.getElementById('set-website').value = settings.website || '';
            document.getElementById('set-footer').value = settings.footer_kwitansi || '';
            
            // Simpan di global appData agar bisa diakses oleh Print Helper tanpa fetch ulang
            appData.settings = settings; 
        }
    } catch (e) {
        console.error("Gagal memuat pengaturan:", e);
    }
}

async function saveSettings() {
    const btn = document.getElementById('btn-save-settings');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';

    const body = {
        nama: document.getElementById('set-nama').value,
        alamat: document.getElementById('set-alamat').value,
        telepon: document.getElementById('set-telepon').value,
        email: document.getElementById('set-email').value,
        website: document.getElementById('set-website').value,
        footer: document.getElementById('set-footer').value
    };

    try {
        const res = await apiCall('/api/settings', 'PUT', body);
        if (res.success) {
            alert("Pengaturan berhasil disimpan.");
            // Update global state
            appData.settings = { 
                nama_sekolah: body.nama, 
                alamat_sekolah: body.alamat,
                telepon: body.telepon,
                email: body.email,
                website: body.website,
                footer_kwitansi: body.footer
            };
        } else {
            alert(res?.message || "Gagal menyimpan.");
        }
    } catch (e) {
        console.error(e);
        alert("Terjadi kesalahan koneksi.");
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}
