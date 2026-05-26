import React, { useEffect, useMemo, useState } from 'react';

const EMPTY_FORM = {
  id: null,
  name: '',
  description: '',
  is_active: 1
};

export function ExtracurricularsSection({ api, setError, pushToast }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [query, setQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  async function loadRows() {
    setLoading(true);
    try {
      const list = await api.extracurriculars.list();
      setRows(Array.isArray(list) ? list : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRows();
  }, []);

  const filteredRows = useMemo(() => {
    const q = String(query || '').trim().toLowerCase();
    return rows.filter((row) => {
      if (filterStatus === 'active' && Number(row.is_active) !== 1) return false;
      if (filterStatus === 'inactive' && Number(row.is_active) !== 0) return false;
      if (!q) return true;
      return (
        String(row.name || '').toLowerCase().includes(q)
        || String(row.description || '').toLowerCase().includes(q)
      );
    });
  }, [rows, filterStatus, query]);

  function openCreate() {
    setForm({ ...EMPTY_FORM });
    setShowForm(true);
  }

  function openEdit(item) {
    setForm({
      id: item.id,
      name: item.name || '',
      description: item.description || '',
      is_active: Number(item.is_active) === 0 ? 0 : 1
    });
    setShowForm(true);
  }

  async function submit() {
    const payload = {
      name: String(form.name || '').trim(),
      description: form.description ? String(form.description) : null,
      is_active: Number(form.is_active) === 0 ? 0 : 1
    };
    if (!payload.name) {
      pushToast?.('error', 'Validasi gagal', 'Nama ekstrakurikuler wajib diisi.');
      return;
    }
    try {
      if (form.id) await api.extracurriculars.update(form.id, payload);
      else await api.extracurriculars.create(payload);
      await loadRows();
      setShowForm(false);
      setForm({ ...EMPTY_FORM });
      pushToast?.('success', 'Berhasil', 'Data ekstrakurikuler tersimpan.');
    } catch (err) {
      setError(err.message);
      pushToast?.('error', 'Gagal simpan', err.message);
    }
  }

  async function remove(id) {
    if (!window.confirm('Hapus data ekstrakurikuler ini?')) return;
    try {
      await api.extracurriculars.remove(id);
      await loadRows();
      pushToast?.('success', 'Berhasil', 'Data ekstrakurikuler dihapus.');
    } catch (err) {
      setError(err.message);
      pushToast?.('error', 'Gagal hapus', err.message);
    }
  }

  return (
    <>
      <section className="student-shell module-shell">
        <div className="student-filter-bar">
          <select className="filter" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="all">Semua Status</option>
            <option value="active">Aktif</option>
            <option value="inactive">Nonaktif</option>
          </select>
          <input className="filter full" placeholder="Cari nama ekstrakurikuler..." value={query} onChange={(e) => setQuery(e.target.value)} />
          <button className="btn-gradient" onClick={openCreate}>Tambah Ekstrakurikuler</button>
        </div>

        <div className="table-card student-table-card">
          <div className="student-table">
            <div className="student-table-head sticky" style={{ gridTemplateColumns: '1.3fr 1.5fr 0.8fr 0.8fr' }}>
              <span>Nama</span>
              <span>Deskripsi</span>
              <span>Status</span>
              <span>Aksi</span>
            </div>
            {loading && Array.from({ length: 6 }).map((_, i) => (
              <div className="student-table-row student-skeleton-row" style={{ gridTemplateColumns: '1.3fr 1.5fr 0.8fr 0.8fr' }} key={`eks-sk-${i}`}>
                <span className="student-skeleton" /><span className="student-skeleton" /><span className="student-skeleton" /><span className="student-skeleton" />
              </div>
            ))}
            {!loading && filteredRows.map((item) => (
              <div className="student-table-row" style={{ gridTemplateColumns: '1.3fr 1.5fr 0.8fr 0.8fr' }} key={item.id}>
                <span>{item.name}</span>
                <span>{item.description || '-'}</span>
                <span>{Number(item.is_active) === 1 ? 'Aktif' : 'Nonaktif'}</span>
                <span className="student-cell-actions">
                  <button className="icon-btn" title="Edit" onClick={() => openEdit(item)}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9" /><path d="m16.5 3.5 4 4L7 21l-4 1 1-4 12.5-14.5Z" /></svg>
                  </button>
                  <button className="icon-btn danger" title="Hapus" onClick={() => remove(item.id)}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></svg>
                  </button>
                </span>
              </div>
            ))}
            {!loading && !filteredRows.length && (
              <div className="module-empty-state">Belum ada data ekstrakurikuler.</div>
            )}
          </div>
        </div>
      </section>

      {showForm && (
        <div className="student-modal-overlay" onClick={() => setShowForm(false)}>
          <section className="student-modal student-modal-themed" onClick={(e) => e.stopPropagation()}>
            <div className="student-editor-head">
              <div>
                <h2>{form.id ? 'Edit Ekstrakurikuler' : 'Tambah Ekstrakurikuler'}</h2>
                <p>Master kegiatan untuk prestasi non akademik.</p>
              </div>
              <button className="ghost" onClick={() => setShowForm(false)}>Tutup</button>
            </div>
            <div className="student-compact-form">
              <label>Nama *</label>
              <label>Status</label>
              <input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
              <select value={form.is_active} onChange={(e) => setForm((prev) => ({ ...prev, is_active: Number(e.target.value) }))}>
                <option value={1}>Aktif</option>
                <option value={0}>Nonaktif</option>
              </select>

              <label className="full">Deskripsi</label>
              <textarea className="full" value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} />
            </div>
            <div className="actions student-form-actions">
              <button className="ghost" onClick={() => setShowForm(false)}>Batal</button>
              <button className="btn-gradient" onClick={submit}>Simpan</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
