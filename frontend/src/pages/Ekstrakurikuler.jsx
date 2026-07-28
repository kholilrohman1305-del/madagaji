import { useEffect, useMemo, useState } from 'react';
import api from '../api';
import { AlertTriangle, Save, SearchCheck, Trash2, Wallet, X } from 'lucide-react';

const TYPE_LABELS = {
  pendamping_kbm: 'Pendamping Ekstra',
  guru_ekstra: 'Guru Ekstra'
};

export default function Ekstrakurikuler() {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [periode, setPeriode] = useState(currentMonth);
  const [items, setItems] = useState([]);
  const [rates, setRates] = useState({ pendamping: 0, guruEkstra: 0 });
  const [loading, setLoading] = useState(true);
  const [savingRates, setSavingRates] = useState(false);
  const [search, setSearch] = useState('');
  const [attendanceDrafts, setAttendanceDrafts] = useState({});
  const [savingAttendance, setSavingAttendance] = useState({});
  const [duplicateAudit, setDuplicateAudit] = useState(null);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [deletingDuplicate, setDeletingDuplicate] = useState(null);
  const [duplicateError, setDuplicateError] = useState('');

  const rupiah = useMemo(() => new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }), []);

  async function load(targetPeriode = periode) {
    setLoading(true);
    try {
      const [sheetResponse, ratesResponse] = await Promise.all([
        api.get('/payroll/extracurricular/sheet', { params: { periode: targetPeriode } }),
        api.get('/payroll/extracurricular/rates')
      ]);
      const rows = sheetResponse.data || [];
      setItems(rows);
      setAttendanceDrafts(Object.fromEntries(rows.map((item) => [item.id, item.jumlahHadir ?? 0])));
      setRates({
        pendamping: Number(ratesResponse.data?.pendamping || 0),
        guruEkstra: Number(ratesResponse.data?.guruEkstra || 0)
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(periode);
  }, [periode]);

  async function saveRates() {
    setSavingRates(true);
    try {
      await api.put('/payroll/extracurricular/rates', rates);
      await load(periode);
    } finally {
      setSavingRates(false);
    }
  }

  async function saveAttendance(item) {
    const jumlahHadir = Math.max(0, Number(attendanceDrafts[item.id]) || 0);
    setSavingAttendance((previous) => ({ ...previous, [item.id]: true }));
    try {
      await api.put('/payroll/extracurricular/sheet', {
        periode,
        items: [{ id: item.id, jumlahHadir, nominal: item.nominal }]
      });
      setItems((previous) => previous.map((row) => (
        row.id === item.id
          ? { ...row, jumlahHadir, jumlahDiterima: jumlahHadir * Number(row.nominal || 0), attendanceManual: true }
          : row
      )));
    } finally {
      setSavingAttendance((previous) => ({ ...previous, [item.id]: false }));
    }
  }

  async function checkDuplicates() {
    setCheckingDuplicates(true);
    setDuplicateError('');
    try {
      const response = await api.get('/payroll/extracurricular/duplicates', { params: { periode } });
      setDuplicateAudit(response.data);
    } catch (error) {
      setDuplicateError(error.response?.data?.message || error.message || 'Pengecekan data ganda gagal.');
      setDuplicateAudit({ periode, duplicateCount: 0, groups: [] });
    } finally {
      setCheckingDuplicates(false);
    }
  }

  async function deleteDuplicate(row) {
    const role = TYPE_LABELS[row.teacherType] || 'Data manual';
    if (!window.confirm(`Hapus ${role} atas nama ${row.teacherName} dari ${row.namaEkstra} untuk periode ${periode}?`)) return;
    setDeletingDuplicate(row.id);
    setDuplicateError('');
    try {
      await api.delete(`/payroll/extracurricular/duplicates/${row.id}`, { params: { periode } });
      await load(periode);
      const response = await api.get('/payroll/extracurricular/duplicates', { params: { periode } });
      setDuplicateAudit(response.data);
    } catch (error) {
      setDuplicateError(error.response?.data?.message || error.message || 'Data ganda gagal dihapus.');
    } finally {
      setDeletingDuplicate(null);
    }
  }

  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...items]
      .filter((item) => !query || [item.namaEkstra, item.teacherName, TYPE_LABELS[item.teacherType]]
        .some((value) => String(value || '').toLowerCase().includes(query)))
      .sort((a, b) => (
        String(a.namaEkstra || '').localeCompare(String(b.namaEkstra || ''), 'id', { numeric: true })
        || String(a.teacherName || '').localeCompare(String(b.teacherName || ''), 'id')
      ));
  }, [items, search]);

  return (
    <div>
      <div className="modern-table-card">
        <div className="modern-table-title"><Wallet size={24} /> Honor Ekstrakurikuler</div>

        <section style={{ padding: 16, marginBottom: 16, border: '1px solid var(--border)', borderRadius: 12, background: '#f8fafc' }}>
          <h3 style={{ margin: '0 0 6px' }}>Tarif Global per Kehadiran</h3>
          <p style={{ margin: '0 0 14px', color: 'var(--muted)', fontSize: 13 }}>
            Tarif berlaku untuk semua pengajar sesuai jenisnya. Jurnal yang sudah masuk tetap memakai snapshot tarif saat jurnal disimpan.
          </p>
          <div className="toolbar" style={{ marginBottom: 0 }}>
            <label style={{ display: 'grid', gap: 5, fontSize: 12, fontWeight: 700 }}>
              Pendamping Ekstra
              <input
                type="number"
                min="0"
                value={rates.pendamping}
                onChange={(event) => setRates((previous) => ({ ...previous, pendamping: event.target.value }))}
                style={{ width: 190 }}
              />
            </label>
            <label style={{ display: 'grid', gap: 5, fontSize: 12, fontWeight: 700 }}>
              Guru Ekstra
              <input
                type="number"
                min="0"
                value={rates.guruEkstra}
                onChange={(event) => setRates((previous) => ({ ...previous, guruEkstra: event.target.value }))}
                style={{ width: 190 }}
              />
            </label>
            <button type="button" onClick={saveRates} disabled={savingRates}>
              <Save size={18} /> {savingRates ? 'Menyimpan…' : 'Simpan Tarif'}
            </button>
          </div>
        </section>

        <div className="toolbar">
          <input type="month" value={periode} onChange={(event) => setPeriode(event.target.value)} />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari ekstra, guru, atau jenis…"
            style={{ minWidth: 250 }}
          />
          <button className="outline" type="button" onClick={() => load(periode)} disabled={loading}>Muat Ulang</button>
          <button className="outline no-print" type="button" onClick={checkDuplicates} disabled={checkingDuplicates}>
            <SearchCheck size={18} /> {checkingDuplicates ? 'Memeriksa…' : 'Cek Data Ganda'}
          </button>
          <button className="outline no-print" type="button" onClick={() => window.print()}>Cetak</button>
          <span style={{ color: 'var(--muted)', fontSize: 13 }}>
            Data pengajar dan ekstrakurikuler otomatis dari MyMada; kehadiran otomatis dari jurnal eMada.
          </span>
        </div>

        {loading ? (
          <div className="skeleton-pulse" style={{ height: 220, borderRadius: 12 }} />
        ) : (
          <>
            <table className="table">
              <thead>
                <tr>
                  <th className="print-only center">No.</th>
                  <th>Nama Ekstra</th>
                  <th>Nama Guru</th>
                  <th>Jenis</th>
                  <th>Jumlah Hadir</th>
                  <th>Tarif</th>
                  <th>Jumlah Diterima</th>
                  <th className="print-only center print-ttd">TTD</th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((item, index) => (
                  <tr key={item.id}>
                    <td className="print-only center">{index + 1}</td>
                    <td style={{ fontWeight: 800 }}>{item.namaEkstra}</td>
                    <td style={{ fontWeight: 700 }}>{item.teacherName}</td>
                    <td>
                      <span style={{ padding: '3px 9px', borderRadius: 999, background: item.teacherType === 'guru_ekstra' ? '#ede9fe' : '#dbeafe', color: item.teacherType === 'guru_ekstra' ? '#6d28d9' : '#1d4ed8', fontSize: 11, fontWeight: 800 }}>
                        {TYPE_LABELS[item.teacherType] || 'Manual'}
                      </span>
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        value={attendanceDrafts[item.id] ?? item.jumlahHadir ?? 0}
                        onChange={(event) => setAttendanceDrafts((previous) => ({ ...previous, [item.id]: event.target.value }))}
                        onBlur={() => saveAttendance(item)}
                        disabled={savingAttendance[item.id]}
                        title="Jumlah dari eMada dapat dikoreksi manual"
                        style={{ width: 92 }}
                      />
                      <small style={{ display: 'block', marginTop: 3, color: item.attendanceManual ? '#b45309' : 'var(--muted)' }}>
                        {item.attendanceManual ? 'Manual' : 'Otomatis eMada'}
                      </small>
                    </td>
                    <td>{rupiah.format(item.nominal)}</td>
                    <td style={{ fontWeight: 800 }}>
                      {rupiah.format((Number(attendanceDrafts[item.id]) || 0) * Number(item.nominal || 0))}
                    </td>
                    <td className="print-only"></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visibleItems.length === 0 && (
              <div className="empty">{search ? 'Data yang dicari tidak ditemukan.' : 'Belum ada penugasan pengajar ekstrakurikuler aktif di MyMada.'}</div>
            )}
          </>
        )}
      </div>

      {duplicateAudit && (
        <div className="modal-backdrop no-print" role="presentation" onMouseDown={() => setDuplicateAudit(null)}>
          <div
            className="modal extra-duplicate-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="duplicate-audit-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <div className="modal-title" id="duplicate-audit-title">
                  <SearchCheck size={22} /> Pemeriksaan Data Ganda
                </div>
                <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 5 }}>Periode {duplicateAudit.periode}</div>
              </div>
              <button className="modal-close" type="button" onClick={() => setDuplicateAudit(null)} aria-label="Tutup">
                <X size={20} />
              </button>
            </div>

            {duplicateError && (
              <div className="extra-duplicate-notice danger">
                <AlertTriangle size={19} /> <span>{duplicateError}</span>
              </div>
            )}

            {!duplicateError && duplicateAudit.groups.length === 0 && (
              <div className="extra-duplicate-notice success">
                <SearchCheck size={20} />
                <span><strong>Tidak ada data ganda.</strong><br />Honor ekstrakurikuler pada periode ini sudah konsisten.</span>
              </div>
            )}

            {duplicateAudit.groups.length > 0 && (
              <>
                <div className="extra-duplicate-notice warning">
                  <AlertTriangle size={20} />
                  <span>
                    Ditemukan <strong>{duplicateAudit.duplicateCount} data berlebih</strong>.
                    Periksa jenis dan tarif, lalu hapus hanya baris yang memang tidak seharusnya menerima honor.
                  </span>
                </div>
                <div className="extra-duplicate-groups">
                  {duplicateAudit.groups.map((group) => (
                    <section className="extra-duplicate-group" key={`${group.namaEkstra}-${group.teacherName}`}>
                      <div className="extra-duplicate-group-head">
                        <div>
                          <strong>{group.namaEkstra}</strong>
                          <div>{group.teacherName}</div>
                        </div>
                        <span className={`badge ${group.conflictType === 'cross_role' ? 'warning' : 'danger'}`}>
                          {group.conflictType === 'cross_role' ? 'Bentrok Peran' : 'Duplikat Sejenis'}
                        </span>
                      </div>
                      <p>{group.explanation}</p>
                      <div className="extra-duplicate-rows">
                        {group.rows.map((row) => (
                          <article className="extra-duplicate-row" key={row.id}>
                            <div>
                              <span className="extra-duplicate-role">{TYPE_LABELS[row.teacherType] || 'Manual'}</span>
                              <small>ID #{row.id} · {row.sourceSynced ? 'Sinkron otomatis' : 'Input manual'}</small>
                            </div>
                            <div>
                              <small>Hadir</small>
                              <strong>{row.jumlahHadir}</strong>
                            </div>
                            <div>
                              <small>Tarif</small>
                              <strong>{rupiah.format(row.nominal)}</strong>
                            </div>
                            <button
                              className="danger sm"
                              type="button"
                              onClick={() => deleteDuplicate(row)}
                              disabled={deletingDuplicate !== null}
                            >
                              <Trash2 size={16} />
                              {deletingDuplicate === row.id ? 'Menghapus…' : 'Hapus Baris Ini'}
                            </button>
                          </article>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
