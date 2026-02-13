import { useEffect, useMemo, useState } from 'react';
import api from '../api';
import { UserCheck, Printer } from 'lucide-react';

const DAYS = ['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Ahad'];
const subjectColor = (subjectId) => {
  if (!subjectId) return 'transparent';
  const str = String(subjectId);
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) hash = (hash * 33 + str.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  const sat = 60 + (hash % 30); // 60-89
  const light = 90 - ((hash >> 4) % 18); // 72-90
  return `hsl(${hue} ${sat}% ${light}%)`;
};

export default function JadwalGuru() {
  const [meta, setMeta] = useState(null);
  const [rows, setRows] = useState([]);
  const [effectiveDays, setEffectiveDays] = useState(DAYS);
  const [query, setQuery] = useState('');
  useEffect(() => {
    api.get('/scheduler/meta').then(res => setMeta(res.data));
    api.get('/schedule').then(res => setRows(res.data || []));
    api.get('/scheduler/config').then(res => {
      const cfgDays = res.data?.days || [];
      setEffectiveDays(cfgDays.length > 0 ? cfgDays : DAYS);
    });
  }, []);
  
  const applyPrintSize = () => {
    const styleId = 'print-size-style';
    const existing = document.getElementById(styleId);
    const css = '@page { size: 33cm 21.5cm; margin: 10mm; }';
    if (existing) {
      existing.textContent = css;
      return;
    }
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = css;
    document.head.appendChild(style);
  };

  const byTeacher = useMemo(() => {
    if (!meta) return [];
    const map = new Map();
    rows.forEach(r => {
      if (!map.has(r.guruId)) map.set(r.guruId, []);
      map.get(r.guruId).push(r);
    });
    return meta.teachers.map(t => ({
      id: t.id,
      name: t.name,
      items: (map.get(String(t.id)) || []).sort((a,b) => a.hari.localeCompare(b.hari) || Number(a.jamKe) - Number(b.jamKe))
    }));
  }, [meta, rows]);

  const filteredTeachers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return byTeacher;
    return byTeacher.filter(t => String(t.name || '').toLowerCase().includes(q));
  }, [byTeacher, query]);

  const maxJam = useMemo(() => {
    const max = rows.reduce((m, r) => Math.max(m, Number(r.jamKe) || 0), 0);
    return Math.max(8, max || 0);
  }, [rows]);

  const kelasNameById = useMemo(() => {
    const map = new Map();
    (meta?.classes || []).forEach(c => map.set(String(c.id), c.name));
    return map;
  }, [meta]);

  const subjectNameById = useMemo(() => {
    const map = new Map();
    (meta?.subjects || []).forEach(s => map.set(String(s.id), s.name));
    return map;
  }, [meta]);

  return (
    <div>
      <div className="modern-table-card no-print">
        <div className="modern-table-title"><UserCheck size={24} /> Jadwal Guru</div>
        <div className="toolbar">
          <input
            placeholder="Cari guru..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{ maxWidth: 240 }}
          />
          <button onClick={() => { applyPrintSize(); window.print(); }}>
            <Printer size={18} /> Cetak PDF
          </button>
        </div>
      </div>

      {filteredTeachers.map(t => {
        const grid = new Map();
        t.items.forEach(i => {
          grid.set(`${i.hari}-${i.jamKe}`, {
            kelas: kelasNameById.get(String(i.kelas)) || i.kelas,
            mapel: subjectNameById.get(String(i.mapelId)) || i.mapelId,
            mapelId: i.mapelId
          });
        });
        const usedDays = effectiveDays.length > 0 ? effectiveDays : DAYS;
        return (
          <div key={t.id} className="teacher-sheet">
            <div className="teacher-header">
              <div className="teacher-title">{t.name}</div>
              <div className="teacher-sub">Jadwal Mengajar</div>
            </div>
            <table className="teacher-grid">
              <thead>
                <tr>
                  <th className="teacher-corner"></th>
                  {Array.from({ length: maxJam }).map((_, i) => (
                    <th key={i}>Jam {i + 1}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {usedDays.map(d => (
                  <tr key={d}>
                    <th className="teacher-day">{d}</th>
                    {Array.from({ length: maxJam }).map((_, i) => {
                      const jamKe = i + 1;
                      const val = grid.get(`${d}-${jamKe}`);
                      return (
                        <td key={`${d}-${jamKe}`} className="teacher-cell" style={{ background: subjectColor(val?.mapelId) }}>
                          {val ? (
                            <div className="teacher-cell-content">
                              <div className="teacher-cell-kelas">{val.kelas}</div>
                              <div className="teacher-cell-mapel">{val.mapel}</div>
                            </div>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
