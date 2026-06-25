import { Link } from 'react-router-dom';
import { Wallet, School, Database, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

export default function LandingHub() {
  const { user } = useAuth();
  const sameOriginSksUrl = typeof window !== 'undefined' ? `${window.location.origin}/sks/login.html` : '/sks/login.html';
  const sameOriginPdmadaUrl = typeof window !== 'undefined' ? `${window.location.origin}/pdmada` : '/pdmada';
  const normalizeExternalUrl = (rawValue, fallbackPath) => {
    const value = String(rawValue || '').trim();
    if (!value) return fallbackPath;
    if (typeof window === 'undefined') return value;

    // If old build still points to localhost, force same-origin path for ngrok/domain access.
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(value)) return fallbackPath;
    return value;
  };

  const sksUrl = normalizeExternalUrl(import.meta.env.VITE_SKS_URL, sameOriginSksUrl);
  const pdmadaUrl = normalizeExternalUrl(import.meta.env.VITE_PDMADA_URL, sameOriginPdmadaUrl);

  return (
    <div className="hub-page">
      <div className="hub-bg-orb hub-bg-orb-a" />
      <div className="hub-bg-orb hub-bg-orb-b" />
      <div className="hub-wrap">
        <div className="hub-header">
          <h1>Pusat Sistem Sekolah</h1>
          <p>Pilih sistem yang ingin digunakan.</p>
        </div>

        <div className="hub-grid">
          <article className="hub-card">
            <div className="hub-icon"><Wallet size={24} /></div>
            <h3>MadaFlow</h3>
            <p>Absensi guru, jadwal, bisyaroh, dan master data utama.</p>
            <Link className="hub-link" to={user ? '/dasbor' : '/login'}>
              {user ? 'Masuk ke Dasbor' : 'Login MadaFlow'}
              <ArrowRight size={16} />
            </Link>
          </article>

          <article className="hub-card">
            <div className="hub-icon"><School size={24} /></div>
            <h3>MadaPay</h3>
            <p>Sistem keuangan sekolah untuk tagihan, pembayaran, dan laporan.</p>
            <a className="hub-link" href={sksUrl}>
              Buka MadaPay
              <ArrowRight size={16} />
            </a>
          </article>

          <article className="hub-card">
            <div className="hub-icon"><Database size={24} /></div>
            <h3>MyMada</h3>
            <p>Master data sekolah: siswa, guru, kelas, mapel, dan sinkronisasi.</p>
            <a className="hub-link" href={pdmadaUrl}>
              Buka MyMada
              <ArrowRight size={16} />
            </a>
          </article>
        </div>
      </div>
    </div>
  );
}
