# Staging SI-RISK AVSEC (data rekaan)

Spreadsheet: **SI-RISK STAGING (data rekaan)** di Drive Admin. Namanya harus tetap memuat kata `STAGING`:
fungsi staging menolak berjalan di spreadsheet lain, dan backup di staging masuk folder terpisah
"SI-RISK BACKUP STAGING".

## Pasang (sekali)
1. Buka spreadsheet staging → **Ekstensi → Apps Script**.
2. Buat file dan tempel: `Code.gs`, `Auth.gs`, `Pelaporan.gs`, `Wilayah.gs`, `Staging.gs` (versi sama dengan produksi + Staging.gs).
3. Pilih fungsi `buatDataRekaanStaging` → **Jalankan** (izinkan akses). Hasil yang diharapkan di log:
   `STAGING terisi: 444 operator, 547 unit, 444 DPRK, 23766 skenario ...`
4. Pilih `ujiBebanStaging` → **Jalankan** → salin seluruh isi log dan kirim ke Claude.
5. **Jangan** jalankan `pasangBackupHarian` di staging (tidak perlu).

## Uji beban di browser (lokal, untuk pengembang)
`python3 tests/ui/beban.py` — memuat data rekaan yang sama ke server tiruan lalu mengukur waktu tiap tab Admin.

Hasil awal 23 Nov 2026 (server tiruan, tanpa jaringan): respons `riskData` Admin ±8,4 MB (semua baris termasuk
histori); tab Monitoring Operator ±4 dtk; dashboard publik 5 KB.
