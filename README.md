# SI-RISK AVSEC

**System Information Risk Assessment Aviation Security** — Dashboard Risiko Keamanan Penerbangan Nasional.
Frontend statis yang di-host di GitHub Pages dan membaca/menulis data melalui Google Apps Script
(spreadsheet *DPRK NASIONAL – DATABASE & MONITORING*).

## Struktur folder

```
index.html                 Struktur halaman (header, tab, form, tabel)
assets/css/app.css         Semua gaya tampilan
assets/js/app.js           Logika aplikasi (ambil data, form, dashboard, grafik)
assets/img/logo.png        Logo
data/katalog-risiko.json   Katalog kategori (01–19) dan skenario risiko
data/bandara-cadangan.json Daftar bandara cadangan — hanya dipakai bila MASTER_OPERATOR gagal dimuat
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

## Menambah tab baru (mis. Sistem Pelaporan Keamanan Penerbangan)

1. **Tombol tab** — di `index.html`, tambahkan di dalam `<nav class="nav">`:
   `<button data-view="pelaporan" role="tab" aria-selected="false">Sistem Pelaporan</button>`
2. **Isi tab** — tambahkan `<section id="view-pelaporan" class="view"> … </section>` sejajar dengan section lain.
   Nama setelah `view-` harus sama dengan `data-view` pada tombol.
3. **Logika** — bila tab butuh memuat data saat dibuka, tambahkan pemanggilnya di fungsi `bind()`
   pada `assets/js/app.js` (lihat pola `if (b.dataset.view === "operator") loadOperators();`).
   Untuk fitur besar, sebaiknya buat file baru `assets/js/pelaporan.js` dan muat setelah `app.js`.
4. **Server** — endpoint baru ditambahkan di `doGet`/`doPost` Apps Script, beserta sheet baru bila perlu.

## Alur perubahan

Semua perubahan diajukan lewat **Pull Request** ke `main` dan baru berlaku setelah disetujui (Merge).
