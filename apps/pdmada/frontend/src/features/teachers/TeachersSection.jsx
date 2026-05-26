import React, { useEffect, useMemo, useRef, useState } from 'react';

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

function formatDocDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('id-ID');
}

export function TeachersSection({
  api,
  data,
  visibleList,
  loading,
  filterStatus,
  setFilterStatus,
  filterQuery,
  setFilterQuery,
  teacherPage,
  setTeacherPage,
  teacherPageSize,
  setTeacherPageSize,
  teacherTotalPages,
  totalRows,
  openDetail,
  startEdit,
  removeItem,
  showForm,
  viewOnly,
  editingId,
  setShowForm,
  setViewOnly,
  form,
  setField,
  submit,
  resetForm
}) {
  const [teacherFormTab, setTeacherFormTab] = useState('identity');
  const [teacherDocuments, setTeacherDocuments] = useState([]);
  const [uploadingDocKey, setUploadingDocKey] = useState('');
  const teacherDocInputRefs = useRef({});
  const teacherStatusClass = Number(form.teachers.is_active) === 1 || form.teachers.is_active === true ? 'aktif' : 'nonaktif';
  const activeTeachers = visibleList.filter((teacher) => Number(teacher.is_active) === 1).length;
  const subjectOptions = ((data?.subjects || [])
    .filter((subject) => Number(subject.is_active) === 1)
    .map((subject) => ({
      id: String(subject.id),
      name: String(subject.name || '').trim()
    }))
    .filter((subject) => subject.name))
    .sort((a, b) => a.name.localeCompare(b.name, 'id'));
  const additionalTaskOptions = Array.from(new Set([
    ...(form.teachers.additional_task ? [form.teachers.additional_task] : []),
    ...((data?.additionalTasks || [])
      .filter((task) => Number(task.is_active) === 1)
      .map((task) => String(task.name || '').trim())
      .filter(Boolean))
  ])).sort((a, b) => a.localeCompare(b, 'id'));
  const subjectNameById = Object.fromEntries(subjectOptions.map((subject) => [subject.id, subject.name]));

  useEffect(() => {
    if (showForm) setTeacherFormTab('identity');
  }, [showForm, editingId.teachers]);

  useEffect(() => {
    async function loadTeacherDocuments() {
      const teacherId = Number(form.teachers?.id || editingId.teachers || 0);
      if (!teacherId || !showForm || !api?.studentAffairs?.listDocuments) {
        setTeacherDocuments([]);
        return;
      }
      try {
        const rows = await api.studentAffairs.listDocuments(teacherId, 'teacher');
        setTeacherDocuments(Array.isArray(rows) ? rows : []);
      } catch (error) {
        setTeacherDocuments([]);
      }
    }
    loadTeacherDocuments();
  }, [api, showForm, form.teachers?.id, editingId.teachers]);

  const teacherDocItems = useMemo(() => ([
    { key: 'ijazah', label: 'Ijazah', type: 'Ijazah', accept: '.pdf,.jpg,.jpeg,application/pdf,image/jpeg' },
    { key: 'sertifikat', label: 'Sertifikat', type: 'Sertifikat', accept: '.pdf,.jpg,.jpeg,application/pdf,image/jpeg' },
    { key: 'sk', label: 'SK', type: 'SK', accept: '.pdf,.jpg,.jpeg,application/pdf,image/jpeg' }
  ]), []);

  function getTeacherDocument(type) {
    return teacherDocuments.find((doc) => String(doc.document_type || '').toLowerCase() === String(type || '').toLowerCase()) || null;
  }

  async function handleTeacherDocumentUpload(item, event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const teacherId = Number(form.teachers?.id || editingId.teachers || 0);
    if (!teacherId) return;
    setUploadingDocKey(item.key);
    try {
      const uploaded = await api.uploads.uploadDocument(file);
      const existing = getTeacherDocument(item.type);
      const payload = {
        owner_type: 'teacher',
        owner_id: teacherId,
        document_type: item.type,
        file_url: uploaded.file_url,
        status: 'valid'
      };
      if (existing?.id) {
        await api.studentAffairs.updateDocument(existing.id, payload, 'teacher');
      } else {
        await api.studentAffairs.createDocument(payload);
      }
      const rows = await api.studentAffairs.listDocuments(teacherId, 'teacher');
      setTeacherDocuments(Array.isArray(rows) ? rows : []);
    } catch (error) {
      console.error(error);
    } finally {
      setUploadingDocKey('');
      event.target.value = '';
    }
  }

  return (
    <>
      <section className="student-shell">
        <div className="student-filter-bar">
          <select className="filter" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="all">Semua Status</option>
            <option value="active">Aktif</option>
            <option value="inactive">Nonaktif</option>
          </select>
          <input className="filter full" placeholder="Cari nama, NIY, NIK, mapel..." value={filterQuery} onChange={(e) => setFilterQuery(e.target.value)} />
        </div>

        <div className="student-meta-bar">
          <span className="pill">Total ditemukan: {totalRows}</span>
          <div className="student-pagination">
            <button className="ghost" disabled={teacherPage <= 1} onClick={() => setTeacherPage((p) => Math.max(1, p - 1))}>Prev</button>
            <span>Halaman {teacherPage} / {teacherTotalPages}</span>
            <button className="ghost" disabled={teacherPage >= teacherTotalPages} onClick={() => setTeacherPage((p) => Math.min(teacherTotalPages, p + 1))}>Next</button>
            <select className="filter" value={teacherPageSize} onChange={(e) => { setTeacherPageSize(Number(e.target.value)); setTeacherPage(1); }}>
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>

        <div className="table-card student-table-card">
          <div className="student-table teacher-table">
            <div className="student-table-head sticky teacher-head">
              <span>Guru</span>
              <span>NIY</span>
              <span>Mapel</span>
              <span>Klasifikasi</span>
              <span>Status</span>
              <span>Aksi</span>
            </div>
            {loading && Array.from({ length: 6 }).map((_, idx) => (
              <div className="student-table-row student-skeleton-row teacher-row" key={`t-sk-${idx}`}>
                <span className="student-skeleton" />
                <span className="student-skeleton" />
                <span className="student-skeleton" />
                <span className="student-skeleton" />
                <span className="student-skeleton" />
                <span className="student-skeleton" />
              </div>
            ))}
            {!loading && visibleList.map((item) => (
              <div className="student-table-row teacher-row" key={item.id}>
                <span className="student-cell-info">
                  <span className="avatar-circle" style={{ background: getAvatarColor(item.name) }}>{getInitials(item.name)}</span>
                  <span>
                    <span className="student-name">{item.name}</span>
                    <span className="student-gender">{item.degree || '-'}</span>
                  </span>
                </span>
                <span className="student-cell-id">{item.niy || '-'}</span>
                <span>{item.subject || '-'}</span>
                <span>{item.classification || '-'}</span>
                <span><span className={`status-badge ${Number(item.is_active) === 1 ? 'aktif' : 'nonaktif'}`}>{Number(item.is_active) === 1 ? 'Aktif' : 'Nonaktif'}</span></span>
                <span className="student-cell-actions">
                  <button className="icon-btn" title="Detail" onClick={() => openDetail('teachers', item)}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Z" /><circle cx="12" cy="12" r="3" /></svg>
                  </button>
                  <button className="icon-btn" title="Edit" onClick={() => startEdit('teachers', item)}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9" /><path d="m16.5 3.5 4 4L7 21l-4 1 1-4 12.5-14.5Z" /></svg>
                  </button>
                  <button className="icon-btn danger" title="Hapus" onClick={() => removeItem('teachers', item.id)}>
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
          <section className="student-modal student-modal-themed" onClick={(e) => e.stopPropagation()}>
            <div className="student-editor-head">
              <div>
                <h2>{viewOnly ? 'Detail Guru' : (editingId.teachers ? 'Edit Guru' : 'Tambah Guru')}</h2>
                <p>Lengkapi data utama guru.</p>
              </div>
              <button className="ghost" onClick={() => { setShowForm(false); setViewOnly(false); }}>Tutup</button>
            </div>

            <div className="student-modal-preview">
              <div className="student-profile-layout">
                <div className="student-profile-main">
                  <div className="student-profile-heading">TEACHER PROFILE | DATA GURU</div>
                  <div className="student-profile-top">
                    <div className="student-photo-wrap">
                      <div className="student-photo-ring">
                        <div className="student-photo-text">{getInitials(form.teachers.name || 'Guru')}</div>
                      </div>
                    </div>
                    <div className="student-profile-meta">
                      <h2>{form.teachers.name || 'Nama Guru'}</h2>
                      <p>NIY: {form.teachers.niy || '-'} | Mapel {form.teachers.subject || '-'}</p>
                      <div className="student-profile-actions">
                        <button className="btn-profile-edit" type="button" onClick={() => setTeacherFormTab('identity')}>Edit Profil</button>
                        <button className="btn-profile-print" type="button" onClick={() => window.print()}>Cetak Data</button>
                      </div>
                    </div>
                    <div className="student-profile-status">
                      <span className={`status-badge ${teacherStatusClass}`}>{teacherStatusClass === 'aktif' ? 'Aktif' : 'Nonaktif'}</span>
                    </div>
                  </div>

                  <div className="student-profile-cards student-profile-form">
                    <div className="student-modal-tabs">
                      <button className={teacherFormTab === 'identity' ? 'active' : ''} onClick={() => setTeacherFormTab('identity')}>Data Diri</button>
                      <button className={teacherFormTab === 'employment' ? 'active' : ''} onClick={() => setTeacherFormTab('employment')}>Kepegawaian</button>
                      <button className={teacherFormTab === 'education' ? 'active' : ''} onClick={() => setTeacherFormTab('education')}>Pendidikan</button>
                      <button className={teacherFormTab === 'address' ? 'active' : ''} onClick={() => setTeacherFormTab('address')}>Alamat</button>
                    </div>

                    {teacherFormTab === 'identity' && (
                      <div className="student-compact-form">
                        <label>NIY</label>
                        <label>NIK</label>
                        <input disabled={viewOnly} value={form.teachers.niy || ''} onChange={(e) => setField('teachers', 'niy', e.target.value)} />
                        <input disabled={viewOnly} value={form.teachers.nik || ''} onChange={(e) => setField('teachers', 'nik', e.target.value)} />
                        <label className="full">Nama Guru</label>
                        <input className="full" disabled={viewOnly} value={form.teachers.name || ''} onChange={(e) => setField('teachers', 'name', e.target.value)} />
                        <label>Jenis Kelamin</label>
                        <label>Tanggal Lahir</label>
                        <select disabled={viewOnly} value={form.teachers.gender || ''} onChange={(e) => setField('teachers', 'gender', e.target.value)}>
                          <option value="">-</option>
                          <option value="L">Laki-laki</option>
                          <option value="P">Perempuan</option>
                        </select>
                        <input disabled={viewOnly} type="date" value={form.teachers.birth_date || ''} onChange={(e) => setField('teachers', 'birth_date', e.target.value)} />
                        <label className="full">Tempat Lahir</label>
                        <input className="full" disabled={viewOnly} value={form.teachers.birth_place || ''} onChange={(e) => setField('teachers', 'birth_place', e.target.value)} />
                        <label>No HP</label>
                        <label>Email</label>
                        <input disabled={viewOnly} value={form.teachers.phone || ''} onChange={(e) => setField('teachers', 'phone', e.target.value)} />
                        <input disabled={viewOnly} value={form.teachers.email || ''} onChange={(e) => setField('teachers', 'email', e.target.value)} />
                        <label className="full">No KK</label>
                        <input className="full" disabled={viewOnly} value={form.teachers.family_card_number || ''} onChange={(e) => setField('teachers', 'family_card_number', e.target.value)} />
                      </div>
                    )}

                    {teacherFormTab === 'employment' && (
                      <div className="student-compact-form">
                        <label>Klasifikasi</label>
                        <label>Mapel</label>
                        <select disabled={viewOnly} value={form.teachers.classification || ''} onChange={(e) => setField('teachers', 'classification', e.target.value)}>
                          <option value="">-</option>
                          <option value="PNS">PNS</option>
                          <option value="Inpassing">Inpassing</option>
                          <option value="Sertifikasi">Sertifikasi</option>
                          <option value="Non Sertifikasi">Non Sertifikasi</option>
                        </select>
                        <select
                          disabled={viewOnly}
                          value={form.teachers.subject_id || ''}
                          onChange={(e) => {
                            const value = e.target.value;
                            setField('teachers', 'subject_id', value);
                            setField('teachers', 'subject', subjectNameById[value] || '');
                          }}
                        >
                          <option value="">Pilih mapel</option>
                          {subjectOptions.map((subject) => (
                            <option key={subject.id} value={subject.id}>{subject.name}</option>
                          ))}
                        </select>
                        <label>Gelar</label>
                        <label>TMT</label>
                        <input disabled={viewOnly} value={form.teachers.degree || ''} onChange={(e) => setField('teachers', 'degree', e.target.value)} />
                        <input disabled={viewOnly} type="date" value={form.teachers.tmt || ''} onChange={(e) => setField('teachers', 'tmt', e.target.value)} />
                        <label className="full">Tugas Tambahan</label>
                        <select className="full" disabled={viewOnly} value={form.teachers.additional_task || ''} onChange={(e) => setField('teachers', 'additional_task', e.target.value)}>
                          <option value="">Pilih tugas tambahan</option>
                          {additionalTaskOptions.map((name) => (
                            <option key={name} value={name}>{name}</option>
                          ))}
                        </select>
                        <label>Status</label>
                        <span />
                        <select disabled={viewOnly} value={form.teachers.is_active ? '1' : '0'} onChange={(e) => setField('teachers', 'is_active', e.target.value === '1')}>
                          <option value="1">Aktif</option>
                          <option value="0">Nonaktif</option>
                        </select>
                      </div>
                    )}

                    {teacherFormTab === 'education' && (
                      <div className="student-compact-form">
                        <label>S1 Universitas</label>
                        <label>S1 Jurusan</label>
                        <input disabled={viewOnly} value={form.teachers.s1_university || ''} onChange={(e) => setField('teachers', 's1_university', e.target.value)} />
                        <input disabled={viewOnly} value={form.teachers.s1_major || ''} onChange={(e) => setField('teachers', 's1_major', e.target.value)} />
                        <label>S1 Tahun Lulus</label>
                        <span />
                        <input disabled={viewOnly} value={form.teachers.s1_grad_year || ''} onChange={(e) => setField('teachers', 's1_grad_year', e.target.value)} />
                        <span />
                        <label>S2 Universitas</label>
                        <label>S2 Jurusan</label>
                        <input disabled={viewOnly} value={form.teachers.s2_university || ''} onChange={(e) => setField('teachers', 's2_university', e.target.value)} />
                        <input disabled={viewOnly} value={form.teachers.s2_major || ''} onChange={(e) => setField('teachers', 's2_major', e.target.value)} />
                        <label>S2 Tahun Lulus</label>
                        <span />
                        <input disabled={viewOnly} value={form.teachers.s2_grad_year || ''} onChange={(e) => setField('teachers', 's2_grad_year', e.target.value)} />
                        <span />
                        <label className="full">Sertifikat Pendidik</label>
                        <input className="full" disabled={viewOnly} value={form.teachers.educator_certificate || ''} onChange={(e) => setField('teachers', 'educator_certificate', e.target.value)} />
                        <label className="full">Bidang Sertifikat</label>
                        <input className="full" disabled={viewOnly} value={form.teachers.certificate_major || ''} onChange={(e) => setField('teachers', 'certificate_major', e.target.value)} />
                      </div>
                    )}

                    {teacherFormTab === 'address' && (
                      <div className="student-compact-form">
                        <label className="full">Alamat</label>
                        <textarea className="full" disabled={viewOnly} value={form.teachers.address || ''} onChange={(e) => setField('teachers', 'address', e.target.value)} />
                        <label>Kelurahan / Desa</label>
                        <label>Kecamatan</label>
                        <input disabled={viewOnly} value={form.teachers.address_village || ''} onChange={(e) => setField('teachers', 'address_village', e.target.value)} />
                        <input disabled={viewOnly} value={form.teachers.address_subdistrict || ''} onChange={(e) => setField('teachers', 'address_subdistrict', e.target.value)} />
                        <label>Kabupaten / Kota</label>
                        <label>Provinsi</label>
                        <input disabled={viewOnly} value={form.teachers.address_city || ''} onChange={(e) => setField('teachers', 'address_city', e.target.value)} />
                        <input disabled={viewOnly} value={form.teachers.address_province || ''} onChange={(e) => setField('teachers', 'address_province', e.target.value)} />
                      </div>
                    )}
                  </div>
                </div>

                <aside className="student-profile-side">
                  <article className="side-card">
                    <h4>STATISTIK GURU</h4>
                    <div className="stats-mini">
                      <div><span>Total</span><strong>{totalRows}</strong></div>
                      <div><span>Aktif</span><strong>{activeTeachers}</strong></div>
                      <div><span>Mapel</span><strong>{new Set(visibleList.map((teacher) => teacher.subject).filter(Boolean)).size}</strong></div>
                    </div>
                  </article>
                  <article className="side-card">
                    <h4>RINGKASAN</h4>
                    <ul>
                      <li>Klasifikasi: {form.teachers.classification || '-'}</li>
                      <li>Gelar: {form.teachers.degree || '-'}</li>
                      <li>TMT: {form.teachers.tmt || '-'}</li>
                    </ul>
                  </article>
                  <article className="side-card">
                    <h4>DOKUMEN</h4>
                    <div className="doc-grid">
                      {teacherDocItems.map((item) => {
                        const doc = getTeacherDocument(item.type);
                        const isUploading = uploadingDocKey === item.key;
                        return (
                          <div key={item.key} className="doc-item">
                            <button
                              type="button"
                              className="ghost"
                              disabled={isUploading}
                              onClick={() => {
                                if (viewOnly && doc?.file_url) {
                                  window.open(api.resolveFileUrl(doc.file_url), '_blank', 'noopener,noreferrer');
                                } else {
                                  teacherDocInputRefs.current[item.key]?.click();
                                }
                              }}
                            >
                              <input
                                type="file"
                                accept={item.accept}
                                style={{ display: 'none' }}
                                ref={(el) => { teacherDocInputRefs.current[item.key] = el; }}
                                onChange={(e) => handleTeacherDocumentUpload(item, e)}
                              />
                              {isUploading ? 'Uploading...' : item.label}
                            </button>
                            <small className={`doc-meta ${doc?.file_url ? 'ok' : 'pending'}`}>
                              {doc?.file_url ? `Terupload • ${formatDocDate(doc.updated_at || doc.created_at)}` : 'Belum upload'}
                            </small>
                          </div>
                        );
                      })}
                    </div>
                  </article>
                </aside>
              </div>
            </div>

            {!viewOnly && (
              <div className="actions student-form-actions">
                <button className="ghost" onClick={() => { setShowForm(false); setViewOnly(false); }}>Batal</button>
                <button className="primary" onClick={() => submit('teachers')}>
                  {editingId.teachers ? 'Update' : 'Simpan'}
                </button>
                <button className="ghost" onClick={() => resetForm('teachers')}>Reset</button>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
