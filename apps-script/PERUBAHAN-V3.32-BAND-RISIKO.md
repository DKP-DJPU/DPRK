# Perbaikan Band Risiko & Kategori Penerimaan (Apps Script V3.32)

## Masalah
Batas **nilai risiko total** di Code.gs V3.31 (`SERVER_BAND`) bergeser satu angka dari
**PR 16 DJPU 2024 Lampiran II** (tidak diubah oleh PR 41 DJPU 2024). Contohnya, nilai 25
tercatat "Tinggi", padahal menurut regulasi "Menengah-Tinggi". Server selalu menghitung
ulang rating saat menyimpan, jadi semua skenario baru tersimpan dengan rating yang salah.
Selain itu, `kategoriPenerimaan` (ALARP) tidak pernah dihitung, sehingga kolomnya kosong.

| Nilai risiko | V3.31 (salah) | V3.32 = PR 16/41 | Kategori penerimaan |
|---|---|---|---|
| 3–7 | 3–6 Rendah, 7 Menengah-Rendah | **Rendah** | Dapat ditoleransi |
| 8–13 | 8–12 Menengah-Rendah, 13 Menengah | **Menengah-Rendah** | Dapat ditoleransi |
| 14–19 | 14–18 Menengah, 19 Menengah-Tinggi | **Menengah** | ALARP |
| 20–25 | 20–24 Menengah-Tinggi, 25 Tinggi | **Menengah-Tinggi** | Tidak dapat ditoleransi |
| 26–30 | Tinggi | **Tinggi** | Tidak dapat ditoleransi |

Batas nilai komponen 1–10 (Ancaman/Kerentanan/Konsekuensi) **sudah benar** dan tidak diubah.

## Langkah pemasangan (±10 menit)
1. Apps Script → buka `Code.gs` → ganti **seluruh isinya** dengan [`Code.gs`](Code.gs) dari repo ini (V3.32).
   Isinya Code.gs V3.31 yang terpasang, dengan 5 perubahan kecil dan 3 fungsi baru di bagian paling bawah.
2. Simpan, lalu **Deploy → Manage deployments → Edit ✏️ → New version → Deploy**.
3. **Pratinjau dulu:** pilih fungsi **`cekHitungUlangRisiko`** → **Run** → buka *Execution log*.
   Isinya daftar baris yang akan berubah. Fungsi ini **tidak menulis apa pun**.
4. Bila sesuai, jalankan **`terapkanHitungUlangRisiko`**. Fungsi ini akan:
   - memperbarui rating, nilai total, dan kategori penerimaan di `RISK_ASSESSMENT`;
   - mencatat setiap baris yang berubah di `RISK_HISTORY` ("Hitung ulang PR16/41");
   - menulis satu ringkasan di `AUDIT_LOG`.
   Aman dijalankan berulang, karena baris yang sudah benar tidak disentuh.

## Yang akan terjadi pada data saat ini (diuji dengan salinan 18 Okt 2026, 169 skenario)
- Rating yang sudah tersimpan **sudah sesuai PR 16/41**, karena data migrasi dibuat dengan batas yang benar. Tidak ada rating yang bergeser, kecuali satu baris di bawah.
- Ke-169 baris mendapat `kategoriPenerimaan`, yang sebelumnya kosong.
- **H.A.S. Hanandjoeddin, kategori 06 (Chemical Threats):** komponen 3 + 1 + 2 tetapi nilai total tercatat 14. Setelah dihitung ulang nilainya menjadi **6 (Rendah)**. Cocokkan dengan dokumen DPRK aslinya. Bila yang benar justru nilai 14, perbaiki angka komponennya lewat formulir.
- **Thai AirAsia:** kategori `1` dirapikan menjadi `01`.

## Cara kerja ke depan
`kategoriPenerimaan` kini dihitung server dari rating dan selalu mengabaikan kiriman browser.
Formulir Pengisian DPRK juga menampilkan kategori penerimaan secara langsung di bawah total risiko.

## Pembaruan V3.33 — nol di depan hilang
Saat V3.32 dijalankan pada data asli, kategori Thai AirAsia tetap tersimpan `1`, bukan `01`.
Penyebabnya: Google Sheets otomatis mengubah teks berbentuk angka menjadi angka, sehingga nol
di depan hilang. Hal yang sama terjadi pada No. HP (`0822…` tersimpan `822…`).
V3.33 memperbaiki `sanitizeCell_`: teks angka yang diawali nol diberi apostrof agar tetap teks.
Perbaikan ini berlaku untuk semua sheet (RISK_ASSESSMENT, USER_ACCESS, LAPORAN_INSIDEN, dst.).

Langkah:
1. Ganti Code.gs dengan versi terbaru dari repo, lalu **Deploy → New version**.
2. Jalankan **`terapkanHitungUlangRisiko`** sekali lagi. Hanya baris Thai AirAsia yang berubah.
3. No. HP lama yang sudah kehilangan angka 0 tidak bisa dipulihkan otomatis. Perbaiki manual di
   sheet dengan mengetik `'0822…` (apostrof di depan).
