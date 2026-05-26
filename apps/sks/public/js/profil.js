// js/profil.js

let _profilCache = null;

function showProfilAlert(type, message) {
    const el = document.getElementById('profil-alert');
    if (!el) return;
    el.className = 'rounded-xl border px-4 py-3 text-sm font-semibold';
    if (type === 'success') {
        el.classList.add('bg-emerald-50', 'border-emerald-200', 'text-emerald-700');
    } else {
        el.classList.add('bg-rose-50', 'border-rose-200', 'text-rose-700');
    }
    el.textContent = message;
    el.classList.remove('hidden');
}

function updatePinBadge(configured) {
    const badge = document.getElementById('profil-pin-badge');
    if (!badge) return;
    if (configured) {
        badge.className = 'text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 font-bold';
        badge.textContent = 'Sudah diset';
    } else {
        badge.className = 'text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-bold';
        badge.textContent = 'Belum diset';
    }
}

function fillProfilForm(profile) {
    document.getElementById('profil-branch-code').value = profile.kode_cabang || '-';
    document.getElementById('profil-branch-name').value = profile.nama_cabang || '';
    document.getElementById('profil-branch-phone').value = profile.telepon || '';
    document.getElementById('profil-branch-address').value = profile.alamat || '';
    document.getElementById('profil-account-name').value = profile.nama_lengkap || '';
    document.getElementById('profil-account-username').value = profile.username || '';
    if (profile.pin_change_pending) {
        const badge = document.getElementById('profil-pin-badge');
        if (badge) {
            badge.className = 'text-xs px-2 py-1 rounded-full bg-sky-100 text-sky-700 font-bold';
            badge.textContent = 'Menunggu Approval';
        }
    } else {
        updatePinBadge(Boolean(profile.payment_pin_configured));
    }
}

async function loadProfilData() {
    const res = await apiCall('/api/profile/me');
    if (!res || res.success !== true) {
        throw new Error(res?.message || 'Gagal memuat profil.');
    }
    _profilCache = res.profile;
    fillProfilForm(_profilCache);
}

async function saveBranchProfile(e) {
    e.preventDefault();
    const body = {
        nama_cabang: document.getElementById('profil-branch-name').value.trim(),
        telepon: document.getElementById('profil-branch-phone').value.trim(),
        alamat: document.getElementById('profil-branch-address').value.trim()
    };
    const res = await apiCall('/api/profile/branch', 'PUT', body);
    if (!res || res.success !== true) {
        showProfilAlert('error', res?.message || 'Gagal menyimpan profil cabang.');
        return;
    }
    showProfilAlert('success', res.message || 'Profil cabang berhasil diperbarui.');
    await loadProfilData();
}

async function saveAccountProfile(e) {
    e.preventDefault();
    const body = {
        nama_lengkap: document.getElementById('profil-account-name').value.trim(),
        username: document.getElementById('profil-account-username').value.trim(),
        current_password: document.getElementById('profil-current-password').value,
        new_password: document.getElementById('profil-new-password').value
    };
    const res = await apiCall('/api/profile/account', 'PUT', body);
    if (!res || res.success !== true) {
        showProfilAlert('error', res?.message || 'Gagal menyimpan profil akun.');
        return;
    }
    document.getElementById('profil-current-password').value = '';
    document.getElementById('profil-new-password').value = '';
    showProfilAlert('success', res.message || 'Profil akun berhasil diperbarui.');
    await loadProfilData();
    if (_profilCache) {
        appData.admin = appData.admin || {};
        appData.admin.username = _profilCache.username;
        appData.admin.nama_lengkap = _profilCache.nama_lengkap;
    }
    updateAdminHeader();
}

async function savePaymentPin(e) {
    e.preventDefault();
    if (_profilCache?.pin_change_pending) {
        showProfilAlert('error', 'Masih ada permintaan perubahan PIN yang menunggu approval super admin.');
        return;
    }
    const oldPin = String(document.getElementById('profil-pin-old').value || '').trim();
    const pin = String(document.getElementById('profil-pin').value || '').trim();
    const confirmPin = String(document.getElementById('profil-pin-confirm').value || '').trim();
    const currentPassword = String(document.getElementById('profil-pin-current-password').value || '');
    if (!/^\d{6}$/.test(pin)) {
        showProfilAlert('error', 'PIN wajib 6 digit angka.');
        return;
    }
    if (pin !== confirmPin) {
        showProfilAlert('error', 'Konfirmasi PIN tidak sama.');
        return;
    }
    if (!currentPassword) {
        showProfilAlert('error', 'Password akun saat ini wajib diisi.');
        return;
    }
    const res = await apiCall('/api/profile/payment-pin', 'PUT', {
        old_pin: oldPin || null,
        pin,
        confirm_pin: confirmPin,
        current_password: currentPassword
    });
    if (!res || res.success !== true) {
        showProfilAlert('error', res?.message || 'Gagal menyimpan PIN transaksi.');
        return;
    }
    document.getElementById('profil-pin-old').value = '';
    document.getElementById('profil-pin').value = '';
    document.getElementById('profil-pin-confirm').value = '';
    document.getElementById('profil-pin-current-password').value = '';
    showProfilAlert('success', res.message || 'Permintaan perubahan PIN berhasil dikirim.');
    await loadProfilData();
}

async function initProfil() {
    const role = appData.role || 'admin';
    if (role === 'super_admin') {
        document.getElementById('page-container').innerHTML = `
            <div class="p-10 text-center text-gray-500 bg-white rounded-xl border">
                Menu Profil Cabang hanya tersedia untuk akun admin cabang.
            </div>
        `;
        return;
    }

    const branchForm = document.getElementById('profil-branch-form');
    const accountForm = document.getElementById('profil-account-form');
    const pinForm = document.getElementById('profil-pin-form');
    if (branchForm) branchForm.onsubmit = saveBranchProfile;
    if (accountForm) accountForm.onsubmit = saveAccountProfile;
    if (pinForm) pinForm.onsubmit = savePaymentPin;

    try {
        await loadProfilData();
    } catch (err) {
        showProfilAlert('error', err.message || 'Gagal memuat profil.');
    }
}
