# V3.47 — Paket A kesiapan teknis

1. **Uji keamanan isian berbahaya (XSS).** Uji tampilan baru mengisi semua kolom teks operator/pelapor/nama akun
   dengan kode HTML/JS, lalu memeriksa dashboard, Monitoring Risiko, rekap operator, tren, daftar & detail laporan,
   formulir, dan bilah akun: kode tidak dijalankan dan tidak menjadi elemen HTML (tampil sebagai teks).
2. **Kebijakan keamanan halaman (CSP)** di index.html: hanya script dari situs ini yang boleh berjalan; data hanya
   boleh dikirim ke Apps Script; video panduan hanya dari youtube-nocookie. Tambahkan domain di tag CSP bila memakai
   layanan luar baru.
3. **Riwayat di perangkat**: tidak lagi menyimpan teks skenario; kode edit tidak disimpan bila disimpan lewat akun;
   riwayat dihapus saat keluar, sesi habis, atau akun lain masuk di perangkat yang sama. Entri lama dibersihkan otomatis.
4. **Peringatan versi (khusus Admin)**: setiap respons server membawa `serverVersion`. Bila tidak sama dengan versi
   yang diharapkan website, Admin melihat peringatan di bawah bilah akun. Publik dan operator tidak melihatnya.
   **Setiap kali Code.gs berubah, naikkan `SERVER_VERSION` (Code.gs) dan `EXPECTED_SERVER` (app.js) bersamaan** —
   ada uji yang memastikan keduanya sama.
5. **ERROR_LOG**: error di jalur baca, simpan, login, notifikasi admin, backup, dan pembersihan cache dicatat di sheet
   ERROR_LOG (dibuat otomatis; maks ±2000 baris). Hanya metadata — isi permintaan dan token tidak disimpan.
   `cekIntegritas()` merangkum error 7 hari terakhir.
6. Kata "bergalat" di impor Excel dan Panduan diganti "error".
