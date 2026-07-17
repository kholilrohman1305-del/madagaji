import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, CalendarCheck, FileText, CalendarClock, LayoutGrid,
  Users, GraduationCap, School, BookOpen, Receipt, Printer, Wallet,
  ClipboardList, PieChart, Settings, UserCog, BarChart3, Wand2,
  UserCheck, LogOut, X, UserRound
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

// Chrome mobile ala myBCA: topbar putih + bottom nav + sheet "Menu Lengkap".
// Hanya tampil di layar <= 768px (diatur via CSS .mb-*).
export default function MobileNav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const isAdmin = user?.role === 'admin';

  const allMenus = [
    { to: '/dasbor',           label: 'Dasbor',           icon: LayoutDashboard, admin: false },
    { to: '/kehadiran',        label: 'Kehadiran',        icon: CalendarCheck,   admin: false },
    { to: '/jadwal-guru',      label: 'Jadwal Guru',      icon: UserCheck,       admin: false },
    { to: '/jadwal-kelas',     label: 'Jadwal Kelas',     icon: GraduationCap,   admin: false },
    { to: '/slip-gaji',        label: 'Slip Gaji',        icon: FileText,        admin: false },
    { to: '/penjadwalan',      label: 'Penjadwalan',      icon: CalendarClock,   admin: true },
    { to: '/auto-schedule',    label: 'Auto Jadwal',      icon: Wand2,           admin: true },
    { to: '/statistik-guru',   label: 'Statistik Guru',   icon: BarChart3,       admin: true },
    { to: '/sebaran-mapel',    label: 'Sebaran Mapel',    icon: LayoutGrid,      admin: true },
    { to: '/detail-guru',      label: 'Detail Jadwal',    icon: UserCog,         admin: true },
    { to: '/rekap-bisyaroh',   label: 'Rekap Bisyaroh',   icon: Receipt,         admin: true },
    { to: '/cetak-bisyaroh',   label: 'Cetak Bisyaroh',   icon: Printer,         admin: true },
    { to: '/pengeluaran-lain', label: 'Pengeluaran',      icon: Wallet,          admin: true },
    { to: '/ekstrakurikuler',  label: 'Ekstrakurikuler',  icon: ClipboardList,   admin: true },
    { to: '/kedisiplinan',     label: 'Kedisiplinan',     icon: ClipboardList,   admin: true },
    { to: '/total-bisyaroh',   label: 'Total Bisyaroh',   icon: PieChart,        admin: true },
    { to: '/setting-bisyaroh', label: 'Setting Bisyaroh', icon: Settings,        admin: true },
    { to: '/data-guru',        label: 'Data Guru',        icon: Users,           admin: true },
    { to: '/data-siswa',       label: 'Data Siswa',       icon: GraduationCap,   admin: true },
    { to: '/data-kelas',       label: 'Data Kelas',       icon: School,          admin: true },
    { to: '/data-mapel',       label: 'Data Mapel',       icon: BookOpen,        admin: true },
    { to: '/tugas-tambahan',   label: 'Tugas Tambahan',   icon: ClipboardList,   admin: true },
    { to: '/users',            label: 'Pengguna',         icon: Users,           admin: true },
    { to: '/profile',          label: 'Profil Saya',      icon: UserRound,       admin: false }
  ].filter((m) => !m.admin || isAdmin);

  const go = (to) => {
    setMenuOpen(false);
    navigate(to);
  };

  return (
    <>
      {/* Topbar ala myBCA */}
      <header className="mb-topbar no-print">
        <div className="mb-topbar-brand">
          <span className="mb-topbar-logo">MF</span>
          <span className="mb-topbar-title">MadaFlow</span>
        </div>
        <button type="button" className="mb-topbar-user" onClick={() => go('/profile')}>
          <UserRound size={18} />
          <span>{(user?.display_name || user?.username || 'User').split(' ')[0]}</span>
        </button>
      </header>

      {/* Bottom nav ala myBCA */}
      <nav className="mb-bottomnav no-print" aria-label="Navigasi mobile">
        <NavLink to="/dasbor" className={({ isActive }) => `mb-tab${isActive ? ' active' : ''}`}>
          <LayoutDashboard size={20} />
          <span>Beranda</span>
        </NavLink>
        <NavLink to="/kehadiran" className={({ isActive }) => `mb-tab${isActive ? ' active' : ''}`}>
          <CalendarCheck size={20} />
          <span>Kehadiran</span>
        </NavLink>
        {isAdmin ? (
          <NavLink to="/rekap-bisyaroh" className={({ isActive }) => `mb-tab${isActive ? ' active' : ''}`}>
            <Receipt size={20} />
            <span>Rekap</span>
          </NavLink>
        ) : (
          <NavLink to="/slip-gaji" className={({ isActive }) => `mb-tab${isActive ? ' active' : ''}`}>
            <FileText size={20} />
            <span>Bisyaroh</span>
          </NavLink>
        )}
        {isAdmin ? (
          <NavLink to="/total-bisyaroh" className={({ isActive }) => `mb-tab${isActive ? ' active' : ''}`}>
            <PieChart size={20} />
            <span>Total</span>
          </NavLink>
        ) : (
          <NavLink to="/jadwal-guru" className={({ isActive }) => `mb-tab${isActive ? ' active' : ''}`}>
            <CalendarClock size={20} />
            <span>Jadwal</span>
          </NavLink>
        )}
        <button type="button" className={`mb-tab${menuOpen ? ' active' : ''}`} onClick={() => setMenuOpen(true)}>
          <LayoutGrid size={20} />
          <span>Menu</span>
        </button>
      </nav>

      {/* Sheet Menu Lengkap ala myBCA */}
      {menuOpen && (
        <div className="mb-sheet-overlay no-print" onClick={(e) => { if (e.target === e.currentTarget) setMenuOpen(false); }}>
          <div className="mb-sheet">
            <div className="mb-sheet-head">
              <span>Semua Menu</span>
              <button type="button" onClick={() => setMenuOpen(false)} aria-label="Tutup">
                <X size={20} />
              </button>
            </div>
            <div className="mb-sheet-grid">
              {allMenus.map((m) => {
                const Icon = m.icon;
                return (
                  <button key={m.to} type="button" className="mb-sheet-item" onClick={() => go(m.to)}>
                    <span className="mb-sheet-icon"><Icon size={20} /></span>
                    <span>{m.label}</span>
                  </button>
                );
              })}
            </div>
            <button type="button" className="mb-sheet-logout" onClick={() => { setMenuOpen(false); logout(); }}>
              <LogOut size={16} /> Keluar
            </button>
          </div>
        </div>
      )}
    </>
  );
}
