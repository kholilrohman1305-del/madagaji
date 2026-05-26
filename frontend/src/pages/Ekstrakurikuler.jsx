import { useEffect, useMemo, useState } from 'react';
import api from '../api';
import { Wallet, Plus, Save, Trash2, X } from 'lucide-react';

export default function Ekstrakurikuler() {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [periode, setPeriode] = useState(currentMonth);
  const [teachers, setTeachers] = useState([]);
  const [items, setItems] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [changedIds, setChangedIds] = useState(new Set());
  const [showModal, setShowModal] = useState(false);
  const [bulkValues, setBulkValues] = useState({ jumlahHadir: '', nominal: '' });
  const [form, setForm] = useState({
    teacherId: '',
    teacherNameManual: '',
    namaEkstra: '',
    nominal: 0,
    keterangan: ''
  });

  const rupiah = useMemo(() => new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }), []);

  const loadTeachers = async () => {
    const res = await api.get('/payroll/extracurricular/teachers');
    const rows = res.data || [];
    setTeachers(rows);
    setForm((prev) => ({ ...prev, teacherId: prev.teacherId || rows[0]?.id || '' }));
  };

  const loadSheet = async (targetPeriode) => {
    const p = targetPeriode || periode;
    const res = await api.get('/payroll/extracurricular/sheet', { params: { periode: p } });
    const rows = res.data || [];
    const nextDrafts = {};
    rows.forEach((row) => {
      nextDrafts[row.id] = {
        jumlahHadir: row.jumlahHadir ?? 0,
        nominal: row.nominal ?? 0
      };
    });
    setItems(rows);
    setDrafts(nextDrafts);
    setChangedIds(new Set());
  };

  useEffect(() => {
    loadTeachers();
  }, []);

  useEffect(() => {
    loadSheet(periode);
  }, []);

  const applyPeriode = () => {
    loadSheet(periode);
  };

  const onDraftChange = (id, key, value) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || {}),
        [key]: value
      }
    }));
    setChangedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const saveMassal = async () => {
    const payload = Array.from(changedIds).map((id) => ({
      id,
      jumlahHadir: drafts[id]?.jumlahHadir ?? 0,
      nominal: drafts[id]?.nominal ?? 0
    }));
    if (payload.length === 0) return;
    await api.put('/payroll/extracurricular/sheet', { periode, items: payload });
    loadSheet(periode);
  };

  const applyMassalToAll = () => {
    const hasJumlah = bulkValues.jumlahHadir !== '';
    const hasNominal = bulkValues.nominal !== '';
    if (!hasJumlah && !hasNominal) return;

    const nextDrafts = { ...drafts };
    const nextChanged = new Set(changedIds);
    items.forEach((it) => {
      nextDrafts[it.id] = {
        ...(nextDrafts[it.id] || {}),
        ...(hasJumlah ? { jumlahHadir: bulkValues.jumlahHadir } : {}),
        ...(hasNominal ? { nominal: bulkValues.nominal } : {})
      };
      nextChanged.add(it.id);
    });
    setDrafts(nextDrafts);
    setChangedIds(nextChanged);
  };

  const add = async () => {
    await api.post('/payroll/extracurricular', {
      tanggal: `${periode}-01`,
      teacherId: form.teacherId,
      teacherNameManual: form.teacherNameManual,
      namaEkstra: form.namaEkstra,
      jumlahHadir: 0,
      nominal: form.nominal,
      keterangan: form.keterangan
    });
    setShowModal(false);
    setForm((prev) => ({ ...prev, teacherNameManual: '', namaEkstra: '', nominal: 0, keterangan: '' }));
    loadSheet(periode);
  };

  const del = async (id) => {
    await api.delete(`/payroll/extracurricular/${id}`);
    loadSheet(periode);
  };

  return (
    <div>
      <div className="modern-table-card">
        <div className="modern-table-title"><Wallet size={24} /> Ekstrakurikuler</div>
        <div className="toolbar">
          <input type="month" value={periode} onChange={(e) => setPeriode(e.target.value)} />
          <button className="outline" onClick={applyPeriode}>Terapkan</button>
          <button className="outline no-print" onClick={() => window.print()}>Cetak</button>
          <input
            type="number"
            min="0"
            placeholder="Hadir semua"
            value={bulkValues.jumlahHadir}
            onChange={(e) => setBulkValues((prev) => ({ ...prev, jumlahHadir: e.target.value }))}
            style={{ width: 140 }}
          />
          <input
            type="number"
            min="0"
            placeholder="Nominal semua"
            value={bulkValues.nominal}
            onChange={(e) => setBulkValues((prev) => ({ ...prev, nominal: e.target.value }))}
            style={{ width: 160 }}
          />
          <button className="outline" onClick={applyMassalToAll}>
            Terapkan ke Semua
          </button>
          <button onClick={saveMassal} disabled={changedIds.size === 0}>
            <Save size={18} /> Simpan Massal ({changedIds.size})
          </button>
          <button className="secondary" onClick={() => setShowModal(true)}>
            <Plus size={18} /> Tambah Guru + Ekstra
          </button>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th className="print-only center">No.</th>
              <th>Nama Guru</th>
              <th>Nama Ekstra</th>
              <th>Jumlah Hadir</th>
              <th>Nominal</th>
              <th>Jumlah Diterima</th>
              <th className="no-print">Aksi</th>
              <th className="print-only center print-ttd">TTD</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => {
              const jumlahHadir = Number(drafts[it.id]?.jumlahHadir ?? it.jumlahHadir ?? 0);
              const nominal = Number(drafts[it.id]?.nominal ?? it.nominal ?? 0);
              return (
                <tr key={it.id}>
                  <td className="print-only center">{idx + 1}</td>
                  <td>{it.teacherName}</td>
                  <td>{it.namaEkstra}</td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      value={jumlahHadir}
                      onChange={(e) => onDraftChange(it.id, 'jumlahHadir', e.target.value)}
                      style={{ width: 120 }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      value={nominal}
                      onChange={(e) => onDraftChange(it.id, 'nominal', e.target.value)}
                      style={{ width: 160 }}
                    />
                  </td>
                  <td style={{ fontWeight: 700 }}>{rupiah.format(jumlahHadir * nominal)}</td>
                  <td className="no-print">
                    <button className="danger sm" onClick={() => del(it.id)}><Trash2 size={14} /></button>
                  </td>
                  <td className="print-only"></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {items.length === 0 && <div className="empty">Belum ada data. Tambah Guru + Ekstra terlebih dahulu.</div>}
      </div>

      {showModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title"><Plus size={24} /> Tambah Guru + Ekstra</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="grid grid-2" style={{ gap: 16 }}>
              <div className="form-group">
                <label className="form-label">Nama Guru</label>
                <select value={form.teacherId} onChange={(e) => setForm({ ...form, teacherId: e.target.value })} style={{ width: '100%' }}>
                  <option value="0">+ Input Manual</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              {String(form.teacherId) === '0' && (
                <div className="form-group">
                  <label className="form-label">Nama Guru (Manual)</label>
                  <input value={form.teacherNameManual} onChange={(e) => setForm({ ...form, teacherNameManual: e.target.value })} style={{ width: '100%' }} />
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Nama Ekstra</label>
                <input value={form.namaEkstra} onChange={(e) => setForm({ ...form, namaEkstra: e.target.value })} style={{ width: '100%' }} />
              </div>
              <div className="form-group">
                <label className="form-label">Nominal Awal</label>
                <input type="number" min="0" value={form.nominal} onChange={(e) => setForm({ ...form, nominal: e.target.value })} style={{ width: '100%' }} />
              </div>
              <div className="form-group">
                <label className="form-label">Keterangan</label>
                <input value={form.keterangan} onChange={(e) => setForm({ ...form, keterangan: e.target.value })} style={{ width: '100%' }} />
              </div>
            </div>
            <div className="toolbar" style={{ marginTop: 20, marginBottom: 0 }}>
              <button
                onClick={add}
                disabled={
                  !form.namaEkstra ||
                  !form.teacherId ||
                  (String(form.teacherId) === '0' && !String(form.teacherNameManual || '').trim())
                }
              >
                <Save size={18} /> Simpan
              </button>
              <button className="outline" onClick={() => setShowModal(false)}>Batal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
