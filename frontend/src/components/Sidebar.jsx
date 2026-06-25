import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  CalendarCheck,
  CalendarClock,
  Wand2,
  UserCheck,
  GraduationCap,
  BarChart3,
  Receipt,
  Printer,
  FileText,
  Wallet,
  PieChart,
  Settings,
  Users,
  School,
  BookOpen,
  ClipboardList,
  ExternalLink,
  Sparkles,
  User,
  LogOut,
  PanelLeftClose,
  LayoutGrid,
  UserCog
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

const LinkItem = ({ to, label, icon: Icon }) => (
  <NavLink className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`} to={to}>
    <Icon className="nav-icon" size={20} />
    <span>{label}</span>
  </NavLink>
);

export default function Sidebar({ hidden, onToggle }) {
  const { user, logout } = useAuth();
  const sameOriginSksUrl = typeof window !== 'undefined' ? `${window.location.origin}/sks/login.html` : '/sks/login.html';
  const sameOriginPdmadaUrl = typeof window !== 'undefined' ? `${window.location.origin}/pdmada` : '/pdmada';
  const normalizeExternalUrl = (rawValue, fallbackPath) => {
    const value = String(rawValue || '').trim();
    if (!value) return fallbackPath;
    if (typeof window === 'undefined') return value;
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(value)) return fallbackPath;
    return value;
  };
  const sksUrl = normalizeExternalUrl(import.meta.env.VITE_SKS_URL, sameOriginSksUrl);
  const pdmadaUrl = normalizeExternalUrl(import.meta.env.VITE_PDMADA_URL, sameOriginPdmadaUrl);

  const openSks = () => {
    window.location.href = sksUrl;
  };

  const openPdMada = () => {
    window.location.href = pdmadaUrl;
  };

  return (
    <aside className={`sidebar ${hidden ? 'sidebar-hidden' : ''}`}>
      <div className="brand">
        <div className="brand-logo">
          <Sparkles size={24} />
        </div>
        <span className="brand-text">MadaFlow</span>
        <button className="sidebar-toggle-icon" type="button" onClick={onToggle}>
          <PanelLeftClose size={18} />
        </button>
      </div>

      <div className="nav-section">
        <div className="nav-title">Utama</div>
        <LinkItem to="/dasbor" label="Dasbor" icon={LayoutDashboard} />
      </div>

      <div className="nav-section">
        <div className="nav-title">Kehadiran</div>
        <LinkItem to="/kehadiran" label="Kehadiran" icon={CalendarCheck} />
        {user?.role === 'admin' && <LinkItem to="/penjadwalan" label="Penjadwalan" icon={CalendarClock} />}
        {user?.role === 'admin' && <LinkItem to="/auto-schedule" label="Auto Jadwal" icon={Wand2} />}
        <LinkItem to="/jadwal-guru" label="Jadwal Guru" icon={UserCheck} />
        <LinkItem to="/jadwal-kelas" label="Jadwal Kelas" icon={GraduationCap} />
        {user?.role === 'admin' && <LinkItem to="/statistik-guru" label="Statistik Guru" icon={BarChart3} />}
        {user?.role === 'admin' && <LinkItem to="/sebaran-mapel" label="Sebaran Mapel" icon={LayoutGrid} />}
        {user?.role === 'admin' && <LinkItem to="/detail-guru" label="Detail Jadwal Guru" icon={UserCog} />}
      </div>

      <div className="nav-section">
        <div className="nav-title">Bisyaroh</div>
        {user?.role === 'admin' && <LinkItem to="/rekap-bisyaroh" label="Rekap Bisyaroh" icon={Receipt} />}
        {user?.role === 'admin' && <LinkItem to="/cetak-bisyaroh" label="Cetak Bisyaroh" icon={Printer} />}
        <LinkItem to="/slip-gaji" label="Slip Gaji" icon={FileText} />
        {user?.role === 'admin' && <LinkItem to="/pengeluaran-lain" label="Pengeluaran Lain" icon={Wallet} />}
        {user?.role === 'admin' && <LinkItem to="/ekstrakurikuler" label="Ekstrakurikuler" icon={ClipboardList} />}
        {user?.role === 'admin' && <LinkItem to="/kedisiplinan" label="Kedisiplinan" icon={ClipboardList} />}
        {user?.role === 'admin' && <LinkItem to="/total-bisyaroh" label="Total Bisyaroh" icon={PieChart} />}
        {user?.role === 'admin' && <LinkItem to="/setting-bisyaroh" label="Setting Bisyaroh" icon={Settings} />}
      </div>

      {user?.role === 'admin' && (
        <div className="nav-section">
          <div className="nav-title">Master Data</div>
          <LinkItem to="/data-guru" label="Data Guru" icon={Users} />
          <LinkItem to="/data-siswa" label="Data Siswa" icon={GraduationCap} />
          <LinkItem to="/data-kelas" label="Data Kelas" icon={School} />
          <LinkItem to="/data-mapel" label="Data Mapel" icon={BookOpen} />
          <LinkItem to="/tugas-tambahan" label="Tugas Tambahan" icon={ClipboardList} />
          <LinkItem to="/users" label="User & Admin" icon={Users} />
        </div>
      )}

      <div className="nav-section">
        <div className="nav-title">Integrasi</div>
        <button className="nav-link" type="button" onClick={openSks}>
          <ExternalLink className="nav-icon" size={20} />
          <span>MadaPay</span>
        </button>
        <button className="nav-link" type="button" onClick={openPdMada}>
          <ExternalLink className="nav-icon" size={20} />
          <span>MyMada</span>
        </button>
      </div>

      <div className="nav-section">
        <div className="nav-title">Akun</div>
        <LinkItem to="/profile" label="Profile" icon={User} />
        <button className="nav-link logout-btn" onClick={logout} type="button">
          <LogOut className="nav-icon" size={20} />
          <span>Logout</span>
        </button>
        {user && <div className="nav-subtle">Login: {user.username}</div>}
      </div>
    </aside>
  );
}
