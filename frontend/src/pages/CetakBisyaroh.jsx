import { useEffect, useRef, useState } from 'react';
import api from '../api';
import { Printer, Calendar, Wallet, FileText, Search, FileSpreadsheet } from 'lucide-react';
import { exportXlsx } from '../utils/reportExport';

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

const EXTRACURRICULAR_TYPE_LABELS = {
  pendamping_kbm: 'Pendamping Ekstra',
  guru_ekstra: 'Guru Ekstra'
};

const findTeacherByTask = (items, keyword) => {
  const needle = String(keyword || '').toLowerCase();
  const found = items.find((item) => getTaskDetails(item).some((task) => String(task.title || '').toLowerCase().includes(needle)));
  return found?.nama || '-';
};

const getTeacherReceivedTotal = (item) => (
  Number(item.bisyarohMengajar || 0) +
  Number(item.bisyarohTransport || 0) +
  Number(item.bisyarohTransportKegiatan || 0) +
  Number(item.honorTugas || 0) +
  Number(item.wiyathabakti || 0)
);

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
  const [exportingXlsx, setExportingXlsx] = useState(false);
  const [search, setSearch] = useState('');
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

  const searchNeedle = String(search || '').trim().toLowerCase();
  const matchesSearch = (...values) => !searchNeedle || values.some((value) =>
    String(value || '').toLowerCase().includes(searchNeedle)
  );
  // Guru Ekstra khusus dibayarkan pada tabel Ekstrakurikuler, sehingga tidak
  // diduplikasi lagi pada Daftar Penerima Bisyaroh guru KBM.
  const allTeacherItems = items.filter(it =>
    !it.isExpense && Number(it.guruId || 0) > -1000000000
  );
  const teacherItems = allTeacherItems.filter((item) => matchesSearch(
    item.nama,
    item.tugasTambahan1,
    item.tugasTambahan2,
    item.tugasTambahan3,
    ...(item.extraCompensationItems || []).map((detail) => detail.label)
  ));
  const filteredExpenses = expenses.filter((item) => matchesSearch(
    item.kategori,
    item.penerima,
    item.keterangan
  ));
  const totalMengajar = teacherItems.reduce((sum, it) => sum + Number(it.bisyarohMengajar || 0), 0);
  const totalTransport = teacherItems.reduce((sum, it) => sum + Number(it.bisyarohTransport || 0) + Number(it.bisyarohTransportKegiatan || 0), 0);
  const totalTugas = teacherItems.reduce((sum, it) => sum + Number(it.honorTugas || 0), 0);
  const totalWiyathabakti = teacherItems.reduce((sum, it) => sum + Number(it.wiyathabakti || 0), 0);
  const totalDiterima = teacherItems.reduce((sum, it) => sum + getTeacherReceivedTotal(it), 0);
  const totalExpense = filteredExpenses.reduce((sum, exp) => {
    const total = exp.totalNominal || (Number(exp.jumlah || 0) * Number(exp.nominal || 0));
    return sum + Number(total || 0);
  }, 0);
  const totalJamMengajar = teacherItems.reduce((sum, it) => sum + Number(it.totalHadir || 0), 0);
  const extracurricularItems = items.filter(it =>
    it.isExpense &&
    it.expenseType === 'extracurricular' &&
    matchesSearch(it.teacherName, it.namaEkstra, it.teacherType, it.nama)
  );
  const disciplineItems = items.filter(it =>
    it.isExpense &&
    it.expenseType === 'discipline' &&
    matchesSearch(it.nama, it.teacherName, it.keterangan)
  );
  const getDisciplineTotal = (item) => Math.abs(
    Number(item.jumlah ?? item.jumlahHadir ?? 0) * Number(item.nominal || 0)
  );
  const totalExtracurricular = extracurricularItems.reduce((sum, it) => sum + Math.abs(Number(it.totalNominal || it.totalBisyaroh || 0)), 0);
  const totalDiscipline = disciplineItems.reduce((sum, it) => sum + getDisciplineTotal(it), 0);
  const kepalaMadrasahName = findTeacherByTask(allTeacherItems, 'kepala madrasah');
  const bendaharaName = findTeacherByTask(allTeacherItems, 'bendahara');
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
  const displayedTotalRows = searchNeedle ? [
    { no: 1, label: 'Wiyatabhakti', value: totalWiyathabakti, color: 'var(--primary-500)' },
    { no: 2, label: 'Bisyaroh Mengajar', value: totalMengajar, color: 'var(--success-500)' },
    { no: 3, label: 'Transport Kehadiran', value: teacherItems.reduce((sum, item) => sum + Number(item.bisyarohTransport || 0), 0), color: 'var(--purple-500)' },
    { no: 4, label: 'Transport Kegiatan', value: teacherItems.reduce((sum, item) => sum + Number(item.bisyarohTransportKegiatan || 0), 0), color: 'var(--cyan-500)' },
    { no: 5, label: 'Tugas Tambahan', value: totalTugas, color: 'var(--orange-500)' },
    { no: 6, label: 'Pengeluaran Lain', value: totalExpense, color: 'var(--danger-500)' },
    { no: 7, label: 'Ekstrakurikuler', value: totalExtracurricular, color: '#be123c' },
    { no: 8, label: 'Kedisiplinan', value: totalDiscipline, color: '#b45309' }
  ] : totalRows;
  const totalBisyarohValue = searchNeedle
    ? displayedTotalRows.reduce((sum, row) => sum + Number(row.value || 0), 0)
    : (totalData?.total ?? totalRows.reduce((sum, row) => sum + Number(row.value || 0), 0));

  const handleExportXlsx = async () => {
    if (loading || exportingXlsx) return;
    setExportingXlsx(true);
    try {
      const teacherRows = teacherItems.map((item, index) => {
        const taskDetails = getTaskDetails(item);
        return [
          index + 1,
          item.nama || '-',
          item.tmt || '-',
          Number(item.totalHadir || 0),
          Number(item.bisyarohMengajar || 0),
          Number(item.totalTransportHari || 0),
          Number(item.bisyarohTransport || 0),
          Number(item.jumlahKegiatan || 0),
          Number(item.bisyarohTransportKegiatan || 0),
          taskDetails.map((task) => `${task.title}${task.nominal === null ? '' : ` (${task.nominal})`}`).join('; ') || '-',
          Number(item.honorTugas || 0),
          Number(item.wiyathabakti || 0),
          getTeacherReceivedTotal(item),
        ];
      });
      if (teacherItems.length) {
        teacherRows.push([
          '', 'TOTAL', '', totalJamMengajar, totalMengajar,
          teacherItems.reduce((sum, item) => sum + Number(item.totalTransportHari || 0), 0),
          teacherItems.reduce((sum, item) => sum + Number(item.bisyarohTransport || 0), 0),
          teacherItems.reduce((sum, item) => sum + Number(item.jumlahKegiatan || 0), 0),
          teacherItems.reduce((sum, item) => sum + Number(item.bisyarohTransportKegiatan || 0), 0),
          '', totalTugas, totalWiyathabakti, totalDiterima,
        ]);
      }

      const expenseRows = filteredExpenses.map((item, index) => {
        const quantity = Number(item.jumlah ?? 1);
        const nominal = Number(item.nominal || 0);
        return [index + 1, item.kategori || '-', quantity, nominal, Number(item.totalNominal || (quantity * nominal))];
      });
      if (filteredExpenses.length) expenseRows.push(['', 'TOTAL', '', '', totalExpense]);

      const extraRows = extracurricularItems.map((item, index) => [
        index + 1,
        item.teacherName || '-',
        item.namaEkstra || '-',
        EXTRACURRICULAR_TYPE_LABELS[item.teacherType] || '-',
        Number(item.jumlah || 0),
        Number(item.nominal || 0),
        Math.abs(Number(item.totalNominal || item.totalBisyaroh || 0)),
      ]);
      if (extracurricularItems.length) extraRows.push(['', 'TOTAL', '', '', '', '', totalExtracurricular]);

      const disciplineRows = disciplineItems.map((item, index) => [
        index + 1,
        item.nama || item.teacherName || '-',
        Number(item.jumlah ?? item.jumlahHadir ?? 0),
        Number(item.nominal || 0),
        getDisciplineTotal(item),
      ]);
      if (disciplineItems.length) disciplineRows.push(['', 'TOTAL', '', '', totalDiscipline]);

      const filterLabel = searchNeedle ? search : 'Semua data';
      await exportXlsx(`cetak-bisyaroh-${startDate}-${endDate}.xlsx`, [
        {
          name: 'Informasi',
          rows: [
            ['Keterangan', 'Nilai'],
            ['Periode Mulai', formatDate(startDate)],
            ['Periode Selesai', formatDate(endDate)],
            ['Filter Pencarian', filterLabel],
            ['Tanggal Export', formatDate(new Date().toISOString().slice(0, 10))],
          ],
        },
        {
          name: 'Penerima Bisyaroh',
          rows: [[
            'No.', 'Nama', 'TMT', 'Jam Mengajar', 'Bisyaroh Mengajar',
            'Hari Transport', 'Transport Kehadiran', 'Jumlah Kegiatan',
            'Transport Kegiatan', 'Rincian Tugas Tambahan', 'Total Tugas Tambahan',
            'Wiyatabhakti', 'Jumlah Diterima',
          ], ...teacherRows],
        },
        { name: 'Pengeluaran Lain', rows: [['No.', 'Kategori', 'Jumlah', 'Nominal', 'Total'], ...expenseRows] },
        { name: 'Ekstrakurikuler', rows: [['No.', 'Nama Guru', 'Nama Ekstra', 'Jenis', 'Jumlah', 'Nominal', 'Total'], ...extraRows] },
        { name: 'Kedisiplinan', rows: [['No.', 'Nama Guru atau Kategori', 'Jumlah', 'Nominal', 'Total'], ...disciplineRows] },
        {
          name: 'Ringkasan Akhir',
          rows: [
            ['No.', 'Komponen', 'Nominal'],
            ...displayedTotalRows.map((row) => [row.no, row.label, Number(row.value || 0)]),
            ['', 'JUMLAH TOTAL', Number(totalBisyarohValue || 0)],
          ],
        },
      ]);
    } catch (error) {
      console.error('Export XLSX Cetak Bisyaroh gagal:', error);
      window.alert(`Export XLSX gagal: ${error.message || 'Terjadi kesalahan.'}`);
    } finally {
      setExportingXlsx(false);
    }
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
          <div style={{ position: 'relative', minWidth: 230, flex: '1 1 230px', maxWidth: 340 }}>
            <Search size={17} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari guru, ekstra, atau kategori…"
              style={{ width: '100%', paddingLeft: 35 }}
            />
          </div>
          <button onClick={print}>
            <Printer size={18} /> Cetak PDF (Landscape)
          </button>
          <button onClick={handleExportXlsx} disabled={loading || exportingXlsx || !totalData}>
            <FileSpreadsheet size={18} /> {exportingXlsx ? 'Menyiapkan XLSX…' : 'Export XLSX'}
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
                  <td className="cetak-total-cell">{formatRupiah(getTeacherReceivedTotal(it))}</td>
                  <td className="print-ttd">{idx + 1}</td>
                </tr>
                );
              })}
              {teacherItems.length > 0 && (
                <tr className="cetak-grand-row">
                  <td colSpan="3">TOTAL</td>
                  <td>{totalJamMengajar.toLocaleString('id-ID')}</td>
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
                <th className="text-left">Kategori</th>
                <th>Jumlah</th>
                <th>Nominal</th>
                <th>Total</th>
                <th className="text-left">TTD</th>
              </tr>
            </thead>
            <tbody>
              {filteredExpenses.map((exp, idx) => (
                <tr key={exp.id}>
                  <td className="center">{idx + 1}</td>
                  <td className="text-left">{exp.kategori}</td>
                  <td>{exp.jumlah ?? 1}</td>
                  <td style={{ fontWeight: 600 }}>{formatRupiah(exp.nominal)}</td>
                  <td style={{ fontWeight: 700 }}>{formatRupiah(exp.totalNominal || (Number(exp.jumlah || 0) * Number(exp.nominal || 0)))}</td>
                  <td className="print-ttd text-left">{idx + 1}</td>
                </tr>
              ))}
              {filteredExpenses.length > 0 && (
                <tr className="cetak-grand-row">
                  <td colSpan="4">TOTAL PENGELUARAN LAIN</td>
                  <td>{formatRupiah(totalExpense)}</td>
                  <td></td>
                </tr>
              )}
            </tbody>
          </table>
          {filteredExpenses.length === 0 && !loading && <div className="empty">{search ? 'Tidak ada pengeluaran yang cocok.' : 'Belum ada pengeluaran.'}</div>}

        </div>
      </div>

      {(extracurricularItems.length > 0 || disciplineItems.length > 0) && (
        <div className="modern-table-card" style={{ marginTop: 24 }}>
          <div className="cetak-bisyaroh-document">
            {extracurricularItems.length > 0 && (
              <>
                <div className="cetak-section-title"><Wallet size={18} /> Ekstrakurikuler</div>
                <table className="table print-show cetak-bisyaroh-expense cetak-bisyaroh-extra">
                  <thead>
                    <tr>
                      <th className="center extra-no">No.</th>
                      <th className="text-left">Nama Guru</th>
                      <th className="text-left">Nama Ekstra</th>
                      <th className="text-left">Jenis</th>
                      <th>Jumlah</th>
                      <th>Nominal</th>
                      <th>Total</th>
                      <th className="text-left">TTD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extracurricularItems.map((item, idx) => (
                      <tr key={`extra-${idx}`}>
                        <td className="center extra-no">{idx + 1}</td>
                        <td className="text-left">{item.teacherName || '-'}</td>
                        <td className="text-left">{item.namaEkstra || '-'}</td>
                        <td className="text-left">{EXTRACURRICULAR_TYPE_LABELS[item.teacherType] || '-'}</td>
                        <td>{item.jumlah ?? 0}</td>
                        <td>{formatRupiah(item.nominal)}</td>
                        <td style={{ fontWeight: 700 }}>{formatRupiah(Math.abs(Number(item.totalNominal || item.totalBisyaroh || 0)))}</td>
                        <td className="print-ttd text-left">{idx + 1}</td>
                      </tr>
                    ))}
                    <tr className="cetak-grand-row">
                      <td colSpan="6">TOTAL EKSTRAKURIKULER</td>
                      <td>{formatRupiah(totalExtracurricular)}</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </>
            )}

            {disciplineItems.length > 0 && (
              <>
                <div className="cetak-section-title"><Wallet size={18} /> Kedisiplinan</div>
                <table className="table print-show cetak-bisyaroh-expense">
                  <thead>
                    <tr>
                      <th>No.</th>
                      <th className="text-left">Nama Guru/Kategori</th>
                      <th>Jumlah</th>
                      <th>Nominal</th>
                      <th>Total</th>
                      <th className="text-left">TTD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {disciplineItems.map((item, idx) => (
                      <tr key={`discipline-${idx}`}>
                        <td className="center">{idx + 1}</td>
                        <td className="text-left">{item.nama}</td>
                        <td>{item.jumlah ?? 0}</td>
                        <td>{formatRupiah(item.nominal)}</td>
                        <td style={{ fontWeight: 700 }}>{formatRupiah(getDisciplineTotal(item))}</td>
                        <td className="print-ttd text-left">{idx + 1}</td>
                      </tr>
                    ))}
                    <tr className="cetak-grand-row">
                      <td colSpan="4">TOTAL KEDISIPLINAN</td>
                      <td>{formatRupiah(totalDiscipline)}</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </>
            )}
          </div>
        </div>
      )}

      <div className="modern-table-card cetak-signature-card" style={{ marginTop: 24 }}>
        <div className="cetak-bisyaroh-document">
          <div className="cetak-signature">
            <div>
              <span>Mengetahui,</span>
              <strong>Kepala Madrasah</strong>
              <em></em>
              <b>{kepalaMadrasahName}</b>
            </div>
            <div>
              <span>Dibuat oleh,</span>
              <strong>Bendahara</strong>
              <em></em>
              <b>{bendaharaName}</b>
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

            <table className="table print-show cetak-total-bisyaroh-table">
              <thead>
                <tr>
                  <th>No.</th>
                  <th>Komponen</th>
                  <th>Nominal</th>
                </tr>
              </thead>
              <tbody>
                {displayedTotalRows.map(row => (
                  <tr key={row.no}>
                    <td className="center">{row.no}</td>
                    <td>
                      <span className="cetak-total-dot" style={{ background: row.color }}></span>
                      {row.label}
                    </td>
                    <td>{formatRupiah(row.value)}</td>
                  </tr>
                ))}
                <tr className="cetak-total-bisyaroh-grand-row">
                  <td colSpan="2">JUMLAH TOTAL</td>
                  <td>{formatRupiah(totalBisyarohValue)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
