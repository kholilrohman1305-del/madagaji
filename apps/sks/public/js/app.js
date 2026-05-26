// js/app.js

const SKS_BASE = window.location.pathname.startsWith('/sks') ? '/sks' : '';
const LAST_PAGE_KEY = 'sks_last_page';
const PENAGIHAN_TAB_KEY = 'sks_penagihan_tab';
const PENAGIHAN_SUBTAB_KEY = 'sks_penagihan_subtab';
const TERM_REPLACERS = [
    { from: /\bCabang\b/g, to: 'Bendahara' },
    { from: /\bcabang\b/g, to: 'bendahara' }
];
let termObserver = null;
const withSksBase = (path) => {
    if (!path) return path;
    if (/^https?:\/\//i.test(path)) return path;
    if (!path.startsWith('/')) return path;
    return `${SKS_BASE}${path}`;
};
window.sksUrl = withSksBase;

function replaceTerms(text) {
    let result = String(text || '');
    for (const rule of TERM_REPLACERS) result = result.replace(rule.from, rule.to);
    return result;
}

function localizeNodeText(node) {
    if (!node) return;
    if (node.nodeType === Node.TEXT_NODE) {
        const oldVal = node.nodeValue;
        const newVal = replaceTerms(oldVal);
        if (newVal !== oldVal) node.nodeValue = newVal;
        return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = String(node.tagName || '').toUpperCase();
    if (tag === 'SCRIPT' || tag === 'STYLE') return;
    ['placeholder', 'title', 'aria-label'].forEach((attr) => {
        if (node.hasAttribute?.(attr)) {
            const oldVal = node.getAttribute(attr);
            const newVal = replaceTerms(oldVal);
            if (newVal !== oldVal) node.setAttribute(attr, newVal);
        }
    });
    node.childNodes?.forEach(localizeNodeText);
}

function applyGlobalTermLocalization(root = document.body) {
    if (!root) return;
    localizeNodeText(root);
}

function startGlobalTermLocalizationObserver() {
    if (termObserver || !document.body) return;
    termObserver = new MutationObserver((mutations) => {
        for (const m of mutations) {
            if (m.type === 'characterData') {
                localizeNodeText(m.target);
                continue;
            }
            m.addedNodes?.forEach(localizeNodeText);
        }
    });
    termObserver.observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true
    });
}

function localizeApiPayload(payload) {
    if (!payload || typeof payload !== 'object') return payload;
    const messageKeys = ['message', 'error', 'warning', 'title'];
    for (const key of messageKeys) {
        if (typeof payload[key] === 'string') payload[key] = replaceTerms(payload[key]);
    }
    return payload;
}

// 1. GLOBAL STATE
const appData = {
    rawStudents: [],
    classes: [],
    payments: [],
    chartData: {},
    schoolYears: [],
    semesters: [],
    activeSchoolYear: null,
    activeSemester: null,
    settings: null,
    admin: null,
    role: null,
    guruHasExpenseResponsibility: true
};
const INITIAL_DATA_CACHE_TTL_MS = 120000;
const initialDataClientCache = new Map();
let _pinPromptPromise = null;
let _pinReverifyInterval = null;

function applyClientRoleScope() {
    const role = String(appData.role || '');
    const branchId = Number(appData?.admin?.branch_id || 0);
    const isBranchScopedRole = role === 'admin' || role === 'wali_kelas' || role === 'guru';
    if (!isBranchScopedRole || branchId <= 0) return;

    const byBranch = (row) => Number(row?.branch_id || 0) === branchId;
    if (Array.isArray(appData.classes)) appData.classes = appData.classes.filter(byBranch);
    if (Array.isArray(appData.rawStudents)) appData.rawStudents = appData.rawStudents.filter(byBranch);
    if (Array.isArray(appData.payments)) appData.payments = appData.payments.filter(byBranch);
    if (Array.isArray(appData.existingBills)) {
        appData.existingBills = appData.existingBills.filter((row) => {
            if (row?.branch_id === undefined || row?.branch_id === null) return true;
            return Number(row.branch_id || 0) === branchId;
        });
    }
    appData.branchSummary = [];
}

