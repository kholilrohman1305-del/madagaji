const XLSX = require('xlsx');

const templates = {
  students: [
    'nama_siswa',
    'nomor_induk',
    'jenis_kelamin',
    'nisn',
    'nis_lokal',
    'nism',
    'nik',
    'no_kip',
    'no_akta_lahir',
    'kelas',
    'tahun_ajaran',
    'tanggal_masuk',
    'tempat_lahir',
    'tanggal_lahir',
    'agama',
    'status_siswa',
    'asal_sekolah',
    'npsn_asal_sekolah',
    'hobi',
    'cita_cita',
    'kebutuhan_khusus',
    'gol_darah',
    'tinggi_cm',
    'berat_kg',
    'transportasi',
    'jarak_km',
    'penerima_kps',
    'nama_darurat',
    'telp_darurat',
    'hubungan_darurat',
    'no_kk',
    'kewarganegaraan',
    'tinggal_bersama',
    'jumlah_saudara',
    'anak_ke',
    'no_hp',
    'pondok_pesantren',
    'ayah_nik',
    'ayah_nama',
    'ayah_tempat_lahir',
    'ayah_tanggal_lahir',
    'ayah_status',
    'ayah_pendidikan',
    'ayah_pekerjaan',
    'ayah_domisili',
    'ayah_no_hp',
    'ayah_penghasilan_bulanan',
    'ayah_alamat',
    'ibu_nik',
    'ibu_nama',
    'ibu_tempat_lahir',
    'ibu_tanggal_lahir',
    'ibu_status',
    'ibu_pendidikan',
    'ibu_pekerjaan',
    'ibu_domisili',
    'ibu_no_hp',
    'ibu_penghasilan_bulanan',
    'ibu_alamat',
    'wali_nik',
    'wali_nama',
    'wali_tempat_lahir',
    'wali_tanggal_lahir',
    'wali_status',
    'wali_pendidikan',
    'wali_pekerjaan',
    'wali_domisili',
    'wali_no_hp',
    'wali_penghasilan_bulanan',
    'wali_alamat',
    'alamat',
    'dusun',
    'rt',
    'rw',
    'desa',
    'kecamatan',
    'kabupaten',
    'provinsi',
    'kode_pos',
    'aktif'
  ],
  teachers: [
    'niy',
    'nama',
    'klasifikasi',
    'gelar',
    'mapel',
    'tugas_tambahan',
    'no_telp',
    'email',
    's1_universitas',
    's1_prodi',
    's1_tahun_lulus',
    's2_universitas',
    's2_prodi',
    's2_tahun_lulus',
    'sertifikat_pendidik',
    'prodi_sertifikat',
    'nik',
    'no_kk',
    'tmt',
    'jenis_kelamin',
    'tempat_lahir',
    'tanggal_lahir',
    'alamat',
    'desa',
    'kecamatan',
    'kabupaten',
    'provinsi',
    'aktif'
  ],
  subjects: [
    'mata_pelajaran',
    'kelompok',
    'aktif'
  ],
  teacherTasks: [
    'niy',
    'nama_guru',
    'tugas',
    'deskripsi',
    'tanggal_mulai',
    'tanggal_selesai',
    'status'
  ],
  additionalTasks: [
    'nama_tugas',
    'aktif'
  ],
  classes: [
    'kelas',
    'tingkat',
    'wali_kelas',
    'nama_ruangan',
    'kurikulum',
    'jumlah_siswa',
    'kapasitas',
    'jtm_rombel',
    'aktif'
  ],
  schoolYears: [
    'tahun_ajaran',
    'aktif'
  ],
  semesters: [
    'semester',
    'aktif'
  ]
};

