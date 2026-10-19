# Uji otomatis SI-RISK AVSEC

Uji berjalan sendiri di GitHub setiap ada Pull Request (tab **Actions** / bagian *Checks* di PR).
PR yang ujinya merah (✗) **jangan di-merge** sebelum diperiksa.

## Isi
| Folder | Isi |
|---|---|
| `harness/gas.js` | Menjalankan `apps-script/*.gs` **asli** di Node dengan tiruan layanan Google (Spreadsheet, Cache 100 KB, Mail + kuota, Drive, Trigger, jam tiruan). |
| `server/*.test.js` | Uji server: login OTP & sesi, band risiko PR 16/41 DJPU 2024 + ALARP, persetujuan akun, penutupan data Terbatas + ambang `MIN_GROUP`, backup harian. |
| `ui/mock-server.js` | Server tiruan yang menjalankan `.gs` asli dengan data sintetis (pengganti Apps Script). |
| `ui/smoke.py` | Uji tampilan di browser (Playwright): publik, Admin, Operator, pendaftaran, login wajib, pelaporan, tampilan HP. |
| `fixtures/` | Data uji **sintetis**. |

## ⚠️ Data
Repo ini **publik**, sedangkan DPRK berklasifikasi **Terbatas**. Semua data uji di `fixtures/`
adalah **rekaan** (dibuat `fixtures/make-fixtures.js` dengan seed tetap). Hanya `operators.json`
yang berasal dari daftar operator, karena isinya sama dengan informasi publik (nama/lokasi).
**Jangan pernah** menyalin isi RISK_ASSESSMENT, LAPORAN_INSIDEN, USER_ACCESS, atau sheet lain
dari spreadsheet asli ke repo ini, termasuk untuk "sekadar uji".

## Menjalankan di komputer sendiri
```bash
node tests/run-server-tests.js            # uji server (Node 18+), ±5 detik
pip install playwright && python -m playwright install chromium
python tests/ui/smoke.py                  # uji tampilan, ±1 menit
```

## Menambah uji
- Uji server baru: buat `tests/server/<nama>.test.js` memakai `require('./_lib')`; runner otomatis menjalankannya.
- Setiap perubahan aturan (misalnya band risiko atau hak akses) sebaiknya disertai uji yang gagal bila aturan itu rusak.
