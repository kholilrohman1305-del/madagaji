import { useEffect, useMemo, useState } from 'react';
import api from '../api';
import { Save, Wallet } from 'lucide-react';

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
      setItems(sheetResponse.data || []);
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
          <button className="outline" type="button" onClick={() => load(periode)} disabled={loading}>Muat Ulang</button>
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
                  <th>Nama Guru</th>
                  <th>Jenis</th>
                  <th>Nama Ekstra</th>
                  <th>Jumlah Hadir</th>
                  <th>Tarif / Hadir</th>
                  <th>Jumlah Diterima</th>
                  <th className="print-only center print-ttd">TTD</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={item.id}>
                    <td className="print-only center">{index + 1}</td>
                    <td style={{ fontWeight: 700 }}>{item.teacherName}</td>
                    <td>
                      <span style={{ padding: '3px 9px', borderRadius: 999, background: item.teacherType === 'guru_ekstra' ? '#ede9fe' : '#dbeafe', color: item.teacherType === 'guru_ekstra' ? '#6d28d9' : '#1d4ed8', fontSize: 11, fontWeight: 800 }}>
                        {TYPE_LABELS[item.teacherType] || 'Manual'}
                      </span>
                    </td>
                    <td>{item.namaEkstra}</td>
                    <td><strong>{item.jumlahHadir}</strong> pertemuan</td>
                    <td>{rupiah.format(item.nominal)}</td>
                    <td style={{ fontWeight: 800 }}>{rupiah.format(item.jumlahDiterima)}</td>
                    <td className="print-only"></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {items.length === 0 && (
              <div className="empty">Belum ada penugasan pengajar ekstrakurikuler aktif di MyMada.</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
