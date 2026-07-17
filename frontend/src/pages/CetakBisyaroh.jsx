import { useEffect, useRef, useState } from 'react';
import api from '../api';
import { Printer, Calendar, Wallet, FileText } from 'lucide-react';

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
            <div>
              <span>Grand Total</span>
              <strong>{formatRupiah(totalDiterima + totalExpense)}</strong>
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
    </div>
  );
}
