import { useState } from 'react';
import api from '../api';
import useMasterData from '../hooks/useMasterData';
import { FileText, Calendar, User, Printer, Download } from 'lucide-react';

export default function SlipGaji() {
  const today = new Date();
  const defaultStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const defaultEnd = today.toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [guruId, setGuruId] = useState('');
  const [guruSearch, setGuruSearch] = useState('');
  const [guruOpen, setGuruOpen] = useState(false);
  const [data, setData] = useState(null);
  const [allData, setAllData] = useState([]);
  const { data: master } = useMasterData();

  const load = async () => {
    const res = await api.get('/payroll/payslip', { params: { startDate, endDate, guruId } });
    setData(res.data);
  };

  const loadAll = async () => {
    const res = await api.get('/payroll/payslips', { params: { startDate, endDate } });
    setAllData(res.data || []);
  };

  const applyPrintSize = () => {
    const styleId = 'print-size-style';
    const css = '@page { size: 10.5cm 14.8cm; margin: 8mm; }';
    const existing = document.getElementById(styleId);
    if (existing) existing.textContent = css;
    else {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = css;
      document.head.appendChild(style);
    }
  };

  const printAll = () => {
    applyPrintSize();
    document.body.classList.add('print-a6');
    setTimeout(() => window.print(), 50);
  };

  const printSingle = () => {
    applyPrintSize();
    document.body.classList.add('print-a6');
    setTimeout(() => window.print(), 50);
  };

  const formatRupiah = (value) => {
    const num = Number(value || 0);
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0
    }).format(Number.isNaN(num) ? 0 : num);
  };

  const getItem = (items, name) => items.find(i => i.nama === name);

  const SlipCard = ({ slip }) => {
    const items = slip.pendapatan || [];
    const honorHadir = getItem(items, 'Honor Hadir')?.total || 0;
    const honorIzin = getItem(items, 'Honor Izin')?.total || 0;
    const honorTidakHadir = getItem(items, 'Honor Tidak Hadir')?.total || 0;
    const bisyarohMengajar = honorHadir + honorIzin + honorTidakHadir;
    const transportHarian = getItem(items, 'Transport Harian')?.total || 0;
    const transportAcara = getItem(items, 'Transport Acara')?.total || 0;
    const wiyathabakti = getItem(items, 'Wiyathabakti')?.total || 0;
    const tugasTambahan = getItem(items, 'Tugas Tambahan')?.total || 0;

    const parseTask = (raw) => {
      if (!raw) return { name: '-', nominal: null };
      const match = String(raw).match(/^(.*)\(([-\d.,]+)\)\s*$/);
      if (!match) return { name: String(raw), nominal: null };
      const name = match[1].trim();
      const num = Number(String(match[2]).replace(/[^0-9-]/g, ''));
      return { name: name || String(raw), nominal: Number.isNaN(num) ? null : num };
    };
    const task1 = parseTask(slip.tugasTambahan1);
    const task2 = parseTask(slip.tugasTambahan2);
    const task3 = parseTask(slip.tugasTambahan3);

    return (
      <div className="slip-card slip-page">
        <div className="slip-header">
          <div className="slip-logo">MA</div>
          <div className="slip-title">
            <div className="slip-school">MADRASAH ALIYAH ABU DARRIN</div>
            <div className="slip-subtitle">MA Plus Keterampilan TIK & Tata Busana</div>
          </div>
        </div>
        <div className="slip-meta">
          <div><strong>Bulan</strong> {slip.periode}</div>
          <div><strong>Pengabdian</strong> {slip.pengabdianYears} Tahun</div>
        </div>
        <div className="slip-name">{slip.nama}</div>
        <table className="slip-table">
          <thead>
            <tr>
              <th>Jenis Bisyaroh</th>
              <th>Bisyaroh</th>
              <th>Jumlah</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Bisyaroh Mengajar</td>
              <td>{formatRupiah(bisyarohMengajar)}</td>
              <td>{formatRupiah(bisyarohMengajar)}</td>
            </tr>
            <tr>
              <td>Transport</td>
              <td>{formatRupiah(transportHarian)}</td>
              <td>{formatRupiah(transportHarian)}</td>
            </tr>
            <tr>
              <td>Transport Kegiatan</td>
              <td>{formatRupiah(transportAcara)}</td>
              <td>{formatRupiah(transportAcara)}</td>
            </tr>
          </tbody>
        </table>
        <div className="slip-section">Tugas Tambahan</div>
        <table className="slip-table">
          <tbody>
            <tr>
              <td>1. {task1.name}</td>
              <td style={{ textAlign: 'right' }}>{task1.nominal !== null ? formatRupiah(task1.nominal) : '-'}</td>
            </tr>
            <tr>
              <td>2. {task2.name}</td>
              <td style={{ textAlign: 'right' }}>{task2.nominal !== null ? formatRupiah(task2.nominal) : '-'}</td>
            </tr>
            <tr>
              <td>3. {task3.name}</td>
              <td style={{ textAlign: 'right' }}>{task3.nominal !== null ? formatRupiah(task3.nominal) : '-'}</td>
            </tr>
            <tr>
              <td>Wiyathabakti</td>
              <td style={{ textAlign: 'right' }}>{formatRupiah(wiyathabakti)}</td>
            </tr>
          </tbody>
        </table>
        <div className="slip-total">
          <span>Jumlah</span>
          <span>{formatRupiah(slip.gajiBersih)}</span>
        </div>
        <div className="slip-footer">Manfaati, Bersinergi, Barokahi</div>
      </div>
    );
  };

  return (
    <div>
      <div className="modern-table-card">
        <div className="modern-table-title no-print"><FileText size={24} /> Slip Gaji</div>
        <div className="toolbar no-print">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Calendar size={18} style={{ color: 'var(--muted)' }} />
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <span style={{ color: 'var(--muted)' }}>s/d</span>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
            <User size={18} style={{ color: 'var(--muted)' }} />
            <button
              type="button"
              className="outline"
              onClick={() => setGuruOpen(!guruOpen)}
            >
              {guruId ? (master?.guru || []).find(g => g.id === guruId)?.name || 'Pilih Guru' : 'Pilih Guru'}
            </button>
            {guruOpen && (
              <div className="dropdown-panel">
                <input
                  value={guruSearch}
                  onChange={e => setGuruSearch(e.target.value)}
                  placeholder="Cari guru..."
                  className="dropdown-search"
                />
                <div className="dropdown-list">
                  {(master?.guru || [])
                    .filter(g => g.name.toLowerCase().includes(guruSearch.toLowerCase()))
                    .map(g => (
                      <button
                        key={g.id}
                        type="button"
                        className="dropdown-item"
                        onClick={() => {
                          setGuruId(g.id);
                          setGuruOpen(false);
                        }}
                      >
                        {g.name}
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>
          <button onClick={load}>
            <Download size={18} /> Tampilkan
          </button>
          <button className="outline" onClick={printSingle} disabled={!data}>
            <Printer size={18} /> Cetak Slip
          </button>
        </div>
        <div className="toolbar no-print" style={{ marginTop: 8 }}>
          <button className="secondary" onClick={loadAll}>
            <Download size={18} /> Muat Semua Slip
          </button>
          <button className="outline" onClick={printAll} disabled={allData.length === 0}>
            <Printer size={18} /> Cetak Semua (A6)
          </button>
        </div>

        {data && (
          <div className="no-print" style={{ marginTop: 20 }}>
            <SlipCard slip={data} />
          </div>
        )}

        {!data && <div className="empty no-print">Pilih guru dan klik Tampilkan untuk melihat slip gaji.</div>}
      </div>

      <div className="print-only" style={{ marginTop: 16 }}>
        {data && <SlipCard slip={data} />}
        {allData.length > 0 && allData.map((slip, idx) => (
          <SlipCard key={idx} slip={slip} />
        ))}
      </div>
    </div>
  );
}
