import { useEffect, useMemo, useState } from 'react';
import api from '../api';
import { CalendarClock, Save, Clock } from 'lucide-react';

const DAYS = ['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Ahad'];

export default function Penjadwalan() {
  const [meta, setMeta] = useState(null);
  const [rows, setRows] = useState([]);
  const [day, setDay] = useState('Senin');
  const [kelasFilter, setKelasFilter] = useState('ALL');
  const [hoursByDay, setHoursByDay] = useState({});
  const [effectiveDays, setEffectiveDays] = useState(DAYS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    Promise.all([
      api.get('/scheduler/meta'),
      api.get('/scheduler/config')
    ]).then(([metaRes, configRes]) => {
      if (!alive) return;
      setMeta(metaRes.data);
      const cfgDays = configRes.data?.days || [];
      const nextDays = cfgDays.length > 0 ? cfgDays : DAYS;
      setEffectiveDays(nextDays);
      setHoursByDay(configRes.data?.hoursByDay || {});
      if (!nextDays.includes(day)) setDay(nextDays[0] || 'Senin');
    }).finally(() => {
      if (alive) setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.get('/schedule', { params: { hari: day, kelas: kelasFilter === 'ALL' ? undefined : kelasFilter } }).then(res => {
      if (!alive) return;
      setRows(res.data || []);
    }).finally(() => {
      if (alive) setLoading(false);
    });
    return () => { alive = false; };
  }, [day, kelasFilter]);

  const hours = Number(hoursByDay[day] || 0);

  const grid = useMemo(() => {
    const map = new Map();
    rows.filter(r => r.hari === day).forEach(r => {
      map.set(`${r.kelas}-${r.jamKe}`, r);
    });
    return map;
  }, [rows, day]);

  const teacherColor = (guruId) => {
    if (!guruId) return 'transparent';
    const str = String(guruId);
    let hash = 0;
    for (let i = 0; i < str.length; i += 1) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
    const hue = hash % 360;
    const sat = 65 + (hash % 25); // 65-89
    const light = 88 - ((hash >> 3) % 14); // 74-88
    return `hsl(${hue} ${sat}% ${light}%)`;
  };

  const visibleClasses = useMemo(() => {
    if (!meta) return [];
    if (kelasFilter === 'ALL') return meta.classes;
    return meta.classes.filter(c => String(c.id) === String(kelasFilter));
  }, [meta, kelasFilter]);

  const updateCell = (classId, jamKe, patch) => {
    const key = `${classId}-${jamKe}`;
    const existing = grid.get(key);
    const next = { ...(existing || { hari: day, jamKe: String(jamKe), kelas: String(classId) }), ...patch };
    setRows(prev => {
      const other = prev.filter(r => !(r.hari === day && r.kelas === String(classId) && String(r.jamKe) === String(jamKe)));
      return [...other, next];
    });
  };

  const saveAll = async () => {
    const toSave = rows.filter(r => r.hari === day && r.mapelId && r.guruId);
    const tasks = toSave.map(r => {
      if (r.id) {
        return api.put(`/schedule/${r.id}`, {
          hari: r.hari,
          jamKe: r.jamKe,
          kelas: r.kelas,
          mapelId: r.mapelId,
          guruId: r.guruId
        });
      }
      return api.post('/schedule', {
        hari: r.hari,
        jamKe: [r.jamKe],
        kelas: r.kelas,
        mapelId: r.mapelId,
        guruId: r.guruId
      });
    });
    await Promise.all(tasks);
    const res = await api.get('/schedule', { params: { hari: day } });
    setRows(res.data || []);
  };

  return (
    <div>
      <div className="modern-table-card">
        <div className="modern-table-title"><CalendarClock size={24} /> Penjadwalan Manual</div>
        <div className="toolbar">
          <select value={day} onChange={e => setDay(e.target.value)}>
            {effectiveDays.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={kelasFilter} onChange={e => setKelasFilter(e.target.value)}>
            <option value="ALL">Semua Kelas</option>
            {meta?.classes?.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: 14 }}>
            <Clock size={18} /> Jam per hari: <strong>{hours || '-'}</strong>
          </div>
          <button className="secondary" onClick={saveAll}>
            <Save size={18} /> Simpan Semua
          </button>
        </div>
      </div>

      <div className="modern-table-card" style={{ marginTop: 24, overflowX: 'auto' }}>
        {(!meta || loading) && (
          <div style={{ padding: 40 }}>
            <div className="skeleton-pulse" style={{ height: 300, borderRadius: 12 }}></div>
          </div>
        )}
        {meta && !loading && (
          <table className="table">
            <thead>
              <tr>
                <th>Kelas</th>
                {Array.from({ length: hours }).map((_, i) => (
                  <th key={i}>Jam {i + 1}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleClasses.map(c => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 700, color: 'var(--primary-700)' }}>{c.name}</td>
                  {Array.from({ length: hours }).map((_, i) => {
                    const jamKe = i + 1;
                    const row = grid.get(`${c.id}-${jamKe}`) || {};
                    return (
                      <td key={`${c.id}-${jamKe}`}>
                        <div style={{ display: 'grid', gap: 8, padding: 8, borderRadius: 10, background: teacherColor(row.guruId) }}>
                          <select value={row.mapelId || ''} onChange={e => updateCell(c.id, jamKe, { mapelId: e.target.value })}>
                            <option value="">Pilih Mapel</option>
                            {meta.subjects.map(s => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                          <select value={row.guruId || ''} onChange={e => updateCell(c.id, jamKe, { guruId: e.target.value })}>
                            <option value="">Pilih Guru</option>
                            {meta.teachers.map(t => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </select>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
