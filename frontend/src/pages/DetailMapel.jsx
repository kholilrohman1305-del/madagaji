import { useEffect, useMemo, useState } from 'react';
import api from '../api';
import { BookOpenCheck, CalendarDays, Clock3, GraduationCap, Search, UserCheck } from 'lucide-react';

const DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

const subjectTone = (value) => {
  const str = String(value || 'subject');
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return {
    bg: `hsl(${hue} 75% 94%)`,
    border: `hsl(${hue} 70% 82%)`,
    color: `hsl(${hue} 70% 30%)`
  };
};

function joinNames(items) {
  return (items || []).map((item) => item.name).filter(Boolean).join(', ') || '-';
}

export default function DetailMapel() {
  const [subjects, setSubjects] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.get('/schedule/subjects/detail')
      .then((res) => {
        if (!alive) return;
        const rows = res.data || [];
        setSubjects(rows);
        setSelectedId((current) => current || rows.find((row) => row.totalSlots > 0)?.subjectId || rows[0]?.subjectId || '');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, []);

  const filteredSubjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return subjects;
    return subjects.filter((subject) =>
      String(subject.subjectName || '').toLowerCase().includes(q) ||
      joinNames(subject.classes).toLowerCase().includes(q) ||
      joinNames(subject.teachers).toLowerCase().includes(q)
    );
  }, [subjects, query]);

  const selected = useMemo(
    () => subjects.find((subject) => String(subject.subjectId) === String(selectedId)) || filteredSubjects[0] || null,
    [subjects, selectedId, filteredSubjects]
  );

  const maxJam = useMemo(() => {
    const max = (selected?.schedules || []).reduce((acc, row) => Math.max(acc, Number(row.jamKe) || 0), 0);
    return Math.max(8, max);
  }, [selected]);

  const matrix = useMemo(() => {
    const map = new Map();
    (selected?.schedules || []).forEach((row) => {
      const key = `${row.hari}-${row.jamKe}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    });
    return map;
  }, [selected]);

  const tone = subjectTone(selected?.subjectId);

  return (
    <div>
      <div className="modern-table-card">
        <div className="modern-table-title">
          <BookOpenCheck size={24} /> Detail Mapel
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Search size={16} style={{ color: 'var(--muted)' }} />
            <input
              placeholder="Cari mapel, kelas, atau guru..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <select value={selected?.subjectId || ''} onChange={(e) => setSelectedId(e.target.value)}>
            {filteredSubjects.map((subject) => (
              <option key={subject.subjectId} value={subject.subjectId}>
                {subject.subjectName} ({subject.totalSlots} slot)
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="skeleton-pulse" style={{ height: 220, borderRadius: 12 }} />
        ) : !selected ? (
          <div className="empty">Belum ada data mapel.</div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 18 }}>
              {[
                { label: 'Total Slot', value: selected.totalSlots, icon: <Clock3 size={17} />, bg: '#dbeafe', color: '#1e40af' },
                { label: 'Kelas Terpakai', value: selected.totalClasses, icon: <GraduationCap size={17} />, bg: '#dcfce7', color: '#166534' },
                { label: 'Pengampu', value: selected.totalTeachers, icon: <UserCheck size={17} />, bg: '#ede9fe', color: '#5b21b6' },
                { label: 'Hari Terjadwal', value: new Set((selected.schedules || []).map((row) => row.hari)).size, icon: <CalendarDays size={17} />, bg: '#fef3c7', color: '#92400e' },
              ].map((item) => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12, background: item.bg, color: item.color }}>
                  {item.icon}
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1 }}>{item.value}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.78 }}>{item.label}</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ border: `1.5px solid ${tone.border}`, borderRadius: 14, padding: 16, background: tone.bg, marginBottom: 18 }}>
              <div style={{ color: tone.color, fontSize: 22, fontWeight: 850, marginBottom: 8 }}>{selected.subjectName}</div>
              <div style={{ display: 'grid', gap: 5, fontSize: 13.5, color: '#334155' }}>
                <div><strong>Kelas:</strong> {joinNames(selected.classes)}</div>
                <div><strong>Guru Pengampu:</strong> {joinNames(selected.teachers)}</div>
              </div>
            </div>

            <div style={{ overflowX: 'auto', marginBottom: 18 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>No</th>
                    <th>Hari</th>
                    <th>Jam</th>
                    <th>Waktu</th>
                    <th>Kelas</th>
                    <th>Pengampu</th>
                  </tr>
                </thead>
                <tbody>
                  {(selected.schedules || []).map((row, idx) => (
                    <tr key={row.id || `${row.hari}-${row.jamKe}-${row.kelasId}-${idx}`}>
                      <td>{idx + 1}</td>
                      <td style={{ fontWeight: 700 }}>{row.hari}</td>
                      <td>Jam {row.jamKe}</td>
                      <td>{row.startTime && row.endTime ? `${row.startTime} - ${row.endTime}` : '-'}</td>
                      <td>{row.kelas}</td>
                      <td>{row.guru}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {selected.schedules.length === 0 && <div className="empty">Mapel ini belum masuk jadwal kelas mana pun.</div>}
            </div>

            <div className="modern-table-title" style={{ fontSize: 16, marginBottom: 10 }}>
              <CalendarDays size={19} /> Matriks Jadwal Mapel
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="teacher-grid">
                <thead>
                  <tr>
                    <th className="teacher-corner"></th>
                    {Array.from({ length: maxJam }).map((_, idx) => (
                      <th key={idx}>Jam {idx + 1}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DAYS.map((day) => (
                    <tr key={day}>
                      <th className="teacher-day">{day}</th>
                      {Array.from({ length: maxJam }).map((_, idx) => {
                        const jamKe = idx + 1;
                        const rows = matrix.get(`${day}-${jamKe}`) || [];
                        return (
                          <td key={`${day}-${jamKe}`} className="teacher-cell" style={{ background: rows.length ? tone.bg : undefined }}>
                            {rows.length > 0 && (
                              <div className="teacher-cell-content">
                                {rows.map((row) => (
                                  <div key={row.id || `${row.kelasId}-${row.guruId}`} style={{ borderBottom: rows.length > 1 ? '1px solid rgba(15,23,42,.08)' : 'none', paddingBottom: rows.length > 1 ? 4 : 0, marginBottom: rows.length > 1 ? 4 : 0 }}>
                                    <div className="teacher-cell-kelas">{row.kelas}</div>
                                    <div className="teacher-cell-mapel">{row.guru}</div>
                                    {row.startTime && row.endTime && (
                                      <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{row.startTime}-{row.endTime}</div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
