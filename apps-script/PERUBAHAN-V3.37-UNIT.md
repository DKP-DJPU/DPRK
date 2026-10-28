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
| **Impor Admin** | `cekImporAdmin()` (hanya memeriksa) dan `terapkanImporAdmin()` untuk operator baru (PAUA), perbaikan kolom master, dan daftar unit. |
| Website | Pilihan **Unit / Stasiun** di formulir (muncul bila operator punya unit), nama unit di Monitoring Risiko, bagian **Cakupan Unit / Stasiun** di rekap operator. |

## Langkah pemasangan
1. Merge PR ini (website ±1 menit).
2. Apps Script → ganti seluruh isi **`Code.gs`** dan **`Auth.gs`** dari repo → Simpan. (`Pelaporan.gs` tidak berubah.)
3. **Deploy → Manage deployments → Edit ✏️ → New version → Deploy.**

## Mengimpor PAUA, perbaikan kode bandara, dan 538 unit
Bahan: file **`Final_Impor_Unit_dan_PAUA.xlsx`** (sudah Anda periksa 28 Okt).

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
4. Jalankan **`terapkanImporAdmin`** → log berakhir "SELESAI diterapkan …".
5. Periksa di website: Dashboard → Total Operator **445**; masuk sebagai Admin → Monitoring Operator → buka mis. *PT Wings Abadi* → bagian **Cakupan Unit / Stasiun** (81 stasiun).
6. Setelah benar, tiga sheet IMPOR_* / PERBAIKAN_MASTER boleh dihapus (atau dibiarkan; menjalankan ulang aman — tidak menggandakan data).

> Menambah sisa ±183 unit AirNav nanti: isi sheet IMPOR_UNIT dengan unit baru saja (format sama), lalu ulangi langkah 3–4.

## Belum termasuk (tahap berikutnya)
- **Impor matriks dari Excel** di website — menunggu contoh file matriks (`Data_Penilaian_Risiko_AU_dan_RA_2024…xlsx`).
- Rekap gabungan per kabupaten/kota — menunggu keputusan penyamaan nama kab/kota di MASTER_OPERATOR.
