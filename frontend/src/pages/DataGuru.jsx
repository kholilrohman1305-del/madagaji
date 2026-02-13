import { useEffect, useState } from 'react';
import api from '../api';
import { Users } from 'lucide-react';

export default function DataGuru() {
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const load = async () => {
    const res = await api.get('/master/teachers');
    setItems(res.data || []);
  };

  useEffect(() => { load(); }, []);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? items.filter((it) => (
        String(it.nama || '').toLowerCase().includes(q) ||
        String(it.klasifikasi || '').toLowerCase().includes(q) ||
        String(it.tugasTambahan || '').toLowerCase().includes(q) ||
        String(it.tmt || '').toLowerCase().includes(q)
      ))
    : items;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const paged = filtered.slice(start, start + pageSize);

  return (
    <div>
      <div className="modern-table-card">
        <div className="modern-table-title"><Users size={24} /> Data Guru</div>
        <div className="toolbar" style={{ justifyContent: 'space-between' }}>
          <div className="empty">Data hanya ditampilkan (read-only).</div>
          <input
            placeholder="Cari guru..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
            style={{ maxWidth: 260 }}
          />
        </div>
        <table className="table">
          <thead><tr><th>Nama</th><th>Klasifikasi</th><th>Tugas Tambahan</th><th>TMT</th></tr></thead>
          <tbody>
            {paged.map((it, idx) => (
              <tr key={it.guruId}>
                <td>{it.nama}</td>
                <td>{it.klasifikasi || '-'}</td>
                <td>{it.tugasTambahan || '-'}</td>
                <td>{it.tmt || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="empty">Belum ada data.</div>}
        {filtered.length > 0 && (
          <div className="toolbar" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
            <button className="outline" onClick={() => setPage(Math.max(1, safePage - 1))} disabled={safePage === 1}>Sebelumnya</button>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>Halaman {safePage} / {totalPages}</div>
            <button className="outline" onClick={() => setPage(Math.min(totalPages, safePage + 1))} disabled={safePage === totalPages}>Berikutnya</button>
          </div>
        )}
      </div>
    </div>
  );
}
