# V3.46 — Perbaikan nomor baris saat menulis + cekIntegritas + nilai risiko operator

## Bug yang diperbaiki (ditemukan 23 Nov 2026)
`rows_()` melewati baris kosong, tetapi beberapa fungsi menghitung nomor baris tujuan dengan `i+2`.
Bila ada baris kosong di atas, penulisan jatuh satu baris terlalu atas:

| Fungsi | Akibat bila ada baris kosong |
|---|---|
| `findRiskById_`, `findRiskToken_` (edit skenario) | menimpa skenario operator lain; skenario asli tetap → riskId ganda |
| `authFindUser_` → `lastLoginAt` | tanggal login ditulis ke akun lain |
| `authLogout_` | sesi yang salah ditandai Keluar |
| `revokeApiKey_`, penerbitan API key (jalur lama) | status kunci akses baris lain berubah |
| impor admin: label `baris N` | nomor baris di pesan salah (hanya tampilan) |

Kejadian nyata: 6 Nov 2026 12:42 UTC, edit Shandong 01.11 menimpa skenario Thai AirAsia
`risk-1793551271036-f0kv0t`. Data dipulihkan 23 Nov dari "SI-RISK BACKUP 2026-11-06 1715" dan dicatat di AUDIT_LOG
(`AUD-RESTORE-20261123-01`); baris kosong 144 dihapus.

Perbaikan: `rows_()` kini juga mengembalikan `r[]` = nomor baris asli; semua penulis memakai `x.r[i]`.
Uji regresi: `tests/server/baris-kosong.test.js` (gagal di V3.45, lulus di V3.46).

## Baru: `cekIntegritas()`
Jalankan dari editor Apps Script. Hanya membaca. Melaporkan baris kosong di tengah data, riskId ganda,
skenario ganda (assessmentKey), dan jumlah skenario yang kolom kategorinya hanya kode.

## Aturan nilai (keputusan Alex 23 Nov 2026)
Nilai yang mewakili satu kategori ancaman = nilai tertinggi di kategori itu. Nilai risiko operator, tren operator,
dan nilai per unit = rata-rata nilai wakil tiap kategori (sebelumnya rata-rata semua skenario).
Perhitungan di browser (operator-detail.js); server tidak berubah untuk bagian ini.
