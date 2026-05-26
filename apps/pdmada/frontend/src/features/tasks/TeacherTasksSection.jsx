import React from 'react';

const AVATAR_COLORS = ['#1d4ed8', '#0f766e', '#9333ea', '#ea580c', '#0891b2', '#b45309'];

function getInitials(name) {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function getAvatarColor(name) {
  if (!name) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function TeacherTasksSection({
  data,
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
          <input className="filter full" placeholder="Cari guru atau tugas..." value={filterQuery} onChange={(e) => setFilterQuery(e.target.value)} />
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
            <div className="student-table-head sticky task-head">
              <span>Guru</span>
              <span>Tugas</span>
              <span>Mulai</span>
              <span>Selesai</span>
              <span>Status</span>
              <span>Aksi</span>
            </div>
            {loading && Array.from({ length: 6 }).map((_, idx) => (
              <div className="student-table-row student-skeleton-row task-row" key={`tt-sk-${idx}`}>
                <span className="student-skeleton" />
                <span className="student-skeleton" />
                <span className="student-skeleton" />
                <span className="student-skeleton" />
                <span className="student-skeleton" />
                <span className="student-skeleton" />
              </div>
            ))}
            {!loading && visibleList.map((item) => (
              <div className="student-table-row task-row" key={item.id}>
                <span className="student-cell-info">
                  <span className="avatar-circle" style={{ background: getAvatarColor(item.teacher_name || '') }}>{getInitials(item.teacher_name || '')}</span>
                  <span>
                    <span className="student-name">{item.teacher_name || '-'}</span>
                  </span>
                </span>
                <span>{item.title || '-'}</span>
                <span>{item.start_date || '-'}</span>
                <span>{item.end_date || '-'}</span>
                <span><span className={`status-badge ${item.status === 'aktif' ? 'aktif' : 'nonaktif'}`}>{item.status || '-'}</span></span>
                <span className="student-cell-actions">
                  <button className="icon-btn" title="Edit" onClick={() => startEdit('teacherTasks', item)}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9" /><path d="m16.5 3.5 4 4L7 21l-4 1 1-4 12.5-14.5Z" /></svg>
                  </button>
                  <button className="icon-btn danger" title="Hapus" onClick={() => removeItem('teacherTasks', item.id)}>
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
                <h2>{viewOnly ? 'Detail Tugas Tambahan' : (editingId.teacherTasks ? 'Edit Tugas Tambahan' : 'Tambah Tugas Tambahan')}</h2>
              </div>
              <button className="ghost" onClick={() => { setShowForm(false); setViewOnly(false); }}>Tutup</button>
            </div>
            <div className="student-compact-form">
              <label>Guru</label>
              <label>Judul Tugas</label>
              <select disabled={viewOnly} value={form.teacherTasks.teacher_id || ''} onChange={(e) => setField('teacherTasks', 'teacher_id', e.target.value)}>
                <option value="">Pilih guru</option>
                {data.teachers.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>{teacher.name}</option>
                ))}
              </select>
              <select disabled={viewOnly} value={form.teacherTasks.title || ''} onChange={(e) => setField('teacherTasks', 'title', e.target.value)}>
                <option value="">Pilih tugas</option>
                {data.additionalTasks.filter((t) => Number(t.is_active) === 1).map((task) => (
                  <option key={task.id} value={task.name}>{task.name}</option>
                ))}
              </select>
              <label className="full">Deskripsi</label>
              <textarea className="full" disabled={viewOnly} value={form.teacherTasks.description || ''} onChange={(e) => setField('teacherTasks', 'description', e.target.value)} />
              <label>Tanggal Mulai</label>
              <label>Tanggal Selesai</label>
              <input disabled={viewOnly} type="date" value={form.teacherTasks.start_date || ''} onChange={(e) => setField('teacherTasks', 'start_date', e.target.value)} />
              <input disabled={viewOnly} type="date" value={form.teacherTasks.end_date || ''} onChange={(e) => setField('teacherTasks', 'end_date', e.target.value)} />
              <label>Status</label>
              <span />
              <select disabled={viewOnly} value={form.teacherTasks.status || 'aktif'} onChange={(e) => setField('teacherTasks', 'status', e.target.value)}>
                <option value="aktif">Aktif</option>
                <option value="selesai">Selesai</option>
                <option value="dibatalkan">Dibatalkan</option>
              </select>
            </div>
            {!viewOnly && (
              <div className="actions student-form-actions">
                <button className="ghost" onClick={() => { setShowForm(false); setViewOnly(false); }}>Batal</button>
                <button className="primary" onClick={() => submit('teacherTasks')}>{editingId.teacherTasks ? 'Update' : 'Simpan'}</button>
                <button className="ghost" onClick={() => resetForm('teacherTasks')}>Reset</button>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
