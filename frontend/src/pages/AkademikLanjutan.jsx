import { useEffect, useMemo, useState } from 'react';
import api, { academicApi } from '../api';
import { toast } from '../utils/toast';

export default function AkademikLanjutan() {
  const [years, setYears] = useState([]);
  const [grades, setGrades] = useState([]);
  const [students, setStudents] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [yearForm, setYearForm] = useState({ name: '', start_date: '', end_date: '', is_active: 0 });
  const [gradeForm, setGradeForm] = useState({
    student_id: '',
    subject_id: '',
    academic_year_id: '',
    semester: 1,
    uh1: '',
    uh2: '',
    uts: '',
    uas: '',
    final_grade: ''
  });
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const load = async () => {
    const [y, g, s, m] = await Promise.all([
      academicApi.get('/academic-years'),
      academicApi.get('/grades'),
      api.get('/master/students'),
      api.get('/master/subjects')
    ]);
    setYears(y.data || []);
    setGrades(g.data || []);
    setStudents(s.data || []);
    setSubjects(m.data || []);
  };

  useEffect(() => { load(); }, []);

  const saveYear = async (e) => {
    e.preventDefault();
    if (yearForm.start_date && yearForm.end_date && yearForm.end_date < yearForm.start_date) {
      toast.error('Tanggal selesai tidak boleh lebih kecil dari tanggal mulai.');
      return;
    }
    await academicApi.post('/academic-years', yearForm);
    setYearForm({ name: '', start_date: '', end_date: '', is_active: 0 });
    load();
  };

  const sanitizeScore = (v) => {
    if (v === '' || v === null || v === undefined) return null;
    const n = Number(v);
    if (Number.isNaN(n) || n < 0 || n > 100) return '__INVALID__';
    return n;
  };

  const saveGrade = async (e) => {
    e.preventDefault();
    if (!gradeForm.student_id || !gradeForm.subject_id || !gradeForm.academic_year_id) {
      toast.error('Siswa, mapel, dan tahun ajaran wajib diisi.');
      return;
    }
    const uh1 = sanitizeScore(gradeForm.uh1);
    const uh2 = sanitizeScore(gradeForm.uh2);
    const uts = sanitizeScore(gradeForm.uts);
    const uas = sanitizeScore(gradeForm.uas);
    const final_grade = sanitizeScore(gradeForm.final_grade);
    if ([uh1, uh2, uts, uas, final_grade].includes('__INVALID__')) {
      toast.error('Nilai harus berada di rentang 0-100.');
      return;
    }
    await academicApi.post('/grades', {
      ...gradeForm,
      student_id: Number(gradeForm.student_id),
      subject_id: Number(gradeForm.subject_id),
      academic_year_id: Number(gradeForm.academic_year_id),
      semester: Number(gradeForm.semester),
      uh1,
      uh2,
      uts,
      uas,
      final_grade
    });
    setGradeForm({
      student_id: '',
      subject_id: '',
      academic_year_id: '',
      semester: 1,
      uh1: '',
      uh2: '',
      uts: '',
      uas: '',
      final_grade: ''
    });
    load();
  };

  const studentMap = useMemo(() => Object.fromEntries(students.map((s) => [String(s.id), s.full_name])), [students]);
  const subjectMap = useMemo(() => Object.fromEntries(subjects.map((s) => [String(s.id), s.name])), [subjects]);
  const yearMap = useMemo(() => Object.fromEntries(years.map((y) => [String(y.id), y.name])), [years]);

  const filteredGrades = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return grades;
    return grades.filter((g) => {
      const studentName = studentMap[String(g.student_id)] || '';
      const subjectName = subjectMap[String(g.subject_id)] || '';
      const yearName = yearMap[String(g.academic_year_id)] || '';
      return (
        studentName.toLowerCase().includes(term) ||
        subjectName.toLowerCase().includes(term) ||
        yearName.toLowerCase().includes(term) ||
        String(g.semester).includes(term)
      );
    });
  }, [grades, q, studentMap, subjectMap, yearMap]);

  const totalPages = Math.max(1, Math.ceil(filteredGrades.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageData = filteredGrades.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="modern-table-card">
        <div className="modern-table-title">Akademik - Tahun Ajaran</div>
        <form className="toolbar" onSubmit={saveYear}>
          <input placeholder="Nama (2026/2027)" value={yearForm.name} onChange={(e) => setYearForm((p) => ({ ...p, name: e.target.value }))} required />
          <input type="date" value={yearForm.start_date} onChange={(e) => setYearForm((p) => ({ ...p, start_date: e.target.value }))} />
          <input type="date" value={yearForm.end_date} onChange={(e) => setYearForm((p) => ({ ...p, end_date: e.target.value }))} />
          <select value={yearForm.is_active} onChange={(e) => setYearForm((p) => ({ ...p, is_active: Number(e.target.value) }))}>
            <option value={0}>Nonaktif</option>
            <option value={1}>Aktif</option>
          </select>
          <button type="submit">Tambah</button>
        </form>
        <table className="table">
          <thead><tr><th>Nama</th><th>Mulai</th><th>Selesai</th><th>Aktif</th></tr></thead>
          <tbody>{years.map((y) => <tr key={y.id}><td>{y.name}</td><td>{y.start_date?.slice?.(0, 10) || '-'}</td><td>{y.end_date?.slice?.(0, 10) || '-'}</td><td>{y.is_active ? 'Ya' : 'Tidak'}</td></tr>)}</tbody>
        </table>
      </div>

      <div className="modern-table-card">
        <div className="modern-table-title">Akademik - Nilai</div>
        <form className="toolbar" onSubmit={saveGrade}>
          <select value={gradeForm.student_id} onChange={(e) => setGradeForm((p) => ({ ...p, student_id: e.target.value }))} required>
            <option value="">Pilih Siswa</option>
            {students.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
          <select value={gradeForm.subject_id} onChange={(e) => setGradeForm((p) => ({ ...p, subject_id: e.target.value }))} required>
            <option value="">Pilih Mapel</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={gradeForm.academic_year_id} onChange={(e) => setGradeForm((p) => ({ ...p, academic_year_id: e.target.value }))} required>
            <option value="">Pilih Tahun Ajaran</option>
            {years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
          </select>
          <select value={gradeForm.semester} onChange={(e) => setGradeForm((p) => ({ ...p, semester: e.target.value }))}>
            <option value={1}>Semester 1</option>
            <option value={2}>Semester 2</option>
          </select>
          <input placeholder="UH1" value={gradeForm.uh1} onChange={(e) => setGradeForm((p) => ({ ...p, uh1: e.target.value }))} />
          <input placeholder="UH2" value={gradeForm.uh2} onChange={(e) => setGradeForm((p) => ({ ...p, uh2: e.target.value }))} />
          <input placeholder="UTS" value={gradeForm.uts} onChange={(e) => setGradeForm((p) => ({ ...p, uts: e.target.value }))} />
          <input placeholder="UAS" value={gradeForm.uas} onChange={(e) => setGradeForm((p) => ({ ...p, uas: e.target.value }))} />
          <input placeholder="Nilai Akhir" value={gradeForm.final_grade} onChange={(e) => setGradeForm((p) => ({ ...p, final_grade: e.target.value }))} required />
          <button type="submit">Tambah</button>
        </form>
        <div className="toolbar" style={{ justifyContent: 'space-between' }}>
          <div className="empty">Gunakan filter untuk cari nilai siswa.</div>
          <input placeholder="Cari siswa/mapel/tahun..." value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} style={{ maxWidth: 280 }} />
        </div>
        <table className="table">
          <thead><tr><th>Siswa</th><th>Mapel</th><th>Tahun</th><th>Sem</th><th>Final</th></tr></thead>
          <tbody>{pageData.map((g) => <tr key={g.id}><td>{studentMap[String(g.student_id)] || g.student_id}</td><td>{subjectMap[String(g.subject_id)] || g.subject_id}</td><td>{yearMap[String(g.academic_year_id)] || g.academic_year_id}</td><td>{g.semester}</td><td>{g.final_grade ?? '-'}</td></tr>)}</tbody>
        </table>
        {filteredGrades.length > 0 && (
          <div className="toolbar" style={{ justifyContent: 'flex-end' }}>
            <button className="outline" onClick={() => setPage(Math.max(1, safePage - 1))} disabled={safePage === 1}>Sebelumnya</button>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>Halaman {safePage} / {totalPages}</div>
            <button className="outline" onClick={() => setPage(Math.min(totalPages, safePage + 1))} disabled={safePage === totalPages}>Berikutnya</button>
          </div>
        )}
      </div>
    </div>
  );
}
