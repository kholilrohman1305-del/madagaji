import React, { useEffect, useMemo, useState } from 'react';

const INITIAL_FORM = {
  id: null,
  owner_type: 'student',
  owner_id: '',
  document_type: '',
  file_number: '',
  file_url: '',
  issuer: '',
  issued_date: '',
  status: 'valid',
  notes: ''
};

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('id-ID');
}

export function ArchivesSection({ api, data, setError, pushToast }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [filterOwnerType, setFilterOwnerType] = useState('all');
  const [filterOwnerId, setFilterOwnerId] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [query, setQuery] = useState('');
  const [uploadingFile, setUploadingFile] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  async function loadRows() {
    setLoading(true);
    try {
      const list = await api.studentAffairs.listDocuments();
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

  const documentTypes = useMemo(() => (
    Array.from(new Set(rows.map((item) => item.document_type).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'id'))
  ), [rows]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (filterOwnerType !== 'all' && String(row.owner_type || '').toLowerCase() !== filterOwnerType) return false;
      if (filterOwnerId !== 'all' && String(row.owner_id) !== String(filterOwnerId)) return false;
      if (filterStatus !== 'all' && String(row.status || '').toLowerCase() !== String(filterStatus).toLowerCase()) return false;
      if (filterType !== 'all' && row.document_type !== filterType) return false;
      if (!q) return true;
      return [row.owner_name, row.document_type, row.file_number, row.issuer, row.notes]
        .some((value) => String(value || '').toLowerCase().includes(q));
    });
  }, [rows, filterOwnerType, filterOwnerId, filterStatus, filterType, query]);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pagedRows = useMemo(
    () => filteredRows.slice((page - 1) * pageSize, page * pageSize),
    [filteredRows, page, pageSize]
  );

  useEffect(() => {
    setPage(1);
  }, [filterOwnerType, filterOwnerId, filterStatus, filterType, query, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const ownerOptions = form.owner_type === 'teacher' ? data.teachers : data.students;
  const filterOwnerOptions = filterOwnerType === 'teacher'
    ? data.teachers
    : filterOwnerType === 'student'
      ? data.students
      : [];

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);
    try {
      const uploaded = await api.uploads.uploadDocument(file);
      setForm((prev) => ({ ...prev, file_url: uploaded.file_url || '' }));
      pushToast?.('success', 'File terupload', 'Dokumen berhasil diunggah.');
    } catch (err) {
      setError(err.message);
      pushToast?.('error', 'Upload gagal', err.message);
    } finally {
      setUploadingFile(false);
      event.target.value = '';
    }
  }

  function openCreate() {
    setForm(INITIAL_FORM);
    setShowForm(true);
  }

  function openEdit(row) {
    setForm({
      id: row.id,
      owner_type: row.owner_type || 'student',
      owner_id: row.owner_id ? String(row.owner_id) : '',
      document_type: row.document_type || '',
      file_number: row.file_number || '',
      file_url: row.file_url || '',
      issuer: row.issuer || '',
      issued_date: row.issued_date || '',
      status: row.status || 'valid',
      notes: row.notes || ''
    });
    setShowForm(true);
  }

  async function submit() {
    try {
      const payload = {
        owner_type: form.owner_type,
        owner_id: Number(form.owner_id),
        document_type: form.document_type,
        file_number: form.file_number || null,
        file_url: form.file_url || null,
        issuer: form.issuer || null,
        issued_date: form.issued_date || null,
        status: form.status || 'valid',
        notes: form.notes || null
      };
      if (form.id) {
        await api.studentAffairs.updateDocument(form.id, payload, form.owner_type);
        pushToast?.('success', 'Arsip diperbarui', 'Dokumen berhasil diperbarui.');
      } else {
        await api.studentAffairs.createDocument(payload);
        pushToast?.('success', 'Arsip ditambahkan', 'Dokumen berhasil ditambahkan.');
      }
      setShowForm(false);
      setForm(INITIAL_FORM);
      await loadRows();
    } catch (err) {
      setError(err.message);
      pushToast?.('error', 'Gagal simpan arsip', err.message);
    }
  }

  async function remove(id, ownerType = 'student') {
    if (!window.confirm('Hapus dokumen ini?')) return;
    try {
      await api.studentAffairs.deleteDocument(id, ownerType);
      pushToast?.('success', 'Arsip dihapus', 'Dokumen berhasil dihapus.');
      await loadRows();
    } catch (err) {
      setError(err.message);
      pushToast?.('error', 'Gagal hapus arsip', err.message);
    }
  }

  return (
    <>
      <section className="student-shell module-shell">
        <div className="student-filter-bar">
          <select className="filter" value={filterOwnerType} onChange={(e) => {
            setFilterOwnerType(e.target.value);
            setFilterOwnerId('all');
          }}>
            <option value="all">Semua Pemilik</option>
            <option value="student">Siswa</option>
            <option value="teacher">Guru</option>
          </select>
          <select className="filter" value={filterOwnerId} onChange={(e) => setFilterOwnerId(e.target.value)}>
            <option value="all">Semua Nama</option>
            {filterOwnerOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <select className="filter" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
            <option value="all">Semua Jenis Dokumen</option>
            {documentTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          <select className="filter" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="all">Semua Status</option>
            <option value="valid">Valid</option>
            <option value="proses">Proses</option>
            <option value="expired">Expired</option>
          </select>
          <input className="filter full" placeholder="Cari nama / nomor dokumen / penerbit..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>

        <div className="student-meta-bar">
          <span className="pill">Total arsip: {filteredRows.length}</span>
          <div className="student-pagination">
            <button className="ghost" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</button>
            <span>Halaman {page} / {totalPages}</span>
            <button className="ghost" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</button>
            <select className="filter" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value) || 20)}>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
          <div className="head-actions">
            <button className="btn-gradient" onClick={openCreate}>Tambah Arsip</button>
          </div>
        </div>

        <div className="table-card student-table-card">
          <div className="student-table">
            <div className="student-table-head sticky" style={{ gridTemplateColumns: '1.5fr 1fr 1fr 0.9fr 0.9fr 0.8fr 1fr' }}>
              <span>Pemilik</span>
              <span>Dokumen</span>
              <span>Nomor</span>
              <span>Penerbit</span>
              <span>Tanggal</span>
              <span>Status</span>
              <span>Aksi</span>
            </div>
            {loading && Array.from({ length: 5 }).map((_, index) => (
              <div className="student-table-row student-skeleton-row" style={{ gridTemplateColumns: '1.5fr 1fr 1fr 0.9fr 0.9fr 0.8fr 1fr' }} key={`archive-sk-${index}`}>
                <span className="student-skeleton" /><span className="student-skeleton" /><span className="student-skeleton" /><span className="student-skeleton" /><span className="student-skeleton" /><span className="student-skeleton" /><span className="student-skeleton" />
              </div>
            ))}
            {!loading && pagedRows.map((row) => (
              <div className="student-table-row" style={{ gridTemplateColumns: '1.5fr 1fr 1fr 0.9fr 0.9fr 0.8fr 1fr' }} key={row.id}>
                <span className="student-cell-info">
                  <span>
                    <span className="student-name">{row.owner_name}</span>
                    <span className="student-gender">{row.owner_type === 'teacher' ? 'Guru' : 'Siswa'} | ID arsip: {row.id}</span>
                  </span>
                </span>
                <span>{row.document_type || '-'}</span>
                <span>{row.file_number || '-'}</span>
                <span>{row.issuer || '-'}</span>
                <span>{formatDate(row.issued_date)}</span>
                <span><span className={String(row.status || '').toLowerCase() === 'valid' ? 'badge success' : 'badge'}>{row.status || '-'}</span></span>
                <span className="student-cell-actions">
                  {row.file_url ? (
                    <button className="icon-btn" title="Buka dokumen" onClick={() => window.open(api.resolveFileUrl(row.file_url), '_blank', 'noopener,noreferrer')}>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M21 14v7H3V3h7" /></svg>
                    </button>
                  ) : null}
                  <button className="icon-btn" title="Edit" onClick={() => openEdit(row)}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9" /><path d="m16.5 3.5 4 4L7 21l-4 1 1-4 12.5-14.5Z" /></svg>
                  </button>
                  <button className="icon-btn danger" title="Hapus" onClick={() => remove(row.id, row.owner_type)}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></svg>
                  </button>
                </span>
              </div>
            ))}
            {!loading && filteredRows.length === 0 && (
              <div className="module-empty-state">Belum ada arsip untuk filter yang dipilih.</div>
            )}
          </div>
        </div>
      </section>

      {showForm && (
        <div className="student-modal-overlay" onClick={() => setShowForm(false)}>
          <section className="student-modal student-modal-themed" onClick={(e) => e.stopPropagation()}>
            <div className="student-editor-head">
              <div>
                <h2>{form.id ? 'Edit Dokumen & Arsip' : 'Tambah Dokumen & Arsip'}</h2>
                <p>Kelola arsip siswa dan guru agar mudah dilacak dan dicetak.</p>
              </div>
              <button className="ghost" onClick={() => setShowForm(false)}>Tutup</button>
            </div>

            <div className="student-compact-form">
              <label>Pemilik Arsip</label>
              <label>Nama</label>
              <select value={form.owner_type} onChange={(e) => setForm((prev) => ({ ...prev, owner_type: e.target.value, owner_id: '' }))}>
                <option value="student">Siswa</option>
                <option value="teacher">Guru</option>
              </select>
              <select value={form.owner_id} onChange={(e) => setForm((prev) => ({ ...prev, owner_id: e.target.value }))}>
                <option value="">Pilih {form.owner_type === 'teacher' ? 'Guru' : 'Siswa'}</option>
                {ownerOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>

              <label>Jenis Dokumen</label>
              <input value={form.document_type} onChange={(e) => setForm((prev) => ({ ...prev, document_type: e.target.value }))} placeholder="Contoh: KK / Ijazah / Sertifikat" />
              <div />

              <label>Nomor Dokumen</label>
              <label>Penerbit</label>
              <input value={form.file_number} onChange={(e) => setForm((prev) => ({ ...prev, file_number: e.target.value }))} />
              <input value={form.issuer} onChange={(e) => setForm((prev) => ({ ...prev, issuer: e.target.value }))} />

              <label>Tanggal Terbit</label>
              <label>Status</label>
              <input type="date" value={form.issued_date} onChange={(e) => setForm((prev) => ({ ...prev, issued_date: e.target.value }))} />
              <select value={form.status} onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}>
                <option value="valid">Valid</option>
                <option value="proses">Proses</option>
                <option value="kedaluwarsa">Kedaluwarsa</option>
              </select>

              <label className="full">Upload File (PDF/JPG/JPEG)</label>
              <div className="full" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input type="file" accept=".pdf,.jpg,.jpeg,application/pdf,image/jpeg" onChange={handleFileChange} />
                {uploadingFile ? <span className="student-gender">Mengupload...</span> : null}
                {form.file_url ? (
                  <button type="button" className="ghost" onClick={() => window.open(api.resolveFileUrl(form.file_url), '_blank', 'noopener,noreferrer')}>
                    Lihat File
                  </button>
                ) : null}
              </div>

              <label className="full">Catatan</label>
              <textarea className="full" value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} />
            </div>

            <div className="actions student-form-actions">
              <button className="ghost" onClick={() => setShowForm(false)}>Batal</button>
              <button className="btn-gradient" onClick={submit} disabled={!form.owner_id || !form.document_type || !form.file_url}>
                Simpan Arsip
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
