import { useEffect, useRef, useState } from 'react';
import api from '../api';
import { Printer, Calendar, Wallet } from 'lucide-react';

const formatRupiah = (value) => {
  const num = Number(value || 0);
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(Number.isNaN(num) ? 0 : num);
};

export default function CetakBisyaroh() {
  const today = new Date();
  const defaultStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const defaultEnd = today.toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [items, setItems] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const [summaryRes, expenseRes] = await Promise.all([
        api.get('/payroll/summary', { params: { startDate, endDate } }),
        api.get('/payroll/expenses', { params: { startDate, endDate } })
      ]);
      setItems(summaryRes.data || []);
      setExpenses(expenseRes.data || []);
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

        <div style={{ overflowX: 'auto' }}>
          <table className="table print-show cetak-bisyaroh-table">
            <thead>
              <tr>
                <th className="print-only center">No.</th>
                <th>Nama</th>
                <th>TMT</th>
                <th>Wiyathabakti</th>
                <th>Jam Hadir</th>
                <th>Bisyaroh Mengajar</th>
                <th>Hadir (Transport)</th>
                <th>Bisyaroh Transport</th>
                <th>Kegiatan</th>
                <th>Transport Kegiatan</th>
                <th>Tugas 1</th>
                <th>Tugas 2</th>
                <th>Tugas 3</th>
                <th style={{ background: 'var(--success-100)' }}>Jumlah Diterima</th>
                <th className="print-only">TTD</th>
              </tr>
            </thead>
            <tbody>
              {items.filter(it => !it.isExpense).map((it, idx) => (
                <tr key={idx}>
                  <td className="print-only center">{idx + 1}</td>
                  <td style={{ fontWeight: 600 }}>{it.nama}</td>
                  <td>{it.tmt || '-'}</td>
                  <td>{formatRupiah(it.wiyathabakti)}</td>
                  <td>{it.totalHadir ?? 0}</td>
                  <td>{formatRupiah(it.bisyarohMengajar)}</td>
                  <td>{it.totalTransportHari ?? 0}</td>
                  <td>{formatRupiah(it.bisyarohTransport)}</td>
                  <td>{it.jumlahKegiatan ?? 0}</td>
                  <td>{formatRupiah(it.bisyarohTransportKegiatan)}</td>
                  <td>{it.tugasTambahan1 || '-'}</td>
                  <td>{it.tugasTambahan2 || '-'}</td>
                  <td>{it.tugasTambahan3 || '-'}</td>
                  <td style={{ fontWeight: 700, color: 'var(--success-600)' }}>{formatRupiah(it.totalBisyaroh)}</td>
                  <td className="print-only print-ttd">{idx + 1}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {items.length === 0 && !loading && <div className="empty">Belum ada data.</div>}
        {loading && <div className="empty">Memuat...</div>}
      </div>

      <div className="modern-table-card" style={{ marginTop: 24 }}>
        <div className="modern-table-title no-print"><Wallet size={24} /> Pengeluaran Lain</div>
        <table className="table print-show cetak-bisyaroh-expense">
          <thead>
            <tr>
              <th>Kategori</th>
              <th>Jumlah</th>
              <th>Nominal</th>
              <th>Total</th>
              <th className="print-only">TTD</th>
            </tr>
          </thead>
          <tbody>
            {expenses.map((exp, idx) => (
              <tr key={exp.id}>
                <td>{exp.kategori}</td>
                <td>{exp.jumlah ?? 1}</td>
                <td style={{ fontWeight: 600 }}>{formatRupiah(exp.nominal)}</td>
                <td style={{ fontWeight: 700 }}>{formatRupiah(exp.totalNominal || (Number(exp.jumlah || 0) * Number(exp.nominal || 0)))}</td>
                <td className="print-only print-ttd">{idx + 1}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {expenses.length === 0 && !loading && <div className="empty">Belum ada pengeluaran.</div>}
      </div>
    </div>
  );
}
