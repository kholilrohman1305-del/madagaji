import { useEffect, useMemo, useState } from "react";
import api from "../api";
import { toast } from "../utils/toast";
import { CalendarClock, Save, Clock, Trash2 } from "lucide-react";

const DAYS = ["Senin","Selasa","Rabu","Kamis","Jumat","Sabtu","Minggu"];

export default function Penjadwalan() {
  const [meta, setMeta] = useState(null);
  const [rows, setRows] = useState([]);
  const [day, setDay] = useState("Senin");
  const [kelasFilter, setKelasFilter] = useState("ALL");
  const [hoursByDay, setHoursByDay] = useState({});
  const [effectiveDays, setEffectiveDays] = useState(DAYS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [conflictAlert, setConflictAlert] = useState({ open: false, items: [] });

  useEffect(() => {
    let alive = true;
    Promise.all([
      api.get("/scheduler/meta"),
      api.get("/scheduler/config")
    ]).then(([metaRes, configRes]) => {
      if (!alive) return;
      setMeta(metaRes.data);
      const cfgDays = configRes.data?.days || [];
      const nextDays = cfgDays.length > 0 ? cfgDays : DAYS;
      setEffectiveDays(nextDays);
      setHoursByDay(configRes.data?.hoursByDay || {});
      if (!nextDays.includes(day)) setDay(nextDays[0] || "Senin");
    }).finally(() => {
      if (alive) setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.get("/schedule", { params: { hari: day, kelas: kelasFilter === "ALL" ? undefined : kelasFilter } }).then(res => {
      if (!alive) return;
      setRows(res.data || []);
    }).finally(() => {
      if (alive) setLoading(false);
    });
    return () => { alive = false; };
  }, [day, kelasFilter]);

  // Derive hours from config; fallback to max jam_ke found in existing schedule rows
  const hours = useMemo(() => {
    const cfgHours = Number(hoursByDay[day] || 0);
    if (cfgHours > 0) return cfgHours;
    return rows
      .filter(r => r.hari === day)
      .reduce((max, r) => Math.max(max, Number(r.jamKe) || 0), 0);
  }, [hoursByDay, day, rows]);

  const grid = useMemo(() => {
    const map = new Map();
    rows.filter(r => r.hari === day).forEach(r => {
      map.set(`${r.kelas}-${r.jamKe}`, r);
    });
    return map;
  }, [rows, day]);

  const teacherColor = (guruId) => {
    if (!guruId) return "transparent";
    const str = String(guruId);
    let hash = 0;
    for (let i = 0; i < str.length; i += 1) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
    const hue = hash % 360;
    const sat = 65 + (hash % 25);
    const light = 88 - ((hash >> 3) % 14);
    return `hsl(${hue} ${sat}% ${light}%)`;
  };

  const visibleClasses = useMemo(() => {
    if (!meta) return [];
    if (kelasFilter === "ALL") return meta.classes;
    return meta.classes.filter(c => String(c.id) === String(kelasFilter));
  }, [meta, kelasFilter]);

  const subjectMap = useMemo(() => {
    const m = new Map();
    (meta?.subjects || []).forEach(s => m.set(String(s.id), s.name));
    return m;
  }, [meta]);

  const teacherMap = useMemo(() => {
    const m = new Map();
    (meta?.teachers || []).forEach(t => m.set(String(t.id), t.name));
    return m;
  }, [meta]);

  const updateCell = (classId, jamKe, patch) => {
    const key = `${classId}-${jamKe}`;
    const existing = grid.get(key);
    const next = { ...(existing || { hari: day, jamKe: String(jamKe), kelas: String(classId) }), ...patch };
    setRows(prev => {
      const other = prev.filter(r => !(r.hari === day && String(r.kelas) === String(classId) && String(r.jamKe) === String(jamKe)));
      return [...other, next];
    });
  };

  const clearCell = async (classId, jamKe) => {
    const key = `${classId}-${jamKe}`;
    const row = grid.get(key);
    if (!row) return;
    if (row.id) {
      if (!window.confirm("Hapus jadwal slot ini?")) return;
      setDeleting(key);
      try {
        await api.delete(`/schedule/${row.id}`);
        setRows(prev => prev.filter(r => !(r.hari === day && String(r.kelas) === String(classId) && String(r.jamKe) === String(jamKe))));
      } catch { /* axios interceptor handles error */ } finally {
        setDeleting(null);
      }
    } else {
      setRows(prev => prev.filter(r => !(r.hari === day && String(r.kelas) === String(classId) && String(r.jamKe) === String(jamKe))));
    }
  };

  const saveAll = async () => {
    if (saving) return;
    const toSave = rows.filter(r => r.hari === day && r.mapelId && r.guruId);
    if (toSave.length === 0) {
      toast.info("Tidak ada perubahan jadwal yang bisa disimpan.");
      return;
    }

    const classNameById = new Map((meta?.classes || []).map(c => [String(c.id), c.name]));
    const subjectNameById = new Map((meta?.subjects || []).map(s => [String(s.id), s.name]));

    const collisions = [];
    const assignmentBySlotGuru = new Map();
    toSave.forEach((r) => {
      const key = `${r.hari}|${r.jamKe}|${r.guruId}`;
      const existing = assignmentBySlotGuru.get(key);
      const payload = {
        className: classNameById.get(String(r.kelas)) || r.kelas,
        subjectName: subjectNameById.get(String(r.mapelId)) || r.mapelId
      };
      if (!existing) {
        assignmentBySlotGuru.set(key, [payload]);
      } else {
        existing.push(payload);
      }
    });
    assignmentBySlotGuru.forEach((items, key) => {
      if (items.length < 2) return;
      const [slotDay, slotHour] = key.split("|");
      collisions.push(
        `${slotDay} jam ${slotHour}: ${items.map(item => `${item.className} (${item.subjectName})`).join(" | ")}`
      );
    });

    if (collisions.length > 0) {
      setConflictAlert({ open: true, items: collisions });
    }

    const updates = toSave.filter(r => r.id);
    const creates = toSave.filter(r => !r.id);

    setSaving(true);
    try {
      const results = [];

      const updateResults = await Promise.allSettled(
        updates.map(r => api.put(`/schedule/${r.id}`, {
          hari: r.hari, jamKe: r.jamKe, kelas: r.kelas, mapelId: r.mapelId, guruId: r.guruId
        }, { skipToast: true }))
      );
      results.push(...updateResults);

      for (const r of creates) {
        const createResult = await api.post("/schedule", {
          hari: r.hari, jamKe: [r.jamKe], kelas: r.kelas, mapelId: r.mapelId, guruId: r.guruId
        }, { skipToast: true })
          .then(value => ({ status: "fulfilled", value }))
          .catch(reason => ({ status: "rejected", reason }));
        results.push(createResult);
      }

      const failed = results.filter(result => result.status === "rejected");

      if (failed.length > 0) {
        const conflictError = failed.find(result => result.reason?.response?.status === 409);
        if (conflictError) {
          const message = conflictError.reason?.response?.data?.message || "Jadwal bentrok. Periksa guru/jam yang sama.";
          const nextItems = [message];
          if (Array.isArray(conflictError.reason?.response?.data?.conflicts)) {
            conflictError.reason.response.data.conflicts.forEach((item) => {
              if (item) nextItems.push(String(item));
            });
          }
          setConflictAlert({ open: true, items: nextItems });
          toast.warn("Jadwal bentrok terdeteksi.");
        } else {
          toast.error(`Sebagian jadwal gagal disimpan. Berhasil: ${results.length - failed.length}, gagal: ${failed.length}.`);
        }
      } else {
        toast.success(`Berhasil menyimpan ${results.length} slot jadwal.`);
      }

      const res = await api.get("/schedule", { params: { hari: day }, skipToast: true });
      setRows(res.data || []);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="modern-table-card">
        <div className="modern-table-title"><CalendarClock size={24} /> Penjadwalan Manual</div>
        <div className="toolbar">
          <select value={day} onChange={e => setDay(e.target.value)}>
            {effectiveDays.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={kelasFilter} onChange={e => setKelasFilter(e.target.value)}>
            <option value="ALL">Semua Kelas</option>
            {meta?.classes?.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--muted)", fontSize: 14 }}>
            <Clock size={18} /> Jam per hari: <strong>{hours || "-"}</strong>
          </div>
          <button className="secondary" onClick={saveAll} disabled={saving}>
            <Save size={18} /> {saving ? "Menyimpan..." : "Simpan Semua"}
          </button>
        </div>
      </div>

      {conflictAlert.open && (
        <div className="conflict-alert-backdrop">
          <div className="conflict-alert-modal">
            <div className="conflict-alert-header">
              <div className="conflict-alert-title-wrap">
                <h3 className="conflict-alert-title">Alert Jadwal Bentrok</h3>
                <p className="conflict-alert-subtitle">
                  Jadwal tetap disimpan, tetapi ada bentrok pada poin berikut:
                </p>
              </div>
              <button
                type="button"
                className="conflict-alert-close"
                onClick={() => setConflictAlert({ open: false, items: [] })}
              >
                Tutup
              </button>
            </div>
            <div className="conflict-alert-body">
              <ol className="conflict-alert-list">
                {conflictAlert.items.map((item, idx) => (
                  <li key={`${item}-${idx}`}>{item}</li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      )}

      <div className="modern-table-card" style={{ marginTop: 24, overflowX: "auto" }}>
        {(!meta || loading) && (
          <div style={{ padding: 40 }}>
            <div className="skeleton-pulse" style={{ height: 300, borderRadius: 12 }}></div>
          </div>
        )}
        {meta && !loading && hours === 0 && (
          <div className="empty">Jam per hari belum dikonfigurasi. Atur di menu Konfigurasi Jadwal.</div>
        )}
        {meta && !loading && hours > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th style={{ minWidth: 100 }}>Kelas</th>
                {Array.from({ length: hours }).map((_, i) => (
                  <th key={i} style={{ minWidth: 160 }}>Jam {i + 1}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleClasses.map(c => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 700, color: "var(--primary-700)", whiteSpace: "nowrap" }}>{c.name}</td>
                  {Array.from({ length: hours }).map((_, i) => {
                    const jamKe = i + 1;
                    const cellKey = `${c.id}-${jamKe}`;
                    const row = grid.get(cellKey) || {};
                    const hasData = !!(row.mapelId || row.guruId);
                    const mapelName = row.namaMapel || subjectMap.get(String(row.mapelId)) || "";
                    const guruName = row.namaGuru || teacherMap.get(String(row.guruId)) || "";
                    return (
                      <td key={cellKey} style={{ padding: 4 }}>
                        <div style={{
                          display: "grid", gap: 5, padding: 7, borderRadius: 10,
                          background: hasData ? teacherColor(row.guruId) : "#f8fafc",
                          border: hasData ? "none" : "1.5px dashed #e2e8f0",
                          minWidth: 150
                        }}>
                          {hasData && (
                            <div style={{ marginBottom: 2 }}>
                              <div style={{ fontWeight: 700, fontSize: 12, color: "#1e293b", lineHeight: 1.4 }}>
                                {mapelName || "—"}
                              </div>
                              <div style={{ fontSize: 11, color: "#475569" }}>
                                {guruName || "—"}
                              </div>
                            </div>
                          )}
                          <select
                            value={String(row.mapelId || "")}
                            onChange={e => updateCell(c.id, jamKe, { mapelId: e.target.value, namaMapel: subjectMap.get(e.target.value) || "" })}
                            style={{ fontSize: 11 }}
                          >
                            <option value="">Pilih Mapel</option>
                            {meta.subjects.map(s => (
                              <option key={s.id} value={String(s.id)}>{s.name}</option>
                            ))}
                          </select>
                          <select
                            value={String(row.guruId || "")}
                            onChange={e => updateCell(c.id, jamKe, { guruId: e.target.value, namaGuru: teacherMap.get(e.target.value) || "" })}
                            style={{ fontSize: 11 }}
                          >
                            <option value="">Pilih Guru</option>
                            {meta.teachers.map(t => (
                              <option key={t.id} value={String(t.id)}>{t.name}</option>
                            ))}
                          </select>
                          {hasData && (
                            <button
                              style={{
                                display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                                background: "#fee2e2", color: "#dc2626", border: "none", borderRadius: 6,
                                padding: "3px 0", fontSize: 11, cursor: "pointer", fontWeight: 600, width: "100%"
                              }}
                              onClick={() => clearCell(c.id, jamKe)}
                              disabled={deleting === cellKey}
                              title="Hapus slot ini"
                            >
                              <Trash2 size={11} /> {deleting === cellKey ? "..." : "Hapus Slot"}
                            </button>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

