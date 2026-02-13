import { useEffect, useRef, useState } from 'react';
import api from '../api';
import { BarChart3, Calendar } from 'lucide-react';

const StatistikSkeleton = () => (
  <div className="modern-table-card">
    <div className="skeleton-pulse" style={{ height: 40, width: 200, marginBottom: 24, borderRadius: 8 }}></div>
    <div className="skeleton-pulse" style={{ height: 300, width: '100%', borderRadius: 12 }}></div>
  </div>
);

export default function StatistikGuru() {
  const today = new Date();
  const defaultStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const defaultEnd = today.toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/attendance/statistics', { params: { startDate, endDate } });
      setItems(res.data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      load();
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [startDate, endDate]);

  return (
    <div>
      {loading && <StatistikSkeleton />}
      {!loading && (
      <div className="modern-table-card">
        <div className="modern-table-title"><BarChart3 size={24} /> Statistik Kehadiran Guru</div>
        <div className="toolbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Calendar size={18} style={{ color: 'var(--muted)' }} />
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <span style={{ color: 'var(--muted)' }}>s/d</span>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
        </div>
        <table className="table">
          <thead>
            <tr>
              <th rowSpan="2">No</th>
              <th rowSpan="2">Nama Guru</th>
              <th colSpan="2" style={{ textAlign: 'center', background: 'var(--primary-100)' }}>Jadwal Tetap</th>
              <th colSpan="2" style={{ textAlign: 'center', background: 'var(--success-100)' }}>Realisasi (Periode)</th>
            </tr>
            <tr>
              <th style={{ background: 'var(--primary-50)' }}>Jam/Minggu</th>
              <th style={{ background: 'var(--primary-50)' }}>Hari/Minggu</th>
              <th style={{ background: 'var(--success-50)' }}>Jam Hadir</th>
              <th style={{ background: 'var(--success-50)' }}>Hari Transport</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => (
              <tr key={idx}>
                <td>{idx + 1}</td>
                <td style={{ fontWeight: 600 }}>{it.nama}</td>
                <td>{it.jadwalJamMingguan}</td>
                <td>{it.jadwalHariMingguan}</td>
                <td style={{ color: 'var(--success-600)', fontWeight: 600 }}>{it.hadirJamPeriode}</td>
                <td style={{ color: 'var(--success-600)', fontWeight: 600 }}>{it.transportHariPeriode}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && !loading && <div className="empty">Belum ada data.</div>}
      </div>
      )}
    </div>
  );
}
