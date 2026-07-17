import { useEffect, useState } from 'react';
import api from '../api';
import { Users, School, CheckCircle, AlertCircle, CreditCard, BarChart3, XCircle, CalendarCheck } from 'lucide-react';
import useIsMobile from '../hooks/useIsMobile';
import { useAuth } from '../context/AuthContext';

// Beranda versi mobile: tema portal MyMada (hero navy + tile pastel).
function greeting() {
  const h = new Date().getHours();
  if (h < 10) return 'Selamat pagi';
  if (h < 15) return 'Selamat siang';
  if (h < 18) return 'Selamat sore';
  return 'Selamat malam';
}

function MobileTile({ icon: Icon, fg, bg, value, label, wide }) {
  return (
    <div className={`mm-tile${wide ? ' wide' : ''}`}>
      <span className="mm-tile-icon" style={{ background: bg, color: fg }}><Icon size={21} /></span>
      <span style={{ minWidth: 0 }}>
        <span className="mm-tile-value">{value}</span>
        <span className="mm-tile-label">{label}</span>
      </span>
    </div>
  );
}

function DashboardMobile({ data, formatRupiah, todayLabel, showAllTeachers, setShowAllTeachers }) {
  const { user } = useAuth();
  const scheduled = data.scheduledTeachersList || [];
  return (
    <div className="mm-page">
      <div className="mm-hero">
        <div className="mm-hero-eyebrow">{greeting()},</div>
        <div className="mm-hero-title">{(user?.display_name || user?.username || 'Admin')}</div>
        <div className="mm-hero-pills">
          <span className="mm-hero-pill">{todayLabel}</span>
          <span className="mm-hero-pill">{scheduled.length} guru terjadwal</span>
        </div>
      </div>

      <div className="mm-tiles">
        <MobileTile icon={Users} fg="#b91c1c" bg="#ffe6e3" value={data.totalGuru} label="Total Guru" />
        <MobileTile icon={School} fg="#047857" bg="#dcf5ea" value={data.totalKelas} label="Total Kelas" />
        <MobileTile icon={CheckCircle} fg="#1d4ed8" bg="#e3ecff" value={data.presentCount} label="Hadir Hari Ini" />
        <MobileTile icon={AlertCircle} fg="#b45309" bg="#fdeed3" value={data.absentCount} label="Absen / Izin" />
        <MobileTile icon={CreditCard} fg="#7c3aed" bg="#ede7ff" value={formatRupiah(data.totalBisyarohMonth)} label="Bisyaroh Bulan Ini" wide />
      </div>

      <div className="mm-card">
        <div className="mm-card-title"><CalendarCheck size={18} /> Guru Terjadwal Hari Ini</div>
        {!scheduled.length ? (
          <div className="mm-empty">Tidak ada guru yang terjadwal hari ini.</div>
        ) : (
          <>
            <div className="mm-chip-wrap">
              {(showAllTeachers ? scheduled : scheduled.slice(0, 15)).map((t, idx) => (
                <span key={t.guruId} className="mm-chip">
                  <b>{idx + 1}.</b> {t.namaGuru}
                </span>
              ))}
            </div>
            {scheduled.length > 15 && (
              <button type="button" className="mm-link-btn" onClick={() => setShowAllTeachers(v => !v)}>
                {showAllTeachers ? 'Tampilkan lebih sedikit' : `Lihat semua (${scheduled.length} guru)`}
              </button>
            )}
          </>
        )}
      </div>

      <div className="mm-card">
        <div className="mm-card-title" style={{ color: '#b91c1c' }}><XCircle size={18} /> Guru Tidak Hadir / Izin</div>
        {!data.absentTeachersList.length ? (
          <div className="mm-empty">Tidak ada data. Semua hadir.</div>
        ) : data.absentTeachersList.map((i, idx) => (
          <div className="mm-row" key={idx}>
            <span className="mm-row-main">
              <b>{i.namaGuru}</b>
              <small>Jam {i.jamKe} - {i.namaKelas || i.kelas}</small>
            </span>
            <span className="mm-badge danger">{i.status}</span>
          </div>
        ))}
      </div>

      <div className="mm-card">
        <div className="mm-card-title" style={{ color: '#047857' }}><CheckCircle size={18} /> Guru Hadir Terkini</div>
        {!data.presentTeachersList.length ? (
          <div className="mm-empty">Belum ada data kehadiran masuk.</div>
        ) : data.presentTeachersList.map((i, idx) => (
          <div className="mm-row" key={idx}>
            <span className="mm-row-main">
              <b>{i.namaGuru}</b>
              <small>Jam {i.jamKe} - {i.namaKelas || i.kelas}</small>
            </span>
            <span className="mm-badge good">Hadir</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const DashboardSkeleton = () => (
  <div>
    <div className="loading-welcome skeleton-pulse"></div>
    <div className="loading-grid">
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} className="loading-card">
          <div className="loading-line sm skeleton-pulse"></div>
          <div className="loading-line lg skeleton-pulse"></div>
          <div className="loading-line sm skeleton-pulse" style={{ width: '80%' }}></div>
        </div>
      ))}
    </div>
    <div className="grid grid-2">
      <div className="loading-table-card skeleton-pulse"></div>
      <div className="loading-table-card skeleton-pulse"></div>
    </div>
  </div>
);

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [showAllTeachers, setShowAllTeachers] = useState(false);
  const isMobile = useIsMobile();
  const formatRupiah = (value) => new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(Number(value) || 0);

  useEffect(() => {
    api.get('/dashboard').then(res => setData(res.data)).catch(() => setData(null));
  }, []);

  const todayLabel = new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  if (data && isMobile) {
    return (
      <DashboardMobile
        data={data}
        formatRupiah={formatRupiah}
        todayLabel={todayLabel}
        showAllTeachers={showAllTeachers}
        setShowAllTeachers={setShowAllTeachers}
      />
    );
  }

  return (
    <div>
      {!data && <DashboardSkeleton />}
      {data && (
        <div>
          <div className="dashboard-welcome">
            <div>
              <h1>Selamat Datang di MadaFlow</h1>
              <p>Ringkasan aktivitas akademik dan keuangan sekolah hari ini.</p>
            </div>
          </div>

          <div className="stat-grid">
            <div className="stat-card blue">
              <div className="stat-label">Total Guru</div>
              <div className="stat-value">{data.totalGuru}</div>
              <div className="stat-desc">Guru aktif terdaftar</div>
              <div className="stat-icon"><Users size={96} /></div>
            </div>
            <div className="stat-card green">
              <div className="stat-label">Total Kelas</div>
              <div className="stat-value">{data.totalKelas}</div>
              <div className="stat-desc">Kelas aktif</div>
              <div className="stat-icon"><School size={96} /></div>
            </div>
            <div className="stat-card purple">
              <div className="stat-label">Hadir Hari Ini</div>
              <div className="stat-value">{data.presentCount}</div>
              <div className="stat-desc">Guru check-in</div>
              <div className="stat-icon"><CheckCircle size={96} /></div>
            </div>
            <div className="stat-card orange">
              <div className="stat-label">Absen / Izin</div>
              <div className="stat-value">{data.absentCount}</div>
              <div className="stat-desc">Tidak hadir</div>
              <div className="stat-icon"><AlertCircle size={96} /></div>
            </div>
            <div className="stat-card pink">
              <div className="stat-label">Bisyaroh Bulan Ini</div>
              <div className="stat-value" style={{ fontSize: '28px' }}>{formatRupiah(data.totalBisyarohMonth)}</div>
              <div className="stat-desc">Estimasi pengeluaran</div>
              <div className="stat-icon"><CreditCard size={96} /></div>
            </div>
          </div>

          <div className="modern-table-card" style={{ marginBottom: 32 }}>
            <div className="modern-table-title">
              <BarChart3 size={24} /> Visualisasi Kehadiran
            </div>
            <div className="chart" style={{ gridTemplateColumns: 'repeat(3, 1fr)', height: 300, background: 'transparent', border: 'none', padding: 0, marginTop: 0 }}>
              <div className="chart-item">
                <div className="chart-bar chart-bar-3d" style={{ height: '100%', '--bar-color': 'var(--primary-500)' }}>
                  <span className="chart-value">{data.totalGuru}</span>
                </div>
                <div className="chart-label">Total Guru</div>
              </div>
              <div className="chart-item">
                <div className="chart-bar chart-bar-3d" style={{ height: `${Math.min(((data.presentCount / (data.totalGuru || 1)) * 100), 100)}%`, '--bar-color': 'var(--success-500)' }}>
                  <span className="chart-value">{data.presentCount}</span>
                </div>
                <div className="chart-label">Hadir</div>
              </div>
              <div className="chart-item">
                <div className="chart-bar chart-bar-3d" style={{ height: `${Math.min(((data.absentCount / (data.totalGuru || 1)) * 100), 100)}%`, '--bar-color': 'var(--danger-500)' }}>
                  <span className="chart-value">{data.absentCount}</span>
                </div>
                <div className="chart-label">Tidak Hadir</div>
              </div>
            </div>
          </div>

          {/* Guru Terjadwal Hari Ini */}
          <div className="modern-table-card" style={{ marginBottom: 24 }}>
            <div className="modern-table-title">
              <CalendarCheck size={24} /> Guru Terjadwal Hari Ini
            </div>
            <div style={{ marginBottom: 12, color: 'var(--muted)', fontSize: 13 }}>
              {todayLabel} &mdash; Total <strong style={{ color: 'var(--primary-700)' }}>{data.scheduledTeachersList?.length ?? 0}</strong> guru terjadwal
            </div>
            {!data.scheduledTeachersList?.length ? (
              <div className="empty">Tidak ada guru yang terjadwal hari ini.</div>
            ) : (
              <>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                  {(showAllTeachers ? data.scheduledTeachersList : data.scheduledTeachersList.slice(0, 30)).map((t, idx) => (
                    <span
                      key={t.guruId}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        background: '#f1f5f9', color: '#1e293b',
                        border: '1px solid #e2e8f0', borderRadius: 20,
                        padding: '4px 12px', fontSize: 13, fontWeight: 500
                      }}
                    >
                      <span style={{ color: 'var(--muted)', fontSize: 11 }}>{idx + 1}.</span>
                      {t.namaGuru}
                    </span>
                  ))}
                </div>
                {data.scheduledTeachersList.length > 30 && (
                  <button className="btn sm outline" onClick={() => setShowAllTeachers(v => !v)} style={{ marginTop: 4 }}>
                    {showAllTeachers ? 'Tampilkan lebih sedikit' : `Lihat semua (${data.scheduledTeachersList.length} guru)`}
                  </button>
                )}
              </>
            )}
          </div>

          <div className="grid grid-2" style={{ marginTop: 16 }}>
            <div className="modern-table-card">
              <div className="modern-table-title">
                <XCircle size={24} /> Guru Tidak Hadir / Izin
              </div>
              <table className="table">
                <thead>
                  <tr><th>Jam</th><th>Kelas</th><th>Guru</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {data.absentTeachersList.map((i, idx) => (
                    <tr key={idx}>
                      <td>{i.jamKe}</td>
                      <td>{i.namaKelas || i.kelas}</td>
                      <td>{i.namaGuru}</td>
                      <td><span className="badge danger">{i.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.absentTeachersList.length === 0 && <div className="empty">Tidak ada data.</div>}
            </div>
            <div className="modern-table-card">
              <div className="modern-table-title">
                <CheckCircle size={24} /> Guru Hadir Terkini
              </div>
              <table className="table">
                <thead>
                  <tr><th>Jam</th><th>Kelas</th><th>Guru</th></tr>
                </thead>
                <tbody>
                  {data.presentTeachersList.map((i, idx) => (
                    <tr key={idx}>
                      <td>{i.jamKe}</td>
                      <td>{i.namaKelas || i.kelas}</td>
                      <td>{i.namaGuru}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.presentTeachersList.length === 0 && <div className="empty">Belum ada data kehadiran masuk.</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
