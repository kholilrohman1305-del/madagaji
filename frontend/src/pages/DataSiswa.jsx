import { useEffect, useMemo, useState } from 'react';
import { GraduationCap } from 'lucide-react';
import api from '../api';

export default function DataSiswa() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');

  useEffect(() => {
    api.get('/master/students').then((res) => setItems(res.data || []));
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items;
    return items.filter((it) => (
      String(it.full_name || '').toLowerCase().includes(term) ||
      String(it.nisn || '').toLowerCase().includes(term) ||
      String(it.nis || '').toLowerCase().includes(term) ||
      String(it.status || '').toLowerCase().includes(term)
    ));
  }, [items, q]);

  return (
    <div className="modern-table-card">
      <div className="modern-table-title"><GraduationCap size={24} /> Data Siswa</div>
      <div className="toolbar" style={{ justifyContent: 'space-between' }}>
        <div className="empty">Data hanya ditampilkan (read-only).</div>
        <input placeholder="Cari siswa..." value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 260 }} />
      </div>
      <table className="table">
        <thead>
          <tr><th>NISN</th><th>NIS</th><th>Nama</th><th>Kelas</th><th>Status</th></tr>
        </thead>
        <tbody>
          {filtered.map((it) => (
            <tr key={it.id}>
              <td>{it.nisn || '-'}</td>
              <td>{it.nis || '-'}</td>
              <td>{it.full_name}</td>
              <td>{it.class_id || '-'}</td>
              <td>{it.status || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {filtered.length === 0 && <div className="empty">Belum ada data.</div>}
    </div>
  );
}
