import { useEffect, useState, useMemo } from 'react';
import api from '../api';
import { BookOpen, Eye, FileSpreadsheet, FileText, Info, Search, Users, X } from 'lucide-react';
import { exportPdf, exportXlsx } from '../utils/reportExport';

const MAPEL_COLORS = [
  { bg: '#dbeafe', color: '#1e40af', border: '#93c5fd' },
  { bg: '#dcfce7', color: '#166534', border: '#86efac' },
  { bg: '#fef9c3', color: '#854d0e', border: '#fde047' },
  { bg: '#fce7f3', color: '#9d174d', border: '#f9a8d4' },
  { bg: '#ede9fe', color: '#4c1d95', border: '#c4b5fd' },
  { bg: '#ffedd5', color: '#9a3412', border: '#fdba74' },
  { bg: '#cffafe', color: '#155e75', border: '#67e8f9' },
  { bg: '#f0fdf4', color: '#14532d', border: '#86efac' },
];

function countClasses(teacher) {
  return teacher.subjects.reduce((sum, subject) => sum + (subject.classes?.length || 0), 0);
}

function buildSummaryRows(teachers) {
  return [
    ['No', 'Nama Guru', 'Jumlah Mapel', 'Jumlah Sesi Kelas'],
    ...teachers.map((teacher, idx) => [
      idx + 1,
      teacher.teacherName,
      teacher.subjects.length,
      countClasses(teacher),
    ]),
  ];
}

function buildDetailRows(teachers) {
  return [
    ['No', 'Nama Guru', 'Mata Pelajaran', 'Tingkat', 'Kelas'],
    ...teachers.flatMap((teacher, teacherIdx) => {
      if (!teacher.subjects?.length) {
        return [[teacherIdx + 1, teacher.teacherName, 'Belum ada mapel', '-', '-']];
      }
      return teacher.subjects.map((subject, subjectIdx) => [
        subjectIdx === 0 ? teacherIdx + 1 : '',
        teacher.teacherName,
        subject.subjectName,
        subject.tingkat || 'Semua',
        subject.classes?.length ? subject.classes.join(', ') : 'Belum ada kelas yang dijadwalkan',
      ]);
    }),
  ];
}

