import React, { useEffect, useState } from 'react';

const INITIAL_FORM = {
  school_name: '',
  school_subtitle: '',
  npsn: '',
  nsm: '',
  address: '',
  village: '',
  city: '',
  province: '',
  postal_code: '',
  phone: '',
  email: '',
  website: '',
  logo_url: '',
  principal_name: '',
  principal_nip: ''
};

export function SchoolSettingsSection({ api, setError, pushToast }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);

  useEffect(() => {
    async function loadSettings() {
      setLoading(true);
      try {
        const settings = await api.schoolSettings.get();
        setForm({ ...INITIAL_FORM, ...(settings || {}) });
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, [api, setError]);

  async function submit() {
    setSaving(true);
    try {
      const saved = await api.schoolSettings.save(form);
      setForm({ ...INITIAL_FORM, ...(saved || {}) });
      pushToast?.('success', 'Pengaturan tersimpan', 'Profil madrasah berhasil diperbarui.');
    } catch (err) {
      setError(err.message);
      pushToast?.('error', 'Gagal simpan pengaturan', err.message);
    } finally {
      setSaving(false);
    }
  }

  async function onUploadLogo(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const result = await api.uploads.uploadLogo(file);
      setForm((prev) => ({ ...prev, logo_url: result.file_url || '' }));
      pushToast?.('success', 'Logo terupload', 'Logo madrasah berhasil diunggah.');
    } catch (err) {
      setError(err.message);
      pushToast?.('error', 'Upload logo gagal', err.message);
    } finally {
      setUploadingLogo(false);
      event.target.value = '';
    }
  }

  return (
    <section className="student-shell module-shell">
      <div className="module-settings-hero">
        <div>
          <h3>Profil Madrasah</h3>
          <p>Data ini dipakai untuk header cetak buku induk, rapor, leger, dan dokumen akademik lainnya.</p>
        </div>
        <button className="btn-gradient" onClick={submit} disabled={saving || loading}>
          {saving ? 'Menyimpan...' : 'Simpan Pengaturan'}
        </button>
      </div>

      <div className="module-stats-grid">
        <article className="module-stat-card">
          <span>Nama Madrasah</span>
          <strong>{form.school_name || '-'}</strong>
        </article>
        <article className="module-stat-card">
          <span>NPSN / NSM</span>
          <strong>{form.npsn || '-'} / {form.nsm || '-'}</strong>
        </article>
        <article className="module-stat-card">
          <span>Kepala Madrasah</span>
          <strong>{form.principal_name || '-'}</strong>
        </article>
      </div>

      <div className="table-card">
        <div className="module-settings-grid">
          <label>Nama Madrasah
            <input value={form.school_name} onChange={(e) => setForm((prev) => ({ ...prev, school_name: e.target.value }))} />
          </label>
          <label>Subjudul / Nama Resmi
            <input value={form.school_subtitle} onChange={(e) => setForm((prev) => ({ ...prev, school_subtitle: e.target.value }))} />
          </label>
          <label>NPSN
            <input value={form.npsn} onChange={(e) => setForm((prev) => ({ ...prev, npsn: e.target.value }))} />
          </label>
          <label>NSM
            <input value={form.nsm} onChange={(e) => setForm((prev) => ({ ...prev, nsm: e.target.value }))} />
          </label>
          <label className="full">Alamat Madrasah
            <textarea value={form.address} onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))} />
          </label>
          <label>Kelurahan / Desa
            <input value={form.village} onChange={(e) => setForm((prev) => ({ ...prev, village: e.target.value }))} />
          </label>
          <label>Kabupaten / Kota
            <input value={form.city} onChange={(e) => setForm((prev) => ({ ...prev, city: e.target.value }))} />
          </label>
          <label>Provinsi
            <input value={form.province} onChange={(e) => setForm((prev) => ({ ...prev, province: e.target.value }))} />
          </label>
          <label>Kode Pos
            <input value={form.postal_code} onChange={(e) => setForm((prev) => ({ ...prev, postal_code: e.target.value }))} />
          </label>
          <label>Telepon
            <input value={form.phone} onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))} />
          </label>
          <label>Email
            <input value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} />
          </label>
          <label>Website
            <input value={form.website} onChange={(e) => setForm((prev) => ({ ...prev, website: e.target.value }))} />
          </label>
          <label className="full">Logo Madrasah (JPG/JPEG)
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="file" accept=".jpg,.jpeg,image/jpeg" onChange={onUploadLogo} />
              {uploadingLogo ? <span>Mengupload...</span> : null}
              {form.logo_url ? (
                <button type="button" className="ghost" onClick={() => window.open(api.resolveFileUrl(form.logo_url), '_blank', 'noopener,noreferrer')}>
                  Lihat Logo
                </button>
              ) : null}
            </div>
          </label>
          <label>Nama Kepala Madrasah
            <input value={form.principal_name} onChange={(e) => setForm((prev) => ({ ...prev, principal_name: e.target.value }))} />
          </label>
          <label>NIP Kepala Madrasah
            <input value={form.principal_nip} onChange={(e) => setForm((prev) => ({ ...prev, principal_nip: e.target.value }))} />
          </label>
        </div>
      </div>
    </section>
  );
}
