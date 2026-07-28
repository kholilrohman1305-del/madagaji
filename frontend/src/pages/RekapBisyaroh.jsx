import { useEffect, useMemo, useRef, useState } from 'react';
import api from '../api';
import {
  Receipt, Calendar, Plus, Printer, Users, X, Save,
  Calculator, Lock, Unlock, RefreshCw, CheckCircle2, Clock3, Search
} from 'lucide-react';

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
  const [manualActivityMap, setManualActivityMap] = useState({});
  const [savingTransport, setSavingTransport] = useState({});
  const [savingActivity, setSavingActivity] = useState({});
  const [payrollState, setPayrollState] = useState(null);
  const [payrollAction, setPayrollAction] = useState('');
  const [showGenerateGuide, setShowGenerateGuide] = useState(false);
  const [search, setSearch] = useState('');
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
      setItems((summaryRes.data || []).filter((item) => !item.isExpense));
      setActivities(activityRes.data || []);
    } finally {
      setLoading(false);
    }
  };

  const loadPayrollState = async (period = startDate.slice(0, 7)) => {
    if (startDate.slice(0, 7) !== endDate.slice(0, 7)) {
      setPayrollState(null);
      return;
    }
    const response = await api.get('/payroll/period-status', { params: { periode: period } });
    setPayrollState(response.data || null);
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
    loadPayrollState().catch(() => setPayrollState(null));
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

  useEffect(() => {
    api.get('/payroll/manual-activities', { params: { startDate, endDate } })
      .then(res => {
        const map = {};
        (res.data || []).forEach(r => {
          map[r.guruId] = Number(r.jumlah || 0);
        });
        setManualActivityMap(map);
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

  const saveManualActivity = async (guruId, value) => {
    const jumlah = Math.max(0, Number(value || 0));
    setSavingActivity(prev => ({ ...prev, [guruId]: true }));
    try {
      await api.post('/payroll/manual-activities', { guruId, startDate, endDate, jumlah });
      load();
    } finally {
      setSavingActivity(prev => ({ ...prev, [guruId]: false }));
    }
  };

  const sameMonth = startDate.slice(0, 7) === endDate.slice(0, 7);
  const selectedPeriod = startDate.slice(0, 7);
  const filteredItems = useMemo(() => {
    const needle = String(search || '').trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => {
      const extraDetails = (item.extraCompensationItems || [])
        .map((detail) => `${detail.label || ''} ${detail.type || ''}`)
        .join(' ');
      return [
        item.nama,
        item.tugasTambahan1,
        item.tugasTambahan2,
        item.tugasTambahan3,
        extraDetails
      ].some((value) => String(value || '').toLowerCase().includes(needle));
    });
  }, [items, search]);

  const executePayrollAction = async (action, reason = '') => {
    setPayrollAction(action);
    try {
      const response = await api.post(`/payroll/${action}`, { periode: selectedPeriod, reason });
      setPayrollState(response.data || null);
      await load();
      return true;
    } catch (_) {
      return false;
    } finally {
      setPayrollAction('');
    }
  };

  const requestPayrollAction = async (action) => {
    if (action === 'generate') {
      setShowGenerateGuide(true);
      return;
    }
    const labels = {
      lock: 'mengunci',
      unlock: 'membuka kunci'
    };
    let reason = '';
    if (action === 'unlock') {
      reason = String(window.prompt('Tuliskan alasan membuka kunci Bisyaroh:') || '').trim();
      if (!reason) return;
    }
    if (!window.confirm(`Yakin ingin ${labels[action]} Bisyaroh periode ${selectedPeriod}?`)) return;
    await executePayrollAction(action, reason);
  };

  const confirmGenerate = async () => {
    const success = await executePayrollAction('generate');
    if (success) setShowGenerateGuide(false);
  };

  const formatTimestamp = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  };

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
          <div style={{ position: 'relative', minWidth: 230, flex: '1 1 230px', maxWidth: 340 }}>
            <Search size={17} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari nama guru atau bisyaroh…"
              style={{ width: '100%', paddingLeft: 35 }}
            />
          </div>
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

        {sameMonth && payrollState && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 16,
            marginBottom: 18,
            padding: 16,
            borderRadius: 14,
            border: `1px solid ${
              payrollState.status === 'locked' ? 'var(--success-300)' :
              payrollState.status === 'generated' ? 'var(--primary-300)' : 'var(--warning-300)'
            }`,
            background: payrollState.status === 'locked' ? 'var(--success-50)' :
              payrollState.status === 'generated' ? 'var(--primary-50)' : 'var(--warning-50)'
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 240 }}>
              <div style={{ marginTop: 2 }}>
                {payrollState.status === 'locked'
                  ? <Lock size={22} />
                  : payrollState.status === 'generated'
                    ? <CheckCircle2 size={22} />
                    : <Clock3 size={22} />}
              </div>
              <div>
                <div style={{ fontWeight: 800, marginBottom: 4 }}>
                  {payrollState.status === 'locked'
                    ? 'Bisyaroh Terkunci'
                    : payrollState.status === 'generated'
                      ? 'Bisyaroh Sudah Digenerate'
                      : 'Bisyaroh Belum Digenerate'}
                </div>
                <div style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.5 }}>
                  {payrollState.status === 'not_generated' ? (
                    <>Guru masih melihat Rp0 di MyMada sampai admin melakukan generate.</>
                  ) : (
                    <>
                      {payrollState.teacherCount || 0} guru · {formatRupiah(payrollState.grandTotal)}
                      {' · '}Dibuat {formatTimestamp(payrollState.generatedAt)}
                      {payrollState.generatedBy ? ` oleh ${payrollState.generatedBy}` : ''}
                      {payrollState.status === 'locked' && (
                        <> · Dikunci {formatTimestamp(payrollState.lockedAt)}</>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {payrollState.status === 'not_generated' && (
                <button
                  className="secondary"
                  onClick={() => requestPayrollAction('generate')}
                  disabled={Boolean(payrollAction)}
                >
                  <Calculator size={18} />
                  {payrollAction === 'generate' ? 'Memproses...' : 'Generate Bisyaroh'}
                </button>
              )}
              {payrollState.status === 'generated' && (
                <>
                  <button
                    className="secondary"
                    onClick={() => requestPayrollAction('generate')}
                    disabled={Boolean(payrollAction)}
                  >
                    <RefreshCw size={18} />
                    {payrollAction === 'generate' ? 'Memproses...' : 'Generate Ulang'}
                  </button>
                  <button onClick={() => requestPayrollAction('lock')} disabled={Boolean(payrollAction)}>
                    <Lock size={18} />
                    {payrollAction === 'lock' ? 'Mengunci...' : 'Kunci Bisyaroh'}
                  </button>
                </>
              )}
              {payrollState.status === 'locked' && (
                <button className="outline" onClick={() => requestPayrollAction('unlock')} disabled={Boolean(payrollAction)}>
                  <Unlock size={18} />
                  {payrollAction === 'unlock' ? 'Membuka...' : 'Buka Kunci'}
                </button>
              )}
            </div>
          </div>
        )}

        {!sameMonth && (
          <div style={{ marginBottom: 18, padding: 12, background: 'var(--warning-50)', borderRadius: 8, fontSize: 13, color: 'var(--warning-600)' }}>
            Generate Bisyaroh hanya tersedia untuk satu bulan penuh. Pilih tanggal awal dan akhir dalam bulan yang sama.
          </div>
        )}

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
                <th style={{ minWidth: 250 }}>Bisyaroh Tambahan</th>
                <th style={{ background: 'var(--success-100)' }}>Jumlah Diterima</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((it, idx) => (
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
                  <td>
                    {it.isExpense ? '-' : (
                      <input
                        type="number"
                        min="0"
                        style={{ width: 80 }}
                        value={manualActivityMap[it.guruId] ?? it.jumlahKegiatan ?? 0}
                        onChange={e => {
                          const v = e.target.value;
                          setManualActivityMap(prev => ({ ...prev, [it.guruId]: v }));
                        }}
                        onBlur={() => saveManualActivity(it.guruId, manualActivityMap[it.guruId] ?? it.jumlahKegiatan ?? 0)}
                        disabled={savingActivity[it.guruId]}
                        title="Jumlah kegiatan manual untuk rentang tanggal ini"
                      />
                    )}
                  </td>
                  <td>{formatRupiah(it.bisyarohTransportKegiatan)}</td>
                  <td>{it.tugasTambahan1 || '-'}</td>
                  <td>{it.tugasTambahan2 || '-'}</td>
                  <td>{it.tugasTambahan3 || '-'}</td>
                  <td style={{ minWidth: 250 }}>
                    {(it.extraCompensationItems || []).length === 0 ? (
                      <span style={{ color: 'var(--muted)' }}>-</span>
                    ) : (
                      <div style={{ display: 'grid', gap: 8 }}>
                        {(it.extraCompensationItems || []).map((detail, detailIdx) => (
                          <div
                            key={`${detail.type || 'tambahan'}-${detail.label || detailIdx}-${detailIdx}`}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: 'minmax(0, 1fr) auto',
                              gap: 10,
                              paddingBottom: 7,
                              borderBottom: '1px dashed var(--border)'
                            }}
                          >
                            <div>
                              <strong style={{ display: 'block', fontSize: 12 }}>{detail.label || 'Bisyaroh Tambahan'}</strong>
                              <span style={{ color: 'var(--muted)', fontSize: 11 }}>
                                {Number(detail.qty || 0).toLocaleString('id-ID')} × {formatRupiah(detail.rate || 0)}
                              </span>
                            </div>
                            <strong style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{formatRupiah(detail.total || 0)}</strong>
                          </div>
                        ))}
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 10,
                          paddingTop: 2,
                          fontSize: 12,
                          color: 'var(--primary-700)',
                          fontWeight: 800
                        }}>
                          <span>Total Tambahan</span>
                          <span>{formatRupiah(it.extraCompensationTotal || 0)}</span>
                        </div>
                      </div>
                    )}
                  </td>
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
        {filteredItems.length === 0 && !loading && (
          <div className="empty">{search ? `Tidak ada data yang cocok dengan “${search}”.` : 'Belum ada data.'}</div>
        )}
        {search && filteredItems.length > 0 && (
          <div style={{ marginTop: 10, color: 'var(--muted)', fontSize: 12 }}>
            Menampilkan {filteredItems.length} dari {items.length} guru.
          </div>
        )}
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

      {showGenerateGuide && (
        <div className="modal-backdrop">
          <div className="modal" style={{ width: 'min(680px, calc(100vw - 24px))', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title" style={{ marginBottom: 4 }}>
                  <Calculator size={24} /> Panduan Generate Bisyaroh
                </h3>
                <div style={{ color: 'var(--muted)', fontSize: 13 }}>
                  Periode {selectedPeriod}
                </div>
              </div>
              <button
                className="modal-close"
                onClick={() => setShowGenerateGuide(false)}
                disabled={Boolean(payrollAction)}
                aria-label="Tutup"
              >
                <X size={20} />
              </button>
            </div>

            <div style={{
              display: 'flex',
              gap: 10,
              padding: 14,
              marginBottom: 18,
              borderRadius: 12,
              border: '1px solid var(--warning-300)',
              background: 'var(--warning-50)',
              color: 'var(--warning-700, #7a4d00)',
              lineHeight: 1.55
            }}>
              <Clock3 size={22} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <strong style={{ display: 'block', marginBottom: 3 }}>Periksa data sebelum melanjutkan</strong>
                Pastikan kehadiran, transport, kegiatan, tugas tambahan, honor ekstra, dan tarif periode ini sudah benar.
              </div>
            </div>

            <div style={{ display: 'grid', gap: 12 }}>
              {[
                {
                  no: 1,
                  title: 'Sistem menghitung ulang seluruh komponen',
                  text: 'MadaFlow mengambil data terbaru pada periode yang dipilih dan menghitung Bisyaroh setiap guru.'
                },
                {
                  no: 2,
                  title: 'Hasil disimpan sebagai snapshot resmi',
                  text: 'Nilai yang dihasilkan disimpan terpisah agar tidak berubah otomatis ketika data sumber berubah.'
                },
                {
                  no: 3,
                  title: 'Bisyaroh langsung terlihat di MyMada',
                  text: 'Status “Belum digenerate” berubah menjadi “Sudah digenerate”, lalu nominal dan rincian tampil pada akun guru.'
                },
                {
                  no: 4,
                  title: 'Admin memeriksa lalu mengunci periode',
                  text: 'Jika hasil sudah benar, gunakan tombol “Kunci Bisyaroh” agar periode tidak dapat digenerate ulang tanpa membuka kunci.'
                }
              ].map((step) => (
                <div key={step.no} style={{
                  display: 'grid',
                  gridTemplateColumns: '36px 1fr',
                  gap: 11,
                  alignItems: 'start',
                  padding: 12,
                  border: '1px solid var(--border)',
                  borderRadius: 12
                }}>
                  <div style={{
                    width: 34,
                    height: 34,
                    display: 'grid',
                    placeItems: 'center',
                    borderRadius: '50%',
                    background: 'var(--primary-100)',
                    color: 'var(--primary-700)',
                    fontWeight: 900
                  }}>
                    {step.no}
                  </div>
                  <div>
                    <strong style={{ display: 'block', marginBottom: 3 }}>{step.title}</strong>
                    <span style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.55 }}>{step.text}</span>
                  </div>
                </div>
              ))}
            </div>

            <div style={{
              marginTop: 18,
              padding: 15,
              borderRadius: 12,
              background: 'var(--primary-50)',
              border: '1px solid var(--primary-200)'
            }}>
              <strong style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                <RefreshCw size={18} /> Jika hasilnya salah, bagaimana mengembalikannya?
              </strong>
              <ol style={{ margin: 0, paddingLeft: 20, color: 'var(--muted)', fontSize: 13, lineHeight: 1.7 }}>
                <li>Jika belum dikunci: perbaiki data sumber, lalu klik <strong>Generate Ulang</strong>.</li>
                <li>Jika sudah dikunci: klik <strong>Buka Kunci</strong> dan tuliskan alasan koreksi.</li>
                <li>Perbaiki data, lakukan <strong>Generate Ulang</strong>, periksa hasilnya, lalu kunci kembali.</li>
                <li>Generate ulang akan mengganti snapshot periode tersebut dan memperbarui tampilan MyMada.</li>
              </ol>
            </div>

            {payrollState?.status === 'generated' && (
              <div style={{
                marginTop: 14,
                padding: 12,
                borderRadius: 10,
                background: 'var(--danger-50, #fff1f2)',
                color: 'var(--danger-700, #9f1239)',
                fontSize: 13,
                fontWeight: 700
              }}>
                Perhatian: ini adalah generate ulang. Snapshot lama periode {selectedPeriod} akan diganti dengan hasil terbaru.
              </div>
            )}

            <div className="toolbar" style={{ marginTop: 20, marginBottom: 0, justifyContent: 'flex-end' }}>
              <button
                className="outline"
                onClick={() => setShowGenerateGuide(false)}
                disabled={Boolean(payrollAction)}
              >
                Batal
              </button>
              <button className="secondary" onClick={confirmGenerate} disabled={Boolean(payrollAction)}>
                {payrollState?.status === 'generated' ? <RefreshCw size={18} /> : <Calculator size={18} />}
                {payrollAction === 'generate'
                  ? 'Sedang Memproses...'
                  : payrollState?.status === 'generated'
                    ? 'Saya Paham, Generate Ulang'
                    : 'Saya Paham, Generate Sekarang'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
