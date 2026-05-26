import React from 'react';

export function PondokPesantrenSection({
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
  showForm,
  viewOnly,
  setShowForm,
  setViewOnly,
  form,
  setField,
  submit,
  editingId,
  startEdit,
  removeItem
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
          <input
            className="filter"
            placeholder="Cari nama pondok..."
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
          />
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
          <div className="student-table-head sticky pondok-head-table">
            <span>Nama Pondok</span>
            <span>Status</span>
            <span>Aksi</span>
          </div>
          {loading && (
            <div className="student-empty">Memuat data...</div>
          )}
          {!loading && visibleList.map((item) => (
            <div className="student-table-row pondok-row-table" key={item.id}>
              <span className="student-name">{item.name}</span>
              <span>
                <span className={Number(item.is_active) === 1 ? 'status-badge aktif' : 'status-badge nonaktif'}>
                  {Number(item.is_active) === 1 ? 'Aktif' : 'Nonaktif'}
                </span>
              </span>
              <span className="student-cell-actions">
                <button className="icon-btn" title="Edit" onClick={() => startEdit('pondokPesantren', item)}>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9" /><path d="m16.5 3.5 4 4L7 21l-4 1 1-4 12.5-14.5Z" /></svg>
                </button>
                <button className="icon-btn danger" title="Hapus" onClick={() => removeItem('pondokPesantren', item.id)}>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></svg>
                </button>
              </span>
            </div>
          ))}
          {!loading && visibleList.length === 0 && (
            <div className="student-empty">Belum ada data pondok sesuai filter.</div>
          )}
        </div>
        </div>
      </section>

      {showForm && (
        <div className="pondok-modal-overlay" onClick={() => { setShowForm(false); setViewOnly(false); }}>
          <section className="pondok-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pondok-modal-head">
              <h3>{viewOnly ? 'Detail Pondok' : (editingId.pondokPesantren ? 'Edit Pondok' : 'Tambah Pondok')}</h3>
              <button className="ghost" onClick={() => { setShowForm(false); setViewOnly(false); }}>Tutup</button>
            </div>
            <div className="pondok-modal-body">
              <label>Nama Pondok</label>
              <input
                disabled={viewOnly}
                value={form.pondokPesantren.name || ''}
                onChange={(e) => setField('pondokPesantren', 'name', e.target.value)}
              />
              <label>Status</label>
              <select
                disabled={viewOnly}
                value={form.pondokPesantren.is_active ? '1' : '0'}
                onChange={(e) => setField('pondokPesantren', 'is_active', e.target.value === '1')}
              >
                <option value="1">Aktif</option>
                <option value="0">Nonaktif</option>
              </select>
            </div>
            {!viewOnly && (
              <div className="pondok-modal-actions">
                <button className="ghost" onClick={() => { setShowForm(false); setViewOnly(false); }}>Batal</button>
                <button className="primary" onClick={() => submit('pondokPesantren')}>
                  {editingId.pondokPesantren ? 'Update' : 'Simpan'}
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
