import { useEffect, useState } from 'react';
import api from '../api';
import { UserPlus, Edit3, Trash2, Save, X } from 'lucide-react';

export default function Users() {
  const [items, setItems] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [form, setForm] = useState({ username: '', password: '', role: 'admin', displayName: '' });
  const [editForm, setEditForm] = useState({ id: '', password: '', role: 'admin', displayName: '' });

  const load = async () => {
    const res = await api.get('/users');
    setItems(res.data || []);
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    await api.post('/users', form);
    setForm({ username: '', password: '', role: 'admin', displayName: '' });
    setShowAdd(false);
    load();
  };

  const openEdit = (row) => {
    setEditForm({ id: row.id, password: '', role: row.role, displayName: row.display_name || '' });
    setShowEdit(true);
  };

  const saveEdit = async () => {
    await api.put(`/users/${editForm.id}`, {
      password: editForm.password || undefined,
      role: editForm.role,
      displayName: editForm.displayName
    });
    setShowEdit(false);
    load();
  };

  const remove = async (id) => {
    await api.delete(`/users/${id}`);
    load();
  };

  return (
    <div>
      <div className="modern-table-card">
        <div className="modern-table-title">Manajemen User</div>
        <div className="toolbar">
          <button onClick={() => setShowAdd(true)}>
            <UserPlus size={18} /> Tambah User
          </button>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Nama</th>
              <th>Role</th>
              <th>Last Login</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id}>
                <td>{it.username}</td>
                <td>{it.display_name || '-'}</td>
                <td>{it.role}</td>
                <td>{it.last_login ? String(it.last_login).slice(0, 19).replace('T', ' ') : '-'}</td>
                <td>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="outline sm" onClick={() => openEdit(it)}><Edit3 size={14} /></button>
                    <button className="danger sm" onClick={() => remove(it.id)}><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <div className="empty">Belum ada user.</div>}
      </div>

      {showAdd && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title"><UserPlus size={24} /> Tambah User</h3>
              <button className="modal-close" onClick={() => setShowAdd(false)}><X size={20} /></button>
            </div>
            <div className="grid grid-2" style={{ gap: 16 }}>
              <div className="form-group">
                <label className="form-label">Username</label>
                <input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Password</label>
                <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Nama</label>
                <input value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Role</label>
                <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                  <option value="admin">admin</option>
                  <option value="guru">guru</option>
                </select>
              </div>
            </div>
            <div className="toolbar" style={{ marginTop: 20, marginBottom: 0 }}>
              <button onClick={create} disabled={!form.username || !form.password}>
                <Save size={18} /> Simpan
              </button>
              <button className="outline" onClick={() => setShowAdd(false)}>Batal</button>
            </div>
          </div>
        </div>
      )}

      {showEdit && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title"><Edit3 size={24} /> Edit User</h3>
              <button className="modal-close" onClick={() => setShowEdit(false)}><X size={20} /></button>
            </div>
            <div className="grid grid-2" style={{ gap: 16 }}>
              <div className="form-group">
                <label className="form-label">Nama</label>
                <input value={editForm.displayName} onChange={e => setEditForm({ ...editForm, displayName: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Role</label>
                <select value={editForm.role} onChange={e => setEditForm({ ...editForm, role: e.target.value })}>
                  <option value="admin">admin</option>
                  <option value="guru">guru</option>
                </select>
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Password Baru (Opsional)</label>
                <input type="password" value={editForm.password} onChange={e => setEditForm({ ...editForm, password: e.target.value })} />
              </div>
            </div>
            <div className="toolbar" style={{ marginTop: 20, marginBottom: 0 }}>
              <button onClick={saveEdit}>
                <Save size={18} /> Simpan
              </button>
              <button className="outline" onClick={() => setShowEdit(false)}>Batal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
