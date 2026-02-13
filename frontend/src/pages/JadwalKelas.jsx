import { useEffect, useMemo, useState } from 'react';
import api from '../api';
import { GraduationCap, Printer } from 'lucide-react';

const DAYS = ['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Ahad'];
const subjectColor = (subjectId) => {
  if (!subjectId) return 'transparent';
  const str = String(subjectId);
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) hash = (hash * 33 + str.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  const sat = 60 + (hash % 30);
  const light = 90 - ((hash >> 4) % 18);
  return `hsl(${hue} ${sat}% ${light}%)`;
};

export default function JadwalKelas() {
  const [meta, setMeta] = useState(null);
  const [rows, setRows] = useState([]);
  const [effectiveDays, setEffectiveDays] = useState(DAYS);
  const [kelasFilter, setKelasFilter] = useState('ALL');
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

  const byClass = useMemo(() => {
    if (!meta) return [];
    const map = new Map();
    rows.forEach(r => {
      if (!map.has(r.kelas)) map.set(r.kelas, []);
      map.get(r.kelas).push(r);
    });
    return meta.classes.map(c => ({
      id: c.id,
      name: c.name,
      items: (map.get(String(c.id)) || []).sort((a,b) => a.hari.localeCompare(b.hari) || Number(a.jamKe) - Number(b.jamKe))
    }));
  }, [meta, rows]);

  const filteredClasses = useMemo(() => {
    if (kelasFilter === 'ALL') return byClass;
    return byClass.filter(c => String(c.id) === String(kelasFilter));
  }, [byClass, kelasFilter]);

  const maxJam = useMemo(() => {
    const max = rows.reduce((m, r) => Math.max(m, Number(r.jamKe) || 0), 0);
    return Math.max(8, max || 0);
  }, [rows]);

  const guruNameById = useMemo(() => {
    const map = new Map();
    (meta?.teachers || []).forEach(t => map.set(String(t.id), t.name));
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
        <div className="modern-table-title"><GraduationCap size={24} /> Jadwal Kelas</div>
        <div className="toolbar">
          <select value={kelasFilter} onChange={e => setKelasFilter(e.target.value)}>
            <option value="ALL">Semua Kelas</option>
            {meta?.classes?.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button onClick={() => { applyPrintSize(); window.print(); }}>
            <Printer size={18} /> Cetak PDF
          </button>
        </div>
      </div>

      {filteredClasses.map(c => {
        const grid = new Map();
        c.items.forEach(i => {
          grid.set(`${i.hari}-${i.jamKe}`, {
            mapel: subjectNameById.get(String(i.mapelId)) || i.mapelId,
            guru: guruNameById.get(String(i.guruId)) || i.guruId,
            mapelId: i.mapelId
          });
        });
        const usedDays = effectiveDays.length > 0 ? effectiveDays : DAYS;
        return (
          <div key={c.id} className="teacher-sheet">
            <div className="teacher-header">
              <div className="teacher-title">{c.name}</div>
              <div className="teacher-sub">Jadwal Kelas</div>
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
                              <div className="teacher-cell-kelas">{val.mapel}</div>
                              <div className="teacher-cell-mapel">{val.guru}</div>
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
