# Backup Harian Spreadsheet (Apps Script V3.35)

Setiap hari sekitar pukul **02.00 WIB**, sistem membuat salinan spreadsheet ke folder Google Drive
pribadi **"SI-RISK BACKUP"** milik akun pemilik script.

- Semua sheet data ikut dicadangkan (operator, DPRK, risiko, riwayat, audit, laporan, pengguna).
- Sheet login **AUTH_SESSION** dan **ACCESS_TOKEN** sengaja **tidak** ikut dicadangkan.
- Salinan lebih tua dari **30 hari** dipindah ke Sampah Drive (masih bisa dipulihkan 30 hari berikutnya).
  Minimal **7 salinan terbaru** selalu disimpan, walaupun sudah tua.
- Kalau backup gagal, email pemberitahuan dikirim ke akun pemilik script.

## Langkah pemasangan (sekali saja)
1. Apps Script → ganti seluruh isi **`Code.gs`** dengan [`Code.gs`](Code.gs) → Simpan.
2. Di editor, pilih fungsi **`pasangBackupHarian`** → **Run**.
3. Google akan meminta izin baru (**Google Drive**). Ini wajar karena backup harus membuat berkas di Drive. Pilih akun → *Advanced* → *Go to …* → **Allow**.
4. Lihat **Execution log**: harus muncul `Trigger backup harian terpasang. Backup … selesai: N sheet …`.
5. Buka Google Drive → folder **SI-RISK BACKUP** → harus ada 1 berkas `SI-RISK BACKUP <tanggal>`.
6. **Deploy → Manage deployments → Edit ✏️ → New version → Deploy** (supaya web app memakai versi yang sama).

> Jangan bagikan folder **SI-RISK BACKUP** ke siapa pun: isinya data Terbatas dan data pribadi pelapor.
> Saat kepemilikan sistem dipindahkan ke akun sistem, pindahkan juga folder ini dan jalankan ulang `pasangBackupHarian()` dari akun baru.

## Memulihkan data
1. Buka salinan backup yang diinginkan.
2. Klik kanan tab sheet yang perlu dipulihkan → **Copy to → Existing spreadsheet** → pilih spreadsheet utama.
3. Di spreadsheet utama, ganti nama sheet lama (mis. `RISK_ASSESSMENT_RUSAK`), lalu ubah nama sheet hasil salinan menjadi nama aslinya (mis. `RISK_ASSESSMENT`).
4. Tidak perlu Deploy ulang. Tunggu ±1–2 menit sampai cache dashboard diperbarui.

Backup manual kapan saja: jalankan **`backupHarian`** dari editor.
