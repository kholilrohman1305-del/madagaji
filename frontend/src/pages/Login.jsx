import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LockKeyhole, Sparkles, ShieldCheck, ChartNoAxesCombined } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { toast } from '../utils/toast';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(username, password);
      navigate('/dasbor', { replace: true });
    } catch (e) {
      const message = e?.response?.data?.message || 'Login gagal. Periksa username/password.';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-orb login-orb-a" />
      <div className="login-orb login-orb-b" />
      <div className="login-grid">
        <section className="login-hero">
          <div className="login-chip">
            <Sparkles size={16} />
            <span>Sistem Keuangan Sekolah</span>
          </div>
          <h1>Mada Gaji</h1>
          <p>Kelola kehadiran, bisyaroh, dan laporan dengan alur kerja yang cepat dan rapi.</p>
          <div className="login-feature">
            <ShieldCheck size={18} />
            <span>Autentikasi Aman</span>
          </div>
          <div className="login-feature">
            <ChartNoAxesCombined size={18} />
            <span>Rekap Real-time</span>
          </div>
        </section>

        <div className="login-card">
          <div className="login-title">
            <LockKeyhole size={20} />
            <span>Masuk ke Dashboard</span>
          </div>
          <form onSubmit={onSubmit} className="login-form">
            <label>Username</label>
            <input value={username} onChange={e => setUsername(e.target.value)} placeholder="Masukkan username" autoComplete="username" />
            <label>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Masukkan password" autoComplete="current-password" />
            <button type="submit" disabled={loading || !username || !password}>
              {loading ? 'Memproses...' : 'Masuk'}
            </button>
          </form>
          <p className="login-footnote">Akses hanya untuk pengguna terdaftar.</p>
        </div>
      </div>
    </div>
  );
}
