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