function getInitialDataCacheKey(options = {}) {
    return JSON.stringify({
        includeRawStudents: options.includeRawStudents === true ? 1 : 0,
        includeExistingBills: options.includeExistingBills === true ? 1 : 0
    });
}

function cloneInitialDataPayload(payload) {
    try {
        return JSON.parse(JSON.stringify(payload || {}));
    } catch (_) {
        return payload || null;
    }
}

async function refreshAppData(force = false, options = {}) {
    const includeRawStudents = options.includeRawStudents === true;
    const includeExistingBills = options.includeExistingBills === true;
    const cacheKey = getInitialDataCacheKey({ includeRawStudents, includeExistingBills });
    const cacheEntry = initialDataClientCache.get(cacheKey) || { payload: null, cachedAt: 0, inFlight: null };
    const query = new URLSearchParams();
    if (includeRawStudents) query.set('include_raw_students', '1');
    if (includeExistingBills) query.set('include_existing_bills', '1');
    const endpoint = `/api/initial-data${query.toString() ? `?${query.toString()}` : ''}`;
    if (!force && cacheEntry.payload && (Date.now() - Number(cacheEntry.cachedAt || 0)) <= INITIAL_DATA_CACHE_TTL_MS) {
        const cachedData = cloneInitialDataPayload(cacheEntry.payload);
        Object.assign(appData, cachedData);
        applyClientRoleScope();
        return cachedData;
    }
    if (!force && cacheEntry.inFlight) {
        const pendingData = await cacheEntry.inFlight;
        const clonedPending = cloneInitialDataPayload(pendingData);
        Object.assign(appData, clonedPending);
        applyClientRoleScope();
        return clonedPending;
    }
    cacheEntry.inFlight = apiCall(endpoint);
    initialDataClientCache.set(cacheKey, cacheEntry);
    const data = await cacheEntry.inFlight;
    cacheEntry.inFlight = null;
    if (data) {
        cacheEntry.payload = cloneInitialDataPayload(data);
        cacheEntry.cachedAt = Date.now();
        initialDataClientCache.set(cacheKey, cacheEntry);
        Object.assign(appData, data);
        applyClientRoleScope();
    }
    return data || null;
}
window.refreshAppData = refreshAppData;

// 2. INITIALIZATION
document.addEventListener('DOMContentLoaded', async () => {
    applyGlobalTermLocalization(document.body);
    startGlobalTermLocalizationObserver();
    // Set Tahun Copyright Otomatis
    const yearEl = document.getElementById('copyright-year');
    if(yearEl) yearEl.innerText = new Date().getFullYear();

    // Must be authenticated; otherwise redirect to login.
    const me = await apiCall('/api/auth/me');
    if (!me || !me.success) {
        window.location.href = withSksBase('/login.html');
        return;
    }
    appData.admin = me.admin || null;
    appData.role = me.role || 'admin';
    updateAdminHeader();
    applyRoleMenuAccess();
    if (appData.role === 'admin') {
        const pinReady = await ensurePinVerificationPrompt(false);
        if (!pinReady) {
            await uiAlert('Verifikasi PIN diperlukan untuk membuka sistem.', 'Akses Ditahan');
            return;
        }
        if (_pinReverifyInterval) clearInterval(_pinReverifyInterval);
        _pinReverifyInterval = setInterval(() => {
            ensurePinVerificationPrompt(true).catch(() => {});
        }, 5 * 60 * 1000);
    }

    // Fetch Initial Data dulu agar halaman pertama tidak render kosong.
    try {
        if (String(appData.role || '') === 'guru') {
            await refreshGuruExpenseResponsibility();
            applyRoleMenuAccess();
        } else {
            await refreshAppData();
            const settings = await apiCall('/api/settings');
            if (settings) appData.settings = settings;
            await refreshGuruExpenseResponsibility();
            applyRoleMenuAccess();
        }
    } catch (e) {
        console.error("Initial load error:", e);
    }
    updateActivePeriodBadge();

    // Load halaman terakhir (persist), fallback dashboard.
    const savedPage = localStorage.getItem(LAST_PAGE_KEY) || 'dashboard';
    loadPage(savedPage);
});

