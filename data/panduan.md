<!--
  PANDUAN SI-RISK AVSEC — file ini tampil di tab "Panduan".
  Cara mengubah: buka file ini di GitHub → ikon pensil (Edit) → simpan lewat Pull Request.

  Format singkat:
    ## Judul bab                         → bab baru (otomatis masuk daftar isi)
    ### Sub judul                        → sub judul (di bab FAQ: satu pertanyaan)
    **tebal**  *miring*  [teks tautan](https://alamat)
    - butir     1. langkah bernomor
    > catatan biasa         > ! peringatan
    | Kolom | Kolom |  (baris kedua: |---|---|)
    ![Keterangan gambar](assets/panduan/nama-file.png)   ← gambar disimpan di folder assets/panduan/
    !video[Judul video](https://youtu.be/ID-VIDEO)       ← YouTube (boleh "Tidak publik"/unlisted) atau Google Drive

  Video JANGAN diunggah ke repo ini (batas ukuran GitHub). Unggah ke YouTube (unlisted) atau
  Google Drive (akses: siapa saja yang memiliki link), lalu tempel tautannya dengan format !video di atas.
  Jangan memakai data asli (nama orang, nilai risiko operator) di gambar — gunakan data contoh.
-->

SI-RISK AVSEC adalah sistem informasi penilaian risiko keamanan penerbangan nasional. Di sini operator mengisi **Dokumen Penilaian Risiko Keamanan (DPRK)** secara digital, Direktorat Keamanan Penerbangan memantau pemenuhan dan kondisi risiko, dan siapa pun dapat melaporkan kejadian keamanan penerbangan.

## Mengenal SI-RISK AVSEC

### Siapa yang memakai sistem ini?

| Pengguna | Perlu login? | Yang dapat dilakukan |
|---|---|---|
| Masyarakat & petugas lapangan | Tidak | Melihat Dashboard ringkasan nasional, mengirim laporan kejadian, mengecek status laporan, membaca Panduan |
| Perwakilan operator (Bandar Udara, Airlines, LPPNPI, Regulated Agent) | Ya | Semua di atas, ditambah mengisi DPRK dan melihat data risiko **milik operatornya sendiri** |
| Admin Direktorat Keamanan Penerbangan | Ya | Melihat seluruh data operator, menyetujui pendaftaran akun, memverifikasi laporan |

### Isi setiap tab

| Tab | Isi |
|---|---|
| **Dashboard** | Ringkasan nasional: jumlah operator, pemenuhan DPRK, kondisi risiko, dan 19 kategori ancaman |
| **Pengisian DPRK** | Formulir penilaian risiko per skenario ancaman |
| **Monitoring Operator** | Status DPRK per operator dan rekap per operator *(login)* |
| **Monitoring Risiko** | Daftar seluruh skenario risiko yang sudah dinilai *(login)* |
| **Trend & Analitik** | Grafik perkembangan pengisian dan nilai risiko, serta jadwal kaji ulang |
| **Sistem Pelaporan** | Formulir laporan kejadian, daftar laporan terverifikasi, dan cek status laporan |
| **Panduan** | Halaman ini |

> DPRK berklasifikasi **Terbatas**. Karena itu rincian risiko per operator hanya dapat dilihat setelah login, dan perwakilan operator hanya melihat data operatornya sendiri.

## Masuk dan Pendaftaran Akun

SI-RISK AVSEC **tidak memakai kata sandi**. Setiap kali masuk, sistem mengirim **kode 6 digit** ke email Anda.

### Mendaftar (sekali saja)

1. Klik tombol **Masuk** di kanan atas, lalu pilih **Daftar sebagai perwakilan operator**.
2. Isi nama lengkap, **email kantor**, jabatan, dan nomor HP (opsional).
3. Pada kolom **Operator yang Anda wakili**, ketik nama bandara, maskapai, cabang AirNav, atau Regulated Agent, lalu pilih dari daftar yang muncul.
4. Klik **Kirim pendaftaran**.
5. Tunggu email pemberitahuan bahwa akun Anda sudah **aktif**. Pendaftaran diperiksa terlebih dahulu oleh Direktorat Keamanan Penerbangan.

![Formulir pendaftaran perwakilan operator](assets/panduan/daftar@2x.png)

> ! Gunakan email kantor dan pilih operator yang benar. Pendaftaran yang tidak dapat dipastikan kebenarannya akan ditolak.

### Masuk

1. Klik **Masuk** di kanan atas.
2. Ketik email yang sudah terdaftar, lalu klik **Kirim kode**.
3. Buka email Anda. Kode berlaku **10 menit**. Periksa juga folder **Spam/Promosi**.
4. Ketik kode 6 digit, lalu klik **Masuk**.

![Langkah masuk dengan kode dari email](assets/panduan/masuk@2x.png)

**Ingat perangkat ini selama 30 hari** — centang hanya di komputer atau HP pribadi. Tanpa centang, Anda otomatis keluar setelah 12 jam.

> ! Di komputer umum atau warnet, jangan centang "Ingat perangkat", dan klik nama Anda di kanan atas → **Keluar** setelah selesai.

### Keluar

Klik nama Anda di kanan atas, lalu klik **Keluar**.

## Mengisi DPRK

Satu kali simpan = **satu skenario ancaman**. Ulangi pengisian untuk setiap skenario yang ada di dokumen DPRK operator Anda. Satu kategori ancaman boleh memiliki lebih dari satu skenario.

Siapkan dulu dokumen DPRK yang sudah disahkan, karena nilai yang diisi harus sama dengan dokumen tersebut.

### Langkah 01 — Identitas entitas

1. Buka tab **Pengisian DPRK** (pastikan Anda sudah masuk).
2. Jenis operator dan nama operator otomatis sesuai akun Anda. Bila akun Anda mewakili lebih dari satu operator, pilih operator yang akan diisi.
3. Isi **Bulan Penilaian**, **Tahun**, **Nama Pengisi**, **Jabatan Pengisi**, dan **Tanggal Pengesahan** dokumen DPRK.
4. **Email Pemilik Risiko** dan **Link File DPRK** (misalnya tautan Google Drive) dianjurkan diisi.
5. Bila operator Anda memiliki **unit atau stasiun** (cabang pembantu, unit kerja, stasiun maskapai), muncul pilihan **Unit / Stasiun**. Pilih **Induk** untuk matriks kantor pusat atau cabang utama, atau pilih unitnya untuk matriks lampiran unit tersebut. Unit tidak dapat dipindah setelah skenario disimpan.

![Langkah 01: identitas entitas](assets/panduan/form-identitas@2x.png)

### Langkah 02 — Skenario dan penilaian risiko

1. Pilih **Kategori Ancaman** (19 kategori).
2. Pilih **Skenario dari Katalog** sebagai acuan, lalu sesuaikan teksnya dengan kondisi operator Anda. Bila tidak ada yang sesuai, tulis skenario sendiri.
3. Isi **Area/Lokasi**, **Langkah Keamanan Saat Ini**, dan **Kerentanan Saat Ini**.
4. Isi nilai **Ancaman**, **Kerentanan**, dan **Konsekuensi**, masing-masing **1–10**, sesuai dokumen DPRK.
5. Pilih **Perlakuan Risiko** (Diterima, Mitigasi, Penolakan, atau Pembagian) dan **Prioritas Penanganan**.
6. Isi **Pemilik Risiko** dan **Tanggal Kaji Ulang**. Tanggal kaji ulang tidak boleh lebih awal dari tanggal pengesahan.
7. Klik **Simpan Skenario**.

![Langkah 02: nilai risiko dan kategori penerimaan dihitung otomatis](assets/panduan/form-penilaian@2x.png)

### Cara nilai risiko dihitung

**Total Risiko = Ancaman + Kerentanan + Konsekuensi** (rentang 3–30). Tingkat risiko dan kategori penerimaannya mengikuti PR 16/41 DJPU Tahun 2024:

| Total | Tingkat Risiko | Kategori Penerimaan |
|---|---|---|
| 3–7 | Rendah | Dapat ditoleransi |
| 8–13 | Menengah-Rendah | Dapat ditoleransi |
| 14–19 | Menengah | ALARP (serendah yang dapat dicapai secara wajar) |
| 20–25 | Menengah-Tinggi | Tidak dapat ditoleransi |
| 26–30 | Tinggi | Tidak dapat ditoleransi |

Tingkat risiko dihitung ulang oleh server saat disimpan, jadi hasilnya selalu konsisten dengan aturan di atas.

### Mengubah skenario yang sudah disimpan

Bila Anda **masuk dengan akun**, tidak perlu kode apa pun:

1. Buka tab **Monitoring Risiko**. Daftar hanya berisi skenario operator Anda (Admin: semua operator).
2. Klik **Edit** pada baris skenario yang ingin diubah. Formulir di tab **Pengisian DPRK** akan terisi otomatis.
3. Ubah isian, lalu klik **Perbarui Skenario**. Untuk membatalkan, klik **Bersihkan**.

![Tombol Edit di Monitoring Risiko untuk pengguna yang sudah masuk](assets/panduan/edit-monitoring@2x.png)

> Jenis operator, nama operator, dan periode (bulan/tahun) tidak dapat diubah lewat Edit. Bila periodenya salah, simpan sebagai skenario baru dan beri tahu admin agar skenario yang salah dihapus.

> ! Bila skenario yang sama sedang diubah orang lain dan tersimpan lebih dulu, sistem menolak penyimpanan Anda agar perubahan mereka tidak tertimpa. Klik **Edit** lagi untuk memuat data terbaru.

### Kode referensi (untuk pengisian tanpa login)

Setiap skenario yang tersimpan juga memiliki **kode referensi** berbentuk `riskId::KODE`. Kode ini hanya diperlukan bila skenario diisi **tanpa login**:

1. Di tab **Pengisian DPRK**, gulir ke bagian **03 — Edit & Riwayat**.
2. Tempel kode referensi pada kolom **Edit Skenario Tersimpan**, lalu klik **Muat Data untuk Edit**. Atau klik **Edit** pada skenario di **Riwayat Pengisian Saya** (tersimpan di perangkat yang sama).
3. Ubah isian, lalu klik **Perbarui Skenario**.

Bagian **Kode DPRK (Ganti Perangkat)** juga hanya untuk pengisian tanpa login, dan otomatis disembunyikan setelah Anda masuk.

## Memahami Dashboard

### Arti angka di bagian atas

| Kartu | Arti |
|---|---|
| **Total Operator** | Jumlah operator aktif yang terdaftar (Bandar Udara, Airlines, LPPNPI, Regulated Agent) |
| **Belum Mengisi** | Total Operator dikurangi Sudah Mengisi |
| **Sudah Mengisi** | Operator yang memiliki DPRK aktif di sistem |
| **Completion Rate** | Sudah Mengisi ÷ Total Operator × 100%, dibulatkan 1 angka desimal |
| **Risiko Tinggi** | Jumlah **skenario** (bukan jumlah operator) berating Tinggi |
| **Kaji Ulang Mendekat** | DPRK dengan tanggal kaji ulang dalam 30 hari ke depan |

### Dashboard untuk pengguna yang login

- **Admin** dapat memakai filter wilayah (provinsi dan kabupaten/kota) dan melihat seluruh data di Monitoring Operator dan Monitoring Risiko.
- **Perwakilan operator** melihat dashboard nasional yang sama dengan publik, dan di tab Monitoring hanya melihat data operatornya sendiri.

## Melaporkan Kejadian

Siapa pun dapat melaporkan kejadian keamanan penerbangan, **tanpa login**: petugas lapangan, operator, maupun masyarakat.

### Mengirim laporan

1. Buka tab **Sistem Pelaporan** → **Formulir Laporan**.
2. Isi formulir mengikuti 5W+1H: **Apa** yang terjadi, **Kapan**, **Di mana**, **Siapa** yang terlibat, **Mengapa**, dan **Bagaimana** kronologinya. Kolom bertanda bintang (*) wajib diisi.
3. Pilih **tingkat keparahan** dan **sumber informasi**.
4. Isi **data pelapor**. Data ini hanya tersimpan di database internal dan **tidak ditampilkan** di daftar laporan.
5. Klik **Kirim Laporan**.

### Simpan nomor referensi dan kode cek

Setelah terkirim, Anda menerima **nomor referensi** (contoh: `LKP/0001/09/2026`) dan **kode cek** 6 karakter.

![Nomor referensi dan kode cek setelah laporan terkirim](assets/panduan/laporan-terkirim@2x.png)

> ! **Catat kode cek.** Demi keamanan, kode cek hanya ditampilkan sekali dan tidak dapat dikirim ulang.

### Mengecek status laporan

1. Buka **Sistem Pelaporan** → **Cek Status Laporan**.
2. Masukkan nomor referensi dan kode cek, lalu klik **Cek status**.

Status laporan: **Menunggu verifikasi**, **Terverifikasi**, atau **Tidak dapat diverifikasi**. Hanya laporan yang sudah **terverifikasi** yang tampil di **Daftar & Rekap**, agar informasi yang belum pasti tidak tersebar.

## Pertanyaan Umum (FAQ)

### Kode masuk tidak sampai ke email saya
Periksa folder **Spam/Promosi**. Tunggu 60 detik, lalu klik **Kirim ulang kode**. Satu email dapat meminta paling banyak 5 kode per jam. Pastikan email yang diketik sama persis dengan email saat mendaftar.

### Muncul pesan "email belum terdaftar"
Email tersebut belum memiliki akun. Klik **Daftar sekarang** dan isi formulir pendaftaran.

### Muncul pesan "menunggu persetujuan"
Pendaftaran Anda sedang diperiksa. Anda akan menerima email setelah akun aktif. Bila lebih dari 3 hari kerja belum ada kabar, hubungi kontak di bagian bawah halaman ini.

### Kode yang saya masukkan dinyatakan salah atau kedaluwarsa
Kode berlaku 10 menit dan hanya kode **terakhir** yang berlaku. Minta kode baru, lalu gunakan kode dari email yang paling baru.

### Saya mewakili lebih dari satu operator
Satu akun dapat dikaitkan dengan beberapa operator. Daftarkan satu operator terlebih dahulu, lalu minta admin menambahkan operator lainnya.

### Saya salah memilih operator saat mendaftar
Hubungi admin agar operator pada akun Anda diperbaiki. Jangan mendaftar ulang dengan email yang sama.

### Mengapa saya tidak bisa melihat tab Monitoring Operator atau Monitoring Risiko?
Kedua tab berisi data berklasifikasi Terbatas, sehingga hanya terbuka setelah login. Perwakilan operator hanya melihat data operatornya sendiri.

### Saat menyimpan muncul pesan skenario sudah ada
Skenario dengan operator, periode, kategori, dan teks skenario yang sama sudah pernah disimpan. Untuk mengubahnya, buka **Monitoring Risiko** lalu klik **Edit** pada skenario tersebut, bukan menyimpan ulang.

### Saya kehilangan kode referensi untuk mengedit
Tidak masalah bila Anda punya akun: masuk, buka **Monitoring Risiko**, lalu klik **Edit**. Kode referensi hanya diperlukan untuk pengisian tanpa login.

### Saya tidak melihat tombol Edit di Monitoring Risiko
Tombol **Edit** hanya muncul setelah Anda masuk, dan hanya untuk skenario operator yang terhubung dengan akun Anda. Bila skenario operator Anda tidak muncul, hubungi admin untuk memeriksa operator pada akun Anda.

### Saat memperbarui muncul pesan data sudah diperbarui pengguna lain
Seseorang mengubah skenario yang sama setelah Anda membukanya. Klik **Edit** lagi pada skenario itu untuk memuat versi terbaru, lalu ulangi perubahan Anda.

### Unit atau stasiun kami tidak ada di pilihan
Daftar unit dan stasiun didaftarkan oleh Admin Direktorat Keamanan Penerbangan. Hubungi admin dengan menyebutkan nama operator dan unit yang belum terdaftar.

### Apakah setiap kategori ancaman wajib diisi?
Isi semua skenario yang tercantum di dokumen DPRK operator Anda yang sudah disahkan. Data di sistem harus sama dengan dokumen tersebut.

### Apakah pelapor kejadian harus login?
Tidak. Formulir laporan dan cek status dapat digunakan tanpa login.

### Laporan saya tidak muncul di Daftar & Rekap
Daftar hanya menampilkan laporan yang sudah diverifikasi. Cek status laporan Anda lewat **Cek Status Laporan**.

### Saya lupa kode cek laporan
Kode cek tidak dapat ditampilkan ulang. Hubungi kontak di halaman ini dengan menyebutkan nomor referensi laporan Anda.

### Apakah data pribadi pelapor dipublikasikan?
Tidak. Nama, instansi, nomor HP, dan email pelapor hanya dapat dilihat oleh petugas Direktorat Keamanan Penerbangan.
