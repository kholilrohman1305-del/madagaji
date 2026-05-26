import React, { useEffect, useMemo, useState } from 'react';

export function RolePortal({ api, session, onLogout }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [teachers, setTeachers] = useState([]);
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [scores, setScores] = useState([]);
  const [achievements, setAchievements] = useState([]);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const [teachersRows, classesRows, studentsRows] = await Promise.all([
          api.teachers.list(),
          api.classes.list(),
          api.students.list()
        ]);
        if (!active) return;
        setTeachers(teachersRows || []);
        setClasses(classesRows || []);
        setStudents(studentsRows || []);

        if (session.role === 'siswa' && session.ref_id) {
          const [scoreRows, achRows] = await Promise.all([
            api.studentScores.list({ studentId: session.ref_id }),
            api.studentAffairs.listAchievements(session.ref_id)
          ]);
          if (!active) return;
          setScores(scoreRows || []);
          setAchievements(achRows || []);
        }
      } catch (err) {
        if (!active) return;
        setError(err.message || 'Gagal memuat data akun.');
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [session.id, session.role, session.ref_id]);

  const teacherProfile = useMemo(
    () => teachers.find((t) => Number(t.id) === Number(session.ref_id)) || null,
    [teachers, session.ref_id]
  );
  const classProfile = useMemo(() => {
    if (session.role === 'wali_kelas') {
      if (session.ref_type === 'class') return classes.find((c) => Number(c.id) === Number(session.ref_id)) || null;
      if (session.ref_type === 'teacher') return classes.find((c) => Number(c.homeroom_teacher_id) === Number(session.ref_id)) || null;
      if (teacherProfile?.name) return classes.find((c) => String(c.homeroom_teacher || '').toLowerCase() === String(teacherProfile.name || '').toLowerCase()) || null;
    }
    return null;
  }, [session.role, session.ref_type, session.ref_id, classes, teacherProfile]);
  const studentProfile = useMemo(
    () => students.find((s) => Number(s.id) === Number(session.ref_id)) || null,
    [students, session.ref_id]
  );

  const roleLabel = session.role === 'wali_kelas'
    ? 'Wali Kelas'
    : session.role === 'guru'
      ? 'Guru'
      : 'Siswa';

  const waliStudents = useMemo(() => {
    if (!classProfile) return [];
    return students.filter((s) => Number(s.class_id) === Number(classProfile.id) && String(s.student_status || '').toLowerCase() === 'aktif');
  }, [students, classProfile]);

  return (
    <main className="role-shell">
      <header className="role-topbar">
        <div>
          <h1>Portal {roleLabel}</h1>
          <p>Selamat datang, {session.username}</p>
        </div>
        <button className="ghost" onClick={onLogout}>Logout</button>
      </header>

      {loading && <div className="role-card">Memuat data akun...</div>}
      {error && <div className="role-card role-error">{error}</div>}

      {!loading && !error && session.role === 'guru' && (
        <section className="role-grid">
          <article className="role-card">
            <h3>Profil Guru</h3>
            <p>Nama: {teacherProfile?.name || '-'}</p>
            <p>NIY: {teacherProfile?.niy || '-'}</p>
            <p>Mapel: {teacherProfile?.subject || '-'}</p>
          </article>
        </section>
      )}

      {!loading && !error && session.role === 'wali_kelas' && (
        <section className="role-grid">
          <article className="role-card">
            <h3>Data Wali Kelas</h3>
            <p>Kelas: {classProfile?.name || '-'}</p>
            <p>Wali: {classProfile?.homeroom_teacher || teacherProfile?.name || '-'}</p>
            <p>Jumlah siswa aktif: {waliStudents.length}</p>
          </article>
          <article className="role-card">
            <h3>Daftar Siswa Kelas</h3>
            <div className="role-list">
              {waliStudents.map((s) => <div key={s.id}>{s.name} ({s.nis_local || '-'})</div>)}
              {!waliStudents.length && <div>Tidak ada siswa aktif.</div>}
            </div>
          </article>
        </section>
      )}

      {!loading && !error && session.role === 'siswa' && (
        <section className="role-grid">
          <article className="role-card">
            <h3>Profil Siswa</h3>
            <p>Nama: {studentProfile?.name || '-'}</p>
            <p>NIS: {studentProfile?.nis_local || '-'}</p>
            <p>Kelas: {classes.find((c) => Number(c.id) === Number(studentProfile?.class_id))?.name || '-'}</p>
          </article>
          <article className="role-card">
            <h3>Ringkasan Nilai</h3>
            <p>Total nilai: {scores.length}</p>
            <p>Rata-rata: {scores.length ? (scores.reduce((sum, row) => sum + Number(row.score_value || 0), 0) / scores.length).toFixed(2) : '-'}</p>
          </article>
          <article className="role-card">
            <h3>Prestasi</h3>
            <div className="role-list">
              {achievements.map((row) => <div key={row.id}>{row.title} ({row.level_name || '-'})</div>)}
              {!achievements.length && <div>Belum ada prestasi.</div>}
            </div>
          </article>
        </section>
      )}
    </main>
  );
}
