import React from 'react';
import {
  BarChart,
  Bar,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

const CARD_THEMES = [
  { key: 'students', label: 'Siswa Aktif', color: 'theme-yellow' },
  { key: 'teachers', label: 'Guru', color: 'theme-red' },
  { key: 'classes', label: 'Rombel', color: 'theme-green' },
  { key: 'nonRombel', label: 'Siswa Non Rombel', color: 'theme-blue' },
  { key: 'extracurricular', label: 'Ekstrakurikuler', color: 'theme-purple' },
  { key: 'bojonegoro', label: 'Lahir Bojonegoro', color: 'theme-orange' },
  { key: 'outside', label: 'Lahir Luar Bojonegoro', color: 'theme-indigo' }
];

function StatCard({ label, value, color }) {
  return (
    <article className={`modern-stat-card ${color}`}>
      <div className="modern-stat-label">{label}</div>
      <div className="modern-stat-value">{typeof value === 'number' ? value.toLocaleString('id-ID') : value}</div>
      <div className="modern-stat-foot">Update realtime</div>
    </article>
  );
}

function ProgressRow({ label, value, total, color }) {
  const percent = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="origin-progress-row">
      <div className="origin-progress-top">
        <span>{label}</span>
        <span>{percent}%</span>
      </div>
      <div className="origin-progress-track">
        <div className="origin-progress-fill" style={{ width: `${percent}%`, background: color }} />
      </div>
    </div>
  );
}

