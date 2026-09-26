# SI-RISK AVSEC

**System Information Risk Assessment Aviation Security** — Dashboard Risiko Keamanan Penerbangan Nasional.
Frontend statis yang di-host di GitHub Pages dan membaca/menulis data melalui Google Apps Script
(spreadsheet *DPRK NASIONAL – DATABASE & MONITORING*).

## Struktur folder

```
index.html                 Struktur halaman (header, tab, form, tabel)
assets/css/app.css         Semua gaya tampilan
assets/css/pelaporan.css   Gaya tab Sistem Pelaporan (kelas berawalan .plp-)
assets/js/app.js           Logika aplikasi (ambil data, form, dashboard, grafik)
assets/js/pelaporan.js     Tab Sistem Pelaporan (formulir 5W+1H, daftar & rekap, dokumen)
assets/img/logo.png        Logo
data/katalog-risiko.json   Katalog kategori (01–19) dan skenario risiko
data/bandara-cadangan.json Daftar bandara cadangan — hanya dipakai bila MASTER_OPERATOR gagal dimuat
apps-script/Pelaporan.gs   Modul server pelaporan (ditempel di proyek Apps Script)
apps-script/PERUBAHAN-Code.gs.md  Langkah pemasangan modul server pelaporan
```

- **Data operator** (bandara, airlines, LPPNPI, regulated agent) **tidak** disimpan di repositori ini.
  Sumbernya sheet `MASTER_OPERATOR`, diambil lewat `GAS_URL?action=operators`.
- **Katalog risiko** cukup diubah di `data/katalog-risiko.json`; tidak perlu menyentuh kode.
  Format skenario: `[idRisiko, kodeKategori, skenario, area, pemilikRisiko]`.

## Menjalankan secara lokal

File JSON dimuat dengan `fetch`, jadi halaman harus dibuka lewat server web (bukan klik ganda `index.html`):

```bash
python3 -m http.server 8000
# buka http://localhost:8000
```

## Sistem Pelaporan Keamanan Penerbangan

- Data laporan disimpan di sheet `LAPORAN_INSIDEN` (spreadsheet yang sama dengan SI-RISK).
- Setiap laporan diberi penanda **AVSEC / Non-AVSEC / Perlu Klasifikasi** sesuai jenis kejadian.
- Daftar publik (`?action=incidents`) **tidak** memuat nama, instansi, HP, email pelapor, maupun catatan.
- Status verifikasi (`Baru` / `Terverifikasi` / `Ditolak`) diubah admin langsung di sheet.
- Pemasangan server: lihat [`apps-script/PERUBAHAN-Code.gs.md`](apps-script/PERUBAHAN-Code.gs.md).

## Menambah tab baru

1. **Tombol tab** — di `index.html`, tambahkan di dalam `<nav class="nav">`:
   `<button data-view="pelaporan" role="tab" aria-selected="false">Sistem Pelaporan</button>`
2. **Isi tab** — tambahkan `<section id="view-pelaporan" class="view"> … </section>` sejajar dengan section lain.
   Nama setelah `view-` harus sama dengan `data-view` pada tombol.
3. **Logika** — bila tab butuh memuat data saat dibuka, tambahkan pemanggilnya di fungsi `bind()`
   pada `assets/js/app.js` (lihat pola `if (b.dataset.view === "operator") loadOperators();`).
   Untuk fitur besar, buat file terpisah (contoh: `assets/js/pelaporan.js`) yang dimuat setelah `app.js`
   dan memakai `window.SIRISK` (GAS_URL, get, post, esc, operators, kategori).
4. **Server** — endpoint baru ditambahkan di `doGet`/`doPost` Apps Script, beserta sheet baru bila perlu.

## Alur perubahan

Semua perubahan diajukan lewat **Pull Request** ke `main` dan baru berlaku setelah disetujui (Merge).

### Versi aset (cache browser)

GitHub Pages menyimpan file JS/CSS di cache browser ±10 menit. Karena itu
`index.html` memuat aset dengan penanda versi, misalnya
`assets/js/app.js?v=20260927`. **Setiap kali file di `assets/` berubah,
naikkan angka `?v=` di `index.html`** (pakai tanggal perubahan) agar pengguna
langsung mendapat versi terbaru tanpa perlu *hard refresh*.