async function refreshGuruExpenseResponsibility() {
    if (String(appData.role || '') !== 'guru') {
        appData.guruHasExpenseResponsibility = true;
        return;
    }
    const res = await apiCall('/api/expenses');
    appData.guruHasExpenseResponsibility = Array.isArray(res?.rows) && res.rows.length > 0;
}

// 3. ROUTER UTAMA
async function loadPage(page) {
    if ((appData.role || 'admin') === 'super_admin') {
        const forbiddenPages = new Set(['pembayaran', 'tagihan', 'kenaikan', 'pengaturan', 'profil']);
        if (forbiddenPages.has(page)) page = 'dashboard';
    } else if ((appData.role || 'admin') === 'wali_kelas') {
        const allowedPages = new Set([
            'dashboard',
            'penagihan',
            'tunggakan-aktif',
            'tunggakan-alumni',
            'siswa-aktif',
            'siswa-alumni',
            'siswa-nonaktif',
            'laporan-detail'
        ]);
        if (!allowedPages.has(page)) page = 'dashboard';
    } else if ((appData.role || 'admin') === 'guru') {
        if (page !== 'pengeluaran') page = 'pengeluaran';
    } else if (page === 'users') {
        page = 'profil';
    } else if (['ringkasan-cabang', 'monitoring-tunggakan', 'tahun-ajaran'].includes(page)) {
        page = 'dashboard';
    }
    localStorage.setItem(LAST_PAGE_KEY, page);
    syncSubmenuByPage(page);

    // Update Sidebar Active State
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const activeNav = document.getElementById(`nav-${page}`);
    if (activeNav) activeNav.classList.add('active');

    // AUTO CLOSE SIDEBAR (Khusus Mobile)
    // Jika layar kecil (< 1024px), tutup sidebar setelah klik menu
    if (window.innerWidth < 1024) {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        if (!sidebar.classList.contains('-translate-x-full')) {
            sidebar.classList.add('-translate-x-full'); // Sembunyikan
            if(overlay) overlay.classList.add('hidden'); // Sembunyikan overlay
        }
    }

    // Target Container
    const container = document.getElementById('page-container');
    
    // Show Loading Animation
    container.innerHTML = `
        <div class="flex flex-col items-center justify-center h-[60vh] text-gray-400 animate-pulse">
            <i class="fas fa-circle-notch fa-spin text-3xl mb-3 text-primary-500"></i>
            <span class="text-sm font-medium">Memuat Halaman...</span>
        </div>
    `;

    try {
        const pageFile = (
            page === 'siswa-aktif' ||
            page === 'siswa-alumni' ||
            page === 'siswa-nonaktif'
        ) ? 'siswa' : (
            page === 'tunggakan-aktif' ||
            page === 'tunggakan-alumni'
         ) ? 'tunggakan' : page;

        // Fetch HTML File
        const response = await fetch(withSksBase(`/pages/${pageFile}.html`));
        if (!response.ok) throw new Error("Halaman tidak ditemukan");
        
        const html = await response.text();
        container.innerHTML = html;
        applyGlobalTermLocalization(container);

        // Initialize Page Logic (Memanggil fungsi dari file js lain)
        switch (page) {
            case 'dashboard': if(typeof initDashboard === 'function') initDashboard(); break;
            case 'penagihan': if(typeof initPenagihan === 'function') initPenagihan(); break;
            case 'ringkasan-cabang': if(typeof initRingkasanCabang === 'function') initRingkasanCabang(); break;
            case 'monitoring-tunggakan': if(typeof initMonitoringTunggakan === 'function') initMonitoringTunggakan(); break;
            case 'pembayaran': if(typeof initPembayaran === 'function') initPembayaran(); break;
            case 'tagihan': if(typeof initTagihan === 'function') initTagihan(); break;
            case 'tunggakan-aktif':
            case 'tunggakan-alumni':
                if(typeof initTunggakan === 'function') initTunggakan(page === 'tunggakan-alumni' ? 'alumni' : 'aktif');
                break;
            case 'kelas': if(typeof initKelas === 'function') initKelas(); break;
            case 'guru': if(typeof initGuru === 'function') initGuru(); break;
            case 'siswa':
            case 'siswa-aktif':
            case 'siswa-alumni':
            case 'siswa-nonaktif':
                if(typeof initSiswa === 'function') initSiswa(
                    page === 'siswa-alumni' ? 'alumni' : (page === 'siswa-nonaktif' ? 'nonaktif' : 'aktif')
                );
                break;
            case 'kenaikan': if(typeof initKenaikan === 'function') initKenaikan(); break;
            case 'beasiswa': if(typeof initBeasiswa === 'function') initBeasiswa(); break;
            case 'pengeluaran': if(typeof initPengeluaran === 'function') initPengeluaran(); break;
            case 'pemasukan-lain': if(typeof initPemasukanLain === 'function') initPemasukanLain(); break;
            case 'arus-kas': if(typeof initArusKas === 'function') initArusKas(); break;
            case 'tahun-ajaran': if(typeof initTahunAjaran === 'function') initTahunAjaran(); break;
            case 'laporan':
            case 'laporan-grafik': if(typeof initLaporan === 'function') initLaporan(); break;
            case 'all-laporan': if(typeof initAllLaporan === 'function') initAllLaporan(); break;
            case 'laporan-detail': if(typeof initLaporanDetail === 'function') initLaporanDetail(); break;
            case 'backup': if(typeof initBackup === 'function') initBackup(); break;
            case 'pengaturan': if(typeof initPengaturan === 'function') initPengaturan(); break;
            case 'users': if(typeof initUsers === 'function') initUsers(); break;
            case 'profil': if(typeof initProfil === 'function') initProfil(); break;
            case 'device-sessions': if(typeof initDeviceSessions === 'function') initDeviceSessions(); break;
            case 'audit-log': if(typeof initAuditLog === 'function') initAuditLog(); break;
        }

    } catch (error) {
        container.innerHTML = `<div class="p-10 text-center text-red-500 font-bold">Error: ${error.message}</div>`;
    }
}

