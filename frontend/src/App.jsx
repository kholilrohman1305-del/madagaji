import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Sidebar from './components/Sidebar.jsx';
import MobileNav from './components/MobileNav';
import MobileTableCards from './components/MobileTableCards.jsx';
import ToastHost from './components/ToastHost.jsx';
import ConfirmHost from './components/ConfirmHost.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import RoleRoute from './components/RoleRoute.jsx';
import { useAuth } from './context/AuthContext.jsx';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

import Dashboard from './pages/Dashboard.jsx';
import Kehadiran from './pages/Kehadiran.jsx';
import Penjadwalan from './pages/Penjadwalan.jsx';
import StatistikGuru from './pages/StatistikGuru.jsx';
import RekapBisyaroh from './pages/RekapBisyaroh.jsx';
import SlipGaji from './pages/SlipGaji.jsx';
import PengeluaranLain from './pages/PengeluaranLain.jsx';
import Ekstrakurikuler from './pages/Ekstrakurikuler.jsx';
import Kedisiplinan from './pages/Kedisiplinan.jsx';
import TotalBisyaroh from './pages/TotalBisyaroh.jsx';
import DataGuru from './pages/DataGuru.jsx';
import DataSiswa from './pages/DataSiswa.jsx';
import DataKelas from './pages/DataKelas.jsx';
import DataMapel from './pages/DataMapel.jsx';
import TugasTambahan from './pages/TugasTambahan.jsx';
import AutoSchedule from './pages/AutoSchedule.jsx';
import JadwalGuru from './pages/JadwalGuru.jsx';
import JadwalKelas from './pages/JadwalKelas.jsx';
import SettingBisyaroh from './pages/SettingBisyaroh.jsx';
import CetakBisyaroh from './pages/CetakBisyaroh.jsx';
import Login from './pages/Login.jsx';
import Profile from './pages/Profile.jsx';
import Users from './pages/Users.jsx';
import SebaranMapel from './pages/SebaranMapel.jsx';
import DetailGuru from './pages/DetailGuru.jsx';
import DetailMapel from './pages/DetailMapel.jsx';
import LandingHub from './pages/LandingHub.jsx';

export default function App() {
  const { user, loading } = useAuth();
  const [sidebarHidden, setSidebarHidden] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem('sidebarHidden');
    if (saved !== null) setSidebarHidden(saved === '1');
  }, []);
  const toggleSidebar = () => {
    const next = !sidebarHidden;
    setSidebarHidden(next);
    localStorage.setItem('sidebarHidden', next ? '1' : '0');
  };
  if (loading) return null;
  return (
    <>
      <ToastHost />
      <ConfirmHost />
      <Routes>
        <Route path="/" element={user ? <Navigate to="/dasbor" replace /> : <Navigate to="/login" replace />} />
        <Route path="/login" element={user ? <Navigate to="/dasbor" replace /> : <Login />} />
        <Route
          path="/*"
          element={(
            <ProtectedRoute>
              <div className={`app-shell ${sidebarHidden ? 'sidebar-hidden' : ''}`}>
                <Sidebar hidden={sidebarHidden} onToggle={toggleSidebar} />
                <MobileNav />
                <MobileTableCards />
                <main className="app-content">
                  {sidebarHidden && (
                    <button className="sidebar-fab no-print" type="button" onClick={toggleSidebar}>
                      <PanelLeftOpen size={18} />
                      <span>Tampilkan Sidebar</span>
                    </button>
                  )}
                  <Routes>
                    <Route path="/" element={<Navigate to="/dasbor" replace />} />
                    <Route path="/dasbor" element={<Dashboard />} />
                    <Route path="/kehadiran" element={<Kehadiran />} />
                    <Route path="/penjadwalan" element={<RoleRoute roles={['admin']}><Penjadwalan /></RoleRoute>} />
                    <Route path="/statistik-guru" element={<RoleRoute roles={['admin']}><StatistikGuru /></RoleRoute>} />
                    <Route path="/rekap-bisyaroh" element={<RoleRoute roles={['admin']}><RekapBisyaroh /></RoleRoute>} />
                    <Route path="/slip-gaji" element={<SlipGaji />} />
                    <Route path="/pengeluaran-lain" element={<RoleRoute roles={['admin']}><PengeluaranLain /></RoleRoute>} />
                    <Route path="/ekstrakurikuler" element={<RoleRoute roles={['admin']}><Ekstrakurikuler /></RoleRoute>} />
                    <Route path="/kedisiplinan" element={<RoleRoute roles={['admin']}><Kedisiplinan /></RoleRoute>} />
                    <Route path="/total-bisyaroh" element={<RoleRoute roles={['admin']}><TotalBisyaroh /></RoleRoute>} />
                    <Route path="/data-guru" element={<RoleRoute roles={['admin']}><DataGuru /></RoleRoute>} />
                    <Route path="/data-siswa" element={<RoleRoute roles={['admin']}><DataSiswa /></RoleRoute>} />
                    <Route path="/data-kelas" element={<RoleRoute roles={['admin']}><DataKelas /></RoleRoute>} />
                    <Route path="/data-mapel" element={<RoleRoute roles={['admin']}><DataMapel /></RoleRoute>} />
                    <Route path="/tugas-tambahan" element={<RoleRoute roles={['admin']}><TugasTambahan /></RoleRoute>} />
                    <Route path="/auto-schedule" element={<RoleRoute roles={['admin']}><AutoSchedule /></RoleRoute>} />
                    <Route path="/sebaran-mapel" element={<RoleRoute roles={['admin']}><SebaranMapel /></RoleRoute>} />
                    <Route path="/detail-guru" element={<RoleRoute roles={['admin']}><DetailGuru /></RoleRoute>} />
                    <Route path="/detail-mapel" element={<RoleRoute roles={['admin']}><DetailMapel /></RoleRoute>} />
                    <Route path="/jadwal-guru" element={<JadwalGuru />} />
                    <Route path="/jadwal-kelas" element={<JadwalKelas />} />
                    <Route path="/setting-bisyaroh" element={<RoleRoute roles={['admin']}><SettingBisyaroh /></RoleRoute>} />
                    <Route path="/cetak-bisyaroh" element={<RoleRoute roles={['admin']}><CetakBisyaroh /></RoleRoute>} />
                    <Route path="/profile" element={<Profile />} />
                    <Route path="/users" element={<RoleRoute roles={['admin']}><Users /></RoleRoute>} />
                  </Routes>
                </main>
              </div>
            </ProtectedRoute>
          )}
        />
      </Routes>
    </>
  );
}
