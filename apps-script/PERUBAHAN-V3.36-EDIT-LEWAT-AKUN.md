# Edit Skenario Lewat Akun Login (Apps Script V3.36)

Operator yang sudah **masuk dengan akun** dapat mengubah skenario DPRK miliknya langsung dari tab
**Monitoring Risiko** (tombol **Edit**), tanpa kode referensi `riskId::KODE`. Admin dapat mengedit skenario semua operator.

## Yang berubah
| Bagian | Perubahan |
|---|---|
| Server | Aksi baca baru **`riskDetail`** (POST, wajib login): memuat satu skenario lengkap. Operator hanya bisa membuka skenario operatornya sendiri; respons untuk "tidak ada" dan "bukan milik Anda" sama, sehingga ID operator lain tidak bisa ditebak. |
| Server | Formulir edit kini terisi **lengkap**: tanggal pengesahan, email pemilik risiko, dan link file diambil dari MASTER_DPRK. Tanggal kaji ulang yang kosong diisi awal dari tanggal kaji ulang DPRK. |
| Server | **Perbaikan bug:** perubahan *Pemilik Risiko* saat edit sebelumnya tidak pernah tersimpan (formulir mengirim `riskOwner`, kolom sheet bernama `pemilikRisiko`). |
| Tampilan | Kolom **Aksi → Edit** di Monitoring Risiko (hanya untuk pengguna login). |
| Tampilan | **Perlindungan saling timpa:** versi baris dikirim saat menyimpan. Bila skenario sudah diubah orang lain lebih dulu, penyimpanan ditolak dan pengguna diminta memuat ulang. |
| Tampilan | **Perbaikan bug:** kategori ancaman tidak terpilih otomatis saat edit (juga pada jalur kode referensi). |
| Tampilan | **Perbaikan:** kotak "Risiko Tinggi" di Monitoring Risiko menghitung nilai ≥ 25; sekarang mengikuti band Tinggi 26–30. |
| Tampilan | Panel *Kode DPRK (Ganti Perangkat)* disembunyikan saat login (tidak diperlukan). Teks versi lama di kaki halaman dihapus. |

Jalur lama dengan kode referensi **tetap berfungsi** selama login belum diwajibkan.
Keamanan tidak berubah: hak edit tetap diperiksa di server (`authGate_`), operator hanya dapat mengubah operator yang terdaftar di akunnya.

## Langkah pemasangan
1. Merge PR ini (website berubah otomatis ±1 menit).
2. Apps Script → ganti seluruh isi **`Code.gs`** dengan [`Code.gs`](Code.gs) → Simpan. (`Auth.gs` dan `Pelaporan.gs` tidak berubah.)
3. **Deploy → Manage deployments → Edit ✏️ → New version → Deploy.**
4. Periksa: masuk dengan akun operator → **Monitoring Risiko** → klik **Edit** → formulir terisi lengkap → ubah sesuatu → **Perbarui Skenario**.

> Pasang Code.gs **bersamaan** dengan merge. Bila website baru dipakai dengan server lama, tombol Edit menampilkan pesan galat
> (tidak ada data yang rusak); jalur kode referensi tetap berjalan.
