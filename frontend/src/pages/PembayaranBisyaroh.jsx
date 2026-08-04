import { useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck, Building2, CheckCircle2, CircleAlert, FileSpreadsheet,
  Landmark, RefreshCw, Save, Search, Send, WalletCards, X
} from 'lucide-react';
import api from '../api';
import { exportXlsx } from '../utils/reportExport';
import { toast } from '../utils/toast';
import { showConfirm } from '../utils/confirm';

const money = (value) => new Intl.NumberFormat('id-ID', {
  style: 'currency', currency: 'IDR', maximumFractionDigits: 0
}).format(Number(value || 0));

const TYPE_LABELS = {
  teacher: 'Guru KBM',
  extra_teacher: 'Guru Ekstra',
  expense: 'Pengeluaran Lain'
};

const STATUS_LABELS = {
  draft: 'Belum diverifikasi',
  ready: 'Siap ditransfer',
  transferred: 'Sudah ditransfer',
  failed: 'Gagal',
  postponed: 'Ditunda'
};

const emptyAccount = {
  recipientKey: '', recipientName: '', bankName: '', accountNumber: '', accountName: '', notes: ''
};

export default function PembayaranBisyaroh() {
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [accountEditor, setAccountEditor] = useState(null);
  const [paymentEditor, setPaymentEditor] = useState(null);

  const load = async (targetPeriod = period) => {
    setLoading(true);
    try {
      const response = await api.get('/payroll/payments', { params: { periode: targetPeriod } });
      setData(response.data);
      setSelectedKeys(new Set((response.data?.recipients || []).filter((row) => row.selected).map((row) => row.recipientKey)));
    } catch (error) {
      toast.error('Data pembayaran gagal dimuat', error.response?.data?.message || error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(period); }, []);

  const prepare = async () => {
    const approved = await showConfirm({
      title: data?.batch ? 'Buat Ulang Data Transfer' : 'Siapkan Data Transfer',
      message: data?.batch
        ? 'Snapshot transfer lama akan diganti dari hasil generate dan data sumber periode ini. Rekening penerima tetap tersimpan.'
        : 'Sistem akan membuat snapshot transfer dari bisyaroh KBM, honor ekstra, kedisiplinan, dan pengeluaran lain.',
      confirmLabel: data?.batch ? 'Ya, Buat Ulang' : 'Ya, Siapkan',
      icon: 'calculator'
    });
    if (!approved) return;
    setWorking('prepare');
    try {
      const response = await api.post('/payroll/payments/prepare', { periode: period });
      setData(response.data);
      setSelectedKeys(new Set((response.data?.recipients || []).map((row) => row.recipientKey)));
      toast.success('Data transfer siap diperiksa', 'Lengkapi rekening dan pastikan seluruh validasi sudah hijau.');
    } catch (error) {
      toast.error('Data transfer gagal disiapkan', error.response?.data?.message || error.message);
    } finally {
      setWorking('');
    }
  };

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (data?.recipients || []).filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (!needle) return true;
      return [row.recipientName, row.bankName, row.accountNumber, row.accountName, TYPE_LABELS[row.recipientType],
        ...row.components.map((item) => item.label)]
        .some((value) => String(value || '').toLowerCase().includes(needle));
    });
  }, [data, search, statusFilter]);

  const selectedRows = (data?.recipients || []).filter((row) => selectedKeys.has(row.recipientKey));
  const allFilteredSelected = filtered.length > 0 && filtered.every((row) => selectedKeys.has(row.recipientKey));

  const toggleAll = () => {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (allFilteredSelected) filtered.forEach((row) => next.delete(row.recipientKey));
      else filtered.forEach((row) => next.add(row.recipientKey));
      return next;
    });
  };

  const saveAccount = async () => {
    setWorking('account');
    try {
      await api.put('/payroll/payments/account', accountEditor);
      setAccountEditor(null);
      await load(period);
      toast.success('Rekening tersimpan', 'Validasi penerima sudah diperbarui.');
    } catch (error) {
      toast.error('Rekening gagal disimpan', error.response?.data?.message || error.message);
    } finally {
      setWorking('');
    }
  };

  const updateRows = async (rows, overrides = {}) => {
    setWorking('status');
    try {
      const response = await api.put('/payroll/payments/status', {
        periode: period,
        items: rows.map((row) => ({
          recipientKey: row.recipientKey,
          selected: selectedKeys.has(row.recipientKey),
          status: overrides.status ?? row.status,
          transferDate: overrides.transferDate ?? row.transferDate,
          transferReference: overrides.transferReference ?? row.transferReference,
          notes: overrides.notes ?? row.paymentNotes
        }))
      });
      setData(response.data);
      setSelectedKeys(new Set((response.data?.recipients || []).filter((row) => row.selected).map((row) => row.recipientKey)));
      toast.success('Status pembayaran tersimpan', `${rows.length} penerima berhasil diperbarui.`);
      return true;
    } catch (error) {
      toast.error('Status gagal disimpan', error.response?.data?.message || error.message);
      return false;
    } finally {
      setWorking('');
    }
  };

  const saveSelection = () => updateRows(data?.recipients || []);
  const markReady = () => updateRows(selectedRows, { status: 'ready' });

  const openBulkTransfer = () => {
    if (!selectedRows.length) return;
    setPaymentEditor({
      mode: 'bulk', rows: selectedRows, status: 'transferred',
      transferDate: new Date().toISOString().slice(0, 10), transferReference: '', notes: ''
    });
  };

  const submitPayment = async () => {
    const ok = await updateRows(paymentEditor.rows, paymentEditor);
    if (ok) setPaymentEditor(null);
  };

  const exportTransfer = async () => {
    if (!selectedRows.length) return;
    setWorking('export');
    try {
      await exportXlsx(`daftar-transfer-bisyaroh-${period}.xlsx`, [
        {
          name: 'Daftar Transfer',
          rows: [
            ['No.', 'Nama Penerima', 'Kategori', 'Bank', 'Nomor Rekening', 'Nama Pemilik Rekening', 'Nominal', 'Status', 'Validasi'],
            ...selectedRows.map((row, index) => [
              index + 1, row.recipientName, TYPE_LABELS[row.recipientType] || row.recipientType,
              row.bankName, row.accountNumber, row.accountName, Number(row.total || 0),
              STATUS_LABELS[row.status] || row.status,
              row.isValid ? 'Siap' : row.validationErrors.join('; ')
            ]),
            ['', 'TOTAL', '', '', '', '', selectedRows.reduce((sum, row) => sum + Number(row.total || 0), 0), '', '']
          ]
        },
        {
          name: 'Rincian Nominal',
          rows: [
            ['No.', 'Nama Penerima', 'Jenis Penerima', 'Komponen', 'Nominal'],
            ...selectedRows.flatMap((row, index) => row.components.map((component) => [
              index + 1, row.recipientName, TYPE_LABELS[row.recipientType] || row.recipientType,
              component.label, Number(component.amount || 0)
            ]))
          ]
        }
      ]);
    } catch (error) {
      toast.error('Export XLSX gagal', error.message);
    } finally {
      setWorking('');
    }
  };

  const summary = data?.summary || {};

  return (
    <div className="payment-page">
      <header className="payment-page-head">
        <div>
          <span className="payment-eyebrow">Pembayaran Bisyaroh</span>
          <h1>Daftar Transfer per Penerima</h1>
          <p>Satu penerima satu transfer, dengan rincian nominal dari setiap sumber.</p>
        </div>
        <div className="payment-period-control">
          <input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} />
          <button className="outline" type="button" onClick={() => load(period)} disabled={loading}>
            <RefreshCw size={17} /> Terapkan
          </button>
          <button type="button" onClick={prepare} disabled={Boolean(working) || data?.payrollStatus === 'not_generated'}>
            <WalletCards size={17} /> {working === 'prepare' ? 'Menyiapkan…' : (data?.batch ? 'Buat Ulang Data' : 'Siapkan Transfer')}
          </button>
        </div>
      </header>

      {data?.payrollStatus === 'not_generated' && (
        <div className="payment-alert danger"><CircleAlert size={20} /><span>Bisyaroh {period} belum digenerate. Lakukan generate di menu Rekap Bisyaroh terlebih dahulu.</span></div>
      )}
      {data?.batch?.sourceChanged && (
        <div className="payment-alert warning"><CircleAlert size={20} /><span>Bisyaroh sudah digenerate ulang setelah data transfer dibuat. Klik <strong>Buat Ulang Data</strong> sebelum melakukan transfer.</span></div>
      )}

      <section className="payment-stats">
        <article><span><Building2 size={19} /></span><div><small>Bisyaroh Guru KBM</small><strong>{money(summary.kbm)}</strong></div></article>
        <article><span><BadgeCheck size={19} /></span><div><small>Honor Ekstrakurikuler</small><strong>{money(summary.extracurricular)}</strong></div></article>
        <article><span><Landmark size={19} /></span><div><small>Pengeluaran Lain</small><strong>{money(summary.otherExpense)}</strong></div></article>
        <article><span><WalletCards size={19} /></span><div><small>Total Transfer</small><strong>{money(summary.total)}</strong></div></article>
        <article><span><CheckCircle2 size={19} /></span><div><small>Penerima / Sudah Transfer</small><strong>{summary.recipients || 0} / {summary.transferred || 0}</strong></div></article>
        <article className={summary.invalid ? 'invalid' : ''}><span><CircleAlert size={19} /></span><div><small>Perlu Dilengkapi</small><strong>{summary.invalid || 0}</strong></div></article>
      </section>

      <section className="modern-table-card payment-table-card">
        <div className="payment-toolbar">
          <label className="payment-search"><Search size={17} /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari penerima, rekening, atau komponen…" /></label>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">Semua status</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <button className="outline" onClick={saveSelection} disabled={!data?.batch || working === 'status'}><Save size={16} /> Simpan Pilihan</button>
          <button className="outline" onClick={exportTransfer} disabled={!selectedRows.length || working === 'export'}><FileSpreadsheet size={17} /> Export XLSX</button>
          <button className="secondary" onClick={markReady} disabled={!selectedRows.length || Boolean(working)}><BadgeCheck size={17} /> Tandai Siap</button>
          <button onClick={openBulkTransfer} disabled={!selectedRows.length || Boolean(working)}><Send size={17} /> Tandai Ditransfer</button>
        </div>

        {!data?.batch && !loading ? (
          <div className="payment-empty"><WalletCards size={42} /><strong>Data transfer belum disiapkan</strong><span>Klik Siapkan Transfer setelah bisyaroh periode ini selesai digenerate.</span></div>
        ) : (
          <div className="payment-table-wrap">
            <table className="table payment-table">
              <thead><tr>
                <th><input type="checkbox" checked={allFilteredSelected} onChange={toggleAll} aria-label="Pilih semua penerima" /></th>
                <th>Penerima</th><th>Rincian Nominal</th><th>Rekening</th><th>Total Transfer</th><th>Status</th><th>Aksi</th>
              </tr></thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.recipientKey}>
                    <td><input type="checkbox" checked={selectedKeys.has(row.recipientKey)} onChange={() => setSelectedKeys((current) => { const next = new Set(current); if (next.has(row.recipientKey)) next.delete(row.recipientKey); else next.add(row.recipientKey); return next; })} /></td>
                    <td><strong>{row.recipientName}</strong><span className={`payment-type ${row.recipientType}`}>{TYPE_LABELS[row.recipientType] || row.recipientType}</span></td>
                    <td><div className="payment-components">{row.components.map((item) => <div key={item.id}><span>{item.label}</span><strong>{money(item.amount)}</strong></div>)}</div></td>
                    <td>
                      {row.accountNumber ? <div className="payment-account"><strong>{row.bankName || '-'}</strong><span>{row.accountNumber}</span><small>a.n. {row.accountName || '-'}</small></div> : <span className="payment-missing">Belum diisi</span>}
                      {!row.isValid && <div className="payment-errors">{row.validationErrors.map((error) => <small key={error}>{error}</small>)}</div>}
                    </td>
                    <td className="payment-total">{money(row.total)}</td>
                    <td><span className={`payment-status ${row.status}`}>{STATUS_LABELS[row.status] || row.status}</span>{row.transferDate && <small className="payment-date">{String(row.transferDate).slice(0, 10)}</small>}</td>
                    <td><div className="payment-actions"><button className="outline sm" onClick={() => setAccountEditor({ ...emptyAccount, recipientKey: row.recipientKey, recipientName: row.recipientName, bankName: row.bankName, accountNumber: row.accountNumber, accountName: row.accountName, notes: row.accountNotes })}><Landmark size={15} /> Rekening</button><button className="outline sm" onClick={() => setPaymentEditor({ mode: 'single', rows: [row], status: row.status, transferDate: row.transferDate ? String(row.transferDate).slice(0, 10) : '', transferReference: row.transferReference, notes: row.paymentNotes })}><Save size={15} /> Status</button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filtered.length && <div className="empty">Data penerima tidak ditemukan.</div>}
          </div>
        )}
      </section>

      {accountEditor && (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setAccountEditor(null)}>
          <div className="modal payment-modal">
            <div className="modal-header"><div><h3 className="modal-title"><Landmark size={22} /> Rekening Penerima</h3><small>{accountEditor.recipientName}</small></div><button className="modal-close" onClick={() => setAccountEditor(null)}><X size={20} /></button></div>
            <div className="grid grid-2" style={{ gap: 16 }}>
              <label className="form-group"><span className="form-label">Nama Bank</span><input value={accountEditor.bankName} onChange={(event) => setAccountEditor({ ...accountEditor, bankName: event.target.value })} placeholder="Contoh: BRI" /></label>
              <label className="form-group"><span className="form-label">Nomor Rekening</span><input value={accountEditor.accountNumber} onChange={(event) => setAccountEditor({ ...accountEditor, accountNumber: event.target.value })} placeholder="Nomor rekening tujuan" /></label>
              <label className="form-group" style={{ gridColumn: '1 / -1' }}><span className="form-label">Nama Pemilik Rekening</span><input value={accountEditor.accountName} onChange={(event) => setAccountEditor({ ...accountEditor, accountName: event.target.value })} placeholder="Sesuai buku rekening" /></label>
              <label className="form-group" style={{ gridColumn: '1 / -1' }}><span className="form-label">Catatan</span><input value={accountEditor.notes} onChange={(event) => setAccountEditor({ ...accountEditor, notes: event.target.value })} /></label>
            </div>
            <div className="toolbar" style={{ margin: '20px 0 0' }}><button onClick={saveAccount} disabled={working === 'account'}><Save size={17} /> Simpan Rekening</button><button className="outline" onClick={() => setAccountEditor(null)}>Batal</button></div>
          </div>
        </div>
      )}

      {paymentEditor && (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setPaymentEditor(null)}>
          <div className="modal payment-modal">
            <div className="modal-header"><div><h3 className="modal-title"><Send size={22} /> Status Pembayaran</h3><small>{paymentEditor.rows.length} penerima · {money(paymentEditor.rows.reduce((sum, row) => sum + row.total, 0))}</small></div><button className="modal-close" onClick={() => setPaymentEditor(null)}><X size={20} /></button></div>
            <div className="grid grid-2" style={{ gap: 16 }}>
              <label className="form-group"><span className="form-label">Status</span><select value={paymentEditor.status} onChange={(event) => setPaymentEditor({ ...paymentEditor, status: event.target.value })}>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="form-group"><span className="form-label">Tanggal Transfer</span><input type="date" value={paymentEditor.transferDate || ''} onChange={(event) => setPaymentEditor({ ...paymentEditor, transferDate: event.target.value })} /></label>
              <label className="form-group" style={{ gridColumn: '1 / -1' }}><span className="form-label">Nomor Referensi/Bukti</span><input value={paymentEditor.transferReference || ''} onChange={(event) => setPaymentEditor({ ...paymentEditor, transferReference: event.target.value })} placeholder="Nomor referensi transaksi atau nama berkas bukti" /></label>
              <label className="form-group" style={{ gridColumn: '1 / -1' }}><span className="form-label">Catatan</span><input value={paymentEditor.notes || ''} onChange={(event) => setPaymentEditor({ ...paymentEditor, notes: event.target.value })} /></label>
            </div>
            <div className="payment-alert warning"><CircleAlert size={18} /><span>Setelah ditandai sudah ditransfer, generate ulang dan pembatalan generate periode ini akan dikunci.</span></div>
            <div className="toolbar" style={{ margin: '20px 0 0' }}><button onClick={submitPayment} disabled={working === 'status' || (paymentEditor.status === 'transferred' && !paymentEditor.transferDate)}><Save size={17} /> Simpan Status</button><button className="outline" onClick={() => setPaymentEditor(null)}>Batal</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
