import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, RefreshCw } from 'lucide-react';
import api from '../api';

const DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

export default function JadwalEkstrakurikuler() {
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const response = await api.get('/attendance/extracurricular-matrix', { params: { period } });
      setRows(response.data?.data || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [period]);

  const grouped = useMemo(() => DAYS.map((day) => ({
    day,
    items: rows.filter((row) => row.day === day)
  })), [rows]);
  const timeSlots = useMemo(() => [...new Set(rows
    .filter((row) => row.startTime && row.endTime)
    .map((row) => `${row.startTime}-${row.endTime}`))]
    .sort((a, b) => a.localeCompare(b)), [rows]);
  const matrix = useMemo(() => {
    const result = new Map();
    rows.forEach((row) => {
      if (!row.startTime || !row.endTime || !DAYS.includes(row.day)) return;
      const key = `${row.day}|${row.startTime}-${row.endTime}`;
      if (!result.has(key)) result.set(key, []);
      result.get(key).push(row);
    });
    return result;
  }, [rows]);
  const totalMeetings = rows.reduce((sum, row) => sum + Number(row.meetings || 0), 0);

  return (
    <div>
      <div className="modern-table-card">
        <div className="modern-table-title"><CalendarDays size={24} /> Jadwal Ekstrakurikuler</div>
        <div className="toolbar">
          <input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} />
          <button className="outline" type="button" onClick={load} disabled={loading}>
            <RefreshCw size={16} /> Muat Ulang
          </button>
          <span style={{ color: 'var(--muted)', fontSize: 13 }}>
            {rows.length} kegiatan · {totalMeetings} jurnal terealisasi
          </span>
        </div>

        {loading ? (
          <div className="skeleton-pulse" style={{ height: 280, borderRadius: 12 }} />
        ) : (
          <div style={{ display: 'grid', gap: 14 }}>
            <section>
              <h3 style={{ margin: '4px 0 10px' }}>Matriks Jadwal Mingguan</h3>
              <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 12 }}>
                <table className="teacher-grid" style={{ minWidth: Math.max(760, 150 + (timeSlots.length * 190)) }}>
                  <thead>
                    <tr>
                      <th className="teacher-corner">Hari</th>
                      {timeSlots.map((slot) => {
                        const [start, end] = slot.split('-');
                        return <th key={slot}>{start}<br />– {end}</th>;
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {DAYS.map((day) => (
                      <tr key={day}>
                        <th className="teacher-day">{day}</th>
                        {timeSlots.map((slot) => {
                          const items = matrix.get(`${day}|${slot}`) || [];
                          return (
                            <td key={`${day}-${slot}`} className="teacher-cell" style={{ verticalAlign: 'top', minWidth: 180 }}>
                              {items.map((item) => (
                                <div
                                  key={item.extracurricularId}
                                  style={{
                                    padding: 8,
                                    marginBottom: 6,
                                    borderRadius: 9,
                                    background: '#ecfdf5',
                                    border: '1px solid #a7f3d0',
                                    textAlign: 'left'
                                  }}
                                >
                                  <div style={{ fontWeight: 800, color: '#065f46', fontSize: 12 }}>{item.name}</div>
                                  <div style={{ color: '#475569', fontSize: 11, marginTop: 3 }}>{item.teacherName}</div>
                                  <div style={{ color: item.meetings ? '#166534' : '#94a3b8', fontSize: 10.5, marginTop: 4 }}>
                                    {item.meetings ? `${item.meetings} jurnal bulan ini` : 'Belum ada jurnal'}
                                  </div>
                                </div>
                              ))}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!timeSlots.length && <div className="empty">Belum ada jadwal ekstra yang memiliki jam mulai dan selesai.</div>}
              </div>
            </section>

            <h3 style={{ margin: '10px 0 0' }}>Rincian Jadwal dan Realisasi</h3>
            {grouped.map(({ day, items }) => (
              <section key={day} style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: '10px 14px', fontWeight: 800, background: '#f8fafc' }}>{day}</div>
                {items.length ? (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Waktu</th>
                        <th>Ekstrakurikuler</th>
                        <th>Guru/Pendamping</th>
                        <th>Realisasi Bulan Ini</th>
                        <th>Tanggal Jurnal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item.extracurricularId}>
                          <td>{item.startTime && item.endTime ? `${item.startTime}–${item.endTime}` : '-'}</td>
                          <td style={{ fontWeight: 700 }}>{item.name}</td>
                          <td>{item.teacherName}</td>
                          <td><strong>{item.meetings}</strong> pertemuan</td>
                          <td>{item.dates || 'Belum ada jurnal'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ padding: 12, color: 'var(--muted)', fontSize: 13 }}>Tidak ada jadwal.</div>
                )}
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
