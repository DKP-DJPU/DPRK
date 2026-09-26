# Perubahan Apps Script untuk Sistem Pelaporan

Modul pelaporan memakai proyek Apps Script **yang sama** dengan SI-RISK AVSEC
(spreadsheet *DPRK NASIONAL – DATABASE & MONITORING*). Data laporan disimpan di
sheet baru **`LAPORAN_INSIDEN`**.

## Langkah pemasangan (±5 menit)

1. Buka spreadsheet → **Extensions → Apps Script**.
2. Klik **+ → Script**, beri nama `Pelaporan`, lalu tempel seluruh isi
   [`Pelaporan.gs`](Pelaporan.gs).
3. Buka `Code.gs`, tambahkan **dua baris** berikut:

   **a. Di fungsi `doGet`**, tepat di bawah baris `if(a==="trend")...`:
   ```js
   if(a==="incidents")return json_({ok:true,data:cached_(INC_CACHE_KEY,incidentsPublic_)});
   ```

   **b. Di fungsi `doPost`**, tepat di bawah baris `if(a==="renewDprk")...`:
   ```js
   if(a==="createIncident")return createIncident_(p);
   ```
4. Simpan, lalu **Deploy → Manage deployments → (deployment yang aktif) → Edit ✏️ →
   Version: New version → Deploy**. URL web app tetap sama, jadi frontend tidak perlu diubah.

> Jangan membuat *New deployment* baru — itu menghasilkan URL berbeda dan frontend
> tidak akan menemukannya.

## Endpoint

| Metode | action | Keterangan |
|---|---|---|
| GET | `incidents` | Daftar laporan untuk publik. **Tanpa** nama/instansi/HP/email pelapor dan catatan. Laporan berstatus `Ditolak` disembunyikan. Di-cache 45 detik. |
| POST | `createIncident` | Menyimpan laporan baru. Nomor referensi `LKP/NNNN/MM/YYYY` dibuat server (berurutan, tidak bisa kembar). |

## Verifikasi laporan

Admin mengubah kolom `statusVerifikasi` langsung di sheet `LAPORAN_INSIDEN`:
`Baru` → `Terverifikasi` atau `Ditolak`. Isi juga `verifiedBy` dan `verifiedAt`.

## Penanda lingkup

Kolom `lingkup` diisi otomatis dari jenis kejadian:

| Lingkup | Jenis kejadian |
|---|---|
| AVSEC | Ancaman keamanan (unlawful interference), Pelanggaran prosedur keamanan, Isu regulasi/kebijakan keamanan, Kegiatan pengawasan/inspeksi/audit, Latihan/simulasi keamanan, Berita media terkait keamanan penerbangan |
| Non-AVSEC | Kecelakaan penerbangan, Insiden serius/near-miss, Gangguan operasional bandara/maskapai |
| Perlu Klasifikasi | Lainnya |
