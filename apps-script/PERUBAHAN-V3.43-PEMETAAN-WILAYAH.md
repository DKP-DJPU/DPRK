# V3.43 — Pemetaan Wilayah Resmi (C3)

## Ringkasnya
Data induk diberi **kode wilayah Kemendagri**. Provinsi dan kab/kota **diturunkan dari kode** (daftar di `Wilayah.gs`), bukan diketik, sehingga ejaannya seragam: `Kab. Tangerang`, bukan "Tangerang", "Tanggerang", atau "Kab Tangerang". Hasilnya, rekap per kab/kota tidak lagi ganda.

## Sheet impor `PEMETAAN_WILAYAH`
| Kolom | Wajib | Fungsi |
|---|---|---|
| `operatorId` | ya | operator di MASTER_OPERATOR |
| `kodeWilayah` | ya | kode resmi, mis. `36.71` |
| `provinsiSekarang`, `kabkotaSekarang` | opsional | pengaman; bila master sudah berubah sejak daftar dibuat → **masalah, tidak diterapkan** |
| kolom lain (`… (info)`) | — | diabaikan |

Diproses oleh **`cekImporAdmin()`** / **`terapkanImporAdmin()`**, sama seperti IMPOR_OPERATOR, PERBAIKAN_MASTER, dan IMPOR_UNIT.

## Yang diubah saat diterapkan
- **MASTER_OPERATOR**: kolom `provinsi`, `kabkota`, dan `kodeWilayah`. Kolom `lokasi` (teks bebas) tidak disentuh.
- **Stasiun maskapai** (`jenisUnit` = Stasiun) di bandara yang dipetakan ikut **lokasi bandaranya** (`kodeUnit` = IATA bandara). Yang dijadikan rujukan hanya bandara **aktif**; baris bandara lama Nonaktif dengan IATA yang sama (LNU, LPU, RTU, PPR) diabaikan.
- **Unit LPPNPI** (Kantor Cabang Pembantu / Unit Kerja) tidak disentuh.
- **Cadangan** dibuat lebih dulu (`backupHarian`).
- **`AUDIT_LOG`** mendapat satu baris per entitas, berisi nilai sebelum dan sesudah.
- **Hanya kolom yang berubah yang ditulis**, dalam satu tulis per kolom, sehingga 367 operator + 492 stasiun selesai dalam hitungan detik.
- **Aman dijalankan ulang**: baris yang sudah sesuai dilewati.

## Masalah yang memblokir
- Operator tidak ada.
- Kode tidak ada di daftar resmi.
- `operatorId` ganda.
- Operator yang sama juga diubah provinsi/kab-kotanya di PERBAIKAN_MASTER.
- Stasiun yang sama juga ada di IMPOR_UNIT.
- Dua bandara aktif ber-IATA sama tetapi wilayahnya berbeda.
- Lokasi master berubah sejak daftar dibuat.

## Perhatian
- **Jangan impor ulang IMPOR_UNIT lama** (berisi provinsi/kab-kota versi lama). Impor itu akan mengembalikan ejaan lama pada stasiun. Bila perlu impor ulang unit, jalankan lagi PEMETAAN_WILAYAH sesudahnya.
- **Kode wilayah disimpan sebagai teks.** Bila Sheets mengubahnya menjadi angka (36.1), server membacanya kembali sebagai `36.10`.

## Pemasangan
1. Ganti seluruh isi **Code.gs** → Deploy → New version. `Auth.gs` dan `Wilayah.gs` tidak berubah.
2. Di spreadsheet: **File → Impor → Upload** `PEMETAAN_WILAYAH.xlsx` → **Sisipkan sheet baru**. Pastikan nama tab-nya `PEMETAAN_WILAYAH`.
3. Jalankan `cekImporAdmin()`. Untuk data 6 Nov 2026, hasil yang diharapkan:
   `PEMETAAN_WILAYAH: 367 operator diperbarui (7 provinsi berubah), 0 sudah sesuai; 492 stasiun maskapai ikut lokasi bandaranya.`
4. Bila bersih → `terapkanImporAdmin()`.
5. Hapus tab `PEMETAAN_WILAYAH`.
