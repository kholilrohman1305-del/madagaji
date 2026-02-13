import { useEffect, useState } from 'react';
import api from '../api';
import { Users, School, CheckCircle, AlertCircle, CreditCard, BarChart3, XCircle } from 'lucide-react';

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
  const formatRupiah = (value) => new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(Number(value) || 0);

  useEffect(() => {
    api.get('/dashboard').then(res => setData(res.data)).catch(() => setData(null));
  }, []);

  return (
    <div>
      {!data && <DashboardSkeleton />}
      {data && (
        <div>
          <div className="dashboard-welcome">
            <div>
              <h1>Selamat Datang di Madagaji</h1>
              <p>Ringkasan aktivitas akademik dan keuangan sekolah hari ini.</p>
            </div>
          </div>

          <div className="stat-grid">
            <div className="stat-card blue">
              <div className="stat-label">Total Guru</div>
              <div className="stat-value">{data.totalGuru}</div>
              <div className="stat-desc">Terjadwal hari ini</div>
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
