# Menutup Data Per Operator dari Publik (Apps Script V3.34)

DPRK berklasifikasi **Terbatas**. Sebelum versi ini, siapa pun yang memegang link bisa membaca
nilai dan rating risiko **per operator per kategori ancaman**, status DPRK setiap operator, dan
daftar kaji ulang per operator. Versi ini menutup semuanya.

## Yang berubah

| Bagian | Publik (tanpa login) | Admin | Operator |
|---|---|---|---|
| KPI Dashboard & kartu per jenis | ✅ (angka risiko per jenis disembunyikan bila di bawah ambang) | ✅ | ✅ |
| Analisis Risiko per Jenis Operator | ✅ agregat dari server; jenis dengan <2 operator **disembunyikan** | ✅ | ✅ agregat |
| Analisis per Wilayah (provinsi/kab-kota) | ❌ disembunyikan | ✅ | ❌ |
| Monitoring Operator & rekap per operator | ❌ | ✅ semua | ✅ **hanya miliknya** |
| Monitoring Risiko | ❌ | ✅ semua | ✅ **hanya miliknya** |
| Trend (grafik nasional) | ✅ | ✅ | ✅ |
| Monitoring Kaji Ulang (per operator) | ❌ | ✅ semua | ✅ hanya miliknya |
| Sistem Pelaporan, daftar nama operator | ✅ | ✅ | ✅ |

**Detail teknis:**
- `GET action=risks` dan `GET action=review` sekarang menolak permintaan (`AUTH_REQUIRED`).
- `GET action=operators` hanya mengirim identitas operator (nama, kode, lokasi), tanpa status DPRK.
- Data terbatas dibaca lewat **POST** `riskData` / `operatorStatus` / `reviewList` dengan token login. Permintaan baca ini **tidak ikut antre** di belakang proses simpan (tanpa Script Lock).
- **Perbaikan cache:** data lebih dari 100 KB dulu gagal di-cache tanpa ketahuan. Daftar operator (±126 KB) selama ini tidak pernah ter-cache. Sekarang data besar dipecah menjadi beberapa potongan.
- `riskData` kini membawa `operatorId`, sehingga rekap per operator dicocokkan lewat ID, bukan nama.
- Perbaikan bug lama: tabel "Monitoring Kaji Ulang" di tab Trend sebelumnya selalu kosong.

## Langkah pemasangan
1. Apps Script → ganti seluruh isi **`Code.gs`** dengan [`Code.gs`](Code.gs) dan **`Auth.gs`** dengan [`Auth.gs`](Auth.gs) dari repo ini.
2. Simpan → **Deploy → Manage deployments → Edit ✏️ → New version → Deploy**.
3. Buka website dan pastikan tanpa login: tab Monitoring Operator & Monitoring Risiko meminta login, dan dashboard tetap tampil.
4. Masuk sebagai Admin: semua tab terbuka seperti biasa.
5. **Setelah semuanya normal, jalankan `aktifkanLoginWajib()`** dari editor Apps Script, supaya Pengisian DPRK juga wajib login.

> Pasang Code.gs **bersamaan** dengan merge PR ini. Kalau frontend baru dipakai dengan server lama,
> tab terbatas akan menampilkan pesan galat (bukan membocorkan data). Kalau server baru dipakai
> dengan frontend lama, tab Monitoring Risiko di frontend lama akan kosong.

## Ambang kerahasiaan (MIN_GROUP = 2)
- Rincian agregat (per jenis operator, per kategori ancaman, per bulan tren) hanya tampil di publik bila berasal dari **minimal 2 operator** (`MIN_GROUP` di Code.gs).
- **Supresi komplementer:** bila jumlah operator di kelompok yang disembunyikan 1 (di bawah ambang), semua rincian per jenis ikut disembunyikan, karena angkanya bisa dihitung dari nasional dikurangi kelompok lain.
- ⚠️ Dengan ambang 2, dua operator dalam satu kelompok dapat saling menghitung angka masing-masing. Standar umum statistik resmi adalah 3. Untuk mengubahnya, cukup ganti `var MIN_GROUP=2;` lalu Deploy New version.