export function DashboardHud({
  studentsCount = 0,
  activeStudentsCount,
  alumniStudentsCount = 0,
  nonRombelStudentsCount,
  teachersCount,
  subjectsCount = 0,
  classesCount,
  extracurricularCount,
  pondokGenderStats = [],
  bojonegoroBirthCount = 0,
  outsideBojonegoroBirthCount = 0,
  activeSchoolYearName = '',
  activeSemesterName = ''
}) {
  const totalPa = pondokGenderStats.reduce((sum, row) => sum + (Number(row.lakiLaki) || 0), 0);
  const totalPi = pondokGenderStats.reduce((sum, row) => sum + (Number(row.perempuan) || 0), 0);
  const totalGenderCount = totalPa + totalPi;

  const pieData = [
    { name: 'PA', value: totalPa, color: '#3b82f6' },
    { name: 'PI', value: totalPi, color: '#ec4899' }
  ];

  const pondokChartData = pondokGenderStats.slice(0, 7).map((row) => ({
    pondok: row.pondok.length > 16 ? `${row.pondok.slice(0, 16)}...` : row.pondok,
    PA: Number(row.lakiLaki) || 0,
    PI: Number(row.perempuan) || 0
  }));

  const cardValueMap = {
    students: activeStudentsCount,
    teachers: teachersCount,
    classes: classesCount,
    nonRombel: nonRombelStudentsCount,
    extracurricular: extracurricularCount,
    bojonegoro: bojonegoroBirthCount,
    outside: outsideBojonegoroBirthCount
  };

  const totalBirthData = bojonegoroBirthCount + outsideBojonegoroBirthCount;
  const classUtilization = classesCount > 0 ? Math.round((activeStudentsCount / classesCount) * 10) / 10 : 0;
  const teacherRatio = teachersCount > 0 ? Math.round((activeStudentsCount / teachersCount) * 10) / 10 : 0;
  const nonRombelRate = activeStudentsCount > 0 ? Math.round((nonRombelStudentsCount / activeStudentsCount) * 100) : 0;
  const completionScore = Math.max(
    0,
    Math.min(100, 100 - nonRombelRate)
  );

  return (
    <section className="dashboard-modern">
      <section className="modern-hero-strip">
        <div>
          <h3>Ringkasan Operasional Madrasah</h3>
          <p>
            {activeSchoolYearName || 'Tahun ajaran belum aktif'} • {activeSemesterName || 'Semester belum aktif'}
          </p>
        </div>
        <div className="modern-hero-metrics">
          <div><span>Total Siswa</span><strong>{studentsCount.toLocaleString('id-ID')}</strong></div>
          <div><span>Siswa Aktif</span><strong>{activeStudentsCount.toLocaleString('id-ID')}</strong></div>
          <div><span>Alumni</span><strong>{alumniStudentsCount.toLocaleString('id-ID')}</strong></div>
        </div>
      </section>

      <div className="modern-kpi-grid">
        {CARD_THEMES.map((item) => (
          <StatCard key={item.key} label={item.label} value={cardValueMap[item.key]} color={item.color} />
        ))}
      </div>

      <div className="modern-analytics-grid">
        <section className="modern-panel">
          <div className="modern-panel-head">
            <h3>Siswa Per Pondok</h3>
            <span>Top pondok aktif</span>
          </div>
          {pondokChartData.length === 0 ? (
            <div className="modern-empty">Belum ada data pondok.</div>
          ) : (
            <ResponsiveContainer width="100%" height={255}>
              <BarChart data={pondokChartData} margin={{ top: 8, right: 8, left: -10, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2ff" />
                <XAxis dataKey="pondok" tick={{ fontSize: 11 }} interval={0} angle={-10} textAnchor="end" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="PA" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                <Bar dataKey="PI" fill="#ec4899" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>

        <section className="modern-panel">
          <div className="modern-panel-head">
            <h3>Komposisi PA / PI</h3>
            <span>Siswa aktif</span>
          </div>
          {totalGenderCount === 0 ? (
            <div className="modern-empty">Belum ada data gender siswa aktif.</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} dataKey="value" innerRadius={52} outerRadius={82} paddingAngle={3}>
                  {pieData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
          <div className="modern-legend">
            {pieData.map((item) => (
              <div key={item.name} className="modern-legend-item">
                <span className="dot" style={{ background: item.color }} />
                {item.name}: {item.value}
              </div>
            ))}
          </div>
        </section>

        <section className="modern-panel">
          <div className="modern-panel-head">
            <h3>Asal Tempat Lahir</h3>
            <span>Bojonegoro vs luar Bojonegoro</span>
          </div>
          <div className="origin-progress-list">
            <ProgressRow label="Bojonegoro" value={bojonegoroBirthCount} total={totalBirthData} color="#22c55e" />
            <ProgressRow label="Luar Bojonegoro" value={outsideBojonegoroBirthCount} total={totalBirthData} color="#6366f1" />
          </div>
          <div className="origin-summary">
            Total terdata: <strong>{totalBirthData.toLocaleString('id-ID')}</strong>
          </div>
        </section>
      </div>

      <div className="modern-secondary-grid">
        <section className="modern-panel">
          <div className="modern-panel-head">
            <h3>Indikator Kinerja</h3>
            <span>Snapshot cepat kualitas data dan operasional</span>
          </div>
          <div className="indicator-grid">
            <div className="indicator-card">
              <span>Rata-rata Siswa / Rombel</span>
              <strong>{classUtilization}</strong>
            </div>
            <div className="indicator-card">
              <span>Rasio Siswa / Guru</span>
              <strong>{teacherRatio}</strong>
            </div>
            <div className="indicator-card">
              <span>Mapel Aktif</span>
              <strong>{subjectsCount}</strong>
            </div>
            <div className="indicator-card">
              <span>Skor Kerapian Rombel</span>
              <strong>{completionScore}%</strong>
            </div>
          </div>
          <div className="origin-progress-list">
            <ProgressRow label="Siswa Masuk Rombel" value={Math.max(0, activeStudentsCount - nonRombelStudentsCount)} total={Math.max(activeStudentsCount, 1)} color="#22c55e" />
            <ProgressRow label="Siswa Non Rombel" value={nonRombelStudentsCount} total={Math.max(activeStudentsCount, 1)} color="#ef4444" />
          </div>
        </section>

        <section className="modern-panel">
          <div className="modern-panel-head">
            <h3>Rekap Pondok Teratas</h3>
            <span>Distribusi siswa aktif per pondok</span>
          </div>
          <div className="pondok-table-wrap">
            <div className="pondok-table-head">
              <span>Pondok</span>
              <span>PA</span>
              <span>PI</span>
              <span>Total</span>
            </div>
            {(pondokGenderStats || []).slice(0, 8).map((row) => (
              <div className="pondok-table-row" key={row.pondok}>
                <span title={row.pondok}>{row.pondok}</span>
                <span>{row.lakiLaki}</span>
                <span>{row.perempuan}</span>
                <span>{row.total}</span>
              </div>
            ))}
            {(!pondokGenderStats || pondokGenderStats.length === 0) && (
              <div className="modern-empty">Belum ada data pondok siswa aktif.</div>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
