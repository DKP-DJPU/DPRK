# Unit / Stasiun, PAUA, dan Simpan per Paket (Apps Script V3.37) — P5 tahap 1

Fondasi fitur Unit. DPRK tetap **satu per operator induk**; matriks unit/stasiun disimpan sebagai
baris skenario biasa dengan kolom `unitId` terisi. Matriks kantor pusat / cabang utama = baris tanpa unit (Induk).

## Yang berubah
| Bagian | Perubahan |
|---|---|
| Sheet baru **MASTER_UNIT** | `unitId, operatorId, jenisUnit, namaUnit, kodeUnit, provinsi, kabkota, aktif`. Dibuat otomatis. Hanya diisi Admin lewat fungsi impor. |
| RISK_ASSESSMENT & RISK_HISTORY | Kolom baru **`unitId`** di ujung kanan (ditambahkan otomatis; data lama tidak berubah). |
| Duplikat | Skenario yang sama di dua unit berbeda **bukan** duplikat. Kunci untuk data tanpa unit tidak berubah. |
| Simpan skenario | Boleh menyertakan unit; server menolak unit yang tidak terdaftar, nonaktif, atau milik operator lain. Unit tidak bisa dipindah saat edit. |
| **Simpan per paket** (`saveRiskBatch`) | Untuk impor matriks Excel (tahap berikutnya): maks. 300 baris per paket, wajib login, semua baris diperiksa dulu — satu saja salah, tidak ada yang disimpan. Paket yang sama dikirim ulang tidak tersimpan ganda. |
| Baca (login) | `unitList` (unit milik akun + jumlah skenario per unit); `riskData`/`riskDetail` memuat unit; status operator memuat `jumlahUnit` & `unitTerisi`. |
| **Impor Admin** | `cekImporAdmin()` (hanya memeriksa) dan `terapkanImporAdmin()` untuk operator baru (PAUA), perbaikan kolom master (termasuk **status Aktif/Nonaktif**), dan daftar unit (termasuk **menonaktifkan unit**). Sebelum menerapkan, sistem **otomatis membuat cadangan spreadsheet**; bila cadangan gagal, impor dibatalkan. |
| Website | Pilihan **Unit / Stasiun** di formulir (muncul bila operator punya unit), nama unit di Monitoring Risiko, bagian **Cakupan Unit / Stasiun** di rekap operator. |

## Langkah pemasangan
1. Merge PR ini (website ±1 menit).
2. Apps Script → ganti seluruh isi **`Code.gs`** dan **`Auth.gs`** dari repo → Simpan. (`Pelaporan.gs` tidak berubah.)
   Pakai **Code.gs versi terbaru** (berisi perbaikan batas grid): RISK_ASSESSMENT produksi tepat 35 kolom, sehingga
   kolom baru `unitId` (kolom ke-36) harus ditambahkan dulu ke grid. Versi sebelum perbaikan ini akan membuat **semua**
   simpan/login gagal.
3. **Deploy → Manage deployments → Edit ✏️ → New version → Deploy.**

## Mengimpor PAUA, perbaikan kode bandara, dan 538 unit
Bahan: file **`Final_Impor_Unit_dan_PAUA.xlsx`** (sudah Anda periksa 28 Okt).

> **Status 28 Okt 2026:** tiga sheet di bawah **sudah diisi langsung** di spreadsheet produksi (tab oranye:
> IMPOR_OPERATOR 64 baris, PERBAIKAN_MASTER 8 baris, IMPOR_UNIT 538 baris — hanya kolom yang dibaca impor).
> Lewati langkah 1–2 dan mulai dari langkah 3. MASTER_* belum disentuh; perubahan baru terjadi saat `terapkanImporAdmin` dijalankan.

1. Buka spreadsheet **DPRK NASIONAL – DATABASE & MONITORING**.
2. Salin tiga sheet dari file final ke spreadsheet (klik kanan tab → *Copy to* → *Existing spreadsheet*, atau buat sheet baru lalu tempel), lalu **ganti namanya**:

   | Sheet di file final | Nama di spreadsheet |
   |---|---|
   | PAUA_MASTER | **IMPOR_OPERATOR** |
   | PERBAIKAN_MASTER | **PERBAIKAN_MASTER** |
   | MASTER_UNIT | **IMPOR_UNIT** |

   Baris judul kolom ikut disalin; kolom tambahan (Keterangan, Cek, Catatan) diabaikan.
