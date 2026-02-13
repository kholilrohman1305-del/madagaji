import { useEffect, useState } from 'react';
import api from '../api';
import useMasterData from '../hooks/useMasterData';
import { Wallet, Calendar, Plus, Save, Trash2, X, Edit3 } from 'lucide-react';

export default function PengeluaranLain() {
  const today = new Date();
  const defaultStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const defaultEnd = today.toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [items, setItems] = useState([]);
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
  const { data: master } = useMasterData();

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
  };

  useEffect(() => {
    load();
  }, [startDate, endDate]);

  const add = async () => {
    const tanggal = `${form.periode}-01`;
    await api.post('/payroll/expenses', {
      tanggal,
      kategori: form.kategori,
      penerima: '',
      jumlah: form.jumlah,
      nominal: form.nominal,
      keterangan: `Periode ${form.periode}`
    });
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
    await api.put(`/payroll/expenses/${editForm.id}`, {
      ...editForm,
      tanggal: editForm.tanggal
    });
    setShowEditModal(false);
    load();
  };

  const del = async (id) => {
    await api.delete(`/payroll/expenses/${id}`);
    load();
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
          <button className="secondary" onClick={() => setShowModal(true)}>
            <Plus size={18} /> Tambah Pengeluaran
          </button>
        </div>

        <table className="table">
          <thead><tr><th>Tanggal</th><th>Kategori</th><th>Jumlah</th><th>Nominal</th><th>Total</th><th>Keterangan</th><th>Aksi</th></tr></thead>
          <tbody>
            {items.map((it, idx) => (
              <tr key={it.id}>
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
