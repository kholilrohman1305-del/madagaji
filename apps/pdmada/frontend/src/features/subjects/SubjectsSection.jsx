import React from 'react';

export function SubjectsSection({
  visibleList,
  loading,
  listPage,
  setListPage,
  listPageSize,
  setListPageSize,
  listTotalPages,
  totalRows,
  filterStatus,
  setFilterStatus,
  filterQuery,
  setFilterQuery,
  startEdit,
  removeItem,
  showForm,
  viewOnly,
  setShowForm,
  setViewOnly,
  form,
  setField,
  submit,
  resetForm,
  editingId
}) {
  return (
    <>
      <section className="student-shell">
        <div className="student-filter-bar">
          <select className="filter" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="all">Semua Status</option>
            <option value="active">Aktif</option>
            <option value="inactive">Nonaktif</option>
          </select>
          <input className="filter full" placeholder="Cari mapel atau kode..." value={filterQuery} onChange={(e) => setFilterQuery(e.target.value)} />
        </div>
        <div className="student-meta-bar">
          <span className="pill">Total ditemukan: {totalRows}</span>
          <div className="student-pagination">
            <button className="ghost" disabled={listPage <= 1} onClick={() => setListPage((p) => Math.max(1, p - 1))}>Prev</button>
            <span>Halaman {listPage} / {listTotalPages}</span>
            <button className="ghost" disabled={listPage >= listTotalPages} onClick={() => setListPage((p) => Math.min(listTotalPages, p + 1))}>Next</button>
            <select className="filter" value={listPageSize} onChange={(e) => setListPageSize(Number(e.target.value) || 20)}>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>

        <div className="table-card student-table-card">
          <div className="student-table">
            <div className="student-table-head sticky" style={{ gridTemplateColumns: '1.6fr 0.8fr 0.9fr 0.8fr 0.8fr 0.8fr 1fr' }}>
              <span>Mapel</span>
              <span>Kode</span>
              <span>Kelompok</span>
              <span>KKM</span>
              <span>Urutan</span>
              <span>Status</span>
              <span>Aksi</span>
            </div>
            {loading && Array.from({ length: 5 }).map((_, idx) => (
              <div className="student-table-row student-skeleton-row" style={{ gridTemplateColumns: '1.6fr 0.8fr 0.9fr 0.8fr 0.8fr 0.8fr 1fr' }} key={`s-sk-${idx}`}>
                <span className="student-skeleton" />
                <span className="student-skeleton" />
                <span className="student-skeleton" />
                <span className="student-skeleton" />
                <span className="student-skeleton" />
                <span className="student-skeleton" />
                <span className="student-skeleton" />
              </div>
            ))}
            {!loading && visibleList.map((item) => (
              <div className="student-table-row" style={{ gridTemplateColumns: '1.6fr 0.8fr 0.9fr 0.8fr 0.8fr 0.8fr 1fr' }} key={item.id}>
                <span className="student-name">{item.name}</span>
                <span className="code-pill">{item.code || '-'}</span>
                <span>{item.group_name || '-'}</span>
                <span>{item.kkm ?? '-'}</span>
                <span>{item.display_order ?? 0}</span>
                <span><span className={`status-badge ${Number(item.is_active) === 1 ? 'aktif' : 'nonaktif'}`}>{Number(item.is_active) === 1 ? 'Aktif' : 'Nonaktif'}</span></span>
                <span className="student-cell-actions">
                  <button className="icon-btn" title="Edit" onClick={() => startEdit('subjects', item)}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9" /><path d="m16.5 3.5 4 4L7 21l-4 1 1-4 12.5-14.5Z" /></svg>
                  </button>
                  <button className="icon-btn danger" title="Hapus" onClick={() => removeItem('subjects', item.id)}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></svg>
                  </button>
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {showForm && (
        <div className="student-modal-overlay" onClick={() => { setShowForm(false); setViewOnly(false); }}>
          <section className="student-modal" onClick={(e) => e.stopPropagation()}>
            <div className="student-editor-head">
              <div>
                <h2>{viewOnly ? 'Detail Mapel' : (editingId.subjects ? 'Edit Mapel' : 'Tambah Mapel')}</h2>
              </div>
              <button className="ghost" onClick={() => { setShowForm(false); setViewOnly(false); }}>Tutup</button>
            </div>
            <div className="student-compact-form">
              <label>Kode</label>
              <label>Kelompok</label>
              <input disabled={viewOnly} value={form.subjects.code || ''} onChange={(e) => setField('subjects', 'code', e.target.value)} />
              <input disabled={viewOnly} value={form.subjects.group_name || ''} onChange={(e) => setField('subjects', 'group_name', e.target.value)} />

              <label className="full">Nama Mapel</label>
              <input className="full" disabled={viewOnly} value={form.subjects.name || ''} onChange={(e) => setField('subjects', 'name', e.target.value)} />

              <label>Tingkat</label>
              <label>KKM</label>
              <input disabled={viewOnly} value={form.subjects.grade_level || ''} onChange={(e) => setField('subjects', 'grade_level', e.target.value)} />
              <input type="number" disabled={viewOnly} value={form.subjects.kkm || ''} onChange={(e) => setField('subjects', 'kkm', e.target.value)} />

              <label>Urutan Tampil</label>
              <label>Status</label>
              <input type="number" disabled={viewOnly} value={form.subjects.display_order || ''} onChange={(e) => setField('subjects', 'display_order', e.target.value)} />
              <select disabled={viewOnly} value={form.subjects.is_active ? '1' : '0'} onChange={(e) => setField('subjects', 'is_active', e.target.value === '1')}>
                <option value="1">Aktif</option>
                <option value="0">Nonaktif</option>
              </select>
            </div>
            {!viewOnly && (
              <div className="actions student-form-actions">
                <button className="ghost" onClick={() => { setShowForm(false); setViewOnly(false); }}>Batal</button>
                <button className="primary" onClick={() => submit('subjects')}>{editingId.subjects ? 'Update' : 'Simpan'}</button>
                <button className="ghost" onClick={() => resetForm('subjects')}>Reset</button>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