window.openPenagihanPage = function(tab = 'tunggakan', subtab = 'aktif') {
    localStorage.setItem(PENAGIHAN_TAB_KEY, tab);
    localStorage.setItem(PENAGIHAN_SUBTAB_KEY, subtab);
    loadPage('penagihan');
};

window.toggleSubmenu = function(submenuId, triggerEl) {
    const submenu = document.getElementById(submenuId);
    if (!submenu) return;
    submenu.classList.toggle('hidden');
    const icon = triggerEl ? triggerEl.querySelector('.fa-chevron-down') : null;
    if (icon) icon.classList.toggle('rotate-180');
};

// 4. SIDEBAR TOGGLE LOGIC (Robust Version)
window.toggleSidebar = function() {
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('main-content');
    const overlay = document.getElementById('sidebar-overlay');

    if (!sidebar || !mainContent) return;

    // Cek apakah mode Mobile atau Desktop
    const isMobile = window.innerWidth < 1024; // 1024px adalah breakpoint 'lg' Tailwind

    if (isMobile) {
        // === LOGIKA MOBILE ===
        // Sidebar default-nya tersembunyi (-translate-x-full)
        if (sidebar.classList.contains('-translate-x-full')) {
            // BUKA SIDEBAR
            sidebar.classList.remove('-translate-x-full');
            if(overlay) overlay.classList.remove('hidden');
        } else {
            // TUTUP SIDEBAR
            sidebar.classList.add('-translate-x-full');
            if(overlay) overlay.classList.add('hidden');
        }
    } else {
        // === LOGIKA DESKTOP ===
        // Sidebar default-nya muncul (lg:translate-x-0)
        
        // Kita cek apakah sidebar sedang 'hidden' secara manual 
        // (artinya memiliki class lg:-translate-x-full)
        const isClosed = sidebar.classList.contains('lg:-translate-x-full');

        if (isClosed) {
            // BUKA KEMBALI
            sidebar.classList.remove('lg:-translate-x-full');
            sidebar.classList.add('lg:translate-x-0');
            
            // Kembalikan margin konten utama
            mainContent.classList.remove('lg:ml-0');
            mainContent.classList.add('lg:ml-64');
        } else {
            // TUTUP (Full Screen Mode)
            sidebar.classList.remove('lg:translate-x-0');
            sidebar.classList.add('lg:-translate-x-full');
            
            // Hilangkan margin konten utama
            mainContent.classList.remove('lg:ml-64');
            mainContent.classList.add('lg:ml-0');
        }
    }
};

