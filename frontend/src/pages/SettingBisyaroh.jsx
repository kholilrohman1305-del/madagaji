import { useEffect, useState } from 'react';
import api from '../api';
import { Settings, DollarSign, Clock, Save } from 'lucide-react';

const formatRupiah = (value) => {
  const num = Number(value || 0);
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(Number.isNaN(num) ? 0 : num);
};

export default function SettingBisyaroh() {
  const [form, setForm] = useState({
    RATE_HADIR: 0,
    RATE_IZIN: 0,
    RATE_TIDAK_HADIR: 0,
    RATE_TRANSPORT: 0,
    RATE_TRANSPORT_PNS: 0,
    RATE_TRANSPORT_INPASSING: 0,
    RATE_TRANSPORT_SERTIFIKASI: 0,
    RATE_TRANSPORT_NON_SERTIFIKASI: 0,
    WIYATHA_1_5: 0,
    WIYATHA_6_10: 0,
    WIYATHA_11_15: 0,
    WIYATHA_16_20: 0,
    WIYATHA_21_25: 0,
    WIYATHA_26_PLUS: 0
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await api.get('/master/settings');
    const data = res.data || {};
    setForm({
      RATE_HADIR: Number(data.RATE_HADIR || data.RATE_MENGAJAR || 0),
      RATE_IZIN: Number(data.RATE_IZIN || 0),
      RATE_TIDAK_HADIR: Number(data.RATE_TIDAK_HADIR || 0),
      RATE_TRANSPORT: Number(data.RATE_TRANSPORT || 0),
      RATE_TRANSPORT_PNS: Number(data.RATE_TRANSPORT_PNS || 0),
      RATE_TRANSPORT_INPASSING: Number(data.RATE_TRANSPORT_INPASSING || 0),
      RATE_TRANSPORT_SERTIFIKASI: Number(data.RATE_TRANSPORT_SERTIFIKASI || 0),
      RATE_TRANSPORT_NON_SERTIFIKASI: Number(data.RATE_TRANSPORT_NON_SERTIFIKASI || 0),
      WIYATHA_1_5: Number(data.WIYATHA_1_5 || 0),
      WIYATHA_6_10: Number(data.WIYATHA_6_10 || 0),
      WIYATHA_11_15: Number(data.WIYATHA_11_15 || 0),
      WIYATHA_16_20: Number(data.WIYATHA_16_20 || 0),
      WIYATHA_21_25: Number(data.WIYATHA_21_25 || 0),
      WIYATHA_26_PLUS: Number(data.WIYATHA_26_PLUS || 0)
    });
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const updateField = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const save = async () => {
    setSaving(true);
    await api.put('/master/settings', form);
    setSaving(false);
    load();
  };

  return (
    <div>
      <div className="modern-table-card">
        <div className="modern-table-title"><Settings size={24} /> Setting Bisyaroh</div>

        {loading ? (
          <div style={{ padding: 40 }}>
            <div className="skeleton-pulse" style={{ height: 300, borderRadius: 12 }}></div>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 28 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <DollarSign size={20} style={{ color: 'var(--primary-500)' }} />
                <span style={{ fontWeight: 700, fontSize: 16 }}>Rate Bisyaroh</span>
              </div>
              <div className="grid grid-2" style={{ gap: 20 }}>
                <div className="form-group">
                  <label className="form-label">Rate Hadir (per jam)</label>
                  <input
                    type="number"
                    value={form.RATE_HADIR}
                    onChange={e => updateField('RATE_HADIR', e.target.value)}
                    style={{ width: '100%' }}
                  />
                  <div style={{ fontSize: 13, color: 'var(--success-600)', marginTop: 4 }}>{formatRupiah(form.RATE_HADIR)}</div>
                </div>
                <div className="form-group">
                  <label className="form-label">Rate Izin (per jam)</label>
                  <input
                    type="number"
                    value={form.RATE_IZIN}
                    onChange={e => updateField('RATE_IZIN', e.target.value)}
                    style={{ width: '100%' }}
                  />
                  <div style={{ fontSize: 13, color: 'var(--warning-600)', marginTop: 4 }}>{formatRupiah(form.RATE_IZIN)}</div>
                </div>
                <div className="form-group">
                  <label className="form-label">Rate Tidak Hadir (per jam)</label>
                  <input
                    type="number"
                    value={form.RATE_TIDAK_HADIR}
                    onChange={e => updateField('RATE_TIDAK_HADIR', e.target.value)}
                    style={{ width: '100%' }}
                  />
                  <div style={{ fontSize: 13, color: 'var(--danger-600)', marginTop: 4 }}>{formatRupiah(form.RATE_TIDAK_HADIR)}</div>
                </div>
                <div className="form-group">
                  <label className="form-label">Rate Transport (per hari)</label>
                  <input
                    type="number"
                    value={form.RATE_TRANSPORT}
                    onChange={e => updateField('RATE_TRANSPORT', e.target.value)}
                    style={{ width: '100%' }}
                  />
                  <div style={{ fontSize: 13, color: 'var(--primary-600)', marginTop: 4 }}>{formatRupiah(form.RATE_TRANSPORT)}</div>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 28 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <DollarSign size={20} style={{ color: 'var(--primary-500)' }} />
                <span style={{ fontWeight: 700, fontSize: 16 }}>Rate Transport Harian (Per Klasifikasi)</span>
              </div>
              <div className="grid grid-2" style={{ gap: 20 }}>
                <div className="form-group">
                  <label className="form-label">PNS</label>
                  <input
                    type="number"
                    value={form.RATE_TRANSPORT_PNS}
                    onChange={e => updateField('RATE_TRANSPORT_PNS', e.target.value)}
                    style={{ width: '100%' }}
                  />
                  <div style={{ fontSize: 13, color: 'var(--primary-600)', marginTop: 4 }}>{formatRupiah(form.RATE_TRANSPORT_PNS)}</div>
                </div>
                <div className="form-group">
                  <label className="form-label">Inpassing</label>
                  <input
                    type="number"
                    value={form.RATE_TRANSPORT_INPASSING}
                    onChange={e => updateField('RATE_TRANSPORT_INPASSING', e.target.value)}
                    style={{ width: '100%' }}
                  />
                  <div style={{ fontSize: 13, color: 'var(--primary-600)', marginTop: 4 }}>{formatRupiah(form.RATE_TRANSPORT_INPASSING)}</div>
                </div>
                <div className="form-group">
                  <label className="form-label">Sertifikasi</label>
                  <input
                    type="number"
                    value={form.RATE_TRANSPORT_SERTIFIKASI}
                    onChange={e => updateField('RATE_TRANSPORT_SERTIFIKASI', e.target.value)}
                    style={{ width: '100%' }}
                  />
                  <div style={{ fontSize: 13, color: 'var(--primary-600)', marginTop: 4 }}>{formatRupiah(form.RATE_TRANSPORT_SERTIFIKASI)}</div>
                </div>
                <div className="form-group">
                  <label className="form-label">Non Sertifikasi (Default)</label>
                  <input
                    type="number"
                    value={form.RATE_TRANSPORT_NON_SERTIFIKASI}
                    onChange={e => updateField('RATE_TRANSPORT_NON_SERTIFIKASI', e.target.value)}
                    style={{ width: '100%' }}
                  />
                  <div style={{ fontSize: 13, color: 'var(--primary-600)', marginTop: 4 }}>{formatRupiah(form.RATE_TRANSPORT_NON_SERTIFIKASI)}</div>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <Clock size={20} style={{ color: 'var(--purple-500)' }} />
                <span style={{ fontWeight: 700, fontSize: 16 }}>Wiyatha Bhakti (Lama Mengajar)</span>
              </div>
              <div className="grid grid-2" style={{ gap: 20 }}>
                <div className="form-group">
                  <label className="form-label">Pengabdian 1-5 Tahun</label>
                  <input
                    type="number"
                    value={form.WIYATHA_1_5}
                    onChange={e => updateField('WIYATHA_1_5', e.target.value)}
                    style={{ width: '100%' }}
                  />
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{formatRupiah(form.WIYATHA_1_5)}</div>
                </div>
                <div className="form-group">
                  <label className="form-label">Pengabdian 6-10 Tahun</label>
                  <input
                    type="number"
                    value={form.WIYATHA_6_10}
                    onChange={e => updateField('WIYATHA_6_10', e.target.value)}
                    style={{ width: '100%' }}
                  />
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{formatRupiah(form.WIYATHA_6_10)}</div>
                </div>
                <div className="form-group">
                  <label className="form-label">Pengabdian 11-15 Tahun</label>
                  <input
                    type="number"
                    value={form.WIYATHA_11_15}
                    onChange={e => updateField('WIYATHA_11_15', e.target.value)}
                    style={{ width: '100%' }}
                  />
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{formatRupiah(form.WIYATHA_11_15)}</div>
                </div>
                <div className="form-group">
                  <label className="form-label">Pengabdian 16-20 Tahun</label>
                  <input
                    type="number"
                    value={form.WIYATHA_16_20}
                    onChange={e => updateField('WIYATHA_16_20', e.target.value)}
                    style={{ width: '100%' }}
                  />
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{formatRupiah(form.WIYATHA_16_20)}</div>
                </div>
                <div className="form-group">
                  <label className="form-label">Pengabdian 21-25 Tahun</label>
                  <input
                    type="number"
                    value={form.WIYATHA_21_25}
                    onChange={e => updateField('WIYATHA_21_25', e.target.value)}
                    style={{ width: '100%' }}
                  />
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{formatRupiah(form.WIYATHA_21_25)}</div>
                </div>
                <div className="form-group">
                  <label className="form-label">Pengabdian 26+ Tahun</label>
                  <input
                    type="number"
                    value={form.WIYATHA_26_PLUS}
                    onChange={e => updateField('WIYATHA_26_PLUS', e.target.value)}
                    style={{ width: '100%' }}
                  />
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{formatRupiah(form.WIYATHA_26_PLUS)}</div>
                </div>
              </div>
            </div>

            <div className="toolbar" style={{ marginTop: 0 }}>
              <button onClick={save} disabled={saving}>
                <Save size={18} /> {saving ? 'Menyimpan...' : 'Simpan Pengaturan'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
