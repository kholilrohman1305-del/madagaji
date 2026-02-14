import { useEffect, useState } from 'react';
import { academicApi } from '../api';

export default function AkademikLanjutan() {
  const [years, setYears] = useState([]);
  const [grades, setGrades] = useState([]);
  const [yearForm, setYearForm] = useState({ name: '', start_date: '', end_date: '', is_active: 0 });
  const [gradeForm, setGradeForm] = useState({ student_id: '', subject_id: '', academic_year_id: '', semester: 1, final_grade: '' });

  const load = async () => {
    const [y, g] = await Promise.all([
      academicApi.get('/academic-years'),
      academicApi.get('/grades')
    ]);
    setYears(y.data || []);
    setGrades(g.data || []);
  };

  useEffect(() => { load(); }, []);

  const saveYear = async (e) => {
    e.preventDefault();
    await academicApi.post('/academic-years', yearForm);
    setYearForm({ name: '', start_date: '', end_date: '', is_active: 0 });
    load();
  };

  const saveGrade = async (e) => {
    e.preventDefault();
    await academicApi.post('/grades', {
      ...gradeForm,
      student_id: Number(gradeForm.student_id),
      subject_id: Number(gradeForm.subject_id),
      academic_year_id: Number(gradeForm.academic_year_id),
      semester: Number(gradeForm.semester),
      final_grade: gradeForm.final_grade ? Number(gradeForm.final_grade) : null
    });
    setGradeForm({ student_id: '', subject_id: '', academic_year_id: '', semester: 1, final_grade: '' });
    load();
  };

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
          <input placeholder="Student ID" value={gradeForm.student_id} onChange={(e) => setGradeForm((p) => ({ ...p, student_id: e.target.value }))} required />
          <input placeholder="Subject ID" value={gradeForm.subject_id} onChange={(e) => setGradeForm((p) => ({ ...p, subject_id: e.target.value }))} required />
          <input placeholder="Academic Year ID" value={gradeForm.academic_year_id} onChange={(e) => setGradeForm((p) => ({ ...p, academic_year_id: e.target.value }))} required />
          <select value={gradeForm.semester} onChange={(e) => setGradeForm((p) => ({ ...p, semester: e.target.value }))}>
            <option value={1}>Semester 1</option>
            <option value={2}>Semester 2</option>
          </select>
          <input placeholder="Nilai Akhir" value={gradeForm.final_grade} onChange={(e) => setGradeForm((p) => ({ ...p, final_grade: e.target.value }))} />
          <button type="submit">Tambah</button>
        </form>
        <table className="table">
          <thead><tr><th>Student</th><th>Subject</th><th>Tahun</th><th>Sem</th><th>Final</th></tr></thead>
          <tbody>{grades.slice(0, 100).map((g) => <tr key={g.id}><td>{g.student_id}</td><td>{g.subject_id}</td><td>{g.academic_year_id}</td><td>{g.semester}</td><td>{g.final_grade ?? '-'}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}