export default function DetailGuru() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selectedTeacher, setSelectedTeacher] = useState(null);

  useEffect(() => {
    api.get('/scheduler/detail-guru')
      .then(r => setResult(r.data))
      .finally(() => setLoading(false));
  }, []);

  const allSubjects = useMemo(() => {
    if (!result) return [];
    const seen = new Map();
    result.data.forEach(t => t.subjects.forEach(m => {
      if (!seen.has(m.subjectId)) seen.set(m.subjectId, m.subjectName);
    }));
    return Array.from(seen.entries());
  }, [result]);

  const colorMap = useMemo(() => {
    const map = new Map();
    allSubjects.forEach(([id], i) => map.set(id, MAPEL_COLORS[i % MAPEL_COLORS.length]));
    return map;
  }, [allSubjects]);

  const filtered = useMemo(() => {
    if (!result) return [];
    const q = query.trim().toLowerCase();
    if (!q) return result.data;
    return result.data.filter(t =>
      t.teacherName.toLowerCase().includes(q) ||
      t.subjects.some(m =>
        m.subjectName.toLowerCase().includes(q) ||
        (m.tingkat || '').toLowerCase().includes(q) ||
        (m.classes || []).some(cls => cls.toLowerCase().includes(q))
      )
    );
  }, [result, query]);

  const fromJadwal = result?.fromJadwal;
  const totalMapel = allSubjects.length;
  const totalSessions = filtered.reduce((sum, teacher) => sum + countClasses(teacher), 0);

  const handleExportXlsx = () => {
    exportXlsx('detail-jadwal-guru.xlsx', [
      { name: 'Ringkasan Guru', rows: buildSummaryRows(filtered) },
      { name: 'Detail Jadwal', rows: buildDetailRows(filtered) },
    ]);
  };

  const handleExportPdf = () => {
    exportPdf('detail-jadwal-guru.pdf', 'Detail Jadwal Guru', [
      { title: 'Ringkasan Guru', rows: buildSummaryRows(filtered) },
      { title: 'Detail Mapel dan Kelas', rows: buildDetailRows(filtered) },
    ]);
  };

  return (
    <div>
      <div className="modern-table-card">
        <div className="modern-table-title">
          <Users size={22} /> Detail Jadwal Guru
        </div>

        {!loading && !fromJadwal && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 8, background: '#fef9c3', border: '1.5px solid #fde047', marginBottom: 16, fontSize: 13, color: '#854d0e' }}>
            <Info size={15} />
            <span>Jadwal belum di-generate. Menampilkan <strong>pemetaan mapel guru</strong> (bukan jadwal aktual).</span>
          </div>
        )}

        {!loading && (
          <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
            {[
              { label: 'Guru Aktif', value: result?.data?.length || 0, bg: '#dbeafe', color: '#1e40af' },
              { label: 'Jenis Mapel', value: totalMapel, bg: '#dcfce7', color: '#166534' },
              { label: 'Sesi Kelas', value: totalSessions, bg: '#fef9c3', color: '#854d0e' },
            ].map(s => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 8, background: s.bg, color: s.color, fontWeight: 700, fontSize: 13 }}>
                {s.value} <span style={{ fontWeight: 400, fontSize: 12 }}>{s.label}</span>
              </div>
            ))}
          </div>
        )}

        <div className="toolbar" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
            <Search size={16} style={{ color: 'var(--muted)' }} />
            <input
              placeholder="Cari nama guru, mapel, tingkat, atau kelas..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{ maxWidth: 380 }}
            />
          </div>
          <button className="btn sm outline" onClick={handleExportXlsx} disabled={loading || filtered.length === 0}>
            <FileSpreadsheet size={16} /> Export XLSX
          </button>
          <button className="btn sm outline" onClick={handleExportPdf} disabled={loading || filtered.length === 0}>
            <FileText size={16} /> Export PDF
          </button>
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="skeleton-pulse" style={{ height: 64, borderRadius: 12 }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            {query ? 'Guru tidak ditemukan.' : 'Belum ada data guru.'}
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>No</th>
                <th>Nama Guru</th>
                <th>Mapel</th>
                <th style={{ textAlign: 'center' }}>Sesi Kelas</th>
                <th style={{ textAlign: 'center' }}>Detail</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((teacher, idx) => (
                <tr key={teacher.teacherId}>
                  <td>{idx + 1}</td>
                  <td style={{ fontWeight: 700 }}>{teacher.teacherName}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {teacher.subjects.slice(0, 4).map((m, i) => {
                        const col = colorMap.get(m.subjectId) || MAPEL_COLORS[i % MAPEL_COLORS.length];
                        return (
                          <span key={m.subjectId} style={{ background: col.bg, color: col.color, border: `1px solid ${col.border}`, borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>
                            {m.subjectName}
                          </span>
                        );
                      })}
                      {teacher.subjects.length > 4 && (
                        <span style={{ background: '#f1f5f9', color: '#64748b', borderRadius: 20, padding: '2px 8px', fontSize: 11 }}>+{teacher.subjects.length - 4}</span>
                      )}
                    </div>
                  </td>
                  <td style={{ textAlign: 'center' }}>{countClasses(teacher)}</td>
                  <td style={{ textAlign: 'center' }}>
                    <button className="btn sm outline" onClick={() => setSelectedTeacher(teacher)}>
                      <Eye size={15} /> Detail
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selectedTeacher && (
        <div className="modal-backdrop">
          <div className="modal" style={{ width: 'min(920px, 100%)' }}>
            <div className="modal-header">
              <h3 className="modal-title"><Users size={22} /> Detail {selectedTeacher.teacherName}</h3>
              <button className="modal-close" onClick={() => setSelectedTeacher(null)}><X size={20} /></button>
            </div>
            <div style={{ display: 'grid', gap: 6, marginBottom: 16, color: 'var(--muted)', fontSize: 13 }}>
              <div><strong style={{ color: 'var(--text)' }}>Jumlah Mapel:</strong> {selectedTeacher.subjects.length}</div>
              <div><strong style={{ color: 'var(--text)' }}>Sesi Kelas:</strong> {countClasses(selectedTeacher)}</div>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>No</th>
                  <th>Mata Pelajaran</th>
                  <th>Tingkat</th>
                  <th>Kelas</th>
                  <th style={{ textAlign: 'center' }}>Jumlah Kelas</th>
                </tr>
              </thead>
              <tbody>
                {selectedTeacher.subjects.map((subject, idx) => {
                  const col = colorMap.get(subject.subjectId) || MAPEL_COLORS[idx % MAPEL_COLORS.length];
                  return (
                    <tr key={subject.subjectId}>
                      <td>{idx + 1}</td>
                      <td>
                        <span style={{ background: col.bg, color: col.color, border: `1px solid ${col.border}`, borderRadius: 20, padding: '4px 10px', fontSize: 12, fontWeight: 700 }}>
                          {subject.subjectName}
                        </span>
                      </td>
                      <td>{subject.tingkat || 'Semua'}</td>
                      <td>
                        {subject.classes?.length ? (
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {subject.classes.map(cls => (
                              <span key={cls} style={{ background: '#f8fafc', color: '#334155', border: '1.5px solid #cbd5e1', borderRadius: 8, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>
                                {cls}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Belum ada kelas yang dijadwalkan</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>{subject.classes?.length || 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