3. Editor Apps Script → pilih **`cekImporAdmin`** → Run → buka *Execution log*. Hasil yang diharapkan:
   ```
   IMPOR_OPERATOR: 63 operator baru (55 aktif), 1 operator lama dilengkapi.
   PERBAIKAN_MASTER: 8 perubahan siap diterapkan.
   IMPOR_UNIT: 538 unit baru, 0 unit diperbarui.
   Pemeriksaan bersih. Jalankan terapkanImporAdmin() untuk menerapkan.
   ```
   Bila ada baris "DITEMUKAN … MASALAH", tidak ada yang diubah — perbaiki baris yang disebut lalu ulangi.
4. Jalankan **`terapkanImporAdmin`**. Sistem memeriksa ulang, membuat **cadangan** ke folder SI-RISK BACKUP, lalu menerapkan. Log berakhir dengan baris "Cadangan sebelum impor: …" dan "SELESAI diterapkan …".
5. Periksa di website: Dashboard → Total Operator **445**; masuk sebagai Admin → Monitoring Operator → buka mis. *PT Wings Abadi* → bagian **Cakupan Unit / Stasiun** (81 stasiun).
6. Setelah benar, tiga sheet IMPOR_* / PERBAIKAN_MASTER boleh dihapus (atau dibiarkan; menjalankan ulang aman — tidak menggandakan data).

> Menambah sisa ±183 unit AirNav nanti: isi sheet IMPOR_UNIT dengan unit baru saja (format sama), lalu ulangi langkah 3–4.

## Belum termasuk (tahap berikutnya)
- **Impor matriks dari Excel** di website — menunggu contoh file matriks (`Data_Penilaian_Risiko_AU_dan_RA_2024…xlsx`).
- Rekap gabungan per kabupaten/kota — menunggu keputusan penyamaan nama kab/kota di MASTER_OPERATOR.

## Operator Aktif / Nonaktif
**Kriteria (usulan, ditetapkan Alex):**
- **Aktif** = memegang izin yang berlaku **dan** beroperasi di Indonesia → wajib menyusun DPRK, dihitung di Total Operator & Completion Rate.
- **Nonaktif** = izin dicabut/berakhir, berhenti beroperasi, PAUA tanpa penerbangan ke Indonesia, atau dibekukan sementara. **Tidak dihapus**: riwayat DPRK, laporan, dan audit tetap ada; bisa diaktifkan kembali.

**Mengubah status** lewat sheet **PERBAIKAN_MASTER** (diperiksa & dicatat di AUDIT_LOG):

| operatorId | Bandara | Kolom | Nilai sekarang | Nilai baru | Dasar |
|---|---|---|---|---|---|
| AIR-BBN-AIRLINES-INDONESIA | PT BBN Airlines Indonesia | status | Aktif | Nonaktif | Berhenti beroperasi Feb 2025 (Statistik Angkutan Udara 2025) |

Kolom `status` dan `aktif` selalu diselaraskan otomatis. Lalu `cekImporAdmin` → `terapkanImporAdmin`.

## Menonaktifkan unit / stasiun
Tambahkan kolom **`aktif`** di IMPOR_UNIT dan isi **FALSE** untuk unit yang ditutup (kosong = aktif). Unit nonaktif tidak muncul di formulir dan tidak bisa diberi skenario baru; skenario lamanya tetap tersimpan.

## V3.37.1 — definisi tunggal "operator aktif" (28 Okt 2026)
Temuan setelah impor: Total Operator 448, bukan 444. Penyebab: dua baris salinan tidak sengaja
(`…AVIATION01`, `…INDONESIA1`), satu baris tanpa operatorId yang hanya berisi spasi, dan BBN dengan
status Nonaktif tetapi `aktif` masih TRUE. Baris salinan & kosong sudah dihapus; BBN dan kode BD-001
(KXB → ABU) diperbaiki lewat PERBAIKAN_MASTER.

Perubahan kode (`opActive_`), dipakai Dashboard, Monitoring Operator, daftar operator publik,
pendaftaran akun, dan penerbitan API key:
- operator dihitung aktif hanya bila **punya operatorId**, `aktif` bukan FALSE, **dan** `status` bukan Nonaktif;
- `cekImporAdmin` kini menampilkan jumlah Total Operator dan **PERINGATAN** (tidak memblokir) untuk baris tanpa
  operatorId, status/aktif yang tidak selaras, dan kode bandara/operator ganda di antara operator aktif.

Pasang: ganti **Code.gs** dan **Auth.gs** → Deploy New version → `cekImporAdmin` → `terapkanImporAdmin`.
