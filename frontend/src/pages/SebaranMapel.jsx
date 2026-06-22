import { useEffect, useState, useMemo } from 'react';
import api from '../api';
import { BookOpen, Eye, FileSpreadsheet, FileText, GraduationCap, Search, Users, X } from 'lucide-react';
import { exportPdf, exportXlsx } from '../utils/reportExport';

const SUBJECT_COLORS = [
  { bg: '#dbeafe', color: '#1e40af' },
  { bg: '#dcfce7', color: '#166534' },
  { bg: '#fef9c3', color: '#854d0e' },
  { bg: '#fce7f3', color: '#9d174d' },
  { bg: '#ede9fe', color: '#4c1d95' },
  { bg: '#ffedd5', color: '#9a3412' },
  { bg: '#cffafe', color: '#155e75' },
  { bg: '#f0fdf4', color: '#14532d' },
];

function buildSummaryRows(classes) {
  return [
    ['No', 'Nama Kelas', 'Wali Kelas', 'Jumlah Siswa', 'Jumlah Mapel'],
    ...classes.map((c, idx) => [
      idx + 1,
      c.className,
      c.homeroomTeacher || '-',
      c.studentCount || 0,
      c.subjectCount || 0,
    ]),
  ];
}

function buildDetailRows(classes) {
  return [
    ['No', 'Nama Kelas', 'Wali Kelas', 'Mata Pelajaran', 'Jam/Minggu', 'Guru Pengampu'],
    ...classes.flatMap((c, classIdx) => {
      if (!c.subjects?.length) {
        return [[classIdx + 1, c.className, c.homeroomTeacher || '-', 'Belum ada mapel', '-', '-']];
      }
      return c.subjects.map((s, subjectIdx) => [
        subjectIdx === 0 ? classIdx + 1 : '',
        c.className,
        c.homeroomTeacher || '-',
        s.subjectName,
        s.hoursPerWeek || 0,
        s.teachers || 'Belum ada jadwal',
      ]);
    }),
  ];
}

export default function SebaranMapel() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selectedClass, setSelectedClass] = useState(null);

  useEffect(() => {
    api.get('/scheduler/sebaran-mapel')
      .then(r => setData(r.data || []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data;
    return data.filter(c =>
      c.className.toLowerCase().includes(q) ||
      (c.homeroomTeacher || '').toLowerCase().includes(q) ||
      (c.subjects || []).some(s =>
        s.subjectName.toLowerCase().includes(q) ||
        (s.teachers || '').toLowerCase().includes(q)
      )
    );
  }, [data, query]);

  const totalSubjects = data.reduce((s, c) => s + (c.subjectCount || 0), 0);
  const totalClasses = data.length;

  const handleExportXlsx = () => {
    exportXlsx('sebaran-mapel.xlsx', [
      { name: 'Ringkasan Kelas', rows: buildSummaryRows(filtered) },
      { name: 'Detail Mapel', rows: buildDetailRows(filtered) },
    ]);
  };

  const handleExportPdf = () => {
    exportPdf('sebaran-mapel.pdf', 'Sebaran Mata Pelajaran', [
      { title: 'Ringkasan Kelas', rows: buildSummaryRows(filtered) },
      { title: 'Detail Mapel Per Kelas', rows: buildDetailRows(filtered) },
    ]);
  };

  return (
    <div>
      <div className="modern-table-card">
        <div className="modern-table-title">
          <BookOpen size={22} /> Sebaran Mata Pelajaran
        </div>

        <div style={{ display: 'flex', gap: 16, marginBottom: 18, flexWrap: 'wrap' }}>
          {[
            { label: 'Total Kelas', value: totalClasses, icon: <GraduationCap size={16} />, bg: '#dbeafe', color: '#1e40af' },
            { label: 'Total Mapel (semua kelas)', value: totalSubjects, icon: <BookOpen size={16} />, bg: '#dcfce7', color: '#166534' },
          ].map(s => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', borderRadius: 10, background: s.bg, color: s.color, fontWeight: 700, fontSize: 14 }}>
              {s.icon} {s.value} <span style={{ fontWeight: 400, fontSize: 12 }}>{s.label}</span>
            </div>
          ))}
        </div>

        <div className="toolbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
            <Search size={16} style={{ color: 'var(--muted)' }} />
            <input
              placeholder="Cari kelas, wali kelas, mapel, atau guru..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{ maxWidth: 360 }}
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
          <div className="skeleton-pulse" style={{ height: 200, borderRadius: 10, marginTop: 8 }} />
        ) : (
          <table className="table" style={{ marginTop: 8 }}>
            <thead>
              <tr>
                <th>No</th>
                <th>Nama Kelas</th>
                <th>Wali Kelas</th>
                <th style={{ textAlign: 'center' }}><Users size={14} style={{ verticalAlign: 'middle' }} /> Siswa</th>
                <th style={{ textAlign: 'center' }}><BookOpen size={14} style={{ verticalAlign: 'middle' }} /> Jumlah Mapel</th>
                <th style={{ textAlign: 'center' }}>Detail</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, idx) => (
                <tr key={c.classId}>
                  <td>{idx + 1}</td>
                  <td style={{ fontWeight: 700 }}>{c.className}</td>
                  <td style={{ color: 'var(--muted)', fontSize: 13 }}>{c.homeroomTeacher}</td>
                  <td style={{ textAlign: 'center' }}>{c.studentCount || '-'}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span style={{ background: '#dbeafe', color: '#1e40af', borderRadius: 20, padding: '2px 10px', fontWeight: 700, fontSize: 13 }}>
                      {c.subjectCount}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button className="btn sm outline" onClick={() => setSelectedClass(c)}>
                      <Eye size={15} /> Detail
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {!loading && filtered.length === 0 && (
          <div className="empty">Tidak ada data kelas.</div>
        )}
      </div>

      {selectedClass && (
        <div className="modal-backdrop">
          <div className="modal" style={{ width: 'min(920px, 100%)' }}>
            <div className="modal-header">
              <h3 className="modal-title"><BookOpen size={22} /> Detail Mapel {selectedClass.className}</h3>
              <button className="modal-close" onClick={() => setSelectedClass(null)}><X size={20} /></button>
            </div>
            <div style={{ display: 'grid', gap: 6, marginBottom: 16, color: 'var(--muted)', fontSize: 13 }}>
              <div><strong style={{ color: 'var(--text)' }}>Wali Kelas:</strong> {selectedClass.homeroomTeacher || '-'}</div>
              <div><strong style={{ color: 'var(--text)' }}>Jumlah Siswa:</strong> {selectedClass.studentCount || 0}</div>
            </div>
            {selectedClass.subjects.length === 0 ? (
              <div className="empty">Belum ada mapel yang ditentukan.</div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>No</th>
                    <th>Mata Pelajaran</th>
                    <th style={{ textAlign: 'center' }}>Jam/Minggu</th>
                    <th>Guru Pengampu</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedClass.subjects.map((s, idx) => {
                    const col = SUBJECT_COLORS[idx % SUBJECT_COLORS.length];
                    return (
                      <tr key={s.subjectId}>
                        <td>{idx + 1}</td>
                        <td>
                          <span style={{ background: col.bg, color: col.color, borderRadius: 6, padding: '4px 10px', fontWeight: 700, fontSize: 12 }}>
                            {s.subjectName}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>{s.hoursPerWeek} jam</td>
                        <td style={{ color: s.teachers ? '#1e293b' : '#94a3b8', fontStyle: s.teachers ? 'normal' : 'italic' }}>
                          {s.teachers || 'Belum ada jadwal'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
