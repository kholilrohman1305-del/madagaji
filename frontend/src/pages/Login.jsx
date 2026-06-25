import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { toast } from '../utils/toast';

const FEATURES = [
  { icon: '📋', label: 'Absensi Guru Real-time', desc: 'Catat dan pantau kehadiran setiap hari.' },
  { icon: '📆', label: 'Jadwal & Penjadwalan', desc: 'Atur jadwal mengajar dengan otomatis.' },
  { icon: '💰', label: 'Kelola Bisyaroh', desc: 'Hitung dan rekap honorarium guru secara akurat.' },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [focused, setFocused] = useState('');

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      navigate('/dasbor', { replace: true });
    } catch (err) {
      const msg = err?.response?.data?.message || 'Login gagal. Periksa username/password.';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mf-shell">
      <div className="mf-orb mf-orb-a" />
      <div className="mf-orb mf-orb-b" />
      <div className="mf-orb mf-orb-c" />

      <div className="mf-grid">
        {/* LEFT — branding */}
        <div className="mf-hero">
          <div className="mf-logo">
            <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="mf-brand">MadaFlow</h1>
          <p className="mf-tagline">Kelola absensi, jadwal, dan bisyaroh guru dalam satu platform yang cepat dan efisien.</p>
          <div className="mf-rule" />
          <div className="mf-features">
            {FEATURES.map((f) => (
              <div key={f.label} className="mf-feat">
                <span className="mf-feat-icon">{f.icon}</span>
                <div>
                  <div className="mf-feat-label">{f.label}</div>
                  <div className="mf-feat-desc">{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT — form card */}
        <div className="mf-card">
          <div className="mf-card-badge">
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h2 className="mf-card-title">Selamat Datang</h2>
          <p className="mf-card-sub">Masuk ke sistem MadaFlow</p>

          <form onSubmit={onSubmit} className="mf-form">
            <div className="mf-field">
              <label className="mf-label">Username</label>
              <div className="mf-input-wrap">
                <span className="mf-input-icon">
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </span>
                <input
                  className={`mf-input${focused === 'user' ? ' mf-input-focused' : ''}`}
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  onFocus={() => setFocused('user')}
                  onBlur={() => setFocused('')}
                  placeholder="Masukkan username"
                  autoComplete="username"
                />
              </div>
            </div>

            <div className="mf-field">
              <label className="mf-label">Password</label>
              <div className="mf-input-wrap">
                <span className="mf-input-icon">
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </span>
                <input
                  type={showPass ? 'text' : 'password'}
                  className={`mf-input mf-input-pr${focused === 'pass' ? ' mf-input-focused' : ''}`}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onFocus={() => setFocused('pass')}
                  onBlur={() => setFocused('')}
                  placeholder="Masukkan password"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="mf-eye"
                  onClick={() => setShowPass(v => !v)}
                  tabIndex={-1}
                >
                  {showPass ? (
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="mf-error">
                <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {error}
              </div>
            )}

            <button
              type="submit"
              className="mf-submit"
              disabled={loading || !username || !password}
            >
              {loading ? (
                <>
                  <svg className="mf-spin" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Memproses…
                </>
              ) : 'Masuk'}
            </button>
          </form>

          <p className="mf-footnote">Hanya untuk pengguna yang telah terdaftar</p>
        </div>
      </div>
    </div>
  );
}