// 5. HELPER FUNCTIONS
async function apiCall(url, method = 'GET', body = null) {
    return _apiCallInternal(url, method, body, false);
}

async function _apiCallInternal(url, method = 'GET', body = null, retried = false) {
    const options = {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin'
    };
    if (body) options.body = JSON.stringify(body);

    const res = await fetch(withSksBase(url), options);
    if (res.status === 401) {
        window.location.href = withSksBase('/login.html');
        return null;
    }
    const text = await res.text();
    let payload = null;
    try {
        payload = JSON.parse(text);
    } catch {
        payload = { success: false, message: text || 'Invalid response' };
    }
    const isPinEndpoint = String(url).includes('/api/auth/pin/');
    if (res.status === 423 && payload?.code === 'PIN_REQUIRED' && !retried && !isPinEndpoint) {
        const pinOk = await ensurePinVerificationPrompt(true);
        if (pinOk) return _apiCallInternal(url, method, body, true);
    }
    return localizeApiPayload(payload);
}

function formatRp(value) {
    return "Rp " + Number(value).toLocaleString('id-ID');
}

function updateAdminHeader() {
    const nameEl = document.getElementById('current-admin-name');
    const userEl = document.getElementById('current-admin-username');
    if (!nameEl || !userEl) return;
    const a = appData.admin;
    nameEl.textContent = (a && a.nama_lengkap) ? a.nama_lengkap : 'Admin';
    const roleText = appData.role === 'super_admin'
        ? 'super_admin'
        : (appData.role === 'wali_kelas' ? 'wali_kelas' : (appData.role === 'guru' ? 'guru' : 'admin'));
    userEl.textContent = a && a.username ? `@${a.username} (${roleText})` : `@admin (${roleText})`;
}

