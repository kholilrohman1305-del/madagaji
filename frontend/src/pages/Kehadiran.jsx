import { useEffect, useMemo, useState } from 'react';
import api from '../api';
import useMasterData from '../hooks/useMasterData';
import { CalendarCheck, Lock, Unlock, Sun, Save, X } from 'lucide-react';

const STATUS_ORDER = ['', 'Hadir', 'Izin', 'Tidak Hadir'];

const KehadiranSkeleton = () => (
  <div className="modern-table-card">
    <div className="skeleton-pulse" style={{ height: 40, width: 200, marginBottom: 24, borderRadius: 8 }}></div>
    <div className="skeleton-pulse" style={{ height: 400, width: '100%', borderRadius: 12 }}></div>
  </div>
);

export default function Kehadiran() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState([]);
  const [locked, setLocked] = useState(false);
  const [holidayReason, setHolidayReason] = useState('');
  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [holidayInput, setHolidayInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  useMasterData();

  const load = async (targetDate = date) => {
    setLoading(true);
    const res = await api.get('/attendance/schedule', { params: { date: targetDate } });
    const payload = res.data || { items: [], locked: false, holidayReason: '' };
    const rows = (payload.items || []).map(r => ({
      ...r
    }));
    setItems(rows);
    setLocked(!!payload.locked);
    setHolidayReason(payload.holidayReason || '');
    setLoading(false);
  };

  useEffect(() => {
    load(date);
  }, [date]);

  const openHoliday = () => {
    setHolidayInput('');
    setShowHolidayModal(true);
  };

  const applyHoliday = async () => {
    await api.post('/attendance/holiday', { date, reason: holidayInput });
    setShowHolidayModal(false);
    await load();
  };

  const clearHoliday = async () => {
    await api.delete('/attendance/holiday', { params: { date } });
    await load();
  };

  const updateItem = (idx, patch) => {
    setItems(prev => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const cycleStatus = (current) => {
    const idx = STATUS_ORDER.indexOf(current || '');
    const nextIdx = idx === -1 ? 1 : (idx + 1) % STATUS_ORDER.length;
    return STATUS_ORDER[nextIdx];
  };

  const onCellClick = (itemIdx) => {
    if (locked) return;
    const current = items[itemIdx]?.status || '';
    const next = cycleStatus(current);
    updateItem(itemIdx, { status: next });
  };

  const save = async () => {
    setSaving(true);
    try {
      if (locked) return;
      const payload = items.map(it => ({
        tanggal: date,
        jamKe: it.jamKe,
        kelas: it.kelas,
        guruId: it.guruId,
        status: it.status || '',
        rowId: it.rowId
      }));
      await api.post('/attendance/bulk', payload);
    } finally {
      setSaving(false);
    }
  };

  const { classes, jamList, cellMap } = useMemo(() => {
    const clsSet = new Set();
    const jamSet = new Set();
    const map = new Map();
    items.forEach((it, idx) => {
      clsSet.add(it.namaKelas || it.kelas);
      jamSet.add(it.jamKe);
      map.set(`${it.namaKelas || it.kelas}__${it.jamKe}`, { ...it, idx });
    });
    const classes = Array.from(clsSet).sort((a, b) => String(a).localeCompare(String(b)));
    const jamList = Array.from(jamSet).sort((a, b) => Number(a) - Number(b));
    return { classes, jamList, cellMap: map };
  }, [items]);

  return (
    <div>
      {loading && <KehadiranSkeleton />}
      {!loading && (
      <div className="modern-table-card">
        <div className="modern-table-title">
          <CalendarCheck size={24} /> Input Kehadiran
        </div>
        <div className="toolbar">
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
          <button className="secondary" onClick={save} disabled={saving || locked}>
            <Save size={18} /> Simpan Kehadiran
          </button>
          <button className="outline" onClick={openHoliday}>
            <Sun size={18} /> Libur
          </button>
          {locked && (
            <button className="outline" onClick={clearHoliday}>
              <Unlock size={18} /> Buka Kunci
            </button>
          )}
        </div>
        <div className="legend">
          <span className="legend-item">
            <span className="legend-dot status-hadir" /> Hadir
          </span>
          <span className="legend-item">
            <span className="legend-dot status-izin" /> Izin
          </span>
          <span className="legend-item">
            <span className="legend-dot status-absen" /> Tidak Hadir
          </span>
        </div>
        {locked && (
          <div className="stat" style={{ marginTop: 16 }}>
            <div className="label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Lock size={14} /> Hari Libur
            </div>
            <div className="value">{holidayReason || 'Tanpa keterangan'}</div>
          </div>
        )}
        <table className="table attendance-table">
          <thead>
            <tr>
              <th>Kelas</th>
              {jamList.map(j => (
                <th key={`jam-${j}`}>Jam {j}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {classes.map(kelas => (
              <tr key={`kelas-${kelas}`}>
                <td className="kelas-col">{kelas}</td>
                {jamList.map(jam => {
                  const cell = cellMap.get(`${kelas}__${jam}`);
                  if (!cell) return <td key={`${kelas}-${jam}`} className="cell empty-cell">-</td>;
                  const statusClass = cell.status === 'Hadir'
                    ? 'status-hadir'
                    : cell.status === 'Izin'
                      ? 'status-izin'
                      : cell.status === 'Tidak Hadir'
                        ? 'status-absen'
                        : '';
                  return (
                    <td key={`${kelas}-${jam}`} className="cell">
                      <button
                        type="button"
                        className={`cell-btn ${statusClass}`}
                        onClick={() => onCellClick(cell.idx)}
                        disabled={locked}
                        title={cell.status || 'Klik untuk isi status'}
                      >
                        <div className="cell-mapel">{cell.namaMapel}</div>
                        <div className="cell-guru">{cell.namaGuru}</div>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <div className="empty">Belum ada data.</div>}
      </div>
      )}

      {showHolidayModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title"><Sun size={24} /> Set Hari Libur</h3>
              <button className="modal-close" onClick={() => setShowHolidayModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label className="form-label">Tanggal</label>
              <input type="date" value={date} disabled style={{ width: '100%' }} />
            </div>
            <div className="form-group" style={{ marginBottom: 20 }}>
              <label className="form-label">Keterangan Libur</label>
              <input
                placeholder="Libur dalam rangka apa?"
                value={holidayInput}
                onChange={e => setHolidayInput(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>
            <div className="toolbar" style={{ marginTop: 0, marginBottom: 0 }}>
              <button onClick={applyHoliday} disabled={!holidayInput}>Terapkan</button>
              <button className="outline" onClick={() => setShowHolidayModal(false)}>Batal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
