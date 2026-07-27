import { useEffect, useMemo, useState } from 'react';
import { Activity, CalendarDays, Clock3, Grid3X3, ListChecks, RefreshCw, UsersRound } from 'lucide-react';
import api from '../api';
import useIsMobile from '../hooks/useIsMobile';

const DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

function colorForExtra(item) {
  const key = String(item?.extracurricularId || item?.name || 'ekstra');
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const hue = Math.abs(hash) % 360;
  const saturation = 62 + (Math.abs(hash >> 8) % 22);
  const lightness = 42 + (Math.abs(hash >> 16) % 12);
  return {
    solid: `hsl(${hue} ${saturation}% ${lightness}%)`,
    ink: `hsl(${hue} ${Math.min(88, saturation + 8)}% 24%)`,
    soft: `hsl(${hue} ${Math.max(45, saturation - 8)}% 95%)`,
    border: `hsl(${hue} ${saturation}% 79%)`,
    glow: `hsl(${hue} ${saturation}% ${lightness}% / .18)`
  };
}

function ScheduleTile({ item, compact = false }) {
  const color = colorForExtra(item);
  return (
    <article
      className={`extra-schedule-tile${compact ? ' compact' : ''}`}
      style={{
        '--extra-solid': color.solid,
        '--extra-ink': color.ink,
        '--extra-soft': color.soft,
        '--extra-border': color.border,
        '--extra-glow': color.glow
      }}
    >
      <span className="extra-schedule-accent" />
      <div className="extra-schedule-tile-head">
        <strong>{item.name}</strong>
        <span>{item.meetings || 0} jurnal</span>
      </div>
      <div className="extra-schedule-time">
        <Clock3 size={13} />
        {item.startTime && item.endTime ? `${item.startTime}–${item.endTime}` : 'Waktu belum diatur'}
      </div>
      <div className="extra-schedule-teachers">
        <UsersRound size={13} />
        <span>{item.teacherName || '-'}</span>
      </div>
    </article>
  );
}

