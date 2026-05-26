import React, { useEffect, useMemo, useState } from 'react';

export function KesiswaanSection({ data, api, loadAll }) {
  const [sourceClassId, setSourceClassId] = useState('');
  const [targetClassId, setTargetClassId] = useState('');
  const [targetStatus, setTargetStatus] = useState('aktif');
  const [tahunLulus, setTahunLulus] = useState(new Date().getFullYear());
  const [rows, setRows] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [loadError, setLoadError] = useState('');

  const activeSchoolYear = useMemo(
    () => data.schoolYears.find((year) => Number(year.is_active) === 1),
    [data.schoolYears]
  );
  const activeSemester = useMemo(
    () => data.semesters.find((semester) => Number(semester.is_active) === 1),
    [data.semesters]
  );

  useEffect(() => {
    if (!sourceClassId) {
      setRows([]);
      setSelectedIds([]);
      return;
    }
    let mounted = true;
    (async () => {
      try {
        setLoadingRows(true);
        setLoadError('');
        const list = await api.studentAffairs.listPromotionCandidates(sourceClassId);
        if (!mounted) return;
        setRows(Array.isArray(list) ? list : []);
        setSelectedIds([]);
      } catch (err) {
        if (!mounted) return;
        setRows([]);
        setSelectedIds([]);
        setLoadError(err.message || 'Gagal memuat siswa kelas asal.');
      } finally {
        if (mounted) setLoadingRows(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [sourceClassId, api]);

  useEffect(() => {
    if (!targetClassId) return;
    setTargetStatus('aktif');
  }, [targetClassId]);

  function toggleSelectAll() {
    if (selectedIds.length === rows.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(rows.map((r) => r.id));
    }
  }

  function toggleSelect(id) {
    setSelectedIds((prev) => (
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    ));
  }

  async function runPromotion() {
    if (!selectedIds.length) {
      alert('Pilih minimal satu siswa.');
      return;
    }
    if (!targetClassId && targetStatus !== 'lulus') {
      alert('Pilih kelas tujuan.');
      return;
    }
    if (targetStatus === 'lulus' && !tahunLulus) {
      alert('Tahun lulus wajib diisi.');
      return;
    }
    if (!window.confirm(`Proses ${selectedIds.length} siswa sekarang?`)) return;

    try {
      setProcessing(true);
      await api.studentAffairs.runPromotion({
        studentIds: selectedIds,
        sourceClassId: sourceClassId ? Number(sourceClassId) : null,
        targetClassId: targetStatus === 'lulus' ? null : Number(targetClassId),
        targetStatus,
        tahunLulus: targetStatus === 'lulus' ? Number(tahunLulus) : null,
        schoolYearId: activeSchoolYear?.id || null,
        semesterId: activeSemester?.id || null
      });
      await loadAll();
      if (sourceClassId) {
        const list = await api.studentAffairs.listPromotionCandidates(sourceClassId);
        setRows(Array.isArray(list) ? list : []);
      }
      setSelectedIds([]);
      alert('Berhasil memproses kenaikan kelas.');
    } catch (err) {
      alert(err.message || 'Gagal memproses kenaikan kelas.');
    } finally {
      setProcessing(false);
    }
  }

  async function rollbackLastPromotion() {
    if (!selectedIds.length) {
      alert('Pilih minimal satu siswa untuk rollback.');
      return;
    }
    if (!window.confirm(`Rollback mutasi terakhir untuk ${selectedIds.length} siswa?`)) return;

    try {
      setProcessing(true);
      const result = await api.studentAffairs.rollbackLastPromotion({ studentIds: selectedIds });
      await loadAll();
      if (sourceClassId) {
        const list = await api.studentAffairs.listPromotionCandidates(sourceClassId);
        setRows(Array.isArray(list) ? list : []);
      }
      setSelectedIds([]);
      alert(result?.message || 'Rollback berhasil.');
    } catch (err) {
      alert(err.message || 'Gagal rollback mutasi.');
    } finally {
      setProcessing(false);
    }
  }

  return (
    <section className="kna-wrap">
      <div className="kna-grid">
        <div className="kna-card">
          <h3>1. Pilih Kelas Asal</h3>
          <label>Kelas Asal</label>
          <select value={sourceClassId} onChange={(e) => setSourceClassId(e.target.value)}>
            <option value="">-- Pilih Kelas --</option>
            {data.classes.map((cls) => (
              <option key={cls.id} value={cls.id}>{cls.name}</option>
            ))}
          </select>
        </div>

        <div className="kna-card">
          <h3>2. Tujuan Kenaikan</h3>
          <label>Kelas Tujuan</label>
          <select value={targetClassId} onChange={(e) => setTargetClassId(e.target.value)} disabled={targetStatus === 'lulus'}>
            <option value="">-- Pilih Kelas Tujuan --</option>
            {data.classes.map((cls) => (
              <option key={cls.id} value={cls.id}>{cls.name}</option>
            ))}
          </select>
          <label>Status Siswa</label>
          <select value={targetStatus} onChange={(e) => setTargetStatus(e.target.value)}>
            <option value="aktif">Aktif (Naik Kelas)</option>
            <option value="lulus">Lulus</option>
          </select>
          {targetStatus === 'lulus' && (
            <>
              <label>Tahun Lulus</label>
              <input type="number" min="2000" max="2999" value={tahunLulus} onChange={(e) => setTahunLulus(e.target.value)} />
            </>
          )}
          <button className="btn-gradient" onClick={runPromotion} disabled={processing}>
            {processing ? 'Memproses...' : 'Proses Kenaikan / Lulus'}
          </button>
          <button className="ghost" onClick={rollbackLastPromotion} disabled={processing || !selectedIds.length}>
            Rollback Mutasi Terakhir
          </button>
        </div>
      </div>

      <div className="table-card student-table-card">
        {loadError && <div className="student-step-alert">{loadError}</div>}
        <div className="student-meta-bar">
          <span className="pill">Terpilih: {selectedIds.length} siswa</span>
          <button className="ghost" onClick={toggleSelectAll} disabled={!rows.length}>Pilih Semua</button>
        </div>
        <div className="student-table">
          <div className="student-table-head sticky kna-head">
            <span><input type="checkbox" checked={rows.length > 0 && selectedIds.length === rows.length} onChange={toggleSelectAll} /></span>
            <span>Nama Siswa</span>
            <span>NIS</span>
            <span>Kelas Saat Ini</span>
          </div>
          {loadingRows && (
            <div className="student-empty">Memuat siswa...</div>
          )}
          {!loadingRows && rows.map((item) => (
            <div className="student-table-row kna-row" key={item.id}>
              <span><input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggleSelect(item.id)} /></span>
              <span className="student-name">{item.name}</span>
              <span>{item.nis_local || item.nisn || '-'}</span>
              <span>{item.class_name || '-'}</span>
            </div>
          ))}
          {!loadingRows && !rows.length && (
            <div className="student-empty">Pilih kelas asal untuk menampilkan siswa aktif.</div>
          )}
        </div>
      </div>
    </section>
  );
}
