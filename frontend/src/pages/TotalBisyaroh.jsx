import { useEffect, useRef, useState } from 'react';
import api from '../api';
import { PieChart, Calendar, TrendingUp, Printer } from 'lucide-react';

const formatRupiah = (value) => {
  const num = Number(value || 0);
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(Number.isNaN(num) ? 0 : num);
};

const formatDate = (value) => {
  if (!value) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  }).format(new Date(value));
};

export default function TotalBisyaroh() {
  const today = new Date();
  const defaultStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const defaultEnd = today.toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/payroll/total-bisyaroh', { params: { startDate, endDate } });
      setData(res.data || null);
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

  const rows = data ? [
    { no: 1, label: 'Wiyatabhakti', value: data.wiyathabakti || 0, color: 'var(--primary-500)' },
    { no: 2, label: 'Bisyaroh Mengajar', value: data.bisyarohMengajar || 0, color: 'var(--success-500)' },
    { no: 3, label: 'Transport Kehadiran', value: data.transportKehadiran || 0, color: 'var(--purple-500)' },
    { no: 4, label: 'Transport Kegiatan', value: data.transportKegiatan || 0, color: 'var(--cyan-500)' },
    { no: 5, label: 'Tugas Tambahan', value: data.bisyarohTugasTambahan || 0, color: 'var(--orange-500)' },
    { no: 6, label: 'Pengeluaran Lain', value: data.pengeluaranLain || 0, color: 'var(--danger-500)' },
    { no: 7, label: 'Ekstrakurikuler', value: data.pengeluaranEkstrakurikuler || 0, color: '#be123c' },
    { no: 8, label: 'Kedisiplinan', value: data.pengeluaranKedisiplinan || 0, color: '#b45309' }
  ] : [];

  const totalRows = rows.reduce((sum, r) => sum + Number(r.value || 0), 0);
  const totalValue = data?.total ?? totalRows;
  const maxValue = rows.reduce((m, r) => Math.max(m, r.value), 1);

  const print = () => {
    const styleId = 'print-size-style';
    const css = '@page { size: 33cm 21.5cm; margin: 10mm; }';
    const existing = document.getElementById(styleId);
    if (existing) existing.textContent = css;
    else {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = css;
      document.head.appendChild(style);
    }
    setTimeout(() => window.print(), 50);
  };

  return (
    <div className="total-bisyaroh-print">
      <div className="modern-table-card">
        <div className="modern-table-title no-print"><PieChart size={24} /> Total Bisyaroh</div>
        <div className="toolbar no-print">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Calendar size={18} style={{ color: 'var(--muted)' }} />
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <span style={{ color: 'var(--muted)' }}>s/d</span>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
          <button onClick={print}>
            <Printer size={18} /> Cetak PDF
          </button>
        </div>

        {data && (
          <div className="total-bisyaroh-document">
            <div className="total-bisyaroh-grand-card">
              <div>
                <span>Jumlah Total</span>
                <strong>{formatRupiah(totalValue)}</strong>
                <p>Periode {formatDate(startDate)} s/d {formatDate(endDate)}</p>
              </div>
              <PieChart size={38} />
            </div>

            <div className="total-bisyaroh-header">
              <div>
                <div className="cetak-bisyaroh-kicker">Ringkasan Bisyaroh</div>
                <h1>Total Bisyaroh</h1>
                <p>Periode {formatDate(startDate)} s/d {formatDate(endDate)}</p>
              </div>
              <div className="cetak-bisyaroh-meta">
                <span>Tanggal Cetak</span>
                <strong>{formatDate(new Date().toISOString().slice(0, 10))}</strong>
              </div>
            </div>

            <div className="stat-grid total-bisyaroh-stat-grid">
              {rows.map(r => (
                <div key={r.no} className="stat-card" style={{ background: `linear-gradient(135deg, ${r.color}15 0%, ${r.color}25 100%)` }}>
                  <div className="stat-label" style={{ color: r.color }}>{r.label}</div>
                  <div className="stat-value" style={{ color: r.color, fontSize: 28 }}>{formatRupiah(r.value)}</div>
                </div>
              ))}
              <div className="stat-card total-bisyaroh-inline-total" style={{ background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)', color: 'white' }}>
                <div className="stat-label" style={{ color: 'rgba(255,255,255,0.8)' }}>JUMLAH TOTAL</div>
                <div className="stat-value" style={{ color: 'white', fontSize: 28 }}>{formatRupiah(totalValue)}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {data && (
        <div className="modern-table-card" style={{ marginTop: 24 }}>
          <div className="modern-table-title total-bisyaroh-chart-title"><TrendingUp size={24} /> Grafik Bisyaroh</div>
          <div className="chart chart-wide" style={{ height: 380 }}>
            {rows.map(r => {
              const ratio = maxValue > 0 ? (Number(r.value) || 0) / maxValue : 0;
              const heightPct = r.value > 0 ? Math.max(8, Math.round(ratio * 100)) : 3;
              return (
              <div key={r.no} className="chart-item">
                <div className="chart-top-value">{formatRupiah(r.value)}</div>
                <div
                  className="chart-bar chart-bar-3d"
                  style={{
                    height: `${heightPct}%`,
                    '--bar-color': r.color
                  }}
                >
                  <span className="chart-value" style={{ fontSize: 12 }}>{formatRupiah(r.value)}</span>
                </div>
                <div className="chart-label">{r.label}</div>
              </div>
            )})}
          </div>
        </div>
      )}

      {!data && !loading && <div className="modern-table-card"><div className="empty">Belum dimuat.</div></div>}
      {loading && <div className="modern-table-card"><div className="empty">Memuat...</div></div>}
    </div>
  );
}