export default function JadwalEkstrakurikuler() {
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const isMobile = useIsMobile();

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
    items: rows
      .filter((row) => row.day === day)
      .sort((a, b) => `${a.startTime}-${a.name}`.localeCompare(`${b.startTime}-${b.name}`, 'id'))
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
  const activeDays = grouped.filter((group) => group.items.length).length;

  return (
    <div className="extra-schedule-page">
      <header className="extra-schedule-page-head">
        <div>
          <span className="extra-schedule-eyebrow">Penjadwalan Ekstrakurikuler</span>
          <h1>Jadwal & Realisasi Kegiatan</h1>
          <p>Warna setiap kegiatan dibuat konsisten agar jadwal mudah dikenali sekilas.</p>
        </div>
        <div className="extra-schedule-controls">
          <input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} />
          <button className="outline" type="button" onClick={load} disabled={loading}>
            <RefreshCw size={16} /> Muat Ulang
          </button>
        </div>
      </header>

      <div className="extra-schedule-stats">
        <div><CalendarDays size={19} /><span><strong>{rows.length}</strong>Kegiatan aktif</span></div>
        <div><Activity size={19} /><span><strong>{totalMeetings}</strong>Jurnal terealisasi</span></div>
        <div><Grid3X3 size={19} /><span><strong>{activeDays}</strong>Hari terjadwal</span></div>
      </div>

      <section className="modern-table-card extra-matrix-card">
        <div className="extra-card-heading">
          <div>
            <span className="extra-card-icon matrix"><Grid3X3 size={20} /></span>
            <span><strong>Matriks Jadwal Mingguan</strong><small>Peta kegiatan berdasarkan hari dan waktu</small></span>
          </div>
          <span className="extra-card-count">{timeSlots.length} slot waktu</span>
        </div>

        {loading ? (
          <div className="skeleton-pulse" style={{ height: 300, borderRadius: 16 }} />
        ) : isMobile ? (
          <div className="extra-mobile-day-list">
            {grouped.map(({ day, items }) => (
              <section className={`extra-mobile-day${items.length ? '' : ' empty-day'}`} key={`matrix-${day}`}>
                <div className="extra-mobile-day-head">
                  <strong>{day}</strong><span>{items.length} kegiatan</span>
                </div>
                {items.length ? (
                  <div className="extra-mobile-schedule-list">
                    {items.map((item) => <ScheduleTile key={`${day}-${item.extracurricularId}`} item={item} />)}
                  </div>
                ) : <p>Tidak ada jadwal.</p>}
              </section>
            ))}
          </div>
        ) : (
          <div className="extra-matrix-scroll">
            <table className="extra-matrix-table" style={{ minWidth: Math.max(820, 145 + (timeSlots.length * 210)) }}>
              <thead>
                <tr>
                  <th className="extra-matrix-corner">Hari</th>
                  {timeSlots.map((slot) => {
                    const [start, end] = slot.split('-');
                    return <th key={slot}><span>{start}</span><small>{end}</small></th>;
                  })}
                </tr>
              </thead>
              <tbody>
                {DAYS.map((day) => (
                  <tr key={day}>
                    <th className="extra-matrix-day">{day}</th>
                    {timeSlots.map((slot) => {
                      const items = matrix.get(`${day}|${slot}`) || [];
                      return (
                        <td key={`${day}-${slot}`}>
                          <div className="extra-matrix-cell-stack">
                            {items.map((item) => (
                              <ScheduleTile key={`${day}-${slot}-${item.extracurricularId}`} item={item} compact />
                            ))}
                            {!items.length && <span className="extra-matrix-empty">—</span>}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {!timeSlots.length && <div className="empty">Belum ada jadwal ekstra yang memiliki jam mulai dan selesai.</div>}
          </div>
        )}
      </section>

      <section className="modern-table-card extra-detail-card">
        <div className="extra-card-heading">
          <div>
            <span className="extra-card-icon detail"><ListChecks size={20} /></span>
            <span><strong>Rincian Jadwal & Realisasi</strong><small>Daftar lengkap pengajar, pertemuan, dan tanggal jurnal</small></span>
          </div>
          <span className="extra-card-count">{rows.length} rincian</span>
        </div>

        {loading ? (
          <div className="skeleton-pulse" style={{ height: 240, borderRadius: 16 }} />
        ) : (
          <div className="extra-detail-days">
            {grouped.map(({ day, items }) => (
              <section className="extra-detail-day" key={`detail-${day}`}>
                <div className="extra-detail-day-head">
                  <strong>{day}</strong><span>{items.length} kegiatan</span>
                </div>
                {items.length ? (
                  isMobile ? (
                    <div className="extra-detail-mobile-list">
                      {items.map((item) => {
                        const color = colorForExtra(item);
                        return (
                          <article
                            className="extra-detail-mobile-card"
                            key={`detail-mobile-${day}-${item.extracurricularId}`}
                            style={{ '--extra-solid': color.solid, '--extra-soft': color.soft, '--extra-border': color.border, '--extra-ink': color.ink }}
                          >
                            <div className="extra-detail-mobile-title"><span /><strong>{item.name}</strong></div>
                            <dl>
                              <div><dt>Waktu</dt><dd>{item.startTime && item.endTime ? `${item.startTime}–${item.endTime}` : '-'}</dd></div>
                              <div><dt>Pengajar</dt><dd>{item.teacherName || '-'}</dd></div>
                              <div><dt>Realisasi</dt><dd>{item.meetings || 0} pertemuan</dd></div>
                              <div><dt>Tanggal jurnal</dt><dd>{item.dates || 'Belum ada jurnal'}</dd></div>
                            </dl>
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="extra-detail-table-wrap">
                      <table className="table extra-detail-table">
                        <thead>
                          <tr>
                            <th>Waktu</th><th>Ekstrakurikuler</th><th>Guru/Pendamping</th>
                            <th>Realisasi Bulan Ini</th><th>Tanggal Jurnal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((item) => {
                            const color = colorForExtra(item);
                            return (
                              <tr key={`detail-row-${day}-${item.extracurricularId}`}>
                                <td><span className="extra-time-pill"><Clock3 size={13} />{item.startTime && item.endTime ? `${item.startTime}–${item.endTime}` : '-'}</span></td>
                                <td><span className="extra-name-pill" style={{ '--extra-solid': color.solid, '--extra-soft': color.soft, '--extra-border': color.border, '--extra-ink': color.ink }}><i />{item.name}</span></td>
                                <td>{item.teacherName || '-'}</td>
                                <td><strong>{item.meetings || 0}</strong> pertemuan</td>
                                <td>{item.dates || 'Belum ada jurnal'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )
                ) : <div className="extra-detail-empty">Tidak ada jadwal pada hari ini.</div>}
              </section>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
