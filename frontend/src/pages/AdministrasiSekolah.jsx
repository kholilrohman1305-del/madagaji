import { useEffect, useState } from 'react';
import { adminApi } from '../api';

export default function AdministrasiSekolah() {
  const [incoming, setIncoming] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [formSurat, setFormSurat] = useState({ letter_date: '', sender: '', subject: '' });
  const [formBarang, setFormBarang] = useState({ code: '', name: '', quantity: 0, condition: 'baik' });

  const load = async () => {
    const [s, i] = await Promise.all([
      adminApi.get('/incoming-letters'),
      adminApi.get('/inventory-items')
    ]);
    setIncoming(s.data || []);
    setInventory(i.data || []);
  };

  useEffect(() => { load(); }, []);

  const saveSurat = async (e) => {
    e.preventDefault();
    await adminApi.post('/incoming-letters', formSurat);
    setFormSurat({ letter_date: '', sender: '', subject: '' });
    load();
  };

  const saveBarang = async (e) => {
    e.preventDefault();
    await adminApi.post('/inventory-items', { ...formBarang, quantity: Number(formBarang.quantity || 0) });
    setFormBarang({ code: '', name: '', quantity: 0, condition: 'baik' });
    load();
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="modern-table-card">
        <div className="modern-table-title">Administrasi - Surat Masuk</div>
        <form className="toolbar" onSubmit={saveSurat}>
          <input type="date" value={formSurat.letter_date} onChange={(e) => setFormSurat((p) => ({ ...p, letter_date: e.target.value }))} required />
          <input placeholder="Pengirim" value={formSurat.sender} onChange={(e) => setFormSurat((p) => ({ ...p, sender: e.target.value }))} required />
          <input placeholder="Perihal" value={formSurat.subject} onChange={(e) => setFormSurat((p) => ({ ...p, subject: e.target.value }))} required />
          <button type="submit">Tambah</button>
        </form>
        <table className="table">
          <thead><tr><th>Tanggal</th><th>Pengirim</th><th>Perihal</th><th>Status</th></tr></thead>
          <tbody>{incoming.map((s) => <tr key={s.id}><td>{s.letter_date?.slice?.(0, 10) || '-'}</td><td>{s.sender || '-'}</td><td>{s.subject}</td><td>{s.status || '-'}</td></tr>)}</tbody>
        </table>
      </div>

      <div className="modern-table-card">
        <div className="modern-table-title">Administrasi - Inventaris</div>
        <form className="toolbar" onSubmit={saveBarang}>
          <input placeholder="Kode" value={formBarang.code} onChange={(e) => setFormBarang((p) => ({ ...p, code: e.target.value }))} />
          <input placeholder="Nama Barang" value={formBarang.name} onChange={(e) => setFormBarang((p) => ({ ...p, name: e.target.value }))} required />
          <input placeholder="Jumlah" value={formBarang.quantity} onChange={(e) => setFormBarang((p) => ({ ...p, quantity: e.target.value }))} />
          <select value={formBarang.condition} onChange={(e) => setFormBarang((p) => ({ ...p, condition: e.target.value }))}>
            <option value="baik">Baik</option>
            <option value="rusak">Rusak</option>
          </select>
          <button type="submit">Tambah</button>
        </form>
        <table className="table">
          <thead><tr><th>Kode</th><th>Nama</th><th>Jumlah</th><th>Kondisi</th></tr></thead>
          <tbody>{inventory.map((i) => <tr key={i.id}><td>{i.code || '-'}</td><td>{i.name}</td><td>{i.quantity || 0}</td><td>{i.condition || '-'}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}
