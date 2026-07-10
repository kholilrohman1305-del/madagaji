import { useEffect, useMemo, useState } from 'react';
import api from '../api';
import { UserCheck, Printer } from 'lucide-react';

const DAYS = ['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Minggu'];
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

  const slotTimeByJam = useMemo(() => {
    const map = new Map();
    rows.forEach(r => {
      if (!map.has(String(r.jamKe)) && r.startTime && r.endTime) {
        map.set(String(r.jamKe), `${r.startTime}-${r.endTime}`);
      }
    });
    return map;
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
        // Multi-kelas: guru bisa mengampu 2+ kelas di jam yang sama — kumpulkan semua
        const grid = new Map();
        t.items.forEach(i => {
          const key = `${i.hari}-${i.jamKe}`;
          if (!grid.has(key)) grid.set(key, []);
          grid.get(key).push({
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
                    <th key={i}>
                      <div>Jam {i + 1}</div>
                      {slotTimeByJam.get(String(i + 1)) && (
                        <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, marginTop: 3 }}>
                          {slotTimeByJam.get(String(i + 1))}
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {usedDays.map(d => (
                  <tr key={d}>
                    <th className="teacher-day">{d}</th>
                    {Array.from({ length: maxJam }).map((_, i) => {
                      const jamKe = i + 1;
                      const vals = grid.get(`${d}-${jamKe}`) || [];
                      const first = vals[0];
                      const mapels = [...new Set(vals.map(v => v.mapel))];
                      return (
                        <td key={`${d}-${jamKe}`} className="teacher-cell" style={{ background: subjectColor(first?.mapelId) }}>
                          {first ? (
                            <div className="teacher-cell-content">
                              <div className="teacher-cell-kelas">{vals.map(v => v.kelas).join(', ')}</div>
                              <div className="teacher-cell-mapel">{mapels.join(', ')}</div>
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
