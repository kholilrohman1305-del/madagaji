import { useEffect, useRef, useState } from 'react';
import api from '../api';
import { Receipt, Calendar, Plus, Printer, Users, X, Save } from 'lucide-react';

const formatRupiah = (value) => {
  const num = Number(value || 0);
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(Number.isNaN(num) ? 0 : num);
};

export default function RekapBisyaroh() {
  const today = new Date();
  const defaultStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const defaultEnd = today.toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [teachers, setTeachers] = useState([]);
  const [activities, setActivities] = useState([]);
  const [manualMap, setManualMap] = useState({});
  const [savingTransport, setSavingTransport] = useState({});
  const [activityForm, setActivityForm] = useState({
    tanggal: new Date().toISOString().slice(0, 10),
    nama: '',
    guruIds: []
  });

  const load = async () => {
    setLoading(true);
    try {
      const [summaryRes, activityRes] = await Promise.all([
        api.get('/payroll/summary', { params: { startDate, endDate } }),
        api.get('/payroll/activities', { params: { startDate, endDate } })
      ]);
      setItems(summaryRes.data || []);
      setActivities(activityRes.data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api.get('/master/teachers').then(res => setTeachers(res.data || []));
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      load();
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [startDate, endDate]);

  useEffect(() => {
    const periodStart = startDate.slice(0, 7);
    const periodEnd = endDate.slice(0, 7);
    if (periodStart !== periodEnd) {
      setManualMap({});
      return;
    }
    api.get('/payroll/manual-transport', { params: { periode: periodStart } })
      .then(res => {
        const map = {};
        (res.data || []).forEach(r => {
          map[r.guruId] = { jumlahHari: Number(r.jumlahHari || 0), jumlahAcara: Number(r.jumlahAcara || 0) };
        });
        setManualMap(map);
      });
  }, [startDate, endDate]);

  const getMonthsInRange = (start, end) => {
    const result = [];
    const cur = new Date(start);
    cur.setDate(1);
    const last = new Date(end);
    last.setDate(1);
    while (cur <= last) {
      const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`;
      result.push(key);
      cur.setMonth(cur.getMonth() + 1);
    }
    return result;
  };

  const saveTransport = async (guruId, totalValue) => {
    const months = getMonthsInRange(startDate, endDate);
    const jumlahAcara = manualMap[guruId]?.jumlahAcara ?? 0;
    const total = Math.max(0, Number(totalValue || 0));
    setSavingTransport(prev => ({ ...prev, [guruId]: true }));
    try {
      const payload = [];
      if (months.length === 1) {
        payload.push({
          guruId,
          periode: months[0],
          jumlahHari: total,
          jumlahAcara: Number(jumlahAcara || 0)
        });
      } else {
        const base = Math.floor(total / months.length);
        let remainder = total - base * months.length;
        months.forEach((periode) => {
          const extra = remainder > 0 ? 1 : 0;
          if (remainder > 0) remainder -= 1;
          payload.push({
            guruId,
            periode,
            jumlahHari: base + extra,
            jumlahAcara: Number(jumlahAcara || 0)
          });
        });
      }
      await api.post('/payroll/manual-transport', payload);
      load();
    } finally {
      setSavingTransport(prev => ({ ...prev, [guruId]: false }));
    }
  };

  const sameMonth = startDate.slice(0, 7) === endDate.slice(0, 7);

  const toggleTeacher = (guruId) => {
    setActivityForm(prev => {
      const set = new Set(prev.guruIds);
      if (set.has(guruId)) set.delete(guruId);
      else set.add(guruId);
      return { ...prev, guruIds: Array.from(set) };
    });
  };

  const saveActivity = async () => {
    await api.post('/payroll/activities', activityForm);
    setShowActivityModal(false);
    setActivityForm({ tanggal: new Date().toISOString().slice(0, 10), nama: '', guruIds: [] });
    load();
  };

  return (
    <div>
      <div className="modern-table-card">
        <div className="modern-table-title"><Receipt size={24} /> Rekap Bisyaroh</div>
        <div className="toolbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Calendar size={18} style={{ color: 'var(--muted)' }} />
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <span style={{ color: 'var(--muted)' }}>s/d</span>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
          <button className="secondary" onClick={() => setShowActivityModal(true)}>
            <Plus size={18} /> Transport Kegiatan
          </button>
          <button className="outline" onClick={() => {
            document.body.classList.add('print-f4', 'print-landscape');
            setTimeout(() => window.print(), 50);
          }}>
            <Printer size={18} /> Cetak PDF
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Nama</th>
                <th>TMT</th>
                <th>Wiyathabakti</th>
                <th>Jam Hadir</th>
                <th>Bisyaroh Mengajar</th>
                <th>Hadir (Transport)</th>
                <th>Bisyaroh Transport</th>
                <th>Kegiatan</th>
                <th>Transport Kegiatan</th>
                <th>Tugas 1</th>
                <th>Tugas 2</th>
                <th>Tugas 3</th>
                <th style={{ background: 'var(--success-100)' }}>Jumlah Diterima</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={idx}>
                  <td style={{ fontWeight: 600 }}>{it.nama}</td>
                  <td>{it.tmt || '-'}</td>
                  <td>{formatRupiah(it.wiyathabakti)}</td>
                  <td>{it.totalHadir ?? 0}</td>
                  <td>{formatRupiah(it.bisyarohMengajar)}</td>
                  <td>
                    <input
                      type="number"
                      style={{ width: 80 }}
                      value={manualMap[it.guruId]?.jumlahHari ?? it.totalTransportHari ?? 0}
                      onChange={e => {
                        const v = e.target.value;
                        setManualMap(prev => ({
                          ...prev,
                          [it.guruId]: { jumlahHari: v, jumlahAcara: prev[it.guruId]?.jumlahAcara ?? 0 }
                        }));
                      }}
                      onBlur={() => saveTransport(it.guruId, manualMap[it.guruId]?.jumlahHari ?? it.totalTransportHari ?? 0)}
                      disabled={savingTransport[it.guruId]}
                    />
                  </td>
                  <td>{formatRupiah(it.bisyarohTransport)}</td>
                  <td>{it.jumlahKegiatan ?? 0}</td>
                  <td>{formatRupiah(it.bisyarohTransportKegiatan)}</td>
                  <td>{it.tugasTambahan1 || '-'}</td>
                  <td>{it.tugasTambahan2 || '-'}</td>
                  <td>{it.tugasTambahan3 || '-'}</td>
                  <td style={{ fontWeight: 700, color: 'var(--success-600)' }}>{formatRupiah(it.totalBisyaroh)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!sameMonth && (
          <div style={{ marginTop: 12, padding: 12, background: 'var(--warning-50)', borderRadius: 8, fontSize: 13, color: 'var(--warning-600)' }}>
            Nilai jumlah transport akan dibagi otomatis ke tiap bulan dalam periode.
          </div>
        )}
        {items.length === 0 && !loading && <div className="empty">Belum ada data.</div>}
        {loading && <div className="empty">Memuat...</div>}
      </div>

      <div className="modern-table-card" style={{ marginTop: 24 }}>
        <div className="modern-table-title"><Users size={24} /> Transport Kegiatan (Periode)</div>
        <table className="table">
          <thead>
            <tr>
              <th>Tanggal</th>
              <th>Nama Kegiatan</th>
              <th>Jumlah Guru</th>
            </tr>
          </thead>
          <tbody>
            {activities.map(act => (
              <tr key={act.id}>
                <td>{String(act.tanggal).slice(0, 10)}</td>
                <td>{act.nama}</td>
                <td><span className="badge info">{act.guruIds?.length || 0} guru</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {activities.length === 0 && !loading && <div className="empty">Belum ada kegiatan.</div>}
      </div>

      {showActivityModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title"><Plus size={24} /> Tambah Transport Kegiatan</h3>
              <button className="modal-close" onClick={() => setShowActivityModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="grid grid-2" style={{ marginBottom: 16 }}>
              <div className="form-group">
                <label className="form-label">Tanggal</label>
                <input type="date" value={activityForm.tanggal} onChange={e => setActivityForm({ ...activityForm, tanggal: e.target.value })} style={{ width: '100%' }} />
              </div>
              <div className="form-group">
                <label className="form-label">Nama Kegiatan</label>
                <input value={activityForm.nama} onChange={e => setActivityForm({ ...activityForm, nama: e.target.value })} placeholder="Masukkan nama kegiatan" style={{ width: '100%' }} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Pilih Guru ({activityForm.guruIds.length} dipilih)</label>
              <div style={{ maxHeight: 240, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
                {teachers.map(t => (
                  <label key={t.guruId} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={activityForm.guruIds.includes(t.guruId)}
                      onChange={() => toggleTeacher(t.guruId)}
                    />
                    <span>{t.nama}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="toolbar" style={{ marginTop: 16, marginBottom: 0 }}>
              <button onClick={saveActivity} disabled={!activityForm.tanggal || !activityForm.nama}>
                <Save size={18} /> Simpan
              </button>
              <button className="outline" onClick={() => setShowActivityModal(false)}>Batal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
