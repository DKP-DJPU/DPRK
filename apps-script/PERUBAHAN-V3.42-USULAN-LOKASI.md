# V3.42 — Usulan Lokasi oleh Operator

## Ringkasnya
Operator yang login dapat **mengusulkan lokasi** (provinsi + kabupaten/kota) bila lokasi kantor pusat atau unit/stasiunnya kosong atau salah. Usulan tidak langsung mengubah data induk. Admin meninjau usulan secara berkala, lalu menerapkannya.

| Isian | Status |
|---|---|
| Provinsi | **wajib**, dari daftar resmi |
| Kabupaten/Kota | **wajib**, hanya kab/kota di provinsi terpilih |
| Alamat lengkap | opsional, maks. 300 karakter |
| Catatan | opsional, maks. 500 karakter |

Daftar wilayah memuat **38 provinsi dan 514 kab/kota** (Kepmendagri No. 300.2.2-2138 Tahun 2025, dataset publik cahyadsn/wilayah, MIT). Isinya ada di `Wilayah.gs` (server) dan `data/wilayah-kemendagri.json` (website). Bila Kepmendagri dimutakhirkan, perbarui keduanya.

## Pemasangan
1. Di editor Apps Script, buat file skrip baru bernama **Wilayah** lalu tempel isi `Wilayah.gs`.
2. Ganti seluruh isi **Code.gs** dan **Auth.gs**.
3. **Deploy → Manage deployments → Edit → New version**. URL web app tidak berubah.
4. Tidak ada fungsi yang perlu dijalankan. Sheet `USULAN_LOKASI` dibuat otomatis saat usulan pertama masuk. Kolom `kodeWilayah` ditambahkan otomatis di `MASTER_OPERATOR` dan `MASTER_UNIT`.

## Alur
1. Operator memilih lokasi yang dinilai (kantor pusat atau unit/stasiun), lalu klik **Usulkan lokasi** / **Usulkan koreksi** di Langkah 01.
2. Usulan masuk ke sheet **USULAN_LOKASI** dengan Status `Menunggu`.
   - Satu akun hanya punya satu usulan terbuka per lokasi. Mengirim ulang akan memperbarui usulan yang sama.
   - Operator dapat **mengubah** atau **membatalkan** usulan selama belum diputuskan.
3. Admin mengisi kolom **Status** di sheet: `Diterima` atau `Ditolak`. Status `Ditolak` **wajib** disertai **Alasan**, karena alasan itu tampil ke operator.
4. Jalankan **`cekUsulanLokasi()`**. Fungsi ini hanya memeriksa dan mengisi kolom `peringatan`; data induk tidak berubah.
5. Bila hasilnya "Pemeriksaan bersih", jalankan **`terapkanUsulanLokasi()`**. Urutannya:
   - membuat cadangan spreadsheet (`backupHarian`);
   - memperbarui `provinsi`, `kabkota`, dan `kodeWilayah` di `MASTER_OPERATOR` / `MASTER_UNIT`;
   - mencatat setiap perubahan di `AUDIT_LOG`;
   - mengisi `diputuskanAt` / `diputuskanOleh`.
6. Keputusan berlaku setelah langkah 5. Usulan yang ditolak tampil di formulir operator beserta alasannya. **Tidak ada email.**

## Kode lokasi bersama (stasiun = lokasi bandaranya)
Stasiun maskapai (`jenisUnit` = Stasiun) memakai lokasi bandaranya. Bila usulan untuk **Stasiun CGK** diterima, perubahan berlaku untuk:
- bandara CGK di `MASTER_OPERATOR`;
- **semua** stasiun maskapai berkode CGK.

Hal yang sama berlaku sebaliknya: usulan untuk bandara CGK juga memperbarui semua stasiun CGK. `cekUsulanLokasi()` menampilkan daftar entitas yang akan ikut berubah sebelum Anda menerapkannya.

## Pemeriksaan otomatis
| Kondisi | Akibat |
|---|---|
| Dua usulan (akun berbeda, atau stasiun berbeda di bandara yang sama) mengusulkan wilayah berbeda | Peringatan "Bertentangan" di kolom `peringatan`. Pilih satu untuk diterima. |
| Lebih dari satu wilayah berbeda berstatus Diterima untuk lokasi yang sama | **Masalah**; tidak ada yang diterapkan. |
| Bandara tercatat dengan wilayah lain | Peringatan. |
| Lokasi di data induk sudah berubah sejak usulan dibuat | **Masalah**; tinjau ulang, lalu ubah Status. |
| `Ditolak` tanpa Alasan, Status tidak dikenal, kode wilayah tidak ada di daftar resmi | **Masalah**. |

## Monitoring Operator
Kolom Lokasi kini menampilkan penanda:
- **Lokasi belum lengkap**: provinsi atau kab/kota kosong. Berguna untuk menagih kelengkapan data saat pembinaan atau surveilan.
- **Usulan lokasi menunggu**: ada usulan yang belum diputuskan.

## Perbaikan ikutan
- **`findBy_`**: nomor baris kini dihitung dari data apa adanya. Sebelumnya, bila ada baris kosong di tengah sheet, nomor baris bergeser sehingga penulisan bisa mengenai baris lain.
- **Kode wilayah disimpan sebagai teks.** Tanpa ini, Google Sheets mengubah `32.10` menjadi angka `32.1`.
