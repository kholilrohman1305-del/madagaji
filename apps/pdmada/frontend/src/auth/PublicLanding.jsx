import React from 'react';
import { api } from '../api.js';

const QUICK_LINKS = [
  { key: 'students', label: 'Data Siswa', icon: '🎓' },
  { key: 'teachers', label: 'Data Guru', icon: '👨‍🏫' },
  { key: 'subjects', label: 'Mata Pelajaran', icon: '📘' },
  { key: 'classes', label: 'Rombel / Kelas', icon: '🏫' }
];

function normalize(text) {
  return String(text || '').toLowerCase().trim();
}

export function PublicLanding({ onOpenLogin }) {
  const [loading, setLoading] = React.useState(true);
  const [keyword, setKeyword] = React.useState('');
  const [scope, setScope] = React.useState('all');
  const [school, setSchool] = React.useState(null);
  const [stats, setStats] = React.useState({ students: 0, teachers: 0, subjects: 0, classes: 0 });
  const [records, setRecords] = React.useState({ students: [], teachers: [], subjects: [], classes: [] });
  const [selectedStudent, setSelectedStudent] = React.useState(null);

  React.useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      try {
        const [schoolSettings, students, teachers, subjects, classes] = await Promise.all([
          api.schoolSettings.get().catch(() => null),
          api.students.list().catch(() => []),
          api.teachers.list().catch(() => []),
          api.subjects.list().catch(() => []),
          api.classes.list().catch(() => [])
        ]);
        if (!mounted) return;
        setSchool(schoolSettings || null);
        setStats({
          students: students.length,
          teachers: teachers.length,
          subjects: subjects.length,
          classes: classes.length
        });
        setRecords({ students, teachers, subjects, classes });
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const searchable = React.useMemo(() => {
    const students = (records.students || []).map((row) => ({
      id: row.id,
      raw: row,
      type: 'Siswa',
      title: row.name || '-',
      subtitle: [row.nis_local, row.nisn, row.student_status].filter(Boolean).join(' • ')
    }));
    const teachers = (records.teachers || []).map((row) => ({
      type: 'Guru',
      title: row.name || '-',
      subtitle: [row.niy, row.subject].filter(Boolean).join(' • ')
    }));
    const subjects = (records.subjects || []).map((row) => ({
      type: 'Mapel',
      title: row.name || '-',
      subtitle: [row.grade_level, row.curriculum].filter(Boolean).join(' • ')
    }));
    const classes = (records.classes || []).map((row) => ({
      type: 'Kelas',
      title: row.name || '-',
      subtitle: [row.homeroom_teacher, row.school_year_name].filter(Boolean).join(' • ')
    }));
    return { students, teachers, subjects, classes };
  }, [records]);

  const results = React.useMemo(() => {
    const q = normalize(keyword);
    if (!q) return [];
    const source = scope === 'all'
      ? [...searchable.students, ...searchable.teachers, ...searchable.subjects, ...searchable.classes]
      : searchable[scope] || [];
    return source
      .filter((item) => normalize(`${item.title} ${item.subtitle}`).includes(q))
      .slice(0, 8);
  }, [keyword, scope, searchable]);

  const schoolName = school?.school_name || 'Sistem Data Madrasah';
  const schoolSub = school?.school_subtitle || 'Pencarian data internal madrasah';
  const classMap = React.useMemo(
    () => Object.fromEntries((records.classes || []).map((row) => [String(row.id), row.name])),
    [records.classes]
  );

  return (
    <main className="landing-shell">
      <header className="landing-topbar">
        <div className="landing-brand">
          <div className="landing-brand-badge">S</div>
          <div>
            <strong>{schoolName}</strong>
            <small>{schoolSub}</small>
          </div>
        </div>
        <button className="btn-login-public" type="button" onClick={onOpenLogin}>
          Login
        </button>
      </header>

      <section className="landing-hero">
        <div className="landing-hero-copy">
          <p className="landing-eyebrow">Informasi Data Madrasah</p>
          <h1>Pusat Pencarian Data Akademik</h1>
          <p>Cari siswa, guru, mata pelajaran, dan rombel secara cepat sebelum masuk ke dashboard.</p>
        </div>
      </section>

      <section className="landing-search-wrap">
        <div className="landing-search">
          <select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="all">Semua</option>
            <option value="students">Siswa</option>
            <option value="teachers">Guru</option>
            <option value="subjects">Mapel</option>
            <option value="classes">Kelas</option>
          </select>
          <input
            type="text"
            placeholder="Cari kata kunci: nama siswa, guru, mapel, kelas..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <button type="button" onClick={onOpenLogin}>Masuk</button>
        </div>
        {keyword.trim() && (
          <div className="landing-search-results">
            {results.length ? results.map((item, idx) => (
              <button
                type="button"
                key={`${item.type}-${item.title}-${idx}`}
                className="landing-result-item"
                onClick={() => {
                  if (item.type === 'Siswa' && item.raw) setSelectedStudent(item.raw);
                }}
              >
                <span>{item.type}</span>
                <strong>{item.title}</strong>
                <small>{item.subtitle || '-'}</small>
              </button>
            )) : <div className="landing-result-empty">Data tidak ditemukan.</div>}
          </div>
        )}
      </section>

      {selectedStudent && (
        <section className="landing-student-detail-wrap">
          <div className="landing-student-breadcrumb">
            Beranda <span>›</span> Siswa <span>›</span> Detail
          </div>
          <div className="landing-student-title">Biodata Siswa</div>
          <div className="landing-student-detail">
            <div>
              <label>Nama</label>
              <strong>{selectedStudent.name || '-'}</strong>
            </div>
            <div>
              <label>Nama Madrasah</label>
              <strong>{schoolName}</strong>
            </div>
            <div>
              <label>Jenis Kelamin</label>
              <strong>{selectedStudent.gender || '-'}</strong>
            </div>
            <div>
              <label>Tanggal Masuk</label>
              <strong>{selectedStudent.entry_date || '-'}</strong>
            </div>
            <div>
              <label>NIS</label>
              <strong>{selectedStudent.nis_local || '-'}</strong>
            </div>
            <div>
              <label>Kelas</label>
              <strong>{classMap[String(selectedStudent.class_id)] || '-'}</strong>
            </div>
            <div>
              <label>Status Siswa</label>
              <strong>{selectedStudent.student_status || '-'}</strong>
            </div>
            <div>
              <label>TTL</label>
              <strong>{[selectedStudent.birth_place, selectedStudent.birth_date].filter(Boolean).join(', ') || '-'}</strong>
            </div>
          </div>
          <div className="landing-student-info">
            Data diambil dari database internal madrasah. Untuk akses lengkap dan perubahan data, masuk ke dashboard.
          </div>
        </section>
      )}

      <section className="landing-cards">
        {QUICK_LINKS.map((card) => (
          <article key={card.key} className="landing-card">
            <div className="landing-card-icon">{card.icon}</div>
            <h3>{card.label}</h3>
            <p>{loading ? '...' : `${stats[card.key]} data`}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
