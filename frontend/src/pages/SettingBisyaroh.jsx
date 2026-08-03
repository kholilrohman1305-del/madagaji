import { useEffect, useMemo, useState } from 'react';
import { Clock, DollarSign, Edit3, Plus, Save, Settings, Trash2, X } from 'lucide-react';
import api from '../api';

const EMPTY_RATE = { name: '', nominal: 0, unit: '', matchValue: '', minYears: '', maxYears: '', configKey: '' };

const formatRupiah = (value) => new Intl.NumberFormat('id-ID', {
  style: 'currency', currency: 'IDR', maximumFractionDigits: 0
}).format(Number(value || 0));

const groupIcon = (code) => code === 'wiyathabakti' ? Clock : DollarSign;

export default function SettingBisyaroh() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [groupEditor, setGroupEditor] = useState(null);
  const [groupName, setGroupName] = useState('');
  const [rateEditor, setRateEditor] = useState(null);
  const [rateForm, setRateForm] = useState(EMPTY_RATE);

  const activeGroup = useMemo(
    () => groups.find((group) => Number(group.id) === Number(rateEditor?.groupId)),
    [groups, rateEditor]
  );

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/master/bisyaroh-rate-groups');
      setGroups(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      setNotice({ type: 'error', text: error.response?.data?.message || error.message || 'Pengaturan gagal dimuat.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const run = async (action, successText) => {
    setBusy(true);
    setNotice(null);
    try {
      await action();
      setNotice({ type: 'success', text: successText });
      setGroupEditor(null);
      setRateEditor(null);
      setGroupName('');
      setRateForm(EMPTY_RATE);
      await load();
    } catch (error) {
      setNotice({ type: 'error', text: error.response?.data?.message || error.message || 'Perubahan gagal disimpan.' });
    } finally {
      setBusy(false);
    }
  };

  const openAddRate = (group) => {
    setRateEditor({ groupId: group.id, id: null });
    setRateForm({ ...EMPTY_RATE, unit: group.code === 'wiyathabakti' ? 'per bulan' : group.code === 'transport' ? 'per hari' : 'per jam' });
  };

  const openEditRate = (group, rate) => {
    setRateEditor({ groupId: group.id, id: rate.id });
    setRateForm({
      name: rate.name || '', nominal: Number(rate.nominal || 0), unit: rate.unit || '',
      matchValue: rate.matchValue || '', minYears: rate.minYears ?? '', maxYears: rate.maxYears ?? '', configKey: rate.configKey || ''
    });
  };

  const saveRate = () => {
    const payload = { ...rateForm, nominal: Number(rateForm.nominal || 0) };
    const request = rateEditor.id
      ? () => api.put(`/master/bisyaroh-rates/${rateEditor.id}`, payload)
      : () => api.post(`/master/bisyaroh-rate-groups/${rateEditor.groupId}/rates`, payload);
    run(request, rateEditor.id ? 'Rate berhasil diperbarui.' : 'Rate berhasil ditambahkan.');
  };

  const saveGroup = () => {
    const request = groupEditor?.id
      ? () => api.put(`/master/bisyaroh-rate-groups/${groupEditor.id}`, { name: groupName })
      : () => api.post('/master/bisyaroh-rate-groups', { name: groupName });
    run(request, groupEditor?.id ? 'Kelompok berhasil diperbarui.' : 'Kelompok berhasil ditambahkan.');
  };

  return (
    <div>
      <div className="modern-table-card">
        <div className="modern-table-title"><Settings size={24} /> Setting Bisyaroh</div>
        <div style={{ color: 'var(--muted)', marginBottom: 20, lineHeight: 1.6 }}>
          Kelola nominal dan aturan tarif. Perubahan akan dipakai pada perhitungan berikutnya atau setelah bisyaroh digenerate ulang.
        </div>

        {notice && (
          <div style={{ padding: '12px 16px', borderRadius: 12, marginBottom: 18, color: notice.type === 'error' ? '#991b1b' : '#166534', background: notice.type === 'error' ? '#fee2e2' : '#dcfce7' }}>
            {notice.text}
          </div>
        )}

        <div className="toolbar">
          <button onClick={() => { setGroupEditor({ id: null }); setGroupName(''); }} disabled={busy}>
            <Plus size={17} /> Tambah Kelompok Bisyaroh
          </button>
        </div>

        {groupEditor && (
          <div className="card" style={{ padding: 20, marginBottom: 22, border: '2px solid var(--primary-200)' }}>
            <div style={{ fontWeight: 800, marginBottom: 12 }}>{groupEditor.id ? 'Edit Kelompok' : 'Tambah Kelompok Bisyaroh'}</div>
            <div className="toolbar" style={{ marginBottom: 0 }}>
              <input value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="Contoh: Bisyaroh Tahfidz" style={{ minWidth: 280 }} />
              <button onClick={saveGroup} disabled={busy || !groupName.trim()}><Save size={17} /> Simpan</button>
              <button className="outline" onClick={() => setGroupEditor(null)}><X size={17} /> Batal</button>
            </div>
          </div>
        )}

        {rateEditor && activeGroup && (
          <div className="card" style={{ padding: 20, marginBottom: 22, border: '2px solid var(--primary-200)' }}>
            <div style={{ fontWeight: 800, marginBottom: 14 }}>{rateEditor.id ? 'Edit' : 'Tambah'} Rate — {activeGroup.name}</div>
            <div className="grid grid-2" style={{ gap: 14 }}>
              <label className="form-group"><span className="form-label">Nama Rate</span><input value={rateForm.name} onChange={(e) => setRateForm((p) => ({ ...p, name: e.target.value }))} /></label>
              <label className="form-group"><span className="form-label">Nominal</span><input type="number" min="0" value={rateForm.nominal} onChange={(e) => setRateForm((p) => ({ ...p, nominal: e.target.value }))} /><small>{formatRupiah(rateForm.nominal)}</small></label>
              <label className="form-group"><span className="form-label">Satuan</span><input value={rateForm.unit} onChange={(e) => setRateForm((p) => ({ ...p, unit: e.target.value }))} placeholder="per jam / per hari / per bulan" /></label>
              {(activeGroup.code === 'bisyaroh' || activeGroup.code === 'transport') && (
                <label className="form-group">
                  <span className="form-label">Kode Penerapan</span>
                  <input disabled={Boolean(rateForm.configKey && !rateForm.configKey.startsWith('CUSTOM_'))} value={rateForm.matchValue} onChange={(e) => setRateForm((p) => ({ ...p, matchValue: e.target.value }))} placeholder="DEFAULT atau klasifikasi guru" />
                  <small style={{ color: 'var(--muted)' }}>Gunakan DEFAULT untuk tarif umum; lainnya harus sama dengan klasifikasi guru.</small>
                </label>
              )}
              {activeGroup.code === 'wiyathabakti' && (
                <>
                  <label className="form-group"><span className="form-label">Minimal Tahun</span><input type="number" min="0" value={rateForm.minYears} onChange={(e) => setRateForm((p) => ({ ...p, minYears: e.target.value }))} /></label>
                  <label className="form-group"><span className="form-label">Maksimal Tahun</span><input type="number" min="0" value={rateForm.maxYears} onChange={(e) => setRateForm((p) => ({ ...p, maxYears: e.target.value }))} placeholder="Kosongkan jika tanpa batas" /></label>
                </>
              )}
            </div>
            <div className="toolbar" style={{ marginTop: 18, marginBottom: 0 }}>
              <button onClick={saveRate} disabled={busy || !rateForm.name.trim()}><Save size={17} /> Simpan Rate</button>
              <button className="outline" onClick={() => setRateEditor(null)}><X size={17} /> Batal</button>
            </div>
          </div>
        )}

        {loading ? <div className="empty">Memuat pengaturan...</div> : groups.map((group) => {
          const Icon = groupIcon(group.code);
          return (
            <section key={group.id} className="card" style={{ padding: 22, marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <Icon size={21} color="var(--primary-600)" />
                <strong style={{ fontSize: 17 }}>{group.name}</strong>
                {group.isCore && <span className="badge info">Kelompok Utama</span>}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                  {!group.isCore && <button className="outline sm" onClick={() => { setGroupEditor({ id: group.id }); setGroupName(group.name); }}><Edit3 size={15} /> Edit Kelompok</button>}
                  {!group.isCore && <button className="danger sm" onClick={() => window.confirm(`Hapus kelompok ${group.name} beserta seluruh ratenya?`) && run(() => api.delete(`/master/bisyaroh-rate-groups/${group.id}`), 'Kelompok berhasil dihapus.')}><Trash2 size={15} /> Hapus</button>}
                  <button className="sm" onClick={() => openAddRate(group)}><Plus size={15} /> Tambah Rate</button>
                </div>
              </div>

              {group.code.startsWith('custom_') && <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 12 }}>Kelompok tambahan adalah katalog tarif. Nominal baru masuk perhitungan setelah mempunyai sumber jumlah dan penerima.</div>}
              <div style={{ overflowX: 'auto' }}>
                <table className="table">
                  <thead><tr><th>Nama Rate</th><th>Aturan</th><th>Satuan</th><th>Nominal</th><th>Aksi</th></tr></thead>
                  <tbody>
                    {group.rates.length === 0 && <tr><td colSpan="5" className="empty">Belum ada rate.</td></tr>}
                    {group.rates.map((rate) => {
                      const rule = group.code === 'wiyathabakti'
                        ? `${rate.minYears ?? 0}–${rate.maxYears ?? '∞'} tahun`
                        : (rate.matchValue || 'Katalog/manual');
                      return (
                        <tr key={rate.id}>
                          <td><strong>{rate.name}</strong></td><td>{rule}</td><td>{rate.unit || '-'}</td><td><strong>{formatRupiah(rate.nominal)}</strong></td>
                          <td><div style={{ display: 'flex', gap: 7 }}><button className="outline sm" onClick={() => openEditRate(group, rate)}><Edit3 size={14} /> Edit</button><button className="danger sm" onClick={() => window.confirm(`Hapus rate ${rate.name}? Nilainya tidak akan dipakai pada generate berikutnya.`) && run(() => api.delete(`/master/bisyaroh-rates/${rate.id}`), 'Rate berhasil dihapus.')}><Trash2 size={14} /> Hapus</button></div></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
