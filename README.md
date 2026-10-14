# Catatan Generator

Ubah **PDF menjadi laporan** bergaya **Report Writing**, lalu edit langsung dan unduh (PDF, Word, Markdown, HTML, teks).

**Semua berjalan di browser.** Tidak ada API Claude, tidak ada AI eksternal, tidak ada server, tidak ada kunci API. Isi PDF tidak pernah dikirim ke mana pun.

## Cara kerja

1. PDF dibaca di browser dengan pdf.js.
2. `public/js/engine.js` menyusun laporan memakai aturan (bukan AI):
   - membersihkan teks (nomor halaman, header/footer berulang, daftar isi),
   - mendeteksi judul dan subjudul,
   - memilih kalimat terpenting (skor frekuensi kata, posisi, angka/tanggal, kata kunci seperti *tujuan*, *hasil*, *kesimpulan*),
   - membakukan bahasa (kata tidak baku, singkatan, tanda seru, emoji, kata ganti orang pertama → orang ketiga),
   - mengubah kalimat langsung menjadi tidak langsung (*menyatakan bahwa*, *menanyakan apakah*, *meminta agar*; pergeseran kata waktu seperti *besok → keesokan harinya*),
   - menyusun: Judul → Byline → Tanggal & Tempat → Pendahuluan → Rincian → Kesimpulan.
3. Hasil tampil di kertas kerja yang bisa diedit, dengan panel **Final Check**.

Mesin hanya **menyusun ulang kalimat yang ada di PDF**, sehingga tidak mengarang fakta. Karena bukan AI, hasilnya tidak sehalus tulisan manusia: selalu baca ulang dan rapikan di kertas kerja.

## Batasan

- Hanya **PDF berteks**. PDF hasil pindaian/gambar tidak bisa dibaca (butuh OCR).
- Pengubahan kalimat langsung → tidak langsung paling andal untuk **Bahasa Indonesia**; untuk Inggris mencakup pola umum (said/asked/told, pergeseran tense dasar).
- Tidak mengubah kalimat aktif ↔ pasif secara otomatis.
- Pustaka pdf.js dan font Google dimuat dari CDN, jadi perlu internet saat pertama membuka. Untuk 100% offline, unduh pdf.js (`pdf.min.mjs` + `pdf.worker.min.mjs`) ke `public/vendor/` lalu ubah `PDFJS_URL` dan `PDFJS_WORKER` di `public/js/app.js`.

## Struktur

```
public/
  index.html
  css/style.css
  js/engine.js    # mesin penyusun laporan (aturan, tanpa AI)
  js/models.js    # metadata model untuk tampilan
  js/export.js    # ekspor HTML / Word / Markdown / teks
  js/app.js       # logika antarmuka
  favicon.svg
vercel.json       # hosting statis
```

## Menjalankan

- **Paling mudah:** buka `public/index.html` di browser.
- **Hosting gratis (GitHub → Vercel / GitHub Pages / Netlify):** unggah repo apa adanya. Tidak ada environment variable dan tidak ada build.

## Menyesuaikan

- Panjang hasil: `LENGTHS` di `engine.js` (jumlah kata target).
- Kata tidak baku: tabel `INFORMAL_ID` / `INFORMAL_EN`.
- Kata kerja pelapor: `SAY_ID` / `SAY_EN`.
- Model baru: set `available: true` di `models.js`, lalu tambahkan fungsi penyusun di `engine.js`.
