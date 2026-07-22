import { useEffect, useState } from 'react';
import api from '../api';
import { Wallet, Calendar, Plus, Save, Trash2, X, Edit3, Printer } from 'lucide-react';
import { showConfirm } from '../utils/confirm';
import { toast } from '../utils/toast';

export default function PengeluaranLain() {
  const today = new Date();
  const defaultStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const defaultEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [items, setItems] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [form, setForm] = useState({
    periode: new Date().toISOString().slice(0, 7),
    kategori: '',
    jumlah: 1,
    nominal: 0
  });
  const [showModal, setShowModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    id: '',
    tanggal: '',
    kategori: '',
    jumlah: 1,
    nominal: 0,
    keterangan: ''
  });
  const load = async (range) => {
    const params = range || { startDate, endDate };
    const res = await api.get('/payroll/expenses', { params });
    const rows = res.data || [];
    const seen = new Set();
    const unique = rows.filter(r => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });
    setItems(unique);
    setSelectedIds(prev => {
      const next = new Set();
      unique.forEach(row => {
        if (prev.has(row.id)) next.add(row.id);
      });
      return next;
    });
  };

  useEffect(() => {
    load();
  }, []);

  const applyDateFilter = () => {
    load({ startDate, endDate });
  };

  const add = async () => {
    const tanggal = `${form.periode}-01`;
    const payload = {
      tanggal,
      kategori: form.kategori,
      penerima: '',
      jumlah: form.jumlah,
      nominal: form.nominal,
      keterangan: `Periode ${form.periode}`
    };
    await api.post('/payroll/expenses', payload);
    setForm({ ...form, kategori: '', jumlah: 1, nominal: 0 });
    setShowModal(false);
    const firstDay = `${form.periode}-01`;
    const [y, m] = form.periode.split('-').map(Number);
    const lastDay = new Date(y, m, 0).toISOString().slice(0, 10);
    setStartDate(firstDay);
    setEndDate(lastDay);
    load({ startDate: firstDay, endDate: lastDay });
  };

  const openEdit = (row) => {
    setEditForm({
      id: row.id,
      tanggal: row.tanggal ? String(row.tanggal).slice(0, 10) : '',
      kategori: row.kategori || '',
      jumlah: row.jumlah ?? 1,
      nominal: row.nominal ?? 0,
      keterangan: row.keterangan || ''
    });
    setShowEditModal(true);
  };

  const saveEdit = async () => {
    const payload = { ...editForm, tanggal: editForm.tanggal };
    await api.put(`/payroll/expenses/${editForm.id}`, payload);
    setShowEditModal(false);
    load();
  };

  const del = async (id) => {
    await api.delete(`/payroll/expenses/${id}`);
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    load();
  };

  const isAllSelected = items.length > 0 && items.every(it => selectedIds.has(it.id));

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(items.map(it => it.id)));
  };

  const bulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const ok = await showConfirm({
      title: 'Hapus Pengeluaran',
      message: `Hapus ${ids.length} data pengeluaran yang dipilih? Tindakan ini tidak dapat dibatalkan.`,
      confirmLabel: 'Ya, Hapus',
      danger: true,
      icon: 'trash',
    });
    if (!ok) return;
    await Promise.all(ids.map(id => api.delete(`/payroll/expenses/${id}`)));
    setSelectedIds(new Set());
    toast.success('Berhasil dihapus', `${ids.length} data pengeluaran telah dihapus.`);
    load();
  };

  const printExpenses = (mode = 'all') => {
    const printItems = mode === 'selected'
      ? items.filter(it => selectedIds.has(it.id))
      : items;
    const printData = printItems.map((it) => ({
      id: it.id,
      tanggal: String(it.tanggal || '').slice(0, 10),
      kategori: it.kategori || '-',
      jumlah: it.jumlah ?? 1,
      nominal: Number(it.nominal) || 0,
      total: ((Number(it.jumlah) || 0) * (Number(it.nominal) || 0))
    }));

    const style = document.createElement('style');
    style.setAttribute('id', 'expense-print-style');
    style.textContent = `
      @media print {
        body * { visibility: hidden; }
        .expense-print-root, .expense-print-root * { visibility: visible; }
        .expense-print-root { position: absolute; left: 0; top: 0; width: 100%; }
        .no-print { display: none !important; }
      }
    `;
    document.head.appendChild(style);

    const container = document.getElementById('expense-print-root');
    if (container) {
      container.innerHTML = `
        <div style="font-family: Arial, sans-serif; padding: 24px; color: #111827;">
          <h2 style="margin: 0 0 8px 0;">Bukti Pengeluaran Lain</h2>
          <p style="margin: 0 0 16px 0; color: #6b7280;">${mode === 'selected' ? 'Data terpilih' : 'Data keseluruhan'}</p>
          <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <thead>
              <tr>
                <th style="border: 1px solid #d1d5db; padding: 8px; text-align: left;">Tanggal</th>
                <th style="border: 1px solid #d1d5db; padding: 8px; text-align: left;">Kategori</th>
                <th style="border: 1px solid #d1d5db; padding: 8px; text-align: right;">Jumlah</th>
                <th style="border: 1px solid #d1d5db; padding: 8px; text-align: right;">Nominal</th>
                <th style="border: 1px solid #d1d5db; padding: 8px; text-align: right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${printData.map(item => `
                <tr>
                  <td style="border: 1px solid #d1d5db; padding: 8px;">${item.tanggal}</td>
                  <td style="border: 1px solid #d1d5db; padding: 8px;">${item.kategori}</td>
                  <td style="border: 1px solid #d1d5db; padding: 8px; text-align: right;">${item.jumlah}</td>
                  <td style="border: 1px solid #d1d5db; padding: 8px; text-align: right;">${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(item.nominal)}</td>
                  <td style="border: 1px solid #d1d5db; padding: 8px; text-align: right; font-weight: 700;">${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(item.total)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div style="margin-top: 16px; text-align: right; font-weight: 700;">Total: ${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(printData.reduce((sum, item) => sum + item.total, 0))}</div>
        </div>
      `;
    }

    window.setTimeout(() => window.print(), 80);
    window.setTimeout(() => {
      document.getElementById('expense-print-style')?.remove();
      if (container) container.innerHTML = '';
    }, 1200);
  };

  return (
    <div>
      <div className="modern-table-card">
        <div className="modern-table-title"><Wallet size={24} /> Pengeluaran Lain</div>
        <div className="toolbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Calendar size={18} style={{ color: 'var(--muted)' }} />
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <span style={{ color: 'var(--muted)' }}>s/d</span>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
          <button className="outline" onClick={applyDateFilter}>
            Terapkan
          </button>
          <button className="danger" onClick={bulkDelete} disabled={selectedIds.size === 0}>
            <Trash2 size={18} /> Hapus Terpilih ({selectedIds.size})
          </button>
          <button className="secondary" onClick={() => setShowModal(true)}>
            <Plus size={18} /> Tambah Pengeluaran
          </button>
          <button className="outline" onClick={() => printExpenses('selected')} disabled={selectedIds.size === 0}>
            <Printer size={18} /> Cetak Terpilih
          </button>
          <button className="outline" onClick={() => printExpenses('all')}>
            <Printer size={18} /> Cetak Semua
          </button>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 44 }}>
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={toggleSelectAll}
                  aria-label="Pilih semua data"
                />
              </th>
              <th>Tanggal</th>
              <th>Kategori</th>
              <th>Jumlah</th>
              <th>Nominal</th>
              <th>Total</th>
              <th>Keterangan</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(it.id)}
                    onChange={() => toggleSelect(it.id)}
                    aria-label={`Pilih data pengeluaran ${it.kategori || it.id}`}
                  />
                </td>
                <td>{String(it.tanggal || '').slice(0, 10)}</td>
                <td>{it.kategori}</td>
                <td>{it.jumlah ?? 1}</td>
                <td style={{ fontWeight: 600 }}>
                  {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 })
                    .format(Number(it.nominal) || 0)}
                </td>
                <td style={{ fontWeight: 700 }}>
                  {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 })
                    .format((Number(it.jumlah) || 0) * (Number(it.nominal) || 0))}
                </td>
                <td>{it.keterangan || '-'}</td>
                <td>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="outline sm" onClick={() => openEdit(it)}><Edit3 size={14} /></button>
                    <button className="danger sm" onClick={() => del(it.id)}><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <div className="empty">Belum ada data.</div>}
      </div>

      <div id="expense-print-root" className="expense-print-root" style={{ display: 'none' }} />

      {showModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title"><Plus size={24} /> Tambah Pengeluaran</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="grid grid-2" style={{ gap: 16 }}>
              <div className="form-group">
                <label className="form-label">Periode (Bulan)</label>
                <input type="month" value={form.periode} onChange={e => setForm({ ...form, periode: e.target.value })} style={{ width: '100%' }} />
              </div>
              <div className="form-group">
                <label className="form-label">Jenis Pengeluaran</label>
                <input
                  value={form.kategori}
                  onChange={e => setForm({ ...form, kategori: e.target.value })}
                  placeholder="Mis. Transport, ATK, Kegiatan"
                  style={{ width: '100%' }}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Nominal</label>
                <input type="number" value={form.nominal} onChange={e => setForm({ ...form, nominal: e.target.value })} style={{ width: '100%' }} />
              </div>
              <div className="form-group">
                <label className="form-label">Jumlah</label>
                <input type="number" value={form.jumlah} onChange={e => setForm({ ...form, jumlah: e.target.value })} style={{ width: '100%' }} />
              </div>
            </div>
            <div className="toolbar" style={{ marginTop: 20, marginBottom: 0 }}>
              <button onClick={add} disabled={!form.periode || !form.kategori}>
                <Save size={18} /> Simpan
              </button>
              <button className="outline" onClick={() => setShowModal(false)}>Batal</button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title"><Edit3 size={24} /> Edit Pengeluaran</h3>
              <button className="modal-close" onClick={() => setShowEditModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="grid grid-2" style={{ gap: 16 }}>
              <div className="form-group">
                <label className="form-label">Tanggal</label>
                <input type="date" value={editForm.tanggal} onChange={e => setEditForm({ ...editForm, tanggal: e.target.value })} style={{ width: '100%' }} />
              </div>
              <div className="form-group">
                <label className="form-label">Jenis Pengeluaran</label>
                <input
                  value={editForm.kategori}
                  onChange={e => setEditForm({ ...editForm, kategori: e.target.value })}
                  placeholder="Mis. Transport, ATK, Kegiatan"
                  style={{ width: '100%' }}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Nominal</label>
                <input type="number" value={editForm.nominal} onChange={e => setEditForm({ ...editForm, nominal: e.target.value })} style={{ width: '100%' }} />
              </div>
              <div className="form-group">
                <label className="form-label">Jumlah</label>
                <input type="number" value={editForm.jumlah} onChange={e => setEditForm({ ...editForm, jumlah: e.target.value })} style={{ width: '100%' }} />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Keterangan</label>
                <input type="text" value={editForm.keterangan} onChange={e => setEditForm({ ...editForm, keterangan: e.target.value })} style={{ width: '100%' }} />
              </div>
            </div>
            <div className="toolbar" style={{ marginTop: 20, marginBottom: 0 }}>
              <button onClick={saveEdit} disabled={!editForm.tanggal || !editForm.kategori}>
                <Save size={18} /> Simpan
              </button>
              <button className="outline" onClick={() => setShowEditModal(false)}>Batal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
