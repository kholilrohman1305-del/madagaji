import { useEffect, useRef, useState } from 'react';
import api from '../api';
import { Printer, Calendar, Wallet, FileText, TrendingUp } from 'lucide-react';

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

const parseTask = (value) => {
  if (!value || value === '-') return null;
  const match = String(value).match(/^(.*)\s+\(([-\d.]+)\)$/);
  if (!match) return { title: value, nominal: null };
  return {
    title: match[1],
    nominal: Number(match[2]) || 0
  };
};

const getTaskDetails = (item) => [
  parseTask(item.tugasTambahan1),
  parseTask(item.tugasTambahan2),
  parseTask(item.tugasTambahan3)
].filter(Boolean);

export default function CetakBisyaroh() {
  const today = new Date();
  const defaultStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const defaultEnd = today.toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [items, setItems] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [totalData, setTotalData] = useState(null);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const [summaryRes, expenseRes, totalRes] = await Promise.all([
        api.get('/payroll/summary', { params: { startDate, endDate } }),
        api.get('/payroll/expenses', { params: { startDate, endDate } }),
        api.get('/payroll/total-bisyaroh', { params: { startDate, endDate } })
      ]);
      setItems(summaryRes.data || []);
      setExpenses(expenseRes.data || []);
      setTotalData(totalRes.data || null);
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

  const teacherItems = items.filter(it => !it.isExpense);
  const totalMengajar = teacherItems.reduce((sum, it) => sum + Number(it.bisyarohMengajar || 0), 0);
  const totalTransport = teacherItems.reduce((sum, it) => sum + Number(it.bisyarohTransport || 0) + Number(it.bisyarohTransportKegiatan || 0), 0);
  const totalTugas = teacherItems.reduce((sum, it) => sum + Number(it.honorTugas || 0), 0);
  const totalWiyathabakti = teacherItems.reduce((sum, it) => sum + Number(it.wiyathabakti || 0), 0);
  const totalDiterima = teacherItems.reduce((sum, it) => sum + Number(it.totalBisyaroh || 0), 0);
  const totalExpense = expenses.reduce((sum, exp) => {
    const total = exp.totalNominal || (Number(exp.jumlah || 0) * Number(exp.nominal || 0));
    return sum + Number(total || 0);
  }, 0);
  const totalJamMengajar = teacherItems.reduce((sum, it) => sum + Number(it.totalHadir || 0), 0);
  const totalRows = totalData ? [
    { no: 1, label: 'Wiyatabhakti', value: totalData.wiyathabakti || 0, color: 'var(--primary-500)' },
    { no: 2, label: 'Bisyaroh Mengajar', value: totalData.bisyarohMengajar || 0, color: 'var(--success-500)' },
    { no: 3, label: 'Transport Kehadiran', value: totalData.transportKehadiran || 0, color: 'var(--purple-500)' },
    { no: 4, label: 'Transport Kegiatan', value: totalData.transportKegiatan || 0, color: 'var(--cyan-500)' },
    { no: 5, label: 'Tugas Tambahan', value: totalData.bisyarohTugasTambahan || 0, color: 'var(--orange-500)' },
    { no: 6, label: 'Pengeluaran Lain', value: totalData.pengeluaranLain || 0, color: 'var(--danger-500)' },
    { no: 7, label: 'Ekstrakurikuler', value: totalData.pengeluaranEkstrakurikuler || 0, color: '#be123c' },
    { no: 8, label: 'Kedisiplinan', value: totalData.pengeluaranKedisiplinan || 0, color: '#b45309' }
  ] : [];
  const totalBisyarohValue = totalData?.total ?? totalRows.reduce((sum, row) => sum + Number(row.value || 0), 0);
  const maxTotalValue = totalRows.reduce((max, row) => Math.max(max, Number(row.value || 0)), 1);

  return (
    <div>
      <div className="modern-table-card">
        <div className="modern-table-title no-print"><Printer size={24} /> Cetak Bisyaroh</div>
        <div className="toolbar no-print">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Calendar size={18} style={{ color: 'var(--muted)' }} />
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <span style={{ color: 'var(--muted)' }}>s/d</span>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
          <button onClick={print}>
            <Printer size={18} /> Cetak PDF (Landscape)
          </button>
        </div>

        <div className="cetak-bisyaroh-document">
          <div className="cetak-bisyaroh-header">
            <div>
              <div className="cetak-bisyaroh-kicker">Dokumen Rekap Honorarium</div>
              <h1>Rekap Bisyaroh Guru dan Tenaga Kependidikan</h1>
              <p>Periode {formatDate(startDate)} s/d {formatDate(endDate)}</p>
            </div>
            <div className="cetak-bisyaroh-meta">
              <span>Tanggal Cetak</span>
              <strong>{formatDate(new Date().toISOString().slice(0, 10))}</strong>
            </div>
          </div>

          <div className="cetak-bisyaroh-summary">
            <div>
              <span>Penerima</span>
              <strong>{teacherItems.length}</strong>
            </div>
            <div>
              <span>Jam Hadir Mengajar</span>
              <strong>{totalJamMengajar.toLocaleString('id-ID')} Jam</strong>
            </div>
            <div>
              <span>Bisyaroh Mengajar</span>
              <strong>{formatRupiah(totalMengajar)}</strong>
            </div>
            <div>
              <span>Transport</span>
              <strong>{formatRupiah(totalTransport)}</strong>
            </div>
            <div>
              <span>Tugas Tambahan</span>
              <strong>{formatRupiah(totalTugas)}</strong>
            </div>
          </div>

          <div className="cetak-section-title"><FileText size={18} /> Daftar Penerima Bisyaroh</div>
          <div style={{ overflowX: 'auto' }}>
            <table className="table print-show cetak-bisyaroh-table">
            <thead>
              <tr>
                <th className="center">No.</th>
                <th>Nama</th>
                <th>TMT</th>
                <th>Jam</th>
                <th>Mengajar</th>
                <th>Transport</th>
                <th>Kegiatan</th>
                <th>Rincian Tugas Tambahan</th>
                <th>Wiyathabakti</th>
                <th style={{ background: 'var(--success-100)' }}>Jumlah Diterima</th>
                <th>TTD</th>
              </tr>
            </thead>
            <tbody>
              {teacherItems.map((it, idx) => {
                const taskDetails = getTaskDetails(it);
                return (
                <tr key={idx}>
                  <td className="center">{idx + 1}</td>
                  <td style={{ fontWeight: 600 }}>{it.nama}</td>
                  <td>{it.tmt || '-'}</td>
                  <td>{it.totalHadir ?? 0}</td>
                  <td>{formatRupiah(it.bisyarohMengajar)}</td>
                  <td>
                    <div>{it.totalTransportHari ?? 0} hari</div>
                    <strong>{formatRupiah(it.bisyarohTransport)}</strong>
                  </td>
                  <td>
                    <div>{it.jumlahKegiatan ?? 0} kegiatan</div>
                    <strong>{formatRupiah(it.bisyarohTransportKegiatan)}</strong>
                  </td>
                  <td className="cetak-task-cell">
                    {taskDetails.length === 0 ? '-' : taskDetails.map((task, taskIdx) => (
                      <div className="cetak-task-line" key={`${idx}-${taskIdx}`}>
                        <span>{task.title}</span>
                        <strong>{task.nominal === null ? '-' : formatRupiah(task.nominal)}</strong>
                      </div>
                    ))}
                    {taskDetails.length > 0 && (
                      <div className="cetak-task-total">
                        <span>Total</span>
                        <strong>{formatRupiah(it.honorTugas)}</strong>
                      </div>
                    )}
                  </td>
                  <td>{formatRupiah(it.wiyathabakti)}</td>
                  <td className="cetak-total-cell">{formatRupiah(it.totalBisyaroh)}</td>
                  <td className="print-ttd">{idx + 1}</td>
                </tr>
                );
              })}
              {teacherItems.length > 0 && (
                <tr className="cetak-grand-row">
                  <td colSpan="4">TOTAL</td>
                  <td>{formatRupiah(totalMengajar)}</td>
                  <td>{formatRupiah(teacherItems.reduce((sum, it) => sum + Number(it.bisyarohTransport || 0), 0))}</td>
                  <td>{formatRupiah(teacherItems.reduce((sum, it) => sum + Number(it.bisyarohTransportKegiatan || 0), 0))}</td>
                  <td>{formatRupiah(totalTugas)}</td>
                  <td>{formatRupiah(totalWiyathabakti)}</td>
                  <td>{formatRupiah(totalDiterima)}</td>
                  <td></td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
        {teacherItems.length === 0 && !loading && <div className="empty">Belum ada data.</div>}
        {loading && <div className="empty">Memuat...</div>}
      </div>

      <div className="modern-table-card" style={{ marginTop: 24 }}>
        <div className="modern-table-title no-print"><Wallet size={24} /> Pengeluaran Lain</div>
        <div className="cetak-bisyaroh-document">
          <div className="cetak-section-title"><Wallet size={18} /> Pengeluaran Lain</div>
          <table className="table print-show cetak-bisyaroh-expense">
            <thead>
              <tr>
                <th>No.</th>
                <th>Kategori</th>
                <th>Jumlah</th>
                <th>Nominal</th>
                <th>Total</th>
                <th>TTD</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((exp, idx) => (
                <tr key={exp.id}>
                  <td className="center">{idx + 1}</td>
                  <td>{exp.kategori}</td>
                  <td>{exp.jumlah ?? 1}</td>
                  <td style={{ fontWeight: 600 }}>{formatRupiah(exp.nominal)}</td>
                  <td style={{ fontWeight: 700 }}>{formatRupiah(exp.totalNominal || (Number(exp.jumlah || 0) * Number(exp.nominal || 0)))}</td>
                  <td className="print-ttd">{idx + 1}</td>
                </tr>
              ))}
              {expenses.length > 0 && (
                <tr className="cetak-grand-row">
                  <td colSpan="4">TOTAL PENGELUARAN LAIN</td>
                  <td>{formatRupiah(totalExpense)}</td>
                  <td></td>
                </tr>
              )}
            </tbody>
          </table>
          {expenses.length === 0 && !loading && <div className="empty">Belum ada pengeluaran.</div>}

          <div className="cetak-signature">
            <div>
              <span>Mengetahui,</span>
              <strong>Kepala Madrasah</strong>
              <em></em>
            </div>
            <div>
              <span>Dibuat oleh,</span>
              <strong>Bendahara</strong>
              <em></em>
            </div>
          </div>
        </div>
      </div>

      {totalData && (
        <div className="modern-table-card cetak-total-bisyaroh-page" style={{ marginTop: 24 }}>
          <div className="total-bisyaroh-document">
            <div className="total-bisyaroh-header">
              <div>
                <div className="cetak-bisyaroh-kicker">Ringkasan Akhir Cetak Bisyaroh</div>
                <h1>Total Bisyaroh</h1>
                <p>Periode {formatDate(startDate)} s/d {formatDate(endDate)}</p>
              </div>
              <div className="cetak-bisyaroh-meta">
                <span>Jumlah Total</span>
                <strong>{formatRupiah(totalBisyarohValue)}</strong>
              </div>
            </div>

            <div className="stat-grid total-bisyaroh-stat-grid">
              <div className="stat-card total-bisyaroh-hours-card">
                <div className="stat-label">Jumlah Jam Hadir Mengajar</div>
                <div className="stat-value">{totalJamMengajar.toLocaleString('id-ID')} Jam</div>
              </div>
              {totalRows.map(row => (
                <div key={row.no} className="stat-card" style={{ background: `linear-gradient(135deg, ${row.color}15 0%, ${row.color}25 100%)` }}>
                  <div className="stat-label" style={{ color: row.color }}>{row.label}</div>
                  <div className="stat-value" style={{ color: row.color, fontSize: 28 }}>{formatRupiah(row.value)}</div>
                </div>
              ))}
              <div className="stat-card" style={{ background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)', color: 'white' }}>
                <div className="stat-label" style={{ color: 'rgba(255,255,255,0.8)' }}>JUMLAH TOTAL</div>
                <div className="stat-value" style={{ color: 'white', fontSize: 28 }}>{formatRupiah(totalBisyarohValue)}</div>
              </div>
            </div>

            <div className="modern-table-title total-bisyaroh-chart-title" style={{ marginTop: 18 }}>
              <TrendingUp size={24} /> Grafik Total Bisyaroh
            </div>
            <div className="chart chart-wide cetak-total-bisyaroh-chart" style={{ height: 340 }}>
              {totalRows.map(row => {
                const ratio = maxTotalValue > 0 ? (Number(row.value) || 0) / maxTotalValue : 0;
                const heightPct = row.value > 0 ? Math.max(8, Math.round(ratio * 100)) : 3;
                return (
                  <div key={row.no} className="chart-item">
                    <div className="chart-top-value">{formatRupiah(row.value)}</div>
                    <div
                      className="chart-bar chart-bar-3d"
                      style={{
                        height: `${heightPct}%`,
                        '--bar-color': row.color
                      }}
                    >
                      <span className="chart-value" style={{ fontSize: 12 }}>{formatRupiah(row.value)}</span>
                    </div>
                    <div className="chart-label">{row.label}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