function downloadTemplate(req, res) {
  const { entity } = req.params;
  const columns = templates[entity];
  if (!columns) return res.status(400).json({ message: 'Invalid template' });

  const wb = XLSX.utils.book_new();
  let sampleRow = null;
  if (entity === 'students') {
    const sampleStudent = {
      nama_siswa: 'Contoh Siswa',
      nomor_induk: 'NIS-001',
      jenis_kelamin: 'L',
      nisn: '1234567890123',
      nis_lokal: 'NIS-001',
      nism: 'NISM-001',
      nik: '1234567890123456',
      no_kip: 'KIP-001',
      no_akta_lahir: 'AL-2024-0001',
      kelas: 'Kelas 10-A',
      tahun_ajaran: '2025/2026',
      tanggal_masuk: '2024-07-01',
      tempat_lahir: 'Bandung',
      tanggal_lahir: '2008-01-15',
      agama: 'Islam',
      status_siswa: 'aktif',
      asal_sekolah: 'SMP Contoh',
      npsn_asal_sekolah: '20202020',
      hobi: 'Membaca',
      cita_cita: 'Dokter',
      kebutuhan_khusus: '',
      gol_darah: 'O',
      tinggi_cm: '170',
      berat_kg: '55',
      transportasi: 'Motor',
      jarak_km: '3.5',
      penerima_kps: '0',
      nama_darurat: 'Bapak Contoh',
      telp_darurat: '081234567890',
      hubungan_darurat: 'Ayah',
      no_kk: '3210012345678901',
      kewarganegaraan: 'WNI',
      tinggal_bersama: 'Orang Tua',
      jumlah_saudara: '2',
      anak_ke: '1',
      no_hp: '081234567890',
      pondok_pesantren: '',
      ayah_nik: '3210012345678901',
      ayah_nama: 'Ayah Contoh',
      ayah_tempat_lahir: 'Bandung',
      ayah_tanggal_lahir: '1975-05-10',
      ayah_status: 'Hidup',
      ayah_pendidikan: 'S1',
      ayah_pekerjaan: 'Wiraswasta',
      ayah_domisili: 'Bandung',
      ayah_no_hp: '081234567891',
      ayah_penghasilan_bulanan: '5000000',
      ayah_alamat: 'Jl. Contoh No. 1',
      ibu_nik: '3210012345678902',
      ibu_nama: 'Ibu Contoh',
      ibu_tempat_lahir: 'Bandung',
      ibu_tanggal_lahir: '1978-08-20',
      ibu_status: 'Hidup',
      ibu_pendidikan: 'SMA',
      ibu_pekerjaan: 'Ibu Rumah Tangga',
      ibu_domisili: 'Bandung',
      ibu_no_hp: '081234567892',
      ibu_penghasilan_bulanan: '3000000',
      ibu_alamat: 'Jl. Contoh No. 1',
      wali_nik: '',
      wali_nama: '',
      wali_tempat_lahir: '',
      wali_tanggal_lahir: '',
      wali_status: '',
      wali_pendidikan: '',
      wali_pekerjaan: '',
      wali_domisili: '',
      wali_no_hp: '',
      wali_penghasilan_bulanan: '',
      wali_alamat: '',
      alamat: 'Jl. Contoh No. 1',
      dusun: 'Dusun Cempaka',
      rt: '001',
      rw: '002',
      desa: 'Sukamaju',
      kecamatan: 'Cicendo',
      kabupaten: 'Bandung',
      provinsi: 'Jawa Barat',
      kode_pos: '40171',
      aktif: '1'
    };
    sampleRow = columns.map((c) => sampleStudent[c] ?? '');
  } else if (entity === 'teachers') {
    sampleRow = [
      'NIY-001',
      'Guru Contoh',
      'Guru Mapel',
      'S.Pd',
      'Matematika',
      'Wali Kelas',
      '081234567890',
      'guru@example.com',
      'Universitas Contoh',
      'Pendidikan Matematika',
      '2018',
      'Universitas Contoh',
      'Manajemen Pendidikan',
      '2022',
      'Sertifikat Pendidik',
      'Pendidikan Matematika',
      '3273010101010001',
      '3273010101010002',
      '2020-07-01',
      'L',
      'Bandung',
      '1990-05-12',
      'Jl. Guru No. 1',
      'Sukamaju',
      'Cicendo',
      'Bandung',
      'Jawa Barat',
      '1'
    ];
  } else if (entity === 'subjects') {
    sampleRow = [
      'Bahasa Indonesia',
      'Umum',
      '1'
    ];
  } else if (entity === 'classes') {
    sampleRow = [
      'Kelas 10-A',
      '10',
      'Guru Contoh',
      'Ruang A1',
      'Kurikulum Merdeka',
      '32',
      '36',
      '32',
      '1'
    ];
  } else if (entity === 'teacherTasks') {
    sampleRow = [
      'NIY-001',
      'Guru Contoh',
      'Koordinator Ujian',
      'Mengelola pelaksanaan ujian semester',
      '2026-01-10',
      '2026-06-30',
      'aktif'
    ];
  } else if (entity === 'additionalTasks') {
    sampleRow = [
      'Kepala Madrasah',
      '1'
    ];
  }

  const ws = XLSX.utils.aoa_to_sheet(sampleRow ? [columns, sampleRow] : [columns]);
  XLSX.utils.book_append_sheet(wb, ws, 'Template');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', `attachment; filename=${entity}_template.xlsx`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buffer);
}

module.exports = {
  downloadTemplate
};
