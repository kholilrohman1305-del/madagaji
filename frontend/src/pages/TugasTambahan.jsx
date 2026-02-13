import { useEffect, useState } from 'react';
import api from '../api';
import { ClipboardList, Save, Edit3, X } from 'lucide-react';

export default function TugasTambahan() {
  const [items, setItems] = useState([]);
  const [showEdit, setShowEdit] = useState(false);
  const [editRow, setEditRow] = useState({ id: '', nominal: 0 });
  const rupiah = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  });

  const load = async () => {
    const res = await api.get('/master/teacher-tasks');
    setItems(res.data || []);
  };

  useEffect(() => { load(); }, []);

  const openEdit = (row) => {
    setEditRow({ id: row.id, nominal: row.nominal || 0 });
    setShowEdit(true);
  };

  const save = async () => {
    await api.put(`/master/teacher-tasks/${editRow.id}`, { nominal: editRow.nominal });
    load();
    setShowEdit(false);
  };

  return (
    <div>
      <div className="modern-table-card">
        <div className="modern-table-title"><ClipboardList size={24} /> Tugas Tambahan</div>
        <table className="table">
          <thead>
            <tr>
              <th>Guru</th>
              <th>Judul</th>
              <th>Periode</th>
              <th>Status</th>
              <th>Gaji</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => (
              <tr key={it.id}>
                <td>{it.teacherName}</td>
                <td>{it.title}</td>
                <td>{it.startDate ? `${String(it.startDate).slice(0, 10)} - ${String(it.endDate || '').slice(0, 10)}` : '-'}</td>
                <td>{it.status}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 600 }}>{rupiah.format(Number(it.nominal || 0))}</span>
                  </div>
                </td>
                <td>
                  <button className="outline" onClick={() => openEdit(it)}><Edit3 size={14} /> Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <div className="empty">Belum ada data.</div>}
      </div>

      {showEdit && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title"><Edit3 size={24} /> Edit Nominal</h3>
              <button className="modal-close" onClick={() => setShowEdit(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="form-group">
              <label className="form-label">Nominal</label>
              <input
                type="number"
                value={editRow.nominal}
                onChange={e => setEditRow({ ...editRow, nominal: e.target.value })}
                style={{ width: '100%' }}
              />
            </div>
            <div className="toolbar" style={{ marginTop: 20, marginBottom: 0 }}>
              <button onClick={save}><Save size={18} /> Simpan</button>
              <button className="outline" onClick={() => setShowEdit(false)}>Batal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
