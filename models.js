/**
 * Metadata model catatan untuk tampilan (sisi klien).
 * Logika penyusunan ada di js/engine.js.
 * Untuk menambah model: set available: true di sini, lalu tambahkan fungsi penyusun di engine.js.
 */
window.CG = window.CG || {};

window.CG.MODELS = [
  {
    id: 'report-writing',
    name: 'Report Writing',
    tagline: 'Laporan formal, faktual, dan runtut',
    icon: 'report',
    available: true,
    description:
      'Menyusun isi PDF menjadi laporan formal tentang sebuah peristiwa, kegiatan, atau situasi: faktual, orang ketiga, kalimat baku, tanpa opini pribadi.',
    flow: [
      { k: 'Judul', d: 'Menjelaskan isi laporan dengan jelas' },
      { k: 'Byline', d: 'Nama dan jabatan penulis' },
      { k: 'Tanggal & Tempat', d: 'Kapan dan di mana' },
      { k: 'Pendahuluan', d: 'Apa, kapan, di mana, bagaimana, mengapa' },
      { k: 'Rincian', d: 'Detail utama secara berurutan' },
      { k: 'Kesimpulan', d: 'Ringkasan peristiwa atau hasil' },
    ],
  },
  { id: 'cornell', name: 'Cornell Notes', tagline: 'Isyarat, catatan, ringkasan', icon: 'cornell', available: false },
  { id: 'outline', name: 'Outline Bertingkat', tagline: 'Poin utama dan sub-poin', icon: 'outline', available: false },
  { id: 'mindmap', name: 'Peta Konsep', tagline: 'Hubungan antar-gagasan', icon: 'mindmap', available: false },
  { id: 'summary', name: 'Ringkasan Cepat', tagline: 'Inti dalam satu halaman', icon: 'summary', available: false },
];
