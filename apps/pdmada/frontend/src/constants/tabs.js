export const TABS = [
  { key: 'dashboard', label: 'Dashboard', icon: 'dashboard' },

  // Data Master
  { key: 'students', label: 'Data Siswa', icon: 'students', isGroup: true },
  { key: 'studentsActive', label: 'Siswa Aktif', icon: 'dot', parent: 'students' },
  { key: 'studentsMoved', label: 'Siswa Pindah', icon: 'dot', parent: 'students' },
  { key: 'studentsAlumni', label: 'Siswa Alumni', icon: 'dot', parent: 'students' },
  { key: 'studentDocumentChecks', label: 'Cek Dokumen', icon: 'archive' },
  { key: 'teachers', label: 'Data Guru', icon: 'teacher' },
  { key: 'classes', label: 'Kelas', icon: 'grid' },
  { key: 'subjects', label: 'Mapel', icon: 'book' },
  { key: 'extracurriculars', label: 'Ekstrakurikuler', icon: 'activity' },
  { key: 'pondokPesantren', label: 'Pondok Pesantren', icon: 'mosque' },

  // Akademik
  { key: 'schoolYears', label: 'Tahun Ajaran', icon: 'calendar' },
  { key: 'classSubjectSettings', label: 'Setting Mapel Kelas', icon: 'settings' },
  { key: 'studentScores', label: 'Nilai', icon: 'book' },
  { key: 'reportCards', label: 'Rapor & Leger Nilai', icon: 'report' },
  { key: 'studentAchievements', label: 'Prestasi Siswa', icon: 'award' },
  { key: 'studentRecommendations', label: 'Rekomendasi Siswa', icon: 'target' },
  { key: 'kesiswaan', label: 'Kesiswaan', icon: 'userGroup' },

  // Administrasi
  { key: 'teacherTasks', label: 'Tugas Tambahan', icon: 'clipboard' },
  { key: 'bukuInduk', label: 'Buku Induk', icon: 'book' },
  { key: 'archives', label: 'Dokumen & Arsip', icon: 'archive' },

  // Pengaturan
  { key: 'users', label: 'Role & Akun', icon: 'userGroup' },
  { key: 'schoolSettings', label: 'Pengaturan Madrasah', icon: 'settings' }
];
