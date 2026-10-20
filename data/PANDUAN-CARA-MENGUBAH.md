# Cara mengubah isi tab Panduan

Isi tab **Panduan** tidak ada di kode. Semuanya diambil dari dua file berikut, jadi bisa diubah langsung di GitHub.

| File | Isi |
|---|---|
| [`panduan.md`](panduan.md) | Seluruh teks panduan, gambar, video, dan FAQ |
| [`kontak.json`](kontak.json) | Kontak yang tampil di bagian **Kontak**. Selama daftarnya kosong, bagian Kontak tidak ditampilkan. |

## Mengubah teks
1. Buka `data/panduan.md` di GitHub → ikon pensil ✏️.
2. Ubah teks. Format yang didukung tertulis di bagian atas file.
3. **Commit changes** → pilih *Create a new branch … and start a pull request*. Uji otomatis akan memeriksa format dan memastikan semua gambar yang dirujuk ada.
4. Merge PR. Perubahan tampil di website ±1 menit kemudian.

## Menambah FAQ
Tambahkan di bab `## Pertanyaan Umum (FAQ)`:
```
### Pertanyaannya?
Jawabannya dalam satu atau beberapa paragraf.
```

## Menambah video
Video **jangan** diunggah ke GitHub. Unggah ke YouTube (pilih *Tidak publik / Unlisted*) atau Google Drive (akses *Siapa saja yang memiliki link*), lalu tulis di `panduan.md`:
```
!video[Judul video](https://youtu.be/ID-VIDEO)
```
Video baru dimuat ketika pengguna mengklik tombol putar, sehingga halaman tetap ringan.

## Menambah gambar
1. Simpan gambar (PNG/JPG/WebP, sebaiknya < 300 KB) ke folder `assets/panduan/` (GitHub: *Add file → Upload files*).
2. Tulis di `panduan.md`: `![Keterangan gambar](assets/panduan/nama-file.png)`
   - **Tangkapan layar:** ambil pada perbesaran layar 200% (atau dari layar retina/HP) dan beri akhiran **`@2x`** pada nama file, misalnya `menu-baru@2x.png`. Gambar seperti ini ditampilkan setengah ukuran aslinya, sehingga tulisan di dalamnya sama besar dengan tulisan aplikasi dan semua gambar terlihat seragam. Gambar tanpa `@2x` (foto, diagram) ditampilkan apa adanya.
3. **Gunakan data contoh**, jangan tangkapan layar berisi data asli (nama orang, nilai risiko operator, data pelapor).

Gambar formulir bawaan dibuat otomatis dari data rekaan: `python3 tests/ui/make-screenshots.py`.

## Mengisi kontak
Isi daftar `kontak` di `data/kontak.json`, contohnya:
```json
"kontak": [
  {
    "unit": "Direktorat Keamanan Penerbangan",
    "nama": "Helpdesk SI-RISK AVSEC",
    "layanan": "Akun, pengisian DPRK, dan kendala teknis",
    "email": "...",
    "telepon": "...",
    "whatsapp": "...",
    "jam": "Senin–Jumat, 08.00–16.00 WIB"
  }
]
```
Gunakan **email dan nomor resmi unit**, bukan nomor pribadi: halaman Panduan terbuka untuk publik. Setiap kontak wajib punya minimal satu dari `email`, `telepon`, atau `whatsapp`.