function applyRoleMenuAccess() {
    const role = appData.role || 'admin';
    const showForSuperAdmin = new Set([
        'nav-dashboard',
        'nav-ringkasan-cabang',
        'nav-monitoring-tunggakan',
        'nav-penagihan',
        'nav-tunggakan-aktif',
        'nav-tunggakan-alumni',
        'nav-kelas',
        'nav-guru',
        'nav-siswa-aktif',
        'nav-siswa-nonaktif',
        'nav-siswa-alumni',
        'nav-beasiswa',
        'nav-kas',
        'nav-pengeluaran',
        'nav-pemasukan-lain',
        'nav-arus-kas',
        'nav-tahun-ajaran',
        'nav-users',
        'nav-backup',
        'nav-laporan',
        'nav-all-laporan',
        'nav-laporan-grafik',
        'nav-laporan-detail',
        'nav-device-sessions',
        'nav-audit-log'
    ]);
    const showForWaliKelas = new Set([
        'nav-dashboard',
        'nav-penagihan',
        'nav-tunggakan-aktif',
        'nav-tunggakan-alumni',
        'nav-siswa-aktif',
        'nav-siswa-nonaktif',
        'nav-siswa-alumni',
        'nav-laporan',
        'nav-laporan-detail'
    ]);
    const showForGuru = appData.guruHasExpenseResponsibility
        ? new Set(['nav-kas', 'nav-pengeluaran'])
        : new Set();

    const navIds = [
        'nav-dashboard',
        'nav-ringkasan-cabang',
        'nav-monitoring-tunggakan',
        'nav-penagihan',
        'nav-pembayaran',
        'nav-tagihan',
        'nav-tunggakan-aktif',
        'nav-tunggakan-alumni',
        'nav-kelas',
        'nav-guru',
        'nav-siswa-aktif',
        'nav-siswa-nonaktif',
        'nav-siswa-alumni',
        'nav-kenaikan',
        'nav-beasiswa',
        'nav-kas',
        'nav-pengeluaran',
        'nav-pemasukan-lain',
        'nav-arus-kas',
        'nav-tahun-ajaran',
        'nav-laporan',
        'nav-all-laporan',
        'nav-laporan-grafik',
        'nav-laporan-detail',
        'nav-backup',
        'nav-pengaturan',
        'nav-users',
        'nav-profil',
        'nav-device-sessions',
        'nav-audit-log'
    ];

    navIds.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (role === 'super_admin') {
            el.classList.toggle('hidden', !showForSuperAdmin.has(id));
        } else if (role === 'wali_kelas') {
            el.classList.toggle('hidden', !showForWaliKelas.has(id));
        } else if (role === 'guru') {
            el.classList.toggle('hidden', !showForGuru.has(id));
        } else {
            if (id === 'nav-ringkasan-cabang' || id === 'nav-monitoring-tunggakan' || id === 'nav-users' || id === 'nav-tahun-ajaran') el.classList.add('hidden');
            else el.classList.remove('hidden');
        }
    });

    const penagihanTrigger = document.getElementById('nav-penagihan');
    if (penagihanTrigger) {
        const paymentVisible = !document.getElementById('nav-pembayaran')?.classList.contains('hidden');
        const tagihanAktifVisible = !document.getElementById('nav-tunggakan-aktif')?.classList.contains('hidden');
        const tagihanAlumniVisible = !document.getElementById('nav-tunggakan-alumni')?.classList.contains('hidden');
        penagihanTrigger.classList.toggle('hidden', !(paymentVisible || tagihanAktifVisible || tagihanAlumniVisible));
    }
    const kasTrigger = document.getElementById('nav-kas');
    if (kasTrigger) {
        const expenseVisible = !document.getElementById('nav-pengeluaran')?.classList.contains('hidden');
        const otherIncomeVisible = !document.getElementById('nav-pemasukan-lain')?.classList.contains('hidden');
        const cashFlowVisible = !document.getElementById('nav-arus-kas')?.classList.contains('hidden');
        kasTrigger.classList.toggle('hidden', !(expenseVisible || otherIncomeVisible || cashFlowVisible));
    }

    const savedPage = localStorage.getItem(LAST_PAGE_KEY);
    if (role === 'super_admin') {
        const forbiddenPages = new Set(['pembayaran', 'tagihan', 'kenaikan', 'pengaturan', 'profil']);
        if (forbiddenPages.has(savedPage)) {
            localStorage.setItem(LAST_PAGE_KEY, 'dashboard');
        }
    } else if (role === 'wali_kelas') {
        const allowedPages = new Set([
            'dashboard',
            'penagihan',
            'tunggakan-aktif',
            'tunggakan-alumni',
            'siswa-aktif',
            'siswa-alumni',
            'siswa-nonaktif',
            'laporan-detail'
        ]);
        if (!allowedPages.has(savedPage)) {
            localStorage.setItem(LAST_PAGE_KEY, 'dashboard');
        }
    } else if (role === 'guru') {
        if (savedPage !== 'pengeluaran') {
            localStorage.setItem(LAST_PAGE_KEY, 'pengeluaran');
        }
    } else if (['ringkasan-cabang', 'monitoring-tunggakan', 'users', 'tahun-ajaran'].includes(savedPage)) {
        localStorage.setItem(LAST_PAGE_KEY, savedPage === 'users' ? 'profil' : 'dashboard');
    }
}

