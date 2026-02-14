import { useEffect, useMemo, useState } from 'react';
import { adminApi } from '../api';
import { toast } from '../utils/toast';

export default function AdministrasiSekolah() {
  const [incoming, setIncoming] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [formSurat, setFormSurat] = useState({ letter_date: '', sender: '', subject: '', priority: 'normal', status: 'baru' });
  const [formBarang, setFormBarang] = useState({ code: '', name: '', quantity: 0, condition: 'baik', category: '' });
  const [qSurat, setQSurat] = useState('');
  const [qBarang, setQBarang] = useState('');
  const [pageSurat, setPageSurat] = useState(1);
  const [pageBarang, setPageBarang] = useState(1);
  const pageSize = 15;

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
    if (!formSurat.letter_date || !formSurat.sender || !formSurat.subject) {
      toast.error('Tanggal, pengirim, dan perihal surat wajib diisi.');
      return;
    }
    await adminApi.post('/incoming-letters', formSurat);
    setFormSurat({ letter_date: '', sender: '', subject: '', priority: 'normal', status: 'baru' });
    load();
  };

  const saveBarang = async (e) => {
    e.preventDefault();
    const qty = Number(formBarang.quantity || 0);
    if (!formBarang.name) {
      toast.error('Nama barang wajib diisi.');
      return;
    }
    if (qty < 0) {
      toast.error('Jumlah barang tidak boleh negatif.');
      return;
    }
    await adminApi.post('/inventory-items', { ...formBarang, quantity: qty });
    setFormBarang({ code: '', name: '', quantity: 0, condition: 'baik', category: '' });
    load();
  };

  const filteredSurat = useMemo(() => {
    const term = qSurat.trim().toLowerCase();
    if (!term) return incoming;
    return incoming.filter((s) =>
      String(s.sender || '').toLowerCase().includes(term) ||
      String(s.subject || '').toLowerCase().includes(term) ||
      String(s.status || '').toLowerCase().includes(term)
    );
  }, [incoming, qSurat]);

  const filteredBarang = useMemo(() => {
    const term = qBarang.trim().toLowerCase();
    if (!term) return inventory;
    return inventory.filter((i) =>
      String(i.code || '').toLowerCase().includes(term) ||
      String(i.name || '').toLowerCase().includes(term) ||
      String(i.category || '').toLowerCase().includes(term)
    );
  }, [inventory, qBarang]);

  const totalSuratPages = Math.max(1, Math.ceil(filteredSurat.length / pageSize));
  const totalBarangPages = Math.max(1, Math.ceil(filteredBarang.length / pageSize));
  const suratPageData = filteredSurat.slice((Math.min(pageSurat, totalSuratPages) - 1) * pageSize, Math.min(pageSurat, totalSuratPages) * pageSize);
  const barangPageData = filteredBarang.slice((Math.min(pageBarang, totalBarangPages) - 1) * pageSize, Math.min(pageBarang, totalBarangPages) * pageSize);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="modern-table-card">
        <div className="modern-table-title">Administrasi - Surat Masuk</div>
        <form className="toolbar" onSubmit={saveSurat}>
          <input type="date" value={formSurat.letter_date} onChange={(e) => setFormSurat((p) => ({ ...p, letter_date: e.target.value }))} required />
          <input placeholder="Pengirim" value={formSurat.sender} onChange={(e) => setFormSurat((p) => ({ ...p, sender: e.target.value }))} required />
          <input placeholder="Perihal" value={formSurat.subject} onChange={(e) => setFormSurat((p) => ({ ...p, subject: e.target.value }))} required />
          <select value={formSurat.priority} onChange={(e) => setFormSurat((p) => ({ ...p, priority: e.target.value }))}>
            <option value="rendah">Rendah</option>
            <option value="normal">Normal</option>
            <option value="tinggi">Tinggi</option>
          </select>
          <button type="submit">Tambah</button>
        </form>
        <div className="toolbar" style={{ justifyContent: 'space-between' }}>
          <div className="empty">Manajemen surat masuk.</div>
          <input placeholder="Cari surat..." value={qSurat} onChange={(e) => { setQSurat(e.target.value); setPageSurat(1); }} style={{ maxWidth: 260 }} />
        </div>
        <table className="table">
          <thead><tr><th>Tanggal</th><th>Pengirim</th><th>Perihal</th><th>Prioritas</th><th>Status</th></tr></thead>
          <tbody>{suratPageData.map((s) => <tr key={s.id}><td>{s.letter_date?.slice?.(0, 10) || '-'}</td><td>{s.sender || '-'}</td><td>{s.subject}</td><td>{s.priority || '-'}</td><td>{s.status || '-'}</td></tr>)}</tbody>
        </table>
        {filteredSurat.length > 0 && (
          <div className="toolbar" style={{ justifyContent: 'flex-end' }}>
            <button className="outline" onClick={() => setPageSurat((p) => Math.max(1, p - 1))} disabled={pageSurat <= 1}>Sebelumnya</button>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>Halaman {Math.min(pageSurat, totalSuratPages)} / {totalSuratPages}</div>
            <button className="outline" onClick={() => setPageSurat((p) => Math.min(totalSuratPages, p + 1))} disabled={pageSurat >= totalSuratPages}>Berikutnya</button>
          </div>
        )}
      </div>

      <div className="modern-table-card">
        <div className="modern-table-title">Administrasi - Inventaris</div>
        <form className="toolbar" onSubmit={saveBarang}>
          <input placeholder="Kode" value={formBarang.code} onChange={(e) => setFormBarang((p) => ({ ...p, code: e.target.value }))} />
          <input placeholder="Nama Barang" value={formBarang.name} onChange={(e) => setFormBarang((p) => ({ ...p, name: e.target.value }))} required />
          <input placeholder="Kategori" value={formBarang.category} onChange={(e) => setFormBarang((p) => ({ ...p, category: e.target.value }))} />
          <input placeholder="Jumlah" value={formBarang.quantity} onChange={(e) => setFormBarang((p) => ({ ...p, quantity: e.target.value }))} />
          <select value={formBarang.condition} onChange={(e) => setFormBarang((p) => ({ ...p, condition: e.target.value }))}>
            <option value="baik">Baik</option>
            <option value="rusak">Rusak</option>
          </select>
          <button type="submit">Tambah</button>
        </form>
        <div className="toolbar" style={{ justifyContent: 'space-between' }}>
          <div className="empty">Manajemen inventaris.</div>
          <input placeholder="Cari barang..." value={qBarang} onChange={(e) => { setQBarang(e.target.value); setPageBarang(1); }} style={{ maxWidth: 260 }} />
        </div>
        <table className="table">
          <thead><tr><th>Kode</th><th>Nama</th><th>Kategori</th><th>Jumlah</th><th>Kondisi</th></tr></thead>
          <tbody>{barangPageData.map((i) => <tr key={i.id}><td>{i.code || '-'}</td><td>{i.name}</td><td>{i.category || '-'}</td><td>{i.quantity || 0}</td><td>{i.condition || '-'}</td></tr>)}</tbody>
        </table>
        {filteredBarang.length > 0 && (
          <div className="toolbar" style={{ justifyContent: 'flex-end' }}>
            <button className="outline" onClick={() => setPageBarang((p) => Math.max(1, p - 1))} disabled={pageBarang <= 1}>Sebelumnya</button>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>Halaman {Math.min(pageBarang, totalBarangPages)} / {totalBarangPages}</div>
            <button className="outline" onClick={() => setPageBarang((p) => Math.min(totalBarangPages, p + 1))} disabled={pageBarang >= totalBarangPages}>Berikutnya</button>
          </div>
        )}
      </div>
    </div>
  );
}
