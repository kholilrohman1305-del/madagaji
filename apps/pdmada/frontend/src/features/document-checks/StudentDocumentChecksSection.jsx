import React, { useEffect, useMemo, useState } from 'react';

const REQUIRED_DOCS = [
  { key: 'kk', label: 'KK', type: 'KK' },
  { key: 'ktp_ortu', label: 'KTP Ortu', type: 'KTP Ortu' },
  { key: 'ijazah_smp_mts', label: 'Ijazah SMP/Mts', type: 'Ijazah SMP/Mts' },
  { key: 'kip', label: 'KIP', type: 'KIP' }
];

function normalizeType(value) {
  return String(value || '').trim().toLowerCase();
}

function getDocDate(doc) {
  return doc?.updated_at || doc?.created_at || '';
}

export function StudentDocumentChecksSection({ api, data, setError, pushToast }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    let alive = true;
    async function loadDocuments() {
      setLoading(true);
      try {
        const rows = await api.studentAffairs.listDocuments('', 'student');
        if (!alive) return;
        setDocuments(Array.isArray(rows) ? rows : []);
      } catch (err) {
        if (!alive) return;
        setDocuments([]);
        setError?.(err.message || 'Gagal memuat dokumen siswa');
        pushToast?.('error', 'Gagal memuat dokumen', err.message || 'Terjadi kesalahan');
      } finally {
        if (alive) setLoading(false);
      }
    }
    loadDocuments();
    return () => { alive = false; };
  }, [api, setError, pushToast]);

  const classNameMap = useMemo(() => {
    const map = {};
    (data.classes || []).forEach((cls) => { map[String(cls.id)] = cls.name || '-'; });
    return map;
  }, [data.classes]);

  const docsByStudent = useMemo(() => {
    const map = {};
    (documents || []).forEach((doc) => {
      if (String(doc.owner_type || '').toLowerCase() !== 'student') return;
      const ownerId = String(doc.owner_id || '');
      if (!ownerId) return;
      const typeKey = normalizeType(doc.document_type);
      if (!map[ownerId]) map[ownerId] = {};
      const prev = map[ownerId][typeKey];
      if (!prev || String(getDocDate(doc)) > String(getDocDate(prev))) {
        map[ownerId][typeKey] = doc;
      }
    });
    return map;
  }, [documents]);

  const rows = useMemo(() => {
    return (data.students || []).map((student) => {
      const sid = String(student.id || '');
      const perStudent = docsByStudent[sid] || {};
      const checklist = REQUIRED_DOCS.map((cfg) => {
        const doc = perStudent[normalizeType(cfg.type)] || null;
        return {
          ...cfg,
          uploaded: Boolean(doc?.file_url),
          fileUrl: doc?.file_url || '',
          date: getDocDate(doc)
        };
      });
      const uploadedCount = checklist.filter((item) => item.uploaded).length;
      return {
        ...student,
        checklist,
        uploadedCount,
        completion: Math.round((uploadedCount / REQUIRED_DOCS.length) * 100)
      };
    });
  }, [data.students, docsByStudent]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = rows;
    if (q) {
      list = list.filter((row) => (
        String(row.name || '').toLowerCase().includes(q) ||
        String(row.nis_local || '').toLowerCase().includes(q) ||
        String(row.nisn || '').toLowerCase().includes(q) ||
        String(classNameMap[String(row.class_id)] || '').toLowerCase().includes(q)
      ));
    }
    if (status === 'complete') list = list.filter((row) => row.uploadedCount === REQUIRED_DOCS.length);
    if (status === 'incomplete') list = list.filter((row) => row.uploadedCount < REQUIRED_DOCS.length);
    return list;
  }, [rows, query, status, classNameMap]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [query, status, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return (
    <section className="student-shell module-shell">
      <div className="student-filter-bar">
        <input
          className="filter"
          placeholder="Cari nama siswa, NIS, NISN, atau kelas..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select className="filter" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">Semua Status</option>
          <option value="complete">Lengkap</option>
          <option value="incomplete">Belum Lengkap</option>
        </select>
      </div>

      <div className="student-meta-bar">
        <span className="pill">Total siswa: {filteredRows.length}</span>
        <div className="student-pagination">
          <button className="ghost" disabled={page <= 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>Prev</button>
          <span>Halaman {page} / {totalPages}</span>
          <button className="ghost" disabled={page >= totalPages} onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}>Next</button>
          <select className="filter" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
        </div>
      </div>

      <div className="table-card student-table-card">
        <div className="student-table document-check-table">
          <div className="student-table-head sticky">
            <span>NIS</span>
            <span>NAMA SISWA</span>
            <span>KELAS</span>
            <span>KK</span>
            <span>KTP ORTU</span>
            <span>IJAZAH SMP/MTS</span>
            <span>KIP</span>
            <span>KELENGKAPAN</span>
          </div>

          {loading && (
            Array.from({ length: 6 }).map((_, idx) => (
              <div className="student-table-row student-skeleton-row" key={`doc-sk-${idx}`}>
                <span className="student-skeleton" />
                <span className="student-skeleton" />
                <span className="student-skeleton" />
                <span className="student-skeleton" />
                <span className="student-skeleton" />
                <span className="student-skeleton" />
                <span className="student-skeleton" />
                <span className="student-skeleton" />
              </div>
            ))
          )}

          {!loading && pagedRows.map((row) => (
            <div className="student-table-row" key={`doc-${row.id}`}>
              <span>{row.nis_local || '-'}</span>
              <span className="student-name">{row.name || '-'}</span>
              <span>{classNameMap[String(row.class_id)] || '-'}</span>
              {row.checklist.map((item) => (
                <span key={`${row.id}-${item.key}`}>
                  {item.uploaded ? (
                    <button
                      type="button"
                      className="doc-check-chip ok"
                      onClick={() => window.open(api.resolveFileUrl(item.fileUrl), '_blank', 'noopener,noreferrer')}
                    >
                      Terupload
                    </button>
                  ) : (
                    <span className="doc-check-chip pending">Belum</span>
                  )}
                </span>
              ))}
              <span>
                <span className={`completion-pill ${row.uploadedCount === REQUIRED_DOCS.length ? 'ok' : 'pending'}`}>
                  {row.uploadedCount}/{REQUIRED_DOCS.length} ({row.completion}%)
                </span>
              </span>
            </div>
          ))}

          {!loading && pagedRows.length === 0 && (
            <div className="student-empty">
              <h4>Data tidak ditemukan</h4>
              <p>Belum ada data siswa yang sesuai filter pencarian.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