function syncSubmenuByPage(page) {
    const map = {
        'submenu-penagihan': ['pembayaran', 'penagihan', 'tunggakan-aktif', 'tunggakan-alumni'],
        'submenu-siswa': ['siswa-aktif', 'siswa-nonaktif', 'siswa-alumni'],
        'submenu-kas': ['pengeluaran', 'pemasukan-lain', 'arus-kas'],
        'submenu-laporan': ['all-laporan', 'laporan-grafik', 'laporan-detail']
    };
    Object.entries(map).forEach(([submenuId, pages]) => {
        const el = document.getElementById(submenuId);
        if (!el) return;
        if (pages.includes(page)) el.classList.remove('hidden');
    });
}

function updateActivePeriodBadge() {
    const chip = document.getElementById('active-period-chip');
    const text = document.getElementById('active-period-text');
    if (!chip || !text) return;
    const tahun = appData.activeSchoolYear?.name;
    const semester = appData.activeSemester?.name;
    if (!tahun && !semester) {
        chip.classList.add('hidden');
        return;
    }
    text.textContent = `${tahun || '-'}${semester ? ` - ${semester}` : ''}`;
    chip.classList.remove('hidden');
}

window.logout = async function() {
    await apiCall('/api/auth/logout', 'POST');
    window.location.href = withSksBase('/login.html');
};

async function ensurePinVerificationPrompt(force = false) {
    if ((appData.role || '') !== 'admin') return true;
    if (_pinPromptPromise) return _pinPromptPromise;
    _pinPromptPromise = (async () => {
        const statusRes = await fetch(withSksBase('/api/auth/pin/status'), {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin'
        });
        const statusData = await statusRes.json().catch(() => ({}));
        if (!statusRes.ok || statusData?.success !== true) return false;
        if (!statusData.required) return true;
        if (!force && statusData.verified) return true;

        while (true) {
            const pinInput = await uiPrompt('Masukkan PIN transaksi (6 digit) untuk melanjutkan:', 'Verifikasi PIN', '######', '');
            if (pinInput === null) return false;
            const pin = String(pinInput || '').trim();
            if (!/^\d{6}$/.test(pin)) {
                await uiAlert('PIN harus 6 digit angka.', 'PIN Tidak Valid');
                continue;
            }
            const verifyRes = await fetch(withSksBase('/api/auth/pin/verify'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ pin })
            });
            const verifyData = await verifyRes.json().catch(() => ({}));
            if (verifyRes.ok && verifyData?.success === true) return true;
            await uiAlert(verifyData?.message || 'PIN tidak valid.', 'Verifikasi Gagal');
        }
    })();
    try {
        return await _pinPromptPromise;
    } finally {
        _pinPromptPromise = null;
    }
}

window.getCurrentOperatorName = async function() {
    const fallback = 'Admin';
    const fromSession = (appData && appData.admin && appData.admin.nama_lengkap) ? String(appData.admin.nama_lengkap).trim() : '';
    if (fromSession) return fromSession;

    try {
        const res = await apiCall('/api/profile/me');
        const profileName = String(res?.profile?.nama_lengkap || '').trim();
        if (profileName) {
            if (!appData.admin) appData.admin = {};
            appData.admin.nama_lengkap = profileName;
            return profileName;
        }
    } catch (_) {}
    return fallback;
};
